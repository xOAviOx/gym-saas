-- M4: reminders, message templates and WhatsApp delivery.
-- Additive: existing members get English as their message language.
--
-- * The app renders every message body (it signs pay links and check-in card
--   links) and stores it through prepare_message, which checks consent and that
--   every referenced row belongs to the same member and gym.
-- * Direct writes to message_logs are closed. Staff mark manual sends or skip a
--   message; WhatsApp Cloud API results are recorded only by the service role.
-- * The daily job asks daily_message_candidates who is due today. Unique
--   indexes keep one reminder per member per day, one birthday wish per day,
--   one receipt per payment and one welcome per member, so reruns are safe.

-- -----------------------------------------------------------------------------
-- Members choose the language of their messages.
-- -----------------------------------------------------------------------------
alter table public.members
  add column preferred_language text not null default 'en'
    check (preferred_language in ('en', 'hi'));

-- -----------------------------------------------------------------------------
-- Message log
-- -----------------------------------------------------------------------------
alter table public.message_logs
  add column language         text not null default 'en' check (language in ('en', 'hi')),
  add column variables        jsonb not null default '{}'::jsonb check (jsonb_typeof(variables) = 'object'),
  add column payment_id       uuid references public.payments (id) on delete set null,
  -- Set while the WhatsApp Cloud API call is in flight, so two senders never send twice.
  add column api_attempted_at timestamptz,
  add constraint message_logs_kind_check check (template_key in (
    'membership_expiring', 'membership_expired', 'dues_overdue', 'payment_receipt', 'welcome', 'birthday')),
  add constraint message_logs_body_length check (char_length(body) between 1 and 2000),
  add constraint message_logs_reminder_date_check check (
    (template_key in ('membership_expiring', 'membership_expired', 'dues_overdue', 'birthday'))
    = (reminder_date is not null));

drop index public.message_logs_one_reminder_per_day;
create unique index message_logs_one_reminder_per_day on public.message_logs (member_id, reminder_date)
  where template_key in ('membership_expiring', 'membership_expired', 'dues_overdue');
create unique index message_logs_one_birthday_per_day on public.message_logs (member_id, reminder_date)
  where template_key = 'birthday';
create unique index message_logs_one_receipt_per_payment on public.message_logs (payment_id)
  where template_key = 'payment_receipt';
create unique index message_logs_one_welcome on public.message_logs (member_id)
  where template_key = 'welcome';
