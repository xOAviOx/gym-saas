-- M2: payments, collection, GST invoices and dues.
-- Additive: no existing invoice, payment or member data is rewritten.
-- Every money write goes through an audited, role-checked function below; the
-- direct table policies that could skip validation are dropped at the end.

-- -----------------------------------------------------------------------------
-- Per-gym Cashfree credentials (secret is AES-256-GCM ciphertext from the app)
-- -----------------------------------------------------------------------------
alter table public.organization_secrets
  add column cashfree_app_id text
    check (cashfree_app_id is null or cashfree_app_id ~ '^[A-Za-z0-9._-]{4,128}$'),
  add column cashfree_secret_key_enc text
    check (cashfree_secret_key_enc is null or cashfree_secret_key_enc ~ '^v1\.'),
  add column cashfree_environment text
    check (cashfree_environment is null or cashfree_environment in ('sandbox', 'production')),
  add column cashfree_verified_at timestamptz,
  add constraint organization_secrets_cashfree_complete check (
    (cashfree_app_id is null) = (cashfree_secret_key_enc is null)
    and (cashfree_app_id is null) = (cashfree_environment is null)
  );

create or replace function public.organization_secrets_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_changed text[] := '{}';
begin
  if new.razorpay_key_id is distinct from old.razorpay_key_id then v_changed := v_changed || 'razorpay_key_id'; end if;
  if new.razorpay_key_secret_enc is distinct from old.razorpay_key_secret_enc then v_changed := v_changed || 'razorpay_key_secret'; end if;
  if new.razorpay_webhook_secret_enc is distinct from old.razorpay_webhook_secret_enc then v_changed := v_changed || 'razorpay_webhook_secret'; end if;
  if new.cashfree_app_id is distinct from old.cashfree_app_id then v_changed := v_changed || 'cashfree_app_id'; end if;
  if new.cashfree_secret_key_enc is distinct from old.cashfree_secret_key_enc then v_changed := v_changed || 'cashfree_secret_key'; end if;
  if new.cashfree_environment is distinct from old.cashfree_environment then v_changed := v_changed || 'cashfree_environment'; end if;
  if new.whatsapp_phone_number_id is distinct from old.whatsapp_phone_number_id then v_changed := v_changed || 'whatsapp_phone_number_id'; end if;
  if new.whatsapp_access_token_enc is distinct from old.whatsapp_access_token_enc then v_changed := v_changed || 'whatsapp_access_token'; end if;
  if cardinality(v_changed) = 0 then
    return null;
  end if;
  insert into audit_logs (org_id, actor_user_id, action, entity_type, entity_id, before, after)
  values (new.org_id, auth.uid(), 'organization.secrets_updated', 'organization_secrets', new.org_id, null,
          jsonb_build_object('changed', to_jsonb(v_changed), 'razorpay_key_id', new.razorpay_key_id,
                             'cashfree_app_id', new.cashfree_app_id, 'cashfree_environment', new.cashfree_environment));
  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- Payments: request idempotency and gateway payment ids
-- -----------------------------------------------------------------------------
alter table public.payments
  add column request_id uuid,
  add column gateway_payment_id text check (gateway_payment_id is null or char_length(gateway_payment_id) between 1 and 100),
  add constraint payments_gateway_id check (method <> 'cashfree' or is_reversal or gateway_payment_id is not null);
create unique index payments_request_unique on public.payments (org_id, request_id) where request_id is not null;
create unique index payments_gateway_id_unique on public.payments (org_id, method, gateway_payment_id)
  where gateway_payment_id is not null and not is_reversal;

-- -----------------------------------------------------------------------------
-- Collection requests: Cashfree payment links
-- -----------------------------------------------------------------------------
alter table public.collection_requests add column request_id uuid;
create unique index collection_requests_request_unique on public.collection_requests (org_id, request_id)
  where request_id is not null;
alter table public.collection_requests drop constraint collection_requests_provider_fields;
alter table public.collection_requests add constraint collection_requests_provider_fields check (
  (provider = 'upi_direct' and upi_uri is not null)
  or (provider in ('razorpay', 'cashfree') and provider_link_id is not null and short_url is not null)
);

