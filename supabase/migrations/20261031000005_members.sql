-- M1: atomic member/plan writes, a tenant-safe directory, and membership lifecycle.
-- This migration is additive and does not reset existing gyms or member data.

alter table public.members drop constraint members_status_check;
alter table public.members add constraint members_status_check
  check (status in ('new', 'upcoming', 'active', 'expiring', 'expired', 'frozen'));

alter table public.memberships add column request_id uuid;
create unique index memberships_request_unique on public.memberships (org_id, request_id)
  where request_id is not null;

-- Read paths must also be correct between midnight and the maintenance job.
create function public.effective_membership_end(m public.memberships, p_today date)
returns date language sql immutable set search_path = public as $$
  select m.end_date + case
    when m.status <> 'cancelled' and m.frozen_to < p_today
      then m.frozen_to - m.frozen_from + 1
    else 0 end;
$$;

create or replace function public.compute_membership_status(m public.memberships, p_today date)
returns public.membership_status language sql immutable set search_path = public as $$
  select case
    when m.status = 'cancelled' then 'cancelled'::public.membership_status
    when m.frozen_from is not null and p_today between m.frozen_from and m.frozen_to
      then 'frozen'::public.membership_status
    when m.start_date > p_today then 'upcoming'::public.membership_status
    when public.effective_membership_end(m, p_today) < p_today then 'expired'::public.membership_status
    when m.sessions_total is not null and m.sessions_used >= m.sessions_total
      then 'expired'::public.membership_status
    else 'active'::public.membership_status
  end;
$$;