create index message_logs_org_created_idx on public.message_logs (org_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Per-gym template overrides. A missing row means the built-in default text.
-- -----------------------------------------------------------------------------
create table public.message_templates (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations (id) on delete cascade,
  template_key text not null check (template_key in (
    'membership_expiring', 'membership_expired', 'dues_overdue', 'payment_receipt', 'welcome', 'birthday')),
  language     text not null check (language in ('en', 'hi')),
  body         text not null check (char_length(body) between 1 and 1000),
  updated_by   uuid references public.team_members (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (org_id, template_key, language)
);
alter table public.message_templates enable row level security;
create trigger message_templates_set_updated_at before update on public.message_templates
  for each row execute function public.set_updated_at();

create policy "message_templates: members read" on public.message_templates
  for select to authenticated
  using (org_id in (select public.my_org_ids()));

-- -----------------------------------------------------------------------------
-- WhatsApp Cloud API connection. The token is AES-256-GCM ciphertext.
-- -----------------------------------------------------------------------------
alter table public.organization_secrets
  add column whatsapp_display_phone text check (whatsapp_display_phone is null or char_length(whatsapp_display_phone) <= 40),
  add column whatsapp_verified_at   timestamptz;

-- -----------------------------------------------------------------------------
-- Settings helpers. Internal.
-- -----------------------------------------------------------------------------
create function public.message_kind_enabled(p_settings jsonb, p_kind text) returns boolean
language sql immutable as $$
  select coalesce((p_settings -> 'message_kinds' ->> p_kind)::boolean, true);
$$;

create function public.setting_days(p_settings jsonb, p_key text, p_default integer[]) returns integer[]
language sql immutable as $$
  select case
    when jsonb_typeof(p_settings -> p_key) = 'array' then
      array(select (e #>> '{}')::integer from jsonb_array_elements(p_settings -> p_key) e
             where jsonb_typeof(e) = 'number')
    else p_default
  end;
$$;

create function public.valid_day_list(p_value jsonb, p_min integer, p_max integer) returns boolean
language plpgsql immutable as $$
declare
  v_item jsonb;
  v_num  numeric;
begin
  if p_value is null or jsonb_typeof(p_value) <> 'array' then
    return false;
  end if;
  if jsonb_array_length(p_value) not between 1 and 5 then
    return false;
  end if;
  for v_item in select value from jsonb_array_elements(p_value) loop
    if jsonb_typeof(v_item) <> 'number' then
      return false;
    end if;
    v_num := (v_item #>> '{}')::numeric;
    if v_num <> trunc(v_num) or v_num not between p_min and p_max then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

create function public.whatsapp_api_ready(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select o.settings ->> 'messaging_provider' = 'whatsapp_api' from organizations o where o.id = p_org), false)
     and exists (select 1 from organization_secrets s
                  where s.org_id = p_org and s.whatsapp_phone_number_id is not null
                    and s.whatsapp_access_token_enc is not null);
$$;

-- -----------------------------------------------------------------------------
-- Member language: member_data_record, create_member and update_member gain
-- preferred_language. A new member without one gets the gym's default.
-- -----------------------------------------------------------------------------
create or replace function public.member_data_record(p_data jsonb, p_base public.members)
returns public.members language plpgsql set search_path = public as $$
declare v_m members;
begin
  if jsonb_typeof(p_data) <> 'object' or exists (
    select 1 from jsonb_object_keys(p_data) k where k not in (
      'full_name','phone','alt_phone','email','gender','dob','address','joined_on','source',
      'emergency_contact_name','emergency_contact_phone','notes','tags','consent_messaging','photo_url',
      'preferred_language'
    )
  ) then raise exception 'invalid_input'; end if;
  v_m := jsonb_populate_record(p_base, p_data);
  v_m.full_name := btrim(v_m.full_name);
  v_m.joined_on := coalesce(v_m.joined_on, ist_today());
  v_m.source := coalesce(v_m.source, 'walk_in');
  v_m.tags := coalesce(v_m.tags, '{}');
  v_m.consent_messaging := coalesce(v_m.consent_messaging, false);
  if v_m.dob > ist_today() or char_length(coalesce(v_m.notes, '')) > 5000
     or char_length(coalesce(v_m.address, '')) > 500
     or cardinality(v_m.tags) > 10
     or (v_m.preferred_language is not null and v_m.preferred_language not in ('en', 'hi')) then
    raise exception 'invalid_input';
  end if;
  return v_m;
end;
$$;

create or replace function public.create_member(
  p_org uuid, p_member_id uuid, p_data jsonb, p_membership jsonb default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_m members; v_previous members; v_language text;
begin
  perform assert_org_role(p_org, '{owner,manager,staff}');
  if p_member_id is null then raise exception 'invalid_input'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_member_id::text, 0));
  select * into v_previous from members where id = p_member_id;
  if found then
    if v_previous.org_id <> p_org or v_previous.phone <> p_data ->> 'phone'
       or v_previous.deleted_at is not null then raise exception 'request_conflict'; end if;
    return v_previous.id;
  end if;
  v_m := member_data_record(p_data, null::members);
  select case when o.settings ->> 'default_language' in ('en', 'hi') then o.settings ->> 'default_language' end
    into v_language from organizations o where o.id = p_org;
  insert into members (id, org_id, full_name, phone, alt_phone, email, gender, dob, address,
    joined_on, source, emergency_contact_name, emergency_contact_phone, notes, tags, consent_messaging,
    preferred_language)
  values (p_member_id, p_org, v_m.full_name, v_m.phone, v_m.alt_phone, v_m.email, v_m.gender, v_m.dob,
    v_m.address, v_m.joined_on, v_m.source, v_m.emergency_contact_name, v_m.emergency_contact_phone,
    v_m.notes, v_m.tags, v_m.consent_messaging, coalesce(v_m.preferred_language, v_language, 'en'));
  if p_membership is not null and p_membership <> 'null'::jsonb then
    if jsonb_typeof(p_membership) <> 'object' or exists (
      select 1 from jsonb_object_keys(p_membership) k
       where k not in ('plan_id','start_date','discount_amount')
    ) then raise exception 'invalid_input'; end if;
    perform enroll_member(p_org, p_member_id, (p_membership ->> 'plan_id')::uuid,
      (p_membership ->> 'start_date')::date, coalesce((p_membership ->> 'discount_amount')::numeric, 0),
      p_member_id);
  end if;
  perform write_audit_log(p_org, 'member.created', 'member', p_member_id, null,
    jsonb_build_object('consent_messaging', v_m.consent_messaging));
  return p_member_id;
end;
$$;

create or replace function public.update_member(p_org uuid, p_member_id uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_m members; v_keys jsonb;
begin
  perform assert_org_role(p_org, '{owner,manager,staff}');
  select * into v_m from members where id = p_member_id and org_id = p_org
    and deleted_at is null for update;
  if not found then raise exception 'member_not_found'; end if;
  v_m := member_data_record(p_data, v_m);
  if v_m.photo_url is not null and v_m.photo_url not like p_org::text || '/members/' || p_member_id::text || '/%' then
    raise exception 'invalid_input';
  end if;
  update members set full_name = v_m.full_name, phone = v_m.phone, alt_phone = v_m.alt_phone,
    email = v_m.email, gender = v_m.gender, dob = v_m.dob, address = v_m.address,
    joined_on = v_m.joined_on, source = v_m.source, emergency_contact_name = v_m.emergency_contact_name,
    emergency_contact_phone = v_m.emergency_contact_phone, notes = v_m.notes, tags = v_m.tags,
    consent_messaging = v_m.consent_messaging, photo_url = v_m.photo_url,
    preferred_language = coalesce(v_m.preferred_language, 'en')
   where id = p_member_id;
  select jsonb_agg(k) into v_keys from jsonb_object_keys(p_data) k;
  perform write_audit_log(p_org, 'member.updated', 'member', p_member_id, null,
    jsonb_build_object('fields', v_keys));
  return p_member_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Preparing messages
-- -----------------------------------------------------------------------------
-- Stores one rendered message, or returns the existing one for the same
-- reminder day, birthday, payment or welcome. Staff sessions may prepare only
-- receipts and welcomes; reminders and birthday wishes come from the daily job.
create function public.prepare_message(
  p_org uuid,
  p_member_id uuid,
  p_kind text,
  p_language text,
  p_body text,
  p_variables jsonb default '{}'::jsonb,
  p_invoice_id uuid default null,
  p_payment_id uuid default null,
  p_reminder_date date default null
) returns public.message_logs
language plpgsql security definer set search_path = public as $$
declare
  v_member  members;
  v_org     organizations;
  v_msg     message_logs;
  v_body    text := btrim(coalesce(p_body, ''));
  v_channel public.message_channel := 'whatsapp_manual';
begin
  perform assert_org_role(p_org, '{owner,manager,staff}');
  if not is_privileged_caller() and coalesce(p_kind not in ('payment_receipt', 'welcome'), true) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if coalesce(
       p_kind not in ('membership_expiring', 'membership_expired', 'dues_overdue', 'payment_receipt', 'welcome', 'birthday')
       or p_language not in ('en', 'hi')
       or char_length(v_body) not between 1 and 2000
       or jsonb_typeof(p_variables) <> 'object'
       or (p_kind in ('membership_expiring', 'membership_expired', 'dues_overdue', 'birthday')) <> (p_reminder_date is not null)
       or (p_kind = 'payment_receipt') <> (p_payment_id is not null)
       or (p_kind = 'dues_overdue' and p_invoice_id is null),
       true) then
    raise exception 'invalid_input';
  end if;

  select * into v_member from members where id = p_member_id and org_id = p_org and deleted_at is null;
  if not found then
    raise exception 'member_not_found';
  end if;
  if not v_member.consent_messaging then
    raise exception 'messaging_consent_missing';
  end if;
  if p_invoice_id is not null and not exists (
    select 1 from invoices where id = p_invoice_id and org_id = p_org and member_id = p_member_id
  ) then
    raise exception 'invoice_not_found';
  end if;
  if p_payment_id is not null and not exists (
    select 1 from payments where id = p_payment_id and org_id = p_org and member_id = p_member_id
       and not is_reversal and amount > 0
  ) then
    raise exception 'payment_not_found';
  end if;
  select * into v_org from organizations where id = p_org;
  if not message_kind_enabled(v_org.settings, p_kind) then
    raise exception 'message_kind_disabled';
  end if;
  if whatsapp_api_ready(p_org) then
    v_channel := 'whatsapp_api';
  end if;

  insert into message_logs (org_id, member_id, invoice_id, payment_id, channel, template_key, language,
                            body, variables, status, scheduled_for, reminder_date)
  values (p_org, p_member_id, p_invoice_id, p_payment_id, v_channel, p_kind, p_language,
          v_body, p_variables, 'prepared', now(), p_reminder_date)
  on conflict do nothing
  returning * into v_msg;

  if v_msg.id is null then
    select * into v_msg from message_logs l
     where l.member_id = p_member_id
       and case
             when p_kind = 'payment_receipt' then l.template_key = p_kind and l.payment_id = p_payment_id
             when p_kind = 'welcome' then l.template_key = p_kind
             when p_kind = 'birthday' then l.template_key = p_kind and l.reminder_date = p_reminder_date
             else l.template_key in ('membership_expiring', 'membership_expired', 'dues_overdue')
                  and l.reminder_date = p_reminder_date
           end
     limit 1;
  end if;
  return v_msg;
end;
$$;

-- -----------------------------------------------------------------------------
-- Staff actions on the queue
-- -----------------------------------------------------------------------------
create function public.mark_message_sent(p_message_id uuid) returns public.message_logs
language plpgsql security definer set search_path = public as $$
declare
  v_msg message_logs;
begin
  select * into v_msg from message_logs
   where id = p_message_id and (is_privileged_caller() or org_id in (select my_org_ids()))
   for update;
  if not found then
    raise exception 'message_not_found';
  end if;
  perform assert_org_role(v_msg.org_id, '{owner,manager,staff}');
  if v_msg.status in ('sent', 'delivered') then
    return v_msg;
  end if;
  if v_msg.status = 'prepared' and v_msg.api_attempted_at > now() - interval '10 minutes' then
    raise exception 'message_sending';
  end if;
  if not exists (select 1 from members where id = v_msg.member_id and consent_messaging and deleted_at is null) then
    raise exception 'messaging_consent_missing';
  end if;
  update message_logs
     set status = 'sent', channel = 'whatsapp_manual', sent_at = now(),
         sent_by = current_team_member_id(v_msg.org_id), error = null
   where id = p_message_id
  returning * into v_msg;
  return v_msg;
end;
$$;

create function public.skip_message(p_message_id uuid) returns public.message_logs
language plpgsql security definer set search_path = public as $$
declare
  v_msg message_logs;
begin
  select * into v_msg from message_logs
   where id = p_message_id and (is_privileged_caller() or org_id in (select my_org_ids()))
   for update;
  if not found then
    raise exception 'message_not_found';
  end if;
  perform assert_org_role(v_msg.org_id, '{owner,manager,staff}');
  if v_msg.status = 'skipped' then
    return v_msg;
  end if;
  if v_msg.status not in ('prepared', 'failed') then
    raise exception 'message_not_pending';
  end if;
  if v_msg.status = 'prepared' and v_msg.api_attempted_at > now() - interval '10 minutes' then
    raise exception 'message_sending';
  end if;
  update message_logs set status = 'skipped', sent_by = current_team_member_id(v_msg.org_id)
   where id = p_message_id
  returning * into v_msg;
  return v_msg;
end;
$$;

-- -----------------------------------------------------------------------------
-- WhatsApp Cloud API sending. Service role only: the app decrypts the gym's
-- token, claims the message, calls Meta and records the outcome.
-- -----------------------------------------------------------------------------
-- True when this caller now owns the send. A message already in flight, sent,
-- skipped, or whose member withdrew consent is not claimed.
create function public.begin_api_send(p_message_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not is_privileged_caller() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update message_logs l
     set api_attempted_at = now(), status = 'prepared'
   where l.id = p_message_id
     and l.status in ('prepared', 'failed')
     and (l.api_attempted_at is null or l.api_attempted_at < now() - interval '10 minutes')
     and exists (select 1 from members m where m.id = l.member_id and m.consent_messaging and m.deleted_at is null)
  returning l.id into v_id;
  return v_id is not null;
end;
$$;

create function public.record_message_result(
  p_message_id uuid,
  p_provider_message_id text,
  p_error text,
  p_sent_by uuid default null
) returns public.message_logs
language plpgsql security definer set search_path = public as $$
declare
  v_msg message_logs;
begin
  if not is_privileged_caller() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_msg from message_logs where id = p_message_id for update;
  if not found then
    raise exception 'message_not_found';
  end if;
  if v_msg.status in ('sent', 'delivered') then
    return v_msg;
  end if;
  if nullif(btrim(coalesce(p_provider_message_id, '')), '') is not null then
    update message_logs
       set status = 'sent', channel = 'whatsapp_api', sent_at = now(),
           sent_by = (select tm.id from team_members tm where tm.id = p_sent_by and tm.org_id = v_msg.org_id),
           provider_message_id = left(btrim(p_provider_message_id), 200), error = null, api_attempted_at = null
     where id = p_message_id
    returning * into v_msg;
  else
    update message_logs
       set status = 'failed', channel = 'whatsapp_api',
           error = left(coalesce(nullif(btrim(coalesce(p_error, '')), ''), 'unknown'), 500),
           api_attempted_at = null
     where id = p_message_id
    returning * into v_msg;
  end if;
  return v_msg;
end;
$$;

-- -----------------------------------------------------------------------------
-- Daily job
-- -----------------------------------------------------------------------------
-- Who is due a reminder or a birthday wish today (IST). At most one reminder per
-- member: expired before expiring before dues. Members already messaged today
-- are left out, so the job can run again safely.
create function public.daily_message_candidates(p_org uuid default null)
returns table (org_id uuid, member_id uuid, kind text, lang text, invoice_id uuid, facts jsonb)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_today date := ist_today();
begin
  if not is_privileged_caller() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
  with base as (
    select m.id, m.org_id, m.full_name, m.preferred_language, m.dob,
           d.status, d.end_date, d.plan_name, o.name as org_name, o.settings
      from members m
      join organizations o on o.id = m.org_id
      join member_directory d on d.id = m.id
     where m.deleted_at is null and m.consent_messaging
       and o.deletion_scheduled_for is null
       and (p_org is null or m.org_id = p_org)
  ),
  membership_due as (
    select b.*,
           case
             when b.status = 'expired'
                  and (v_today - b.end_date) = any (setting_days(b.settings, 'expired_reminder_days_after', '{1}'))
                  and message_kind_enabled(b.settings, 'membership_expired')
               then 'membership_expired'
             when b.status in ('active', 'expiring')
                  and (b.end_date - v_today) = any (setting_days(b.settings, 'reminder_days_before', '{7,3,0}'))
                  and message_kind_enabled(b.settings, 'membership_expiring')
                  and not exists (select 1 from memberships u
                                   where u.member_id = b.id and u.status <> 'cancelled' and u.start_date > v_today)
               then 'membership_expiring'
           end as due_kind
      from base b
  ),
  reminders as (
    select md.org_id, md.id as member_id, md.due_kind as kind, md.preferred_language as lang,
           null::uuid as invoice_id,
           jsonb_build_object('full_name', md.full_name, 'org_name', md.org_name, 'end_date', md.end_date,
                              'plan_name', md.plan_name, 'days', abs(md.end_date - v_today)) as facts,
           case md.due_kind when 'membership_expired' then 1 else 2 end as priority
      from membership_due md
     where md.due_kind is not null
    union all
    select b.org_id, b.id, 'dues_overdue'::text, b.preferred_language, i.id,
           jsonb_build_object('full_name', b.full_name, 'org_name', b.org_name,
                              'invoice_number', i.invoice_number, 'balance_due', i.balance_due,
                              'due_date', i.due_date, 'days', v_today - i.due_date),
           3
      from base b
      join lateral (
        select inv.id, inv.invoice_number, inv.balance_due, inv.due_date
          from invoices inv
         where inv.member_id = b.id and inv.org_id = b.org_id
           and inv.status in ('unpaid', 'partially_paid') and inv.balance_due > 0
           and (v_today - inv.due_date) = any (setting_days(b.settings, 'dues_reminder_days_after', '{3,7}'))
         order by inv.due_date, inv.created_at
         limit 1
      ) i on true
     where message_kind_enabled(b.settings, 'dues_overdue')
  ),
  first_reminder as (
    select distinct on (r.member_id) r.*
      from reminders r
     where not exists (
       select 1 from message_logs l
        where l.member_id = r.member_id and l.reminder_date = v_today
          and l.template_key in ('membership_expiring', 'membership_expired', 'dues_overdue'))
     order by r.member_id, r.priority
  )
  select f.org_id, f.member_id, f.kind, f.lang, f.invoice_id, f.facts
    from first_reminder f
  union all
  select b.org_id, b.id, 'birthday'::text, b.preferred_language, null::uuid,
         jsonb_build_object('full_name', b.full_name, 'org_name', b.org_name)
    from base b
   where b.dob is not null
     and b.status in ('active', 'expiring', 'frozen')
     and message_kind_enabled(b.settings, 'birthday')
     and (to_char(b.dob, 'MM-DD') = to_char(v_today, 'MM-DD')
          -- 29 February birthdays are celebrated on 28 February in other years.
          or (to_char(b.dob, 'MM-DD') = '02-29' and to_char(v_today, 'MM-DD') = '02-28'
              and to_char(v_today + 1, 'MM-DD') = '03-01'))
     and not exists (
       select 1 from message_logs l
        where l.member_id = b.id and l.reminder_date = v_today and l.template_key = 'birthday');
end;
$$;

-- Prepared messages nobody sent within three days are no longer useful.
create function public.expire_stale_messages() returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  if not is_privileged_caller() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update message_logs
     set status = 'skipped', error = 'expired'
   where status = 'prepared' and created_at < now() - interval '3 days'
     and (api_attempted_at is null or api_attempted_at < now() - interval '10 minutes');
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- Settings (owner/manager)
-- -----------------------------------------------------------------------------
create function public.save_messaging_settings(p_org uuid, p_settings jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_key text;
begin
  perform assert_org_role(p_org, '{owner,manager}');
  if p_settings is null or jsonb_typeof(p_settings) <> 'object' then
    raise exception 'invalid_input';
  end if;
  for v_key in select jsonb_object_keys(p_settings) loop
    if v_key not in ('reminder_days_before', 'expired_reminder_days_after', 'dues_reminder_days_after',
                     'default_language', 'messaging_provider', 'message_kinds') then
      raise exception 'invalid_input';
    end if;
  end loop;
  if not valid_day_list(p_settings -> 'reminder_days_before', 0, 30)
     or not valid_day_list(p_settings -> 'expired_reminder_days_after', 1, 60)
     or not valid_day_list(p_settings -> 'dues_reminder_days_after', 1, 90)
     or coalesce(p_settings ->> 'default_language', '') not in ('en', 'hi')
     or coalesce(p_settings ->> 'messaging_provider', '') not in ('manual', 'whatsapp_api')
     or coalesce(jsonb_typeof(p_settings -> 'message_kinds'), '') <> 'object' then
    raise exception 'invalid_input';
  end if;
  for v_key in select jsonb_object_keys(p_settings -> 'message_kinds') loop
    if v_key not in ('membership_expiring', 'membership_expired', 'dues_overdue', 'payment_receipt', 'welcome', 'birthday')
       or jsonb_typeof(p_settings -> 'message_kinds' -> v_key) <> 'boolean' then
      raise exception 'invalid_input';
    end if;
  end loop;
  if p_settings ->> 'messaging_provider' = 'whatsapp_api' and not exists (
    select 1 from organization_secrets
     where org_id = p_org and whatsapp_phone_number_id is not null and whatsapp_access_token_enc is not null
  ) then
    raise exception 'whatsapp_not_configured';
  end if;
  update organizations set settings = settings || p_settings where id = p_org;
  perform write_audit_log(p_org, 'messaging_settings.updated', 'organization', p_org, null, p_settings);
end;
$$;

-- An empty body removes the override, so the built-in text applies again.
create function public.save_message_template(p_org uuid, p_kind text, p_language text, p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_body text := btrim(coalesce(p_body, ''));
begin
  perform assert_org_role(p_org, '{owner,manager}');
  if coalesce(p_kind not in ('membership_expiring', 'membership_expired', 'dues_overdue', 'payment_receipt', 'welcome', 'birthday')
              or p_language not in ('en', 'hi')
              or char_length(v_body) > 1000, true) then
    raise exception 'invalid_input';
  end if;
  if v_body = '' then
    delete from message_templates where org_id = p_org and template_key = p_kind and language = p_language;
  else
    insert into message_templates (org_id, template_key, language, body, updated_by)
    values (p_org, p_kind, p_language, v_body, current_team_member_id(p_org))
    on conflict (org_id, template_key, language)
      do update set body = excluded.body, updated_by = excluded.updated_by;
  end if;
  perform write_audit_log(p_org, case when v_body = '' then 'message_template.reset' else 'message_template.updated' end,
                          'organization', p_org, null,
                          jsonb_build_object('template_key', p_kind, 'language', p_language));
end;
$$;

create function public.save_whatsapp_credentials(
  p_org uuid,
  p_phone_number_id text,
  p_token_enc text,
  p_display_phone text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform assert_org_role(p_org, '{owner,manager}');
  if p_phone_number_id is null or btrim(p_phone_number_id) !~ '^[0-9]{5,30}$'
     or p_token_enc is null or p_token_enc !~ '^v1\.' or char_length(p_token_enc) > 4000
     or char_length(coalesce(p_display_phone, '')) > 40 then
    raise exception 'invalid_input';
  end if;
  insert into organization_secrets (org_id) values (p_org) on conflict (org_id) do nothing;
  update organization_secrets
     set whatsapp_phone_number_id = btrim(p_phone_number_id), whatsapp_access_token_enc = p_token_enc,
         whatsapp_display_phone = nullif(btrim(coalesce(p_display_phone, '')), ''),
         whatsapp_verified_at = now()
   where org_id = p_org;
end;
$$;

-- Messages waiting for the API fall back to staff sending them by hand.
create function public.remove_whatsapp_credentials(p_org uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform assert_org_role(p_org, '{owner,manager}');
  update organization_secrets
     set whatsapp_phone_number_id = null, whatsapp_access_token_enc = null,
         whatsapp_display_phone = null, whatsapp_verified_at = null
   where org_id = p_org;
  update organizations
     set settings = settings || '{"messaging_provider": "manual"}'::jsonb
   where id = p_org;
  update message_logs
     set channel = 'whatsapp_manual', api_attempted_at = null
   where org_id = p_org and channel = 'whatsapp_api' and status = 'prepared';
end;
$$;

-- -----------------------------------------------------------------------------
-- Close the direct write path and set grants.
-- -----------------------------------------------------------------------------
drop policy "message_logs: members insert" on public.message_logs;
drop policy "message_logs: members update" on public.message_logs;

revoke execute on function public.message_kind_enabled(jsonb, text) from public, anon, authenticated;
revoke execute on function public.setting_days(jsonb, text, integer[]) from public, anon, authenticated;
revoke execute on function public.valid_day_list(jsonb, integer, integer) from public, anon, authenticated;
revoke execute on function public.whatsapp_api_ready(uuid) from public, anon, authenticated;

revoke execute on function public.begin_api_send(uuid) from public, anon, authenticated;
revoke execute on function public.record_message_result(uuid, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.daily_message_candidates(uuid) from public, anon, authenticated;
revoke execute on function public.expire_stale_messages() from public, anon, authenticated;
grant execute on function
  public.begin_api_send(uuid),
  public.record_message_result(uuid, text, text, uuid),
  public.daily_message_candidates(uuid),
  public.expire_stale_messages()
  to service_role;

revoke execute on function public.prepare_message(uuid, uuid, text, text, text, jsonb, uuid, uuid, date) from public, anon;
revoke execute on function public.mark_message_sent(uuid) from public, anon;
revoke execute on function public.skip_message(uuid) from public, anon;
revoke execute on function public.save_messaging_settings(uuid, jsonb) from public, anon;
revoke execute on function public.save_message_template(uuid, text, text, text) from public, anon;
revoke execute on function public.save_whatsapp_credentials(uuid, text, text, text) from public, anon;
revoke execute on function public.remove_whatsapp_credentials(uuid) from public, anon;
grant execute on function
  public.prepare_message(uuid, uuid, text, text, text, jsonb, uuid, uuid, date),
  public.mark_message_sent(uuid),
  public.skip_message(uuid),
  public.save_messaging_settings(uuid, jsonb),
  public.save_message_template(uuid, text, text, text),
  public.save_whatsapp_credentials(uuid, text, text, text),
  public.remove_whatsapp_credentials(uuid)
  to authenticated, service_role;