-- -----------------------------------------------------------------------------
-- Gateway webhook log (was razorpay_events; empty until now). Service role only.
-- Stores a redacted summary of each verified event, never card or payer details.
-- -----------------------------------------------------------------------------
alter table public.razorpay_events rename to gateway_events;
alter table public.gateway_events rename constraint razorpay_events_pkey to gateway_events_pkey;
alter table public.gateway_events rename constraint razorpay_events_org_id_fkey to gateway_events_org_id_fkey;
alter table public.gateway_events drop constraint razorpay_events_event_id_key;
alter trigger razorpay_events_set_updated_at on public.gateway_events rename to gateway_events_set_updated_at;
alter table public.gateway_events add column provider public.collection_provider not null default 'cashfree';
alter table public.gateway_events alter column provider drop default;
create unique index gateway_events_provider_event on public.gateway_events (provider, event_id);
create index gateway_events_org_idx on public.gateway_events (org_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Core ledger insert shared by staff entry, claim confirmation and the gateway.
-- Internal: callers check the role and the tenant first.
-- -----------------------------------------------------------------------------
drop function public.record_payment(uuid, numeric, public.payment_method, text, text, timestamptz, text, uuid);

create function public.apply_payment(
  p_invoice_id uuid,
  p_amount numeric,
  p_method public.payment_method,
  p_utr text,
  p_reference text,
  p_paid_at timestamptz,
  p_request_id uuid,
  p_gateway_payment_id text,
  p_collection_request_id uuid
) returns public.payments
language plpgsql security definer set search_path = public as $$
declare
  v_inv     invoices;
  v_pay     payments;
  v_utr     text := nullif(btrim(coalesce(p_utr, '')), '');
  v_gateway boolean := p_method = 'cashfree';
begin
  select * into v_inv from invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'invoice_not_found';
  end if;
  if v_inv.status = 'void' then
    raise exception 'invoice_void';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) or p_amount > 99999999.99 then
    raise exception 'invalid_amount';
  end if;
  -- Money already taken by the gateway is never refused; any excess shows as overpaid.
  if not v_gateway and p_amount > v_inv.balance_due then
    raise exception 'amount_exceeds_balance';
  end if;
  if v_gateway and p_gateway_payment_id is null then
    raise exception 'invalid_input';
  end if;
  if v_utr is not null then
    if v_utr !~ '^[0-9]{12}$' then
      raise exception 'invalid_utr';
    end if;
    if exists (select 1 from payments where org_id = v_inv.org_id and utr = v_utr and not is_reversal) then
      raise exception 'duplicate_utr';
    end if;
  end if;

  insert into payments (org_id, invoice_id, member_id, amount, method, utr, reference, paid_at,
                        request_id, gateway_payment_id)
  values (v_inv.org_id, v_inv.id, v_inv.member_id, p_amount, p_method, v_utr,
          nullif(btrim(coalesce(p_reference, '')), ''), coalesce(p_paid_at, now()),
          p_request_id, p_gateway_payment_id)
  returning * into v_pay;

  if p_collection_request_id is not null then
    update collection_requests set status = 'paid', confirmed_payment_id = v_pay.id
     where id = p_collection_request_id and invoice_id = v_inv.id and status <> 'paid';
  elsif p_method = 'upi' then
    update collection_requests set status = 'paid', confirmed_payment_id = v_pay.id
     where invoice_id = v_inv.id and provider = 'upi_direct' and status = 'pending';
  end if;

  perform write_audit_log(v_inv.org_id, 'payment.recorded', 'payment', v_pay.id, null,
                          to_jsonb(v_pay) || jsonb_build_object('invoice_number', v_inv.invoice_number));
  return v_pay;
end;
$$;

-- Staff entry for money received at the counter. Retrying the same request id
-- returns the original payment instead of recording it twice.
create function public.record_payment(
  p_org uuid,
  p_invoice_id uuid,
  p_request_id uuid,
  p_amount numeric,
  p_method public.payment_method,
  p_utr text default null,
  p_reference text default null,
  p_paid_on date default null
) returns public.payments
language plpgsql security definer set search_path = public as $$
declare
  v_inv     invoices;
  v_pay     payments;
  v_today   date := ist_today();
  v_paid_on date := coalesce(p_paid_on, ist_today());
  v_utr     text := nullif(btrim(coalesce(p_utr, '')), '');
  v_claim   payment_claims;