create or replace function public.refresh_member_status(p_member_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_today date := ist_today();
  v_status text;
begin
  update memberships m
     set end_date = m.end_date + (m.frozen_to - m.frozen_from + 1),
         freeze_days_used = m.freeze_days_used + (m.frozen_to - m.frozen_from + 1),
         frozen_from = null, frozen_to = null
   where member_id = p_member_id and status <> 'cancelled' and frozen_to < v_today;
  update memberships m set status = compute_membership_status(m, v_today)
   where member_id = p_member_id and status <> compute_membership_status(m, v_today);
  select case when m.status = 'active' and m.end_date <= v_today + 7 then 'expiring'
              else m.status::text end
    into v_status from memberships m
   where member_id = p_member_id and status <> 'cancelled'
   order by case m.status when 'frozen' then 0 when 'active' then 1
             when 'upcoming' then 2 else 3 end,
            case when m.status = 'upcoming' then m.start_date end asc,
            m.end_date desc, m.created_at desc, m.id
   limit 1;
  v_status := coalesce(v_status, 'new');
  update members set status = v_status where id = p_member_id and status <> v_status;
  return v_status;
end;
$$;

create view public.member_directory with (security_invoker = true) as
select m.id, m.org_id, m.member_code, m.full_name, m.phone, m.deleted_at,
       coalesce(case when current_ms.computed_status = 'active'
                           and current_ms.effective_end <= public.ist_today() + 7
                     then 'expiring' else current_ms.computed_status::text end, 'new') as status,
       current_ms.id as membership_id, current_ms.start_date,
       current_ms.effective_end as end_date, p.name as plan_name,
       coalesce(dues.balance_due, 0)::numeric(10,2) as balance_due
  from public.members m
  left join lateral (
    select ms.*, public.compute_membership_status(ms, public.ist_today()) as computed_status,
           public.effective_membership_end(ms, public.ist_today()) as effective_end
      from public.memberships ms
     where ms.member_id = m.id and ms.org_id = m.org_id and ms.status <> 'cancelled'
     order by case public.compute_membership_status(ms, public.ist_today())
                when 'frozen' then 0 when 'active' then 1 when 'upcoming' then 2 else 3 end,
              case when ms.start_date > public.ist_today() then ms.start_date end asc,
              public.effective_membership_end(ms, public.ist_today()) desc, ms.created_at desc, ms.id
     limit 1
  ) current_ms on true
  left join public.plans p on p.id = current_ms.plan_id and p.org_id = m.org_id
  left join lateral (
    select sum(i.balance_due) as balance_due from public.invoices i
     where i.member_id = m.id and i.org_id = m.org_id and i.status <> 'void'
  ) dues on true;
revoke all on public.member_directory from anon, public;
grant select on public.member_directory to authenticated, service_role;

create function public.list_members(
  p_org uuid, p_search text default '', p_filter text default 'all',
  p_page integer default 1, p_page_size integer default 25
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare v_result jsonb;
begin
  perform assert_org_role(p_org, '{owner,manager,staff}');
  if p_filter not in ('all','active','expiring','expired','dues','frozen','deleted')
     or p_page < 1 or p_page > 100000 or p_page_size not between 1 and 50
     or length(p_search) > 100 then
    raise exception 'invalid_input';
  end if;
  if p_filter = 'deleted' then perform assert_org_role(p_org, '{owner,manager}'); end if;
  with filtered as (
    select d.*, case when d.balance_due > 0 then 0
                     when d.status = 'expired' then 1 when d.status = 'expiring' then 2
                     when d.status = 'frozen' then 3 when d.status = 'active' then 4 else 5 end as urgency
      from member_directory d
     where d.org_id = p_org
       and case when p_filter = 'deleted' then d.deleted_at > now() - interval '30 days'
                else d.deleted_at is null end
       and (p_filter in ('all','deleted') or d.status = p_filter
            or (p_filter = 'dues' and d.balance_due > 0))
       and (btrim(p_search) = ''
            or strpos(lower(d.full_name), lower(btrim(p_search))) > 0
            or strpos(lower(d.member_code), lower(btrim(p_search))) > 0
            or (regexp_replace(p_search, '[^0-9]', '', 'g') <> ''
                and strpos(d.phone, regexp_replace(p_search, '[^0-9]', '', 'g')) > 0))
  ), paged as (
    select * from filtered order by urgency, lower(full_name), id
     limit p_page_size offset (p_page - 1) * p_page_size
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'rows', coalesce((select jsonb_agg(to_jsonb(paged) - 'urgency'
                        order by urgency, lower(full_name), id) from paged), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

-- Only editable attributes may be deserialized, never org/role/status/consent timestamps.
create function public.member_data_record(p_data jsonb, p_base public.members)
returns public.members language plpgsql set search_path = public as $$
declare v_m members;
begin
  if jsonb_typeof(p_data) <> 'object' or exists (
    select 1 from jsonb_object_keys(p_data) k where k not in (
      'full_name','phone','alt_phone','email','gender','dob','address','joined_on','source',
      'emergency_contact_name','emergency_contact_phone','notes','tags','consent_messaging','photo_url'
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
     or cardinality(v_m.tags) > 10 then raise exception 'invalid_input'; end if;
  return v_m;
end;
$$;

create function public.enroll_member(
  p_org uuid, p_member_id uuid, p_plan_id uuid, p_start_date date,
  p_discount_amount numeric, p_request_id uuid, p_notes text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_result jsonb; v_previous memberships;
begin
  perform assert_org_role(p_org, '{owner,manager,staff}');
  perform 1 from members where id = p_member_id and org_id = p_org and deleted_at is null for update;
  if not found then raise exception 'member_not_found'; end if;
  if p_request_id is null then raise exception 'invalid_input'; end if;
  select * into v_previous from memberships where org_id = p_org and request_id = p_request_id;
  if found then
    if v_previous.member_id <> p_member_id or v_previous.plan_id <> p_plan_id
       or v_previous.start_date <> p_start_date or v_previous.discount_amount <> p_discount_amount then
      raise exception 'request_conflict';
    end if;
    return jsonb_build_object('membership', to_jsonb(v_previous),
      'invoice', (select to_jsonb(i) from invoices i where membership_id = v_previous.id));
  end if;
  v_result := create_membership(p_member_id, p_plan_id, p_start_date, p_discount_amount, p_notes);
  update memberships set request_id = p_request_id
   where id = (v_result -> 'membership' ->> 'id')::uuid;
  return v_result;
end;
$$;

create function public.create_member(
  p_org uuid, p_member_id uuid, p_data jsonb, p_membership jsonb default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_m members; v_previous members;
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
  insert into members (id, org_id, full_name, phone, alt_phone, email, gender, dob, address,
    joined_on, source, emergency_contact_name, emergency_contact_phone, notes, tags, consent_messaging)
  values (p_member_id, p_org, v_m.full_name, v_m.phone, v_m.alt_phone, v_m.email, v_m.gender, v_m.dob,
    v_m.address, v_m.joined_on, v_m.source, v_m.emergency_contact_name, v_m.emergency_contact_phone,
    v_m.notes, v_m.tags, v_m.consent_messaging);
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

create function public.update_member(p_org uuid, p_member_id uuid, p_data jsonb)
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
    consent_messaging = v_m.consent_messaging, photo_url = v_m.photo_url
   where id = p_member_id;
  select jsonb_agg(k) into v_keys from jsonb_object_keys(p_data) k;
  perform write_audit_log(p_org, 'member.updated', 'member', p_member_id, null,
    jsonb_build_object('fields', v_keys));
  return p_member_id;
end;
$$;

create or replace function public.restore_member(p_member_id uuid) returns public.members
language plpgsql security definer set search_path = public as $$
declare v_m members;
begin
  select * into v_m from members where id = p_member_id for update;
  if not found then raise exception 'member_not_found'; end if;
  perform assert_org_role(v_m.org_id, '{owner,manager}');
  if v_m.deleted_at is null then return v_m; end if;
  if v_m.deleted_at <= now() - interval '30 days' then raise exception 'restore_window_expired'; end if;
  if exists (select 1 from members where org_id = v_m.org_id and phone = v_m.phone
               and deleted_at is null and id <> p_member_id) then raise exception 'phone_in_use'; end if;
  update members set deleted_at = null where id = p_member_id returning * into v_m;
  perform refresh_member_status(p_member_id);
  perform write_audit_log(v_m.org_id, 'member.restored', 'member', v_m.id, null,
    jsonb_build_object('member_code', v_m.member_code));
  return v_m;
end;
$$;

create function public.save_plan(p_org uuid, p_plan_id uuid default null, p_data jsonb default '{}')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_plan plans; v_before plans;
begin
  perform assert_org_role(p_org, '{owner,manager}');
  if jsonb_typeof(p_data) <> 'object' or exists (
    select 1 from jsonb_object_keys(p_data) k
     where k not in ('name','type','duration_days','session_count','price','description','is_active')
  ) then raise exception 'invalid_input'; end if;
  if p_plan_id is not null then
    select * into v_before from plans where id = p_plan_id and org_id = p_org for update;
    if not found then raise exception 'plan_not_found'; end if;
  end if;
  v_plan := jsonb_populate_record(v_before, p_data);
  if p_plan_id is null then
    insert into plans (org_id, name, type, duration_days, session_count, price, description, is_active)
    values (p_org, btrim(v_plan.name), coalesce(v_plan.type, 'duration'), v_plan.duration_days,
      case when v_plan.type = 'sessions' then v_plan.session_count end, v_plan.price,
      v_plan.description, coalesce(v_plan.is_active, true)) returning * into v_plan;
  else
    update plans set name = btrim(v_plan.name), type = v_plan.type, duration_days = v_plan.duration_days,
      session_count = case when v_plan.type = 'sessions' then v_plan.session_count end,
      price = v_plan.price, description = v_plan.description, is_active = v_plan.is_active
      where id = p_plan_id returning * into v_plan;
  end if;
  perform write_audit_log(p_org, case when p_plan_id is null then 'plan.created' else 'plan.updated' end,
    'plan', v_plan.id, to_jsonb(v_before), to_jsonb(v_plan));
  return v_plan.id;
end;
$$;

create function public.save_onboarding_plans(p_org uuid, p_plans jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare v_data jsonb; v_count integer := 0;
begin
  perform assert_org_role(p_org, '{owner,manager}');
  perform 1 from organizations where id = p_org for update;
  if exists (select 1 from plans where org_id = p_org) then return 0; end if;
  if jsonb_typeof(p_plans) <> 'array' or jsonb_array_length(p_plans) not between 1 and 20 then
    raise exception 'invalid_input';
  end if;
  for v_data in select value from jsonb_array_elements(p_plans) loop
    perform save_plan(p_org, null, v_data);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create function public.import_members(p_org uuid, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_row jsonb; v_id uuid; v_imported integer := 0; v_skipped integer := 0;
begin
  perform assert_org_role(p_org, '{owner,manager,staff}');
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) not between 1 and 500 then
    raise exception 'invalid_input';
  end if;
  -- Serialize imports for one gym; unique phone index also protects against a simultaneous manual add.
  perform pg_advisory_xact_lock(hashtextextended('member-import:' || p_org::text, 0));
  for v_row in select value from jsonb_array_elements(p_rows) loop
    if exists (select 1 from members where org_id = p_org
       and phone = v_row -> 'data' ->> 'phone' and deleted_at is null) then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    begin
      v_id := create_member(p_org, (v_row ->> 'id')::uuid, v_row -> 'data', v_row -> 'membership');
      v_imported := v_imported + 1;
    exception when unique_violation then
      if not exists (select 1 from members where org_id = p_org
        and phone = v_row -> 'data' ->> 'phone' and deleted_at is null) then raise; end if;
      v_skipped := v_skipped + 1;
    end;
  end loop;
  perform write_audit_log(p_org, 'members.imported', 'member', null, null,
    jsonb_build_object('imported', v_imported, 'skipped', v_skipped));
  return jsonb_build_object('imported', v_imported, 'skipped', v_skipped);
end;
$$;

-- No direct membership inserts/updates can bypass invoice creation or lifecycle guards.
drop policy "memberships: members insert" on public.memberships;
drop policy "memberships: members update" on public.memberships;

revoke execute on function public.member_data_record(jsonb, public.members) from public, anon, authenticated;
revoke execute on function public.effective_membership_end(public.memberships, date) from public, anon;
revoke execute on function public.list_members(uuid, text, text, integer, integer) from public, anon;
revoke execute on function public.enroll_member(uuid, uuid, uuid, date, numeric, uuid, text) from public, anon;
revoke execute on function public.create_member(uuid, uuid, jsonb, jsonb) from public, anon;
revoke execute on function public.update_member(uuid, uuid, jsonb) from public, anon;
revoke execute on function public.save_plan(uuid, uuid, jsonb) from public, anon;
revoke execute on function public.save_onboarding_plans(uuid, jsonb) from public, anon;
revoke execute on function public.import_members(uuid, jsonb) from public, anon;

grant execute on function public.effective_membership_end(public.memberships, date),
  public.list_members(uuid, text, text, integer, integer),
  public.enroll_member(uuid, uuid, uuid, date, numeric, uuid, text),
  public.create_member(uuid, uuid, jsonb, jsonb),
  public.update_member(uuid, uuid, jsonb),
  public.save_plan(uuid, uuid, jsonb),
  public.save_onboarding_plans(uuid, jsonb),
  public.import_members(uuid, jsonb) to authenticated, service_role;

-- Bring existing cached statuses in line with the new upcoming/expiry rules.
select public.recompute_all_statuses(null);
