-- Search-scoped overview and filter counts share the directory's tenant/role boundary.
-- Replacing the read-only RPC preserves existing data and its execution grants.
create or replace function public.list_members(
  p_org uuid, p_search text default '', p_filter text default 'all',
  p_page integer default 1, p_page_size integer default 25
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_result jsonb;
  v_can_restore boolean;
begin
  perform assert_org_role(p_org, '{owner,manager,staff}');
  if p_search is null or p_filter is null or p_page is null or p_page_size is null
     or p_filter not in ('all','active','expiring','expired','dues','frozen','new','upcoming','deleted')
     or p_page < 1 or p_page > 100000 or p_page_size not between 1 and 50
     or length(p_search) > 100 then
    raise exception 'invalid_input';
  end if;
  v_can_restore := has_org_role(p_org, '{owner,manager}');
  if p_filter = 'deleted' then perform assert_org_role(p_org, '{owner,manager}'); end if;

  with matched as materialized (
    select d.*, case when d.balance_due > 0 then 0
                     when d.status = 'expired' then 1 when d.status = 'expiring' then 2
                     when d.status = 'frozen' then 3 when d.status = 'active' then 4 else 5 end as urgency
      from member_directory d
     where d.org_id = p_org
       and (d.deleted_at is null
            or (v_can_restore and d.deleted_at > now() - interval '30 days'))
       and (btrim(p_search) = ''
            or strpos(lower(d.full_name), lower(btrim(p_search))) > 0
            or strpos(lower(d.member_code), lower(btrim(p_search))) > 0
            or (regexp_replace(p_search, '[^0-9]', '', 'g') <> ''
                and strpos(d.phone, regexp_replace(p_search, '[^0-9]', '', 'g')) > 0))
  ), filtered as (
    select * from matched d
     where case when p_filter = 'deleted' then d.deleted_at is not null
                else d.deleted_at is null end
       and (p_filter in ('all','deleted') or d.status = p_filter
            or (p_filter = 'dues' and d.balance_due > 0))
  ), paged as (
    select * from filtered order by urgency, lower(full_name), id
     limit p_page_size offset (p_page - 1) * p_page_size
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'counts', (
      select jsonb_build_object(
        'all', count(*) filter (where deleted_at is null),
        'active', count(*) filter (where deleted_at is null and status = 'active'),
        'expiring', count(*) filter (where deleted_at is null and status = 'expiring'),
        'expired', count(*) filter (where deleted_at is null and status = 'expired'),
        'dues', count(*) filter (where deleted_at is null and balance_due > 0),
        'frozen', count(*) filter (where deleted_at is null and status = 'frozen'),
        'new', count(*) filter (where deleted_at is null and status = 'new'),
        'upcoming', count(*) filter (where deleted_at is null and status = 'upcoming')
      ) || case when v_can_restore then jsonb_build_object(
        'deleted', count(*) filter (where deleted_at is not null)
      ) else '{}'::jsonb end
      from matched
    ),
    'balance_due', (select coalesce(sum(balance_due) filter (where deleted_at is null), 0) from matched),
    'rows', coalesce((select jsonb_agg(to_jsonb(paged) - 'urgency'
                        order by urgency, lower(full_name), id) from paged), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;