begin
  perform assert_org_role(p_org, '{owner,manager,staff}');
  if p_request_id is null or p_method is null or p_method not in ('cash', 'upi', 'card', 'bank_transfer')
     or (v_utr is not null and p_method <> 'upi')
     or char_length(coalesce(p_reference, '')) > 100 then
    raise exception 'invalid_input';
  end if;
  select * into v_inv from invoices where id = p_invoice_id and org_id = p_org for update;
  if not found then
    raise exception 'invoice_not_found';
  end if;
  select * into v_pay from payments where org_id = p_org and request_id = p_request_id;
  if found then
    if v_pay.invoice_id <> p_invoice_id or v_pay.amount <> p_amount or v_pay.method <> p_method then
      raise exception 'request_conflict';
    end if;
    return v_pay;
  end if;
  if v_paid_on > v_today or v_paid_on < v_today - 90 then
    raise exception 'invalid_paid_on';
  end if;

  v_pay := apply_payment(p_invoice_id, p_amount, p_method, v_utr, p_reference,
                         case when v_paid_on = v_today then now()
                              else ist_day_start(v_paid_on) + interval '12 hours' end,
                         p_request_id, null, null);

  -- A member may already have told us about this exact UPI transfer.
  if v_utr is not null then
    for v_claim in
      update payment_claims
         set status = 'confirmed', payment_id = v_pay.id, reviewed_at = now(),
             reviewed_by = current_team_member_id(p_org)
       where invoice_id = p_invoice_id and utr = v_utr and status = 'pending'
      returning *
    loop
      perform write_audit_log(p_org, 'payment_claim.confirmed', 'payment_claim', v_claim.id, null,
                              jsonb_build_object('utr', v_claim.utr, 'amount', v_claim.amount, 'payment_id', v_pay.id));
    end loop;
  end if;
  return v_pay;
end;
$$;

create or replace function public.confirm_payment_claim(p_claim_id uuid) returns public.payment_claims
language plpgsql security definer set search_path = public as $$
declare
  v_claim payment_claims;
  v_pay   payments;
begin
  select * into v_claim from payment_claims where id = p_claim_id for update;
  if not found then
    raise exception 'claim_not_found';
  end if;
  perform assert_org_role(v_claim.org_id, '{owner,manager,staff}');
  if v_claim.status <> 'pending' then
    raise exception 'claim_not_pending';
  end if;

  v_pay := apply_payment(v_claim.invoice_id, v_claim.amount, 'upi', v_claim.utr, null,
                         v_claim.claimed_at, null, null, null);

  update payment_claims
     set status = 'confirmed', reviewed_by = current_team_member_id(v_claim.org_id), reviewed_at = now(), payment_id = v_pay.id
   where id = p_claim_id
  returning * into v_claim;

  perform write_audit_log(v_claim.org_id, 'payment_claim.confirmed', 'payment_claim', v_claim.id, null,
                          jsonb_build_object('utr', v_claim.utr, 'amount', v_claim.amount, 'payment_id', v_pay.id));
  return v_claim;
end;
$$;

-- -----------------------------------------------------------------------------
-- Gateway links
-- -----------------------------------------------------------------------------
-- Records a link the app has just created at Cashfree. Retrying with the same
-- request id is a no-op; a second live link for one invoice is refused.
create function public.save_gateway_link(
  p_org uuid,
  p_invoice_id uuid,
  p_request_id uuid,
  p_link_id text,
  p_url text,
  p_amount numeric,
  p_expires_at timestamptz
) returns public.collection_requests
language plpgsql security definer set search_path = public as $$
declare
  v_inv invoices;
  v_req collection_requests;
begin
  perform assert_org_role(p_org, '{owner,manager,staff}');
  if p_request_id is null or p_link_id is null or p_link_id !~ '^[A-Za-z0-9_-]{1,50}$'
     or p_url is null or p_url !~ '^https://' or char_length(p_url) > 500
     or p_expires_at is null or p_expires_at <= now() then
    raise exception 'invalid_input';
  end if;
  select * into v_inv from invoices where id = p_invoice_id and org_id = p_org for update;
  if not found then
    raise exception 'invoice_not_found';
  end if;
  select * into v_req from collection_requests where org_id = p_org and request_id = p_request_id;
  if found then
    if v_req.invoice_id <> p_invoice_id or v_req.provider_link_id <> p_link_id then
      raise exception 'request_conflict';
    end if;
    return v_req;
  end if;
  if v_inv.status = 'void' or v_inv.balance_due <= 0 then
    raise exception 'invoice_not_payable';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > v_inv.balance_due then
    raise exception 'invalid_amount';
  end if;

  update collection_requests set status = 'expired'
   where invoice_id = p_invoice_id and provider = 'cashfree' and status = 'pending' and expires_at <= now();
  if exists (select 1 from collection_requests
              where invoice_id = p_invoice_id and provider = 'cashfree' and status = 'pending') then
    raise exception 'gateway_link_open';
  end if;

  insert into collection_requests (org_id, invoice_id, member_id, provider, amount, provider_link_id,
                                   short_url, status, expires_at, created_by, request_id)
  values (p_org, p_invoice_id, v_inv.member_id, 'cashfree', p_amount, p_link_id, p_url, 'pending',
          p_expires_at, current_team_member_id(p_org), p_request_id)
  returning * into v_req;

  perform write_audit_log(p_org, 'collection_request.created', 'collection_request', v_req.id, null,
                          jsonb_build_object('provider', 'cashfree', 'amount', p_amount,
                                             'invoice_number', v_inv.invoice_number, 'link_id', p_link_id));
  return v_req;
