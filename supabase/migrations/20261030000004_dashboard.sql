-- =============================================================================
-- GymDesk · 0004 · dashboard
-- Single round-trip for the Today tiles. SECURITY INVOKER: RLS still applies,
-- and the explicit membership check gives a clear error for other gyms.
-- =============================================================================

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
      select sum(balance_due) from invoices
      where org_id = p_org and status in ('unpaid', 'partially_paid')
    ), 0),
    'pending_dues_count', (
      select count(*) from invoices
      where org_id = p_org and status in ('unpaid', 'partially_paid')
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

revoke execute on function public.dashboard_stats(uuid) from anon, public;
