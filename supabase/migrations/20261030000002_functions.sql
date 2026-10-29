-- =============================================================================
-- GymDesk · 0002 · functions and triggers
-- All multi-step writes live here so they are transactional and enforce the
-- role matrix in the database, not only in app code. Entry points callable from
-- the app are SECURITY DEFINER and start with assert_org_role(); internal helpers
-- are revoked from authenticated in 0003_rls.sql.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Generic helpers
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.ist_today() returns date
language sql stable as $$
  select (timezone('Asia/Kolkata', now()))::date;
$$;

create or replace function public.ist_day_start(p_date date) returns timestamptz
language sql stable as $$
  select timezone('Asia/Kolkata', p_date::timestamp);
$$;

create or replace function public.safe_uuid(p text) returns uuid
language plpgsql immutable as $$
begin
  return p::uuid;
exception when others then
  return null;
end;
$$;

-- Indian fiscal year label, April to March: 2025-06-01 -> '25-26', 2026-02-01 -> '25-26'.
create or replace function public.fiscal_year_label(p_date date) returns text
language sql immutable as $$
  select case
    when extract(month from p_date) >= 4
      then to_char(p_date, 'YY') || '-' || to_char((p_date + interval '1 year')::date, 'YY')
    else to_char((p_date - interval '1 year')::date, 'YY') || '-' || to_char(p_date, 'YY')
  end;
$$;

-- GST-inclusive split that preserves the total exactly:
-- taxable = round(total / (1 + r/100), 2); cgst = round(tax/2, 2); sgst = tax - cgst.
create or replace function public.split_gst(p_total numeric, p_rate numeric)
returns table (taxable_value numeric, cgst_amount numeric, sgst_amount numeric)
language plpgsql immutable as $$
declare
  v_tax numeric;
begin
  if p_rate is null or p_rate <= 0 then
    taxable_value := p_total;
    cgst_amount := 0;
    sgst_amount := 0;
  else
    taxable_value := round(p_total / (1 + p_rate / 100), 2);
    v_tax := p_total - taxable_value;
    cgst_amount := round(v_tax / 2, 2);
    sgst_amount := v_tax - cgst_amount;
  end if;
  return next;
end;
$$;

-- -----------------------------------------------------------------------------
-- Auth helpers (used by RLS policies and by every entry point)
-- -----------------------------------------------------------------------------
-- Service-role requests (webhooks, cron, portal routes) and direct SQL by the
-- database owner (migrations, seed) bypass the role matrix.
create or replace function public.is_privileged_caller() returns boolean
language sql stable as $$
  select coalesce(auth.role(), '') = 'service_role'
      or (auth.uid() is null and session_user in ('postgres', 'supabase_admin'));
$$;

create or replace function public.my_org_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select tm.org_id from team_members tm where tm.user_id = auth.uid() and tm.is_active;
$$;

create or replace function public.my_org_ids_with_role(p_roles public.team_role[]) returns setof uuid
language sql stable security definer set search_path = public as $$
  select tm.org_id from team_members tm
  where tm.user_id = auth.uid() and tm.is_active and tm.role = any (p_roles);
$$;

create or replace function public.is_org_member(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from team_members tm
    where tm.org_id = p_org and tm.user_id = auth.uid() and tm.is_active
  );
$$;

create or replace function public.has_org_role(p_org uuid, p_roles public.team_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from team_members tm
    where tm.org_id = p_org and tm.user_id = auth.uid() and tm.is_active and tm.role = any (p_roles)
  );
$$;