end;
$$;

create function public.close_gateway_link(p_org uuid, p_request_id uuid, p_status public.collection_request_status)
returns public.collection_requests
language plpgsql security definer set search_path = public as $$
declare
  v_req collection_requests;
begin
  perform assert_org_role(p_org, '{owner,manager,staff}');
  if p_status is null or p_status not in ('cancelled', 'expired') then
    raise exception 'invalid_input';
  end if;
  update collection_requests set status = p_status
   where id = p_request_id and org_id = p_org and status = 'pending'
  returning * into v_req;
  if not found then
    select * into v_req from collection_requests where id = p_request_id and org_id = p_org;
    if not found then
      raise exception 'collection_request_not_found';
    end if;
    return v_req;
  end if;
  perform write_audit_log(p_org, 'collection_request.closed', 'collection_request', v_req.id, null,
                          jsonb_build_object('status', p_status, 'link_id', v_req.provider_link_id));
  return v_req;
end;
$$;

-- Called only by the server after it has read the payment back from the
-- Cashfree API with the gym's own credentials. Idempotent per gateway payment.
create function public.record_gateway_payment(
  p_org uuid,
  p_collection_request_id uuid,
  p_gateway_payment_id text,
  p_amount numeric,
  p_paid_at timestamptz,
  p_reference text
) returns public.payments
language plpgsql security definer set search_path = public as $$
declare
  v_req collection_requests;
  v_pay payments;
begin
  if not is_privileged_caller() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_req from collection_requests
   where id = p_collection_request_id and org_id = p_org and provider = 'cashfree';
  if not found then
    raise exception 'collection_request_not_found';
  end if;
  perform 1 from invoices where id = v_req.invoice_id for update;
  select * into v_pay from payments
   where org_id = p_org and method = 'cashfree' and gateway_payment_id = p_gateway_payment_id and not is_reversal;
  if found then
    update collection_requests set status = 'paid', confirmed_payment_id = coalesce(confirmed_payment_id, v_pay.id)
     where id = v_req.id and status <> 'paid';
    return v_pay;
  end if;
  return apply_payment(v_req.invoice_id, p_amount, 'cashfree', null, p_reference, p_paid_at, null,
                       p_gateway_payment_id, v_req.id);
end;
$$;

-- -----------------------------------------------------------------------------
-- Payment settings
-- -----------------------------------------------------------------------------
create function public.update_payment_settings(
  p_org uuid,
  p_upi_vpa text,
  p_upi_payee_name text,
  p_default_mode public.collection_mode
) returns public.organizations
language plpgsql security definer set search_path = public as $$
declare
  v_vpa  text := nullif(btrim(coalesce(p_upi_vpa, '')), '');
  v_name text := nullif(btrim(coalesce(p_upi_payee_name, '')), '');
  v_org  organizations;
begin
  perform assert_org_role(p_org, '{owner,manager}');
  if (v_vpa is null) <> (v_name is null) or p_default_mode is null or p_default_mode = 'razorpay' then
    raise exception 'invalid_input';
  end if;
  if p_default_mode = 'upi_direct' and v_vpa is null then
    raise exception 'upi_required';
  end if;
  if p_default_mode = 'cashfree' and not exists (
    select 1 from organization_secrets where org_id = p_org and cashfree_app_id is not null
  ) then
    raise exception 'cashfree_not_configured';
  end if;
  update organizations
     set upi_vpa = v_vpa, upi_payee_name = v_name, default_collection_mode = p_default_mode
   where id = p_org
  returning * into v_org;
  return v_org;
