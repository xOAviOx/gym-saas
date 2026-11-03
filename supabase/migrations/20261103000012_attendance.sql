-- M3: attendance, member QR codes and the front-desk kiosk.
-- Additive for data: existing check-ins and members are kept.
--
-- * The kiosk PIN hash moves off organizations, which every team member can
--   read: a 4-6 digit PIN hash can be brute-forced offline in seconds. It now
--   lives in organization_kiosk (no policies) and is checked only inside SQL,
--   with a lockout after repeated failures.
-- * check_in_member is the only way to create a check-in for signed-in users.
--   Overriding an expired-membership block needs an owner/manager session or
--   the kiosk PIN, verified here rather than trusted from the app.
-- * Kiosk devices are paired by an owner or manager and then act without a
--   user session: the app verifies the device cookie and calls the service-role
--   functions below.

-- -----------------------------------------------------------------------------
-- Kiosk PIN
-- -----------------------------------------------------------------------------
create table public.organization_kiosk (
  org_id          uuid primary key references public.organizations (id) on delete cascade,
  pin_hash        text,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table public.organization_kiosk enable row level security;
create trigger organization_kiosk_set_updated_at before update on public.organization_kiosk
  for each row execute function public.set_updated_at();

insert into public.organization_kiosk (org_id, pin_hash)
select id, kiosk_pin_hash from public.organizations where kiosk_pin_hash is not null;

alter table public.organizations drop column kiosk_pin_hash;

-- -----------------------------------------------------------------------------
-- Kiosk devices. The device keeps a random token in an httpOnly cookie; only its
-- SHA-256 is stored.
-- -----------------------------------------------------------------------------
create table public.kiosk_devices (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations (id) on delete cascade,
  label        text not null check (char_length(label) between 1 and 40),
  token_hash   text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by   uuid references public.team_members (id) on delete set null,
  last_seen_at timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index kiosk_devices_org_idx on public.kiosk_devices (org_id, created_at desc);
alter table public.kiosk_devices enable row level security;
create trigger kiosk_devices_set_updated_at before update on public.kiosk_devices
  for each row execute function public.set_updated_at();

create policy "kiosk_devices: owner/manager read" on public.kiosk_devices
  for select to authenticated
  using (org_id in (select public.my_org_ids_with_role('{owner,manager}')));

alter table public.check_ins
  add column kiosk_device_id uuid references public.kiosk_devices (id) on delete set null,
  add column overridden boolean not null default false;
update public.check_ins set overridden = true where override_by is not null;

-- Bumped to invalidate a member's printed or shared check-in QR code.
alter table public.members
  add column qr_version integer not null default 1 check (qr_version between 1 and 1000000);

-- -----------------------------------------------------------------------------
-- PIN verification. Never raises on a wrong PIN, so the failure counter commits
-- even though the caller refuses the action. Internal.
-- Returns 'ok' | 'invalid' | 'locked' | 'not_set'.
-- -----------------------------------------------------------------------------
create function public.verify_kiosk_pin(p_org uuid, p_pin text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_row organization_kiosk;
begin
  select * into v_row from organization_kiosk where org_id = p_org for update;
  if not found or v_row.pin_hash is null then
    return 'not_set';
  end if;
  if v_row.locked_until is not null and v_row.locked_until > now() then
    return 'locked';
  end if;
  if p_pin is not null and p_pin ~ '^[0-9]{4,6}$'
     and extensions.crypt(p_pin, v_row.pin_hash) = v_row.pin_hash then
    update organization_kiosk set failed_attempts = 0, locked_until = null where org_id = p_org;
    return 'ok';
  end if;
  if v_row.failed_attempts + 1 >= 5 then
    update organization_kiosk
       set failed_attempts = 0, locked_until = now() + interval '5 minutes'
     where org_id = p_org;
    return 'locked';
  end if;
  update organization_kiosk set failed_attempts = v_row.failed_attempts + 1 where org_id = p_org;
  return 'invalid';
end;
$$;

-- -----------------------------------------------------------------------------
-- Check-in core shared by the front desk and the kiosk. Internal: callers have
-- already resolved the org and the caller's right to act for it.
--
-- Result: { result: 'checked_in' | 'duplicate' | 'blocked', member, check_in?,
--           overridden?, pin_error? } where pin_error is 'pin_required' |
--           'invalid' | 'locked' | 'not_set'.
-- Flags: expired > expiring > dues_pending. When settings.block_expired_checkin
-- is on, an expired member is refused unless the override is authorised.
-- -----------------------------------------------------------------------------
create function public.apply_check_in(
  p_org uuid,
  p_member_id uuid,
  p_method public.check_in_method,
  p_override boolean,
  p_role_may_override boolean,
  p_pin text,
  p_actor uuid,
  p_device uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_member     members;
  v_org        organizations;
  v_ms         memberships;
  v_recent     check_ins;
  v_ci         check_ins;
  v_status     text;
  v_flag       public.check_in_flag;
  v_dues       numeric(10,2) := 0;
  v_block      boolean := false;
  v_overridden boolean := false;
  v_pin        text;
  v_summary    jsonb;
begin
  select * into v_member from members
   where id = p_member_id and org_id = p_org and deleted_at is null
   for update;
  if not found then
    raise exception 'member_not_found';
  end if;
  select * into v_org from organizations where id = p_org;

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
  v_block := coalesce(v_flag = 'expired', false)
             and coalesce((v_org.settings ->> 'block_expired_checkin')::boolean, false);

  v_summary := jsonb_build_object(
    'id', v_member.id, 'full_name', v_member.full_name, 'member_code', v_member.member_code,
    'photo_url', v_member.photo_url, 'status', v_status, 'flag', v_flag,
    'end_date', v_ms.end_date, 'sessions_total', v_ms.sessions_total,
    'sessions_used', v_ms.sessions_used, 'balance_due', v_dues
  );

  -- A second scan within five minutes returns the first check-in and never consumes a second session.
  select * into v_recent from check_ins
   where member_id = p_member_id and checked_in_at > now() - interval '5 minutes'
   order by checked_in_at desc limit 1;
  if found then
    return jsonb_build_object('result', 'duplicate', 'check_in', to_jsonb(v_recent), 'member', v_summary);
  end if;

  if v_block then
    if not coalesce(p_override, false) then
      return jsonb_build_object('result', 'blocked', 'member', v_summary);
    end if;
    if not coalesce(p_role_may_override, false) then
      if p_pin is null then
        return jsonb_build_object('result', 'blocked', 'member', v_summary, 'pin_error', 'pin_required');
      end if;
      v_pin := verify_kiosk_pin(p_org, p_pin);
      if v_pin <> 'ok' then
        return jsonb_build_object('result', 'blocked', 'member', v_summary, 'pin_error', v_pin);
      end if;
    end if;
    v_overridden := true;
  end if;

  insert into check_ins (org_id, member_id, checked_in_at, method, checked_in_by, flag, override_by,
                         overridden, kiosk_device_id)
  values (p_org, p_member_id, now(), p_method, p_actor, v_flag,
          case when v_overridden then p_actor end, v_overridden, p_device)
  returning * into v_ci;

  if v_ms.id is not null and v_ms.status = 'active' and v_ms.sessions_total is not null then
    update memberships set sessions_used = sessions_used + 1 where id = v_ms.id;
    select * into v_ms from memberships where id = v_ms.id;
    select status into v_status from members where id = p_member_id;
    v_summary := v_summary || jsonb_build_object('status', v_status, 'sessions_used', v_ms.sessions_used);
  end if;

  if v_overridden then
    perform write_audit_log(p_org, 'check_in.override', 'check_in', v_ci.id, null,
                            to_jsonb(v_ci) || jsonb_build_object('via_pin', not coalesce(p_role_may_override, false)));
  end if;

  return jsonb_build_object('result', 'checked_in', 'check_in', to_jsonb(v_ci), 'member', v_summary,
                            'overridden', v_overridden);
end;
$$;

-- Front desk, signed-in team member. Owners and managers may override a block
-- themselves; staff need the kiosk PIN.
drop function public.check_in_member(uuid, public.check_in_method, boolean);

create function public.check_in_member(
  p_member_id uuid,
  p_method public.check_in_method default 'manual',
  p_override boolean default false,
  p_pin text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
begin
  -- Another gym's member looks exactly like a missing one.
  select org_id into v_org from members
   where id = p_member_id and deleted_at is null
     and (is_privileged_caller() or org_id in (select my_org_ids()));
  if not found then
    raise exception 'member_not_found';
  end if;
  perform assert_org_role(v_org, '{owner,manager,staff}');
  return apply_check_in(
    v_org, p_member_id, p_method, p_override,
    is_privileged_caller() or has_org_role(v_org, '{owner,manager}'),
    p_pin, current_team_member_id(v_org), null
  );
end;
$$;

-- Kiosk, service role only, after the app has verified the device cookie.
-- A blocked member can be let in only with the PIN.
create function public.kiosk_check_in(
  p_device_id uuid,
  p_member_id uuid,
  p_method public.check_in_method default 'qr',
  p_pin text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_device kiosk_devices;
begin
  if not is_privileged_caller() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_device from kiosk_devices where id = p_device_id and revoked_at is null;
  if not found then
    raise exception 'kiosk_not_paired';
  end if;
  update kiosk_devices set last_seen_at = now() where id = p_device_id;
  return apply_check_in(v_device.org_id, p_member_id, p_method, p_pin is not null, false, p_pin, null, v_device.id);
end;
$$;

-- Leaving kiosk mode on the device needs the PIN; success unpairs the device.
-- Returns the same codes as verify_kiosk_pin.
create function public.kiosk_exit(p_device_id uuid, p_pin text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_device kiosk_devices;
  v_result text;
begin
  if not is_privileged_caller() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_device from kiosk_devices where id = p_device_id and revoked_at is null;
  if not found then
    raise exception 'kiosk_not_paired';
  end if;
  v_result := verify_kiosk_pin(v_device.org_id, p_pin);
  if v_result = 'ok' then
    update kiosk_devices set revoked_at = now() where id = p_device_id;
    perform write_audit_log(v_device.org_id, 'kiosk_device.exited', 'kiosk_device', v_device.id, null,
                            jsonb_build_object('label', v_device.label));
  end if;
  return v_result;
end;
$$;

-- -----------------------------------------------------------------------------
-- Settings (owner/manager)
-- -----------------------------------------------------------------------------
-- A null PIN removes it, which also unpairs every kiosk: they could not be exited.
create function public.set_kiosk_pin(p_org uuid, p_pin text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform assert_org_role(p_org, '{owner,manager}');
  if p_pin is not null and p_pin !~ '^[0-9]{4,6}$' then
    raise exception 'invalid_pin_format';
  end if;
  insert into organization_kiosk (org_id) values (p_org) on conflict (org_id) do nothing;
  update organization_kiosk
     set pin_hash = case when p_pin is null then null else extensions.crypt(p_pin, extensions.gen_salt('bf', 8)) end,
         failed_attempts = 0, locked_until = null
   where org_id = p_org;
  if p_pin is null then
    update kiosk_devices set revoked_at = now() where org_id = p_org and revoked_at is null;
  end if;
  perform write_audit_log(p_org, case when p_pin is null then 'kiosk_pin.removed' else 'kiosk_pin.set' end,
                          'organization', p_org, null, null);
end;
$$;

create function public.save_attendance_settings(p_org uuid, p_block_expired boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform assert_org_role(p_org, '{owner,manager}');
  if p_block_expired is null then
    raise exception 'invalid_input';
  end if;
  update organizations
     set settings = settings || jsonb_build_object('block_expired_checkin', p_block_expired)
   where id = p_org;
end;
$$;

-- Readable status for the settings screen without exposing the hash.
create function public.kiosk_pin_status(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_row organization_kiosk;
begin
  perform assert_org_role(p_org, '{owner,manager}');
  select * into v_row from organization_kiosk where org_id = p_org;
  return jsonb_build_object(
    'pin_set', coalesce(v_row.pin_hash is not null, false),
    'locked_until', case when v_row.locked_until > now() then v_row.locked_until end
  );
end;
$$;

create function public.create_kiosk_device(p_org uuid, p_label text, p_token_hash text) returns public.kiosk_devices
language plpgsql security definer set search_path = public as $$
declare
  v_label  text := btrim(coalesce(p_label, ''));
  v_device kiosk_devices;
begin
  perform assert_org_role(p_org, '{owner,manager}');
  if char_length(v_label) not between 1 and 40 or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_input';
  end if;
  if not exists (select 1 from organization_kiosk where org_id = p_org and pin_hash is not null) then
    raise exception 'kiosk_pin_required';
  end if;
  if (select count(*) from kiosk_devices where org_id = p_org and revoked_at is null) >= 10 then
    raise exception 'kiosk_device_limit';
  end if;
  insert into kiosk_devices (org_id, label, token_hash, created_by, last_seen_at)
  values (p_org, v_label, p_token_hash, current_team_member_id(p_org), now())
  returning * into v_device;
  perform write_audit_log(p_org, 'kiosk_device.paired', 'kiosk_device', v_device.id, null,
                          jsonb_build_object('label', v_device.label));
  return v_device;
end;
$$;

create function public.revoke_kiosk_device(p_device_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_device kiosk_devices;
begin
  select * into v_device from kiosk_devices
   where id = p_device_id and (is_privileged_caller() or org_id in (select my_org_ids()));
  if not found then
    raise exception 'kiosk_device_not_found';
  end if;
  perform assert_org_role(v_device.org_id, '{owner,manager}');
  if v_device.revoked_at is null then
    update kiosk_devices set revoked_at = now() where id = p_device_id;
    perform write_audit_log(v_device.org_id, 'kiosk_device.revoked', 'kiosk_device', v_device.id, null,
                            jsonb_build_object('label', v_device.label));
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Member QR codes: any team member can issue a new code, which stops the old one.
-- -----------------------------------------------------------------------------
create function public.reset_member_qr(p_member_id uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_member  members;
  v_version integer;
begin
  select * into v_member from members
   where id = p_member_id and deleted_at is null
     and (is_privileged_caller() or org_id in (select my_org_ids()))
   for update;
  if not found then
    raise exception 'member_not_found';
  end if;
  perform assert_org_role(v_member.org_id, '{owner,manager,staff}');
  update members set qr_version = qr_version + 1 where id = p_member_id
  returning qr_version into v_version;
  perform write_audit_log(v_member.org_id, 'member.qr_reset', 'member', p_member_id, null,
                          jsonb_build_object('qr_version', v_version));
  return v_version;
end;
$$;

-- -----------------------------------------------------------------------------
-- Close the direct write path and set grants.
-- -----------------------------------------------------------------------------
drop policy "check_ins: members insert" on public.check_ins;

revoke execute on function public.verify_kiosk_pin(uuid, text) from public, anon, authenticated;
revoke execute on function public.apply_check_in(uuid, uuid, public.check_in_method, boolean, boolean, text, uuid, uuid)
  from public, anon, authenticated;

revoke execute on function public.kiosk_check_in(uuid, uuid, public.check_in_method, text) from public, anon, authenticated;
revoke execute on function public.kiosk_exit(uuid, text) from public, anon, authenticated;
grant execute on function
  public.kiosk_check_in(uuid, uuid, public.check_in_method, text),
  public.kiosk_exit(uuid, text)
  to service_role;

revoke execute on function public.check_in_member(uuid, public.check_in_method, boolean, text) from public, anon;
revoke execute on function public.set_kiosk_pin(uuid, text) from public, anon;
revoke execute on function public.save_attendance_settings(uuid, boolean) from public, anon;
revoke execute on function public.kiosk_pin_status(uuid) from public, anon;
revoke execute on function public.create_kiosk_device(uuid, text, text) from public, anon;
revoke execute on function public.revoke_kiosk_device(uuid) from public, anon;
revoke execute on function public.reset_member_qr(uuid) from public, anon;
grant execute on function
  public.check_in_member(uuid, public.check_in_method, boolean, text),
  public.set_kiosk_pin(uuid, text),
  public.save_attendance_settings(uuid, boolean),
  public.kiosk_pin_status(uuid),
  public.create_kiosk_device(uuid, text, text),
  public.revoke_kiosk_device(uuid),
  public.reset_member_qr(uuid)
  to authenticated, service_role;