create or replace function public.current_team_member_id(p_org uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select tm.id from team_members tm
  where tm.org_id = p_org and tm.user_id = auth.uid() and tm.is_active
  limit 1;
$$;

create or replace function public.shares_org_with(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from team_members a
    join team_members b on a.org_id = b.org_id
    where a.user_id = auth.uid() and a.is_active and b.user_id = p_user
  );
$$;

create or replace function public.assert_org_role(p_org uuid, p_roles public.team_role[]) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if is_privileged_caller() then
    return;
  end if;
  if p_org is null or not has_org_role(p_org, p_roles) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Counters and number allocation
-- -----------------------------------------------------------------------------
create or replace function public.next_counter_value(p_org uuid, p_key text) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_value bigint;
begin
  insert into counters (org_id, key, next_value) values (p_org, p_key, 1)
  on conflict (org_id, key) do nothing;
  select next_value into v_value from counters where org_id = p_org and key = p_key for update;
  update counters set next_value = v_value + 1 where org_id = p_org and key = p_key;
  return v_value;
end;
$$;

-- {PREFIX}/{FY}/{0001}, sequential per org per fiscal year, never reused.
create or replace function public.allocate_invoice_number(p_org uuid, p_issue_date date)
returns table (invoice_number text, fiscal_year text)
language plpgsql security definer set search_path = public as $$
declare
  v_prefix text;
  v_seq    bigint;
begin
  select o.invoice_prefix into v_prefix from organizations o where o.id = p_org;
  if v_prefix is null then
    raise exception 'organization_not_found';
  end if;
  fiscal_year := fiscal_year_label(p_issue_date);
  v_seq := next_counter_value(p_org, 'invoice:' || fiscal_year);
  invoice_number := format('%s/%s/%s', v_prefix, fiscal_year, lpad(v_seq::text, 4, '0'));
  return next;
end;
$$;

-- -----------------------------------------------------------------------------
-- Audit log
-- -----------------------------------------------------------------------------
create or replace function public.write_audit_log(
  p_org uuid, p_action text, p_entity_type text,
  p_entity_id uuid default null, p_before jsonb default null, p_after jsonb default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_privileged_caller() and not is_org_member(p_org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into audit_logs (org_id, actor_user_id, action, entity_type, entity_id, before, after)
  values (p_org, auth.uid(), p_action, p_entity_type, p_entity_id, p_before, p_after);
end;
$$;

-- -----------------------------------------------------------------------------
-- Trigger functions
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Member codes are always allocated here ('M-0001'); imports never supply them.
create or replace function public.members_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.member_code := 'M-' || lpad(next_counter_value(new.org_id, 'member')::text, 4, '0');
  if new.consent_messaging and new.consent_recorded_at is null then
    new.consent_recorded_at := now();
  end if;
  return new;
end;
$$;

create or replace function public.members_before_update() returns trigger
language plpgsql as $$
begin
  if new.member_code <> old.member_code then
    raise exception 'member_code is immutable' using errcode = '23514';
  end if;
  if new.org_id <> old.org_id then
    raise exception 'org_id is immutable' using errcode = '23514';
  end if;
  if new.consent_messaging is distinct from old.consent_messaging then
    new.consent_recorded_at := now();
  end if;
  return new;
end;
$$;

-- A child row's org must match its parent's org (member, invoice, membership, plan).
create or replace function public.enforce_parent_org() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v     jsonb := to_jsonb(new);
  v_org uuid;
begin
  if coalesce(v ->> 'member_id', '') <> '' then
    select org_id into v_org from members where id = (v ->> 'member_id')::uuid;
    if v_org is distinct from new.org_id then
      raise exception 'org_mismatch: member' using errcode = '23514';
    end if;
  end if;
  if coalesce(v ->> 'invoice_id', '') <> '' then
    select org_id into v_org from invoices where id = (v ->> 'invoice_id')::uuid;
    if v_org is distinct from new.org_id then
      raise exception 'org_mismatch: invoice' using errcode = '23514';
    end if;
  end if;
  if coalesce(v ->> 'membership_id', '') <> '' then
    select org_id into v_org from memberships where id = (v ->> 'membership_id')::uuid;
    if v_org is distinct from new.org_id then
      raise exception 'org_mismatch: membership' using errcode = '23514';
    end if;
  end if;
  if coalesce(v ->> 'plan_id', '') <> '' then
    select org_id into v_org from plans where id = (v ->> 'plan_id')::uuid;
    if v_org is distinct from new.org_id then
      raise exception 'org_mismatch: plan' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.payments_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_inv invoices;
begin
  select * into v_inv from invoices where id = new.invoice_id;
  if not found then
    raise exception 'invoice_not_found';
  end if;
  if v_inv.status = 'void' then
    raise exception 'invoice_void';
  end if;
  new.org_id := v_inv.org_id;
  new.member_id := v_inv.member_id;
  if auth.uid() is not null then
    new.collected_by := current_team_member_id(v_inv.org_id);
  end if;
  if new.paid_at is null then
    new.paid_at := now();
  end if;
  return new;
end;
$$;

create or replace function public.payments_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform recompute_invoice(new.invoice_id);
  return null;
end;
$$;

create or replace function public.payments_forbid_update() returns trigger
language plpgsql as $$
begin
  raise exception 'payments are immutable; record a reversal instead' using errcode = 'P0001';
end;
$$;

create or replace function public.memberships_after_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform refresh_member_status(new.member_id);
  return null;
end;
$$;

-- Settings changes (including the UPI ID) are audited with only the changed keys.
create or replace function public.organizations_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_old    jsonb := to_jsonb(old) - 'updated_at';
  v_new    jsonb := to_jsonb(new) - 'updated_at';
  v_before jsonb := '{}'::jsonb;
  v_after  jsonb := '{}'::jsonb;
  k        text;
begin
  for k in select jsonb_object_keys(v_new) loop
    if v_old -> k is distinct from v_new -> k then
      if k = 'kiosk_pin_hash' then
        v_before := v_before || jsonb_build_object(k, case when v_old ->> k is null then null else '[set]' end);
        v_after  := v_after  || jsonb_build_object(k, case when v_new ->> k is null then null else '[set]' end);
      else
        v_before := v_before || jsonb_build_object(k, v_old -> k);
        v_after  := v_after  || jsonb_build_object(k, v_new -> k);
      end if;
    end if;
  end loop;
  if v_after = '{}'::jsonb then
    return null;
  end if;
  insert into audit_logs (org_id, actor_user_id, action, entity_type, entity_id, before, after)
  values (new.id, auth.uid(), 'organization.updated', 'organization', new.id, v_before, v_after);
  return null;
end;
$$;

create or replace function public.organizations_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.deletion_scheduled_for is distinct from old.deletion_scheduled_for
     and not is_privileged_caller()
     and not has_org_role(old.id, array['owner']::public.team_role[]) then
    raise exception 'only the owner can schedule or cancel gym deletion' using errcode = '42501';
  end if;
  if new.vertical <> old.vertical then
    raise exception 'vertical is immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.organization_secrets_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_changed text[] := '{}';
begin
  if new.razorpay_key_id is distinct from old.razorpay_key_id then v_changed := v_changed || 'razorpay_key_id'; end if;
  if new.razorpay_key_secret_enc is distinct from old.razorpay_key_secret_enc then v_changed := v_changed || 'razorpay_key_secret'; end if;
  if new.razorpay_webhook_secret_enc is distinct from old.razorpay_webhook_secret_enc then v_changed := v_changed || 'razorpay_webhook_secret'; end if;
  if new.whatsapp_phone_number_id is distinct from old.whatsapp_phone_number_id then v_changed := v_changed || 'whatsapp_phone_number_id'; end if;
  if new.whatsapp_access_token_enc is distinct from old.whatsapp_access_token_enc then v_changed := v_changed || 'whatsapp_access_token'; end if;
  if cardinality(v_changed) = 0 then
    return null;
  end if;
  insert into audit_logs (org_id, actor_user_id, action, entity_type, entity_id, before, after)
  values (new.org_id, auth.uid(), 'organization.secrets_updated', 'organization_secrets', new.org_id, null,
          jsonb_build_object('changed', to_jsonb(v_changed), 'razorpay_key_id', new.razorpay_key_id));
  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- Derived state: invoice totals and membership / member status
-- -----------------------------------------------------------------------------
create or replace function public.recompute_invoice(p_invoice_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_paid   numeric(10,2);
  v_total  numeric(10,2);
  v_status public.invoice_status;
begin
  select total_amount, status into v_total, v_status from invoices where id = p_invoice_id for update;
  if not found then
    return;
  end if;
  select coalesce(sum(amount), 0) into v_paid from payments where invoice_id = p_invoice_id;
  if v_status = 'void' then
    update invoices set amount_paid = v_paid, balance_due = 0 where id = p_invoice_id;
  else
    update invoices
       set amount_paid = v_paid,
           balance_due = greatest(v_total - v_paid, 0),
           status = case
             when v_paid >= v_total then 'paid'::public.invoice_status
             when v_paid > 0 then 'partially_paid'::public.invoice_status
             else 'unpaid'::public.invoice_status
           end
     where id = p_invoice_id;
  end if;
end;
$$;

create or replace function public.compute_membership_status(m public.memberships, p_today date)
returns public.membership_status
language sql immutable as $$
  select case
    when m.status = 'cancelled' then 'cancelled'::public.membership_status
    when m.frozen_from is not null and p_today between m.frozen_from and m.frozen_to then 'frozen'::public.membership_status
    when m.start_date > p_today then 'upcoming'::public.membership_status
    when m.end_date < p_today then 'expired'::public.membership_status
    when m.sessions_total is not null and m.sessions_used >= m.sessions_total then 'expired'::public.membership_status
    else 'active'::public.membership_status
  end;
$$;

-- Recomputes every membership of one member and the cached members.status.
-- Returns the member status: new | active | expiring | expired | frozen.
create or replace function public.refresh_member_status(p_member_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_today  date := ist_today();
  v_status text;
begin
  -- A freeze window that has passed without an explicit unfreeze pushes the end date out.
  update memberships m
     set end_date = m.end_date + (m.frozen_to - m.frozen_from + 1),
         freeze_days_used = m.freeze_days_used + (m.frozen_to - m.frozen_from + 1),
         frozen_from = null,
         frozen_to = null
   where m.member_id = p_member_id
     and m.status <> 'cancelled'
     and m.frozen_to is not null
     and m.frozen_to < v_today;

  update memberships m
     set status = compute_membership_status(m, v_today)
   where m.member_id = p_member_id
     and m.status <> 'cancelled'
     and m.status <> compute_membership_status(m, v_today);

  select case
           when bool_or(m.status = 'frozen') then 'frozen'
           when bool_or(m.status = 'active') then
             case
               when max(m.end_date) filter (where m.status = 'active') <= v_today + 7
                    and not bool_or(m.status = 'upcoming')
                 then 'expiring'
               else 'active'
             end
           when bool_or(m.status = 'upcoming') then 'new'
           when count(*) > 0 then 'expired'
           else 'new'
         end
    into v_status
    from memberships m
   where m.member_id = p_member_id
     and m.status <> 'cancelled';

  v_status := coalesce(v_status, 'new');
  update members set status = v_status where id = p_member_id and status <> v_status;
  return v_status;
end;
$$;

-- Nightly: recompute every member of one org, or of all orgs when p_org is null (cron).
create or replace function public.recompute_all_statuses(p_org uuid default null) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer := 0;
  r       record;
begin
  if not is_privileged_caller() then
    if p_org is null then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    perform assert_org_role(p_org, array['owner', 'manager', 'staff']::public.team_role[]);
  end if;
  for r in
    select m.id from members m
    where (p_org is null or m.org_id = p_org) and m.deleted_at is null
  loop
    perform refresh_member_status(r.id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- Organizations and team
-- -----------------------------------------------------------------------------
create or replace function public.create_organization(
  p_name text,
  p_city text,
  p_phone text,
  p_upi_vpa text,
  p_upi_payee_name text,
  p_gst_enabled boolean,
  p_gstin text,
  p_invoice_prefix text,
  p_state text default null,
  p_email text default null
) returns public.organizations
language plpgsql security definer set search_path = public as $$
declare
  v_org organizations;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  insert into organizations (name, city, state, phone, email, upi_vpa, upi_payee_name, gst_enabled, gstin, invoice_prefix)
  values (
    btrim(p_name), nullif(btrim(p_city), ''), nullif(btrim(p_state), ''), nullif(btrim(p_phone), ''),
    nullif(lower(btrim(p_email)), ''), nullif(btrim(p_upi_vpa), ''), nullif(btrim(p_upi_payee_name), ''),
    coalesce(p_gst_enabled, false), case when coalesce(p_gst_enabled, false) then upper(btrim(p_gstin)) end,
    upper(btrim(p_invoice_prefix))
  )
  returning * into v_org;

  insert into team_members (org_id, user_id, role) values (v_org.id, v_uid, 'owner');
  insert into organization_secrets (org_id) values (v_org.id);
  insert into counters (org_id, key, next_value) values (v_org.id, 'member', 1);
  insert into profiles (id, active_org_id) values (v_uid, v_org.id)
  on conflict (id) do update set active_org_id = excluded.active_org_id;

  perform write_audit_log(v_org.id, 'organization.created', 'organization', v_org.id, null, to_jsonb(v_org) - 'kiosk_pin_hash');
  return v_org;
end;
$$;

-- Token hash is computed by the app (sha256 of the raw invite token).
create or replace function public.accept_invitation(p_token_hash text) returns public.team_members
language plpgsql security definer set search_path = public as $$
declare
  v_inv   invitations;
  v_uid   uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_tm    team_members;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  select * into v_inv from invitations where token_hash = p_token_hash for update;
  if not found or v_inv.accepted_at is not null or v_inv.expires_at < now() then
    raise exception 'invitation_invalid';
  end if;
  if v_email <> v_inv.email then
    raise exception 'invitation_email_mismatch';
  end if;

  insert into team_members (org_id, user_id, role)
  values (v_inv.org_id, v_uid, v_inv.role)
  on conflict (org_id, user_id) do update set role = excluded.role, is_active = true
  returning * into v_tm;

  update invitations set accepted_at = now() where id = v_inv.id;
  insert into profiles (id, active_org_id) values (v_uid, v_inv.org_id)
  on conflict (id) do update set active_org_id = excluded.active_org_id;

  perform write_audit_log(v_inv.org_id, 'team.invitation_accepted', 'team_member', v_tm.id, null, to_jsonb(v_tm));
  return v_tm;
end;
$$;

create or replace function public.change_team_role(p_team_member_id uuid, p_role public.team_role) returns public.team_members
language plpgsql security definer set search_path = public as $$
declare
  v_tm     team_members;
  v_before team_members;
begin
  select * into v_tm from team_members where id = p_team_member_id for update;
  if not found then
    raise exception 'team_member_not_found';
  end if;
  perform assert_org_role(v_tm.org_id, array['owner', 'manager']::public.team_role[]);
  if v_tm.role = 'owner' or p_role = 'owner' then
    raise exception 'use transfer_ownership to change the owner' using errcode = '42501';
  end if;
  if v_tm.user_id = auth.uid() then
    raise exception 'cannot change your own role' using errcode = '42501';
  end if;
  v_before := v_tm;
  update team_members set role = p_role where id = p_team_member_id returning * into v_tm;
  perform write_audit_log(v_tm.org_id, 'team.role_changed', 'team_member', v_tm.id, to_jsonb(v_before), to_jsonb(v_tm));
  return v_tm;
end;
$$;

create or replace function public.set_team_member_active(p_team_member_id uuid, p_active boolean) returns public.team_members
language plpgsql security definer set search_path = public as $$
declare
  v_tm     team_members;
  v_before team_members;
begin
  select * into v_tm from team_members where id = p_team_member_id for update;
  if not found then
    raise exception 'team_member_not_found';
  end if;
  perform assert_org_role(v_tm.org_id, array['owner', 'manager']::public.team_role[]);
  if v_tm.role = 'owner' then
    raise exception 'the owner cannot be deactivated' using errcode = '42501';
  end if;
  if v_tm.user_id = auth.uid() then
    raise exception 'cannot deactivate yourself' using errcode = '42501';
  end if;
  v_before := v_tm;
  update team_members set is_active = p_active where id = p_team_member_id returning * into v_tm;
  perform write_audit_log(v_tm.org_id, case when p_active then 'team.member_activated' else 'team.member_deactivated' end,
                          'team_member', v_tm.id, to_jsonb(v_before), to_jsonb(v_tm));
  return v_tm;
end;
$$;

-- The current owner becomes a manager; the target becomes the single owner.
create or replace function public.transfer_ownership(p_team_member_id uuid) returns public.team_members
language plpgsql security definer set search_path = public as $$
declare
  v_tm team_members;
begin
  select * into v_tm from team_members where id = p_team_member_id for update;
  if not found then
    raise exception 'team_member_not_found';
  end if;
  if auth.uid() is null or not has_org_role(v_tm.org_id, array['owner']::public.team_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not v_tm.is_active then
    raise exception 'team_member_inactive';
  end if;
  if v_tm.role = 'owner' then
    return v_tm;
  end if;
  update team_members set role = 'manager' where org_id = v_tm.org_id and role = 'owner';
  update team_members set role = 'owner' where id = p_team_member_id returning * into v_tm;
  perform write_audit_log(v_tm.org_id, 'team.ownership_transferred', 'team_member', v_tm.id,
                          jsonb_build_object('previous_owner_user_id', auth.uid()), to_jsonb(v_tm));
  return v_tm;
end;
$$;

create or replace function public.schedule_organization_deletion(p_org uuid) returns public.organizations
language plpgsql security definer set search_path = public as $$
declare
  v_org organizations;
begin
  perform assert_org_role(p_org, array['owner']::public.team_role[]);
  update organizations set deletion_scheduled_for = now() + interval '7 days'
   where id = p_org returning * into v_org;
  if not found then
    raise exception 'organization_not_found';
  end if;
  return v_org;
end;
$$;

create or replace function public.cancel_organization_deletion(p_org uuid) returns public.organizations
language plpgsql security definer set search_path = public as $$
declare
  v_org organizations;
begin
  perform assert_org_role(p_org, array['owner']::public.team_role[]);
  update organizations set deletion_scheduled_for = null where id = p_org returning * into v_org;
  if not found then
    raise exception 'organization_not_found';
  end if;
  return v_org;
end;
$$;

-- -----------------------------------------------------------------------------
-- Members
-- -----------------------------------------------------------------------------
create or replace function public.soft_delete_member(p_member_id uuid) returns public.members
language plpgsql security definer set search_path = public as $$
declare
  v_m members;
begin
  select * into v_m from members where id = p_member_id for update;
  if not found then
    raise exception 'member_not_found';
  end if;
  perform assert_org_role(v_m.org_id, array['owner', 'manager']::public.team_role[]);
  if v_m.deleted_at is not null then
    return v_m;
  end if;
  update members set deleted_at = now() where id = p_member_id returning * into v_m;
  update portal_tokens set revoked_at = now() where member_id = p_member_id and revoked_at is null;
  perform write_audit_log(v_m.org_id, 'member.deleted', 'member', v_m.id, null,
                          jsonb_build_object('member_code', v_m.member_code, 'deleted_at', v_m.deleted_at));
  return v_m;
end;
$$;

create or replace function public.restore_member(p_member_id uuid) returns public.members
language plpgsql security definer set search_path = public as $$
declare
  v_m members;
begin
  select * into v_m from members where id = p_member_id for update;
  if not found then
    raise exception 'member_not_found';
  end if;
  perform assert_org_role(v_m.org_id, array['owner', 'manager']::public.team_role[]);
  if v_m.deleted_at is null then
    return v_m;
  end if;
  if exists (select 1 from members x where x.org_id = v_m.org_id and x.phone = v_m.phone and x.deleted_at is null and x.id <> v_m.id) then
    raise exception 'phone_in_use';
  end if;
  update members set deleted_at = null where id = p_member_id returning * into v_m;
  perform write_audit_log(v_m.org_id, 'member.restored', 'member', v_m.id, null, jsonb_build_object('member_code', v_m.member_code));
  return v_m;
end;
$$;

-- DPDP erasure: strips personal data and activity, keeps the financial ledger
-- (invoices and payments are legally retained) attached to an anonymised member.
create or replace function public.purge_member_data(p_member_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_m          members;
  v_anon_phone text;
begin
  select * into v_m from members where id = p_member_id for update;
  if not found then
    raise exception 'member_not_found';
  end if;
  perform assert_org_role(v_m.org_id, array['owner']::public.team_role[]);
  v_anon_phone := '+000' || lpad(right(abs(hashtext(v_m.id::text))::text, 10), 10, '0');

  update members
     set full_name = 'Deleted member',
         phone = v_anon_phone,
         alt_phone = null,
         email = null,
         gender = null,
         dob = null,
         photo_url = null,
         address = null,
         emergency_contact_name = null,
         emergency_contact_phone = null,
         notes = null,
         tags = '{}',
         consent_messaging = false,
         referred_by_member_id = null,
         deleted_at = coalesce(deleted_at, now())
   where id = p_member_id;

  delete from check_ins where member_id = p_member_id;
  delete from message_logs where member_id = p_member_id;
  delete from portal_tokens where member_id = p_member_id;
  delete from payment_claims where member_id = p_member_id and status = 'pending';
  update memberships set notes = null where member_id = p_member_id;
  update invoices set notes = null where member_id = p_member_id;

  perform write_audit_log(v_m.org_id, 'member.purged', 'member', v_m.id, jsonb_build_object('member_code', v_m.member_code), null);
  return v_m.id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Memberships
-- -----------------------------------------------------------------------------
-- Creates the membership, its invoice (GST split from org settings) and the
-- invoice line in one transaction. Payment is recorded separately with record_payment.
create or replace function public.create_membership(
  p_member_id uuid,
  p_plan_id uuid,
  p_start_date date,
  p_discount_amount numeric default 0,
  p_notes text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_member members;
  v_plan   plans;
  v_org    organizations;
  v_m      memberships;
  v_inv    invoices;
  v_end    date;
  v_tm     uuid;
  v_total  numeric(10,2);
  v_rate   numeric(5,2);
  v_gst    record;
  v_num    record;
  v_today  date := ist_today();
  v_disc   numeric(10,2) := coalesce(p_discount_amount, 0);
begin
  select * into v_member from members where id = p_member_id and deleted_at is null for update;
  if not found then
    raise exception 'member_not_found';
  end if;
  perform assert_org_role(v_member.org_id, array['owner', 'manager', 'staff']::public.team_role[]);

  select * into v_plan from plans where id = p_plan_id and org_id = v_member.org_id and is_active;
  if not found then
    raise exception 'plan_not_found';
  end if;
  select * into v_org from organizations where id = v_member.org_id;
  if p_start_date is null then
    raise exception 'start_date_required';
  end if;
  if v_disc < 0 or v_disc > v_plan.price then
    raise exception 'invalid_discount';
  end if;

  v_end := p_start_date + (v_plan.duration_days - 1);
  v_tm := current_team_member_id(v_member.org_id);
  v_total := v_plan.price - v_disc;
  v_rate := case when v_org.gst_enabled then v_org.gst_rate else 0 end;

  insert into memberships (org_id, member_id, plan_id, start_date, end_date, sessions_total, list_price,
                           discount_amount, final_amount, status, notes, created_by)
  values (v_member.org_id, p_member_id, p_plan_id, p_start_date, v_end,
          case when v_plan.type = 'sessions' then v_plan.session_count end,
          v_plan.price, v_disc, v_total,
          case when p_start_date > v_today then 'upcoming'::public.membership_status else 'active'::public.membership_status end,
          nullif(btrim(p_notes), ''), v_tm)
  returning * into v_m;

  select * into v_gst from split_gst(v_total, v_rate);
  select * into v_num from allocate_invoice_number(v_org.id, v_today);

  insert into invoices (org_id, member_id, membership_id, invoice_number, fiscal_year, issue_date, due_date,
                        subtotal, discount_amount, taxable_value, gst_rate, cgst_amount, sgst_amount,
                        total_amount, amount_paid, balance_due, status, created_by)
  values (v_org.id, p_member_id, v_m.id, v_num.invoice_number, v_num.fiscal_year, v_today, v_today,
          v_plan.price, v_disc, v_gst.taxable_value, v_rate, v_gst.cgst_amount, v_gst.sgst_amount,
          v_total, 0, v_total, case when v_total = 0 then 'paid'::public.invoice_status else 'unpaid'::public.invoice_status end, v_tm)
  returning * into v_inv;

  insert into invoice_items (org_id, invoice_id, description, quantity, unit_price, amount)
  values (v_org.id, v_inv.id,
          format('%s (%s to %s)', v_plan.name, to_char(p_start_date, 'DD Mon YYYY'), to_char(v_end, 'DD Mon YYYY')),
          1, v_plan.price, v_plan.price);

  perform write_audit_log(v_org.id, 'membership.created', 'membership', v_m.id, null,
                          jsonb_build_object('plan_id', p_plan_id, 'start_date', p_start_date, 'end_date', v_end,
                                             'final_amount', v_total, 'invoice_number', v_inv.invoice_number));

  select * into v_m from memberships where id = v_m.id;
  return jsonb_build_object('membership', to_jsonb(v_m), 'invoice', to_jsonb(v_inv));
end;
$$;

create or replace function public.freeze_membership(p_membership_id uuid, p_from date, p_to date) returns public.memberships
language plpgsql security definer set search_path = public as $$
declare
  v_m     memberships;
  v_today date := ist_today();
begin
  select * into v_m from memberships where id = p_membership_id for update;
  if not found then
    raise exception 'membership_not_found';
  end if;
  perform assert_org_role(v_m.org_id, array['owner', 'manager', 'staff']::public.team_role[]);
  if v_m.status not in ('active', 'upcoming') then
    raise exception 'only active memberships can be frozen';
  end if;
  if v_m.frozen_from is not null then
    raise exception 'membership already frozen';
  end if;
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'invalid_freeze_window';
  end if;
  if p_from < v_today then
    raise exception 'freeze cannot start in the past';
  end if;
  if p_from < v_m.start_date or p_from > v_m.end_date then
    raise exception 'freeze must start within the membership';
  end if;
  if (p_to - p_from + 1) > 90 then
    raise exception 'freeze cannot exceed 90 days';
  end if;

  update memberships set frozen_from = p_from, frozen_to = p_to where id = p_membership_id;
  perform write_audit_log(v_m.org_id, 'membership.frozen', 'membership', v_m.id, null,
                          jsonb_build_object('frozen_from', p_from, 'frozen_to', p_to));
  select * into v_m from memberships where id = p_membership_id;
  return v_m;
end;
$$;

-- Days actually frozen = [frozen_from .. min(frozen_to, yesterday)]; the end date moves out by that many days.
create or replace function public.unfreeze_membership(p_membership_id uuid) returns public.memberships
language plpgsql security definer set search_path = public as $$
declare
  v_m     memberships;
  v_today date := ist_today();
  v_days  integer;
begin
  select * into v_m from memberships where id = p_membership_id for update;
  if not found then
    raise exception 'membership_not_found';
  end if;
  perform assert_org_role(v_m.org_id, array['owner', 'manager', 'staff']::public.team_role[]);
  if v_m.frozen_from is null then
    raise exception 'membership is not frozen';
  end if;
  v_days := greatest(0, least(v_m.frozen_to, v_today - 1) - v_m.frozen_from + 1);

  update memberships
     set end_date = end_date + v_days,
         freeze_days_used = freeze_days_used + v_days,
         frozen_from = null,
         frozen_to = null
   where id = p_membership_id;

  perform write_audit_log(v_m.org_id, 'membership.unfrozen', 'membership', v_m.id,
                          jsonb_build_object('frozen_from', v_m.frozen_from, 'frozen_to', v_m.frozen_to, 'end_date', v_m.end_date),
                          jsonb_build_object('days_frozen', v_days, 'end_date', v_m.end_date + v_days));
  select * into v_m from memberships where id = p_membership_id;
  return v_m;
end;
$$;

create or replace function public.cancel_membership(p_membership_id uuid, p_reason text) returns public.memberships
language plpgsql security definer set search_path = public as $$
declare
  v_m memberships;
begin
  select * into v_m from memberships where id = p_membership_id for update;
  if not found then
    raise exception 'membership_not_found';
  end if;
  perform assert_org_role(v_m.org_id, array['owner', 'manager']::public.team_role[]);
  if v_m.status = 'cancelled' then
    return v_m;
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'reason_required';
  end if;
  update memberships set status = 'cancelled', frozen_from = null, frozen_to = null where id = p_membership_id;
  perform write_audit_log(v_m.org_id, 'membership.cancelled', 'membership', v_m.id,
                          jsonb_build_object('status', v_m.status), jsonb_build_object('status', 'cancelled', 'reason', p_reason));
  select * into v_m from memberships where id = p_membership_id;
  return v_m;
end;
$$;

-- -----------------------------------------------------------------------------
-- Payments
-- -----------------------------------------------------------------------------
-- The only way money enters the ledger. Partial amounts allowed; totals and
-- status on the invoice are maintained by the payments insert trigger.
create or replace function public.record_payment(
  p_invoice_id uuid,
  p_amount numeric,
  p_method public.payment_method,
  p_utr text default null,
  p_reference text default null,
  p_paid_at timestamptz default null,
  p_razorpay_payment_id text default null,
  p_collection_request_id uuid default null
) returns public.payments
language plpgsql security definer set search_path = public as $$
declare
  v_inv invoices;
  v_pay payments;
  v_utr text := nullif(btrim(coalesce(p_utr, '')), '');
begin
  select * into v_inv from invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'invoice_not_found';
  end if;
  perform assert_org_role(v_inv.org_id, array['owner', 'manager', 'staff']::public.team_role[]);
  if v_inv.status = 'void' then
    raise exception 'invoice_void';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_amount';
  end if;
  -- Gateway money is never rejected; any excess shows as amount_paid above total.
  if p_method <> 'razorpay' and p_amount > v_inv.balance_due then
    raise exception 'amount_exceeds_balance';
  end if;
  if v_utr is not null then
    if v_utr !~ '^[0-9]{12}$' then
      raise exception 'invalid_utr';
    end if;
    if exists (select 1 from payments where org_id = v_inv.org_id and utr = v_utr and not is_reversal) then
      raise exception 'duplicate_utr';
    end if;
  end if;
  if p_method = 'razorpay' then
    if p_razorpay_payment_id is null then
      raise exception 'razorpay_payment_id_required';
    end if;
    if exists (select 1 from payments where org_id = v_inv.org_id and razorpay_payment_id = p_razorpay_payment_id and not is_reversal) then
      raise exception 'duplicate_razorpay_payment';
    end if;
  end if;

  insert into payments (org_id, invoice_id, member_id, amount, method, utr, reference, paid_at, collected_by, razorpay_payment_id)
  values (v_inv.org_id, v_inv.id, v_inv.member_id, p_amount, p_method, v_utr, nullif(btrim(coalesce(p_reference, '')), ''),
          coalesce(p_paid_at, now()), current_team_member_id(v_inv.org_id), p_razorpay_payment_id)
  returning * into v_pay;

  if p_collection_request_id is not null then
    update collection_requests set status = 'paid', confirmed_payment_id = v_pay.id
     where id = p_collection_request_id and invoice_id = v_inv.id and status = 'pending';
  elsif p_method = 'upi' then
    update collection_requests set status = 'paid', confirmed_payment_id = v_pay.id
     where invoice_id = v_inv.id and provider = 'upi_direct' and status = 'pending';
  end if;

  perform write_audit_log(v_inv.org_id, 'payment.recorded', 'payment', v_pay.id, null, to_jsonb(v_pay));
  return v_pay;
end;
$$;

create or replace function public.reverse_payment(p_payment_id uuid, p_reason text) returns public.payments
language plpgsql security definer set search_path = public as $$
declare
  v_p   payments;
  v_rev payments;
begin
  select * into v_p from payments where id = p_payment_id for update;
  if not found then
    raise exception 'payment_not_found';
  end if;
  perform assert_org_role(v_p.org_id, array['owner', 'manager']::public.team_role[]);
  if v_p.is_reversal then
    raise exception 'cannot_reverse_reversal';
  end if;
  if exists (select 1 from payments where reverses_payment_id = v_p.id) then
    raise exception 'already_reversed';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'reason_required';
  end if;

  insert into payments (org_id, invoice_id, member_id, amount, method, paid_at, collected_by, is_reversal, reverses_payment_id, reversal_reason)
  values (v_p.org_id, v_p.invoice_id, v_p.member_id, -v_p.amount, v_p.method, now(), current_team_member_id(v_p.org_id), true, v_p.id, btrim(p_reason))
  returning * into v_rev;

  perform write_audit_log(v_p.org_id, 'payment.reversed', 'payment', v_p.id, to_jsonb(v_p), to_jsonb(v_rev));
  return v_rev;
end;
$$;

-- Invoices are voided, never deleted. Reverse payments first; a voided invoice carries no balance.
create or replace function public.void_invoice(p_invoice_id uuid, p_reason text) returns public.invoices
language plpgsql security definer set search_path = public as $$
declare
  v_inv invoices;
  v_tm  uuid;
begin
  select * into v_inv from invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'invoice_not_found';
  end if;
  perform assert_org_role(v_inv.org_id, array['owner', 'manager']::public.team_role[]);
  if v_inv.status = 'void' then
    return v_inv;
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'reason_required';
  end if;
  if v_inv.amount_paid <> 0 then
    raise exception 'invoice_has_payments';
  end if;
  v_tm := current_team_member_id(v_inv.org_id);

  update invoices
     set status = 'void', void_reason = btrim(p_reason), voided_at = now(), voided_by = v_tm, balance_due = 0
   where id = p_invoice_id;
  update collection_requests set status = 'cancelled' where invoice_id = p_invoice_id and status = 'pending';
  update payment_claims
     set status = 'rejected', reject_reason = 'Invoice voided', reviewed_at = now(), reviewed_by = v_tm
   where invoice_id = p_invoice_id and status = 'pending';

  perform write_audit_log(v_inv.org_id, 'invoice.voided', 'invoice', v_inv.id, to_jsonb(v_inv),
                          jsonb_build_object('status', 'void', 'void_reason', p_reason));
  select * into v_inv from invoices where id = p_invoice_id;
  return v_inv;
end;
$$;

-- -----------------------------------------------------------------------------
-- Payment claims (member portal -> staff confirmation)
-- -----------------------------------------------------------------------------
-- Called only by the portal server route (service role) after token validation.
create or replace function public.submit_payment_claim(p_invoice_id uuid, p_amount numeric, p_utr text, p_note text default null)
returns public.payment_claims
language plpgsql security definer set search_path = public as $$
declare
  v_inv   invoices;
  v_claim payment_claims;
  v_utr   text := btrim(coalesce(p_utr, ''));
begin
  if not is_privileged_caller() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_inv from invoices where id = p_invoice_id for update;
  if not found or v_inv.status = 'void' or v_inv.balance_due <= 0 then
    raise exception 'invoice_not_payable';
  end if;
  if v_utr !~ '^[0-9]{12}$' then
    raise exception 'invalid_utr';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > v_inv.balance_due then
    raise exception 'invalid_amount';
  end if;
  if exists (select 1 from payments where org_id = v_inv.org_id and utr = v_utr and not is_reversal)
     or exists (select 1 from payment_claims where org_id = v_inv.org_id and utr = v_utr and status in ('pending', 'confirmed')) then
    raise exception 'duplicate_utr';
  end if;
  if (select count(*) from payment_claims where invoice_id = p_invoice_id and claimed_at >= ist_day_start(ist_today())) >= 3 then
    raise exception 'claim_limit_reached';
  end if;

  insert into payment_claims (org_id, invoice_id, member_id, amount, utr, note)
  values (v_inv.org_id, v_inv.id, v_inv.member_id, p_amount, v_utr, nullif(btrim(coalesce(p_note, '')), ''))
  returning * into v_claim;

  perform write_audit_log(v_inv.org_id, 'payment_claim.submitted', 'payment_claim', v_claim.id, null, to_jsonb(v_claim));
  return v_claim;
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
  perform assert_org_role(v_claim.org_id, array['owner', 'manager', 'staff']::public.team_role[]);
  if v_claim.status <> 'pending' then
    raise exception 'claim_not_pending';
  end if;

  v_pay := record_payment(v_claim.invoice_id, v_claim.amount, 'upi', v_claim.utr, null, v_claim.claimed_at, null, null);

  update payment_claims
     set status = 'confirmed', reviewed_by = current_team_member_id(v_claim.org_id), reviewed_at = now(), payment_id = v_pay.id
   where id = p_claim_id
  returning * into v_claim;

  perform write_audit_log(v_claim.org_id, 'payment_claim.confirmed', 'payment_claim', v_claim.id, null,
                          jsonb_build_object('utr', v_claim.utr, 'amount', v_claim.amount, 'payment_id', v_pay.id));
  return v_claim;
end;
$$;

create or replace function public.reject_payment_claim(p_claim_id uuid, p_reason text) returns public.payment_claims
language plpgsql security definer set search_path = public as $$
declare
  v_claim payment_claims;
begin
  select * into v_claim from payment_claims where id = p_claim_id for update;
  if not found then
    raise exception 'claim_not_found';
  end if;
  perform assert_org_role(v_claim.org_id, array['owner', 'manager', 'staff']::public.team_role[]);
  if v_claim.status <> 'pending' then
    raise exception 'claim_not_pending';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'reason_required';
  end if;

  update payment_claims
     set status = 'rejected', reviewed_by = current_team_member_id(v_claim.org_id), reviewed_at = now(), reject_reason = btrim(p_reason)
   where id = p_claim_id
  returning * into v_claim;

  perform write_audit_log(v_claim.org_id, 'payment_claim.rejected', 'payment_claim', v_claim.id, null,
                          jsonb_build_object('utr', v_claim.utr, 'amount', v_claim.amount, 'reason', p_reason));
  return v_claim;
end;
$$;

-- -----------------------------------------------------------------------------
-- Attendance
-- -----------------------------------------------------------------------------
-- Flags: expired > expiring > dues_pending. When settings.block_expired_checkin
-- is on, an expired member raises 'checkin_blocked' unless p_override is true
-- (the app sets it only after verifying the kiosk PIN); overrides are audited.
create or replace function public.check_in_member(
  p_member_id uuid,
  p_method public.check_in_method default 'manual',
  p_override boolean default false
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_member  members;
  v_org     organizations;
  v_ms      memberships;
  v_recent  check_ins;
  v_ci      check_ins;
  v_status  text;
  v_flag    public.check_in_flag;
  v_dues    numeric(10,2) := 0;
  v_block   boolean := false;
  v_tm      uuid;
  v_summary jsonb;
begin
  select * into v_member from members where id = p_member_id and deleted_at is null for update;
  if not found then
    raise exception 'member_not_found';
  end if;
  perform assert_org_role(v_member.org_id, array['owner', 'manager', 'staff']::public.team_role[]);
  select * into v_org from organizations where id = v_member.org_id;

  v_status := refresh_member_status(p_member_id);
  select * into v_ms from memberships
   where member_id = p_member_id and status <> 'cancelled'
   order by (status in ('active', 'frozen')) desc, end_date desc
   limit 1;
  select coalesce(sum(balance_due), 0) into v_dues from invoices
   where member_id = p_member_id and status in ('unpaid', 'partially_paid');

  v_flag := case
    when v_status in ('expired', 'new') then 'expired'::public.check_in_flag
    when v_status = 'expiring' then 'expiring'::public.check_in_flag
    when v_dues > 0 then 'dues_pending'::public.check_in_flag
    else null
  end;
  v_block := coalesce(v_flag = 'expired', false) and coalesce((v_org.settings ->> 'block_expired_checkin')::boolean, false);
  v_tm := current_team_member_id(v_member.org_id);

  v_summary := jsonb_build_object(
    'id', v_member.id, 'full_name', v_member.full_name, 'member_code', v_member.member_code,
    'photo_url', v_member.photo_url, 'status', v_status, 'end_date', v_ms.end_date,
    'sessions_total', v_ms.sessions_total, 'sessions_used', v_ms.sessions_used, 'balance_due', v_dues
  );

  -- A second scan within five minutes returns the first check-in and never consumes a second session.
  select * into v_recent from check_ins
   where member_id = p_member_id and checked_in_at > now() - interval '5 minutes'
   order by checked_in_at desc limit 1;
  if found then
    return jsonb_build_object('duplicate', true, 'check_in', to_jsonb(v_recent), 'member', v_summary);
  end if;

  if v_block and not p_override then
    raise exception 'checkin_blocked' using errcode = 'P0001', detail = v_summary::text;
  end if;

  insert into check_ins (org_id, member_id, checked_in_at, method, checked_in_by, flag, override_by)
  values (v_member.org_id, p_member_id, now(), p_method, v_tm, v_flag, case when v_block then v_tm end)
  returning * into v_ci;

  if v_ms.id is not null and v_ms.status = 'active' and v_ms.sessions_total is not null then
    update memberships set sessions_used = sessions_used + 1 where id = v_ms.id;
    select * into v_ms from memberships where id = v_ms.id;
    select status into v_status from members where id = p_member_id;
    v_summary := v_summary || jsonb_build_object('status', v_status, 'sessions_used', v_ms.sessions_used);
  end if;

  if v_block then
    perform write_audit_log(v_member.org_id, 'check_in.override', 'check_in', v_ci.id, null, to_jsonb(v_ci));
  end if;

  return jsonb_build_object('duplicate', false, 'check_in', to_jsonb(v_ci), 'member', v_summary);
end;
$$;

-- -----------------------------------------------------------------------------
-- Public-endpoint rate limiting and daily maintenance (service role only)
-- -----------------------------------------------------------------------------
create or replace function public.check_rate_limit(p_key text, p_limit integer, p_window_seconds integer) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_now   timestamptz := now();
  v_count integer;
begin
  if not is_privileged_caller() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into rate_limits (key, window_start, count, updated_at)
  values (p_key, v_now, 1, v_now)
  on conflict (key) do update
    set count = case when rate_limits.window_start + make_interval(secs => p_window_seconds) < v_now then 1 else rate_limits.count + 1 end,
        window_start = case when rate_limits.window_start + make_interval(secs => p_window_seconds) < v_now then v_now else rate_limits.window_start end,
        updated_at = v_now
  returning count into v_count;
  return v_count <= p_limit;
end;
$$;

create or replace function public.daily_maintenance() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_expired_requests integer;
  v_purged_members   integer := 0;
  v_purged_orgs      integer;
  v_rate_limits      integer;
  v_tokens           integer;
  r                  record;
begin
  if not is_privileged_caller() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update collection_requests set status = 'expired' where status = 'pending' and expires_at < now();
  get diagnostics v_expired_requests = row_count;

  for r in select id from members where deleted_at is not null and deleted_at < now() - interval '30 days' and full_name <> 'Deleted member' loop
    perform purge_member_data(r.id);
    v_purged_members := v_purged_members + 1;
  end loop;

  delete from organizations where deletion_scheduled_for is not null and deletion_scheduled_for < now();
  get diagnostics v_purged_orgs = row_count;

  delete from rate_limits where updated_at < now() - interval '1 day';
  get diagnostics v_rate_limits = row_count;

  delete from portal_tokens where expires_at < now() - interval '30 days' or (revoked_at is not null and revoked_at < now() - interval '30 days');
  get diagnostics v_tokens = row_count;

  delete from invitations where accepted_at is null and expires_at < now() - interval '30 days';

  return jsonb_build_object(
    'expired_collection_requests', v_expired_requests,
    'purged_members', v_purged_members,
    'purged_organizations', v_purged_orgs,
    'rate_limit_rows_deleted', v_rate_limits,
    'portal_tokens_deleted', v_tokens
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Triggers
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'organizations', 'profiles', 'organization_secrets', 'team_members', 'invitations', 'members', 'plans',
    'memberships', 'invoices', 'invoice_items', 'payments', 'collection_requests', 'payment_claims',
    'check_ins', 'message_logs', 'expenses', 'portal_tokens', 'audit_logs', 'razorpay_events'
  ] loop
    execute format('create trigger %I_set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t, t);
  end loop;

  foreach t in array array[
    'memberships', 'invoices', 'invoice_items', 'collection_requests', 'payment_claims',
    'check_ins', 'message_logs', 'portal_tokens'
  ] loop
    execute format('create trigger %I_enforce_parent_org before insert or update on public.%I for each row execute function public.enforce_parent_org()', t, t);
  end loop;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create trigger members_before_insert
  before insert on public.members
  for each row execute function public.members_before_insert();

create trigger members_before_update
  before update on public.members
  for each row execute function public.members_before_update();

create trigger payments_before_insert
  before insert on public.payments
  for each row execute function public.payments_before_insert();

create trigger payments_after_insert
  after insert on public.payments
  for each row execute function public.payments_after_insert();

create trigger payments_forbid_update
  before update on public.payments
  for each row execute function public.payments_forbid_update();

create trigger memberships_refresh_member
  after insert or update on public.memberships
  for each row when (pg_trigger_depth() < 1) execute function public.memberships_after_change();

create trigger organizations_guard
  before update on public.organizations
  for each row execute function public.organizations_guard();

create trigger organizations_audit
  after update on public.organizations
  for each row execute function public.organizations_audit();

create trigger organization_secrets_audit
  after update on public.organization_secrets
  for each row execute function public.organization_secrets_audit();