end;
$$;

create function public.save_cashfree_credentials(
  p_org uuid,
  p_app_id text,
  p_secret_enc text,
  p_environment text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform assert_org_role(p_org, '{owner,manager}');
  if p_app_id is null or btrim(p_app_id) !~ '^[A-Za-z0-9._-]{4,128}$'
     or p_secret_enc is null or p_secret_enc !~ '^v1\.' or char_length(p_secret_enc) > 2000
     or p_environment not in ('sandbox', 'production') then
    raise exception 'invalid_input';
  end if;
  insert into organization_secrets (org_id) values (p_org) on conflict (org_id) do nothing;
  update organization_secrets
     set cashfree_app_id = btrim(p_app_id), cashfree_secret_key_enc = p_secret_enc,
         cashfree_environment = p_environment, cashfree_verified_at = now()
   where org_id = p_org;
end;
$$;

-- Open links must be closed by the app first because only it can reach Cashfree.
create function public.remove_cashfree_credentials(p_org uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_org organizations;
begin
  perform assert_org_role(p_org, '{owner,manager}');
  select * into v_org from organizations where id = p_org for update;
  if exists (select 1 from collection_requests
              where org_id = p_org and provider = 'cashfree' and status = 'pending' and expires_at > now()) then
    raise exception 'gateway_links_pending';
  end if;
  if v_org.default_collection_mode = 'cashfree' then
    if v_org.upi_vpa is null then
      raise exception 'upi_required';
    end if;
    update organizations set default_collection_mode = 'upi_direct' where id = p_org;
  end if;
  update organization_secrets
     set cashfree_app_id = null, cashfree_secret_key_enc = null, cashfree_environment = null,
         cashfree_verified_at = null
   where org_id = p_org;
end;
$$;

-- -----------------------------------------------------------------------------
-- Dues: open invoices of live members, oldest due first, pending claims on top.
-- -----------------------------------------------------------------------------
create function public.list_dues(
  p_org uuid, p_search text default '', p_filter text default 'all',
  p_page integer default 1, p_page_size integer default 25
) returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare
  v_today  date := ist_today();
  v_digits text;
  v_result jsonb;
begin
  perform assert_org_role(p_org, '{owner,manager,staff}');
  if p_search is null or p_filter is null or p_page is null or p_page_size is null
     or p_filter not in ('all', 'overdue', 'today', 'upcoming', 'claims')
     or p_page < 1 or p_page > 100000 or p_page_size not between 1 and 50
     or length(p_search) > 100 then
    raise exception 'invalid_input';
  end if;
  v_digits := regexp_replace(p_search, '[^0-9]', '', 'g');

  with open_invoices as materialized (
    select i.id, i.invoice_number, i.issue_date, i.due_date, i.total_amount, i.amount_paid,
           i.balance_due, i.status, m.id as member_id, m.member_code, m.full_name, m.phone,
           (select count(*) from payment_claims c
             where c.invoice_id = i.id and c.status = 'pending')::integer as pending_claims,
           exists (select 1 from collection_requests r
                    where r.invoice_id = i.id and r.provider = 'cashfree' and r.status = 'pending'
                      and r.expires_at > now()) as open_link
      from invoices i
      join members m on m.id = i.member_id and m.org_id = i.org_id
     where i.org_id = p_org and i.status in ('unpaid', 'partially_paid') and i.balance_due > 0
       and m.deleted_at is null
       and (btrim(p_search) = ''
            or strpos(lower(m.full_name), lower(btrim(p_search))) > 0
            or strpos(lower(m.member_code), lower(btrim(p_search))) > 0
            or strpos(lower(i.invoice_number), lower(btrim(p_search))) > 0
            or (v_digits <> '' and strpos(m.phone, v_digits) > 0))
  ), filtered as (
    select * from open_invoices o
     where case p_filter
             when 'overdue' then o.due_date < v_today
             when 'today' then o.due_date = v_today
             when 'upcoming' then o.due_date > v_today
             when 'claims' then o.pending_claims > 0
             else true
           end
  ), paged as (
    select * from filtered
     order by (pending_claims > 0) desc, due_date, balance_due desc, id
     limit p_page_size offset (p_page - 1) * p_page_size
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'summary', (
      select jsonb_build_object(
        'outstanding', coalesce(sum(balance_due), 0),
        'overdue', coalesce(sum(balance_due) filter (where due_date < v_today), 0),
        'all', count(*),
        'overdue_count', count(*) filter (where due_date < v_today),
        'today_count', count(*) filter (where due_date = v_today),
        'upcoming_count', count(*) filter (where due_date > v_today),
        'claims_count', count(*) filter (where pending_claims > 0)
      ) from open_invoices
    ),
    'rows', coalesce((select jsonb_agg(to_jsonb(paged)
                        order by (pending_claims > 0) desc, due_date, balance_due desc, id)
                        from paged), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

-- Today's "Pending dues" tile now matches the Dues screen: deleted members are excluded.
create or replace function public.dashboard_stats(p_org uuid) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  v_today date        := ist_today();
  v_start timestamptz := ist_day_start(v_today);
  v_end   timestamptz := ist_day_start(v_today + 1);
begin
  if not is_privileged_caller() and not is_org_member(p_org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'collected_today', coalesce((
      select sum(amount) from payments
      where org_id = p_org and paid_at >= v_start and paid_at < v_end
    ), 0),
    'pending_dues', coalesce((
      select sum(i.balance_due) from invoices i join members m on m.id = i.member_id
      where i.org_id = p_org and i.status in ('unpaid', 'partially_paid') and m.deleted_at is null
    ), 0),
    'pending_dues_count', (
      select count(*) from invoices i join members m on m.id = i.member_id
      where i.org_id = p_org and i.status in ('unpaid', 'partially_paid') and m.deleted_at is null
    ),
    'expiring_7d', (
      select count(*) from members
      where org_id = p_org and deleted_at is null and status = 'expiring'
    ),
    'checkins_today', (
      select count(*) from check_ins
      where org_id = p_org and checked_in_at >= v_start and checked_in_at < v_end
    ),
    'active_members', (
      select count(*) from members
      where org_id = p_org and deleted_at is null and status in ('active', 'expiring')
    ),
    'total_members', (
      select count(*) from members
      where org_id = p_org and deleted_at is null
    )
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Close the remaining direct-write paths. Payments, links and credentials now
-- change only through the functions above.
-- -----------------------------------------------------------------------------
drop policy "payments: members insert" on public.payments;
drop policy "collection_requests: members insert" on public.collection_requests;
drop policy "collection_requests: members update" on public.collection_requests;
drop policy "organization_secrets: members read" on public.organization_secrets;
drop policy "organization_secrets: owner/manager insert" on public.organization_secrets;
drop policy "organization_secrets: owner/manager update" on public.organization_secrets;
create policy "organization_secrets: owner/manager read" on public.organization_secrets
  for select to authenticated
  using (org_id in (select public.my_org_ids_with_role('{owner,manager}')));

revoke execute on function public.apply_payment(uuid, numeric, public.payment_method, text, text, timestamptz, uuid, text, uuid)
  from public, anon, authenticated;
revoke execute on function public.record_gateway_payment(uuid, uuid, text, numeric, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.record_gateway_payment(uuid, uuid, text, numeric, timestamptz, text) to service_role;

revoke execute on function public.record_payment(uuid, uuid, uuid, numeric, public.payment_method, text, text, date) from public, anon;
revoke execute on function public.save_gateway_link(uuid, uuid, uuid, text, text, numeric, timestamptz) from public, anon;
revoke execute on function public.close_gateway_link(uuid, uuid, public.collection_request_status) from public, anon;
revoke execute on function public.update_payment_settings(uuid, text, text, public.collection_mode) from public, anon;
revoke execute on function public.save_cashfree_credentials(uuid, text, text, text) from public, anon;
revoke execute on function public.remove_cashfree_credentials(uuid) from public, anon;
revoke execute on function public.list_dues(uuid, text, text, integer, integer) from public, anon;

grant execute on function
  public.record_payment(uuid, uuid, uuid, numeric, public.payment_method, text, text, date),
  public.save_gateway_link(uuid, uuid, uuid, text, text, numeric, timestamptz),
  public.close_gateway_link(uuid, uuid, public.collection_request_status),
  public.update_payment_settings(uuid, text, text, public.collection_mode),
  public.save_cashfree_credentials(uuid, text, text, text),
  public.remove_cashfree_credentials(uuid),
  public.list_dues(uuid, text, text, integer, integer)
  to authenticated, service_role;
