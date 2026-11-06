-- M5: audited expense writes and owner/manager reporting.

drop policy if exists "expenses: owner/manager insert" on public.expenses;
drop policy if exists "expenses: owner/manager update" on public.expenses;
drop policy if exists "expenses: owner/manager delete" on public.expenses;

create or replace function public.save_expense(
  p_org uuid, p_id uuid, p_category public.expense_category,
  p_amount numeric, p_date date, p_vendor text, p_notes text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_before public.expenses%rowtype;
  v_after public.expenses%rowtype;
begin
  perform assert_org_role(p_org, array['owner','manager']::public.team_role[]);
  if p_amount is null or p_amount <= 0 or p_amount > 99999999.99
     or p_date is null or p_category is null
     or length(coalesce(p_vendor, '')) > 120 or length(coalesce(p_notes, '')) > 500 then
    raise exception 'invalid_expense';
  end if;
  if p_id is null then
    insert into expenses (org_id, category, amount, expense_date, vendor, notes, created_by)
    values (p_org, p_category, p_amount, p_date, nullif(trim(p_vendor), ''),
            nullif(trim(p_notes), ''),
            (select id from team_members where org_id = p_org and user_id = auth.uid() and is_active limit 1))
    returning * into v_after;
    perform write_audit_log(p_org, 'expense.created', 'expense', v_after.id, null, to_jsonb(v_after));
  else
    select * into v_before from expenses where id = p_id and org_id = p_org for update;
    if not found then raise exception 'expense_not_found'; end if;
    update expenses set category = p_category, amount = p_amount, expense_date = p_date,
      vendor = nullif(trim(p_vendor), ''), notes = nullif(trim(p_notes), ''), updated_at = now()
    where id = p_id and org_id = p_org returning * into v_after;
    perform write_audit_log(p_org, 'expense.updated', 'expense', p_id,
      to_jsonb(v_before), to_jsonb(v_after));
  end if;
  return v_after.id;
end;
$$;

create or replace function public.delete_expense(p_org uuid, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_before public.expenses%rowtype;
begin
  perform assert_org_role(p_org, array['owner','manager']::public.team_role[]);
  delete from expenses where org_id = p_org and id = p_id returning * into v_before;
  if not found then raise exception 'expense_not_found'; end if;
  perform write_audit_log(p_org, 'expense.deleted', 'expense', p_id, to_jsonb(v_before), null);
end;
$$;

create or replace function public.report_overview(p_org uuid, p_start date, p_end date)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare
  v_from timestamptz;
  v_to timestamptz;
  v_revenue numeric;
  v_expenses numeric;
begin
  perform assert_org_role(p_org, array['owner','manager']::public.team_role[]);
  if p_start is null or p_end is null or p_end < p_start or p_end - p_start > 366 then
    raise exception 'invalid_report_range';
  end if;
  v_from := ist_day_start(p_start);
  v_to := ist_day_start(p_end + 1);
  select coalesce(sum(amount), 0) into v_revenue from payments
    where org_id = p_org and paid_at >= v_from and paid_at < v_to;
  select coalesce(sum(amount), 0) into v_expenses from expenses
    where org_id = p_org and expense_date between p_start and p_end;
  return jsonb_build_object(
    'revenue', v_revenue, 'expenses', v_expenses, 'net', v_revenue - v_expenses,
    'by_method', coalesce((
      select jsonb_agg(jsonb_build_object('name', method::text, 'amount', amount) order by amount desc)
      from (select method, sum(amount) amount from payments
        where org_id = p_org and paid_at >= v_from and paid_at < v_to group by method) m
    ), '[]'::jsonb),
    'by_plan', coalesce((
      select jsonb_agg(jsonb_build_object('name', name, 'amount', amount) order by amount desc)
      from (select coalesce(pl.name, 'Other') name, sum(pay.amount) amount
        from payments pay left join invoices inv on inv.id = pay.invoice_id and inv.org_id = p_org
        left join memberships ms on ms.id = inv.membership_id and ms.org_id = p_org
        left join plans pl on pl.id = ms.plan_id and pl.org_id = p_org
        where pay.org_id = p_org and pay.paid_at >= v_from and pay.paid_at < v_to
        group by coalesce(pl.name, 'Other')) p
    ), '[]'::jsonb),
    'by_staff', coalesce((
      select jsonb_agg(jsonb_build_object('name', name, 'amount', amount) order by amount desc)
      from (select coalesce(nullif(pr.full_name, ''), 'Unassigned') name, sum(pay.amount) amount
        from payments pay left join team_members tm on tm.id = pay.collected_by and tm.org_id = p_org
        left join profiles pr on pr.id = tm.user_id
        where pay.org_id = p_org and pay.paid_at >= v_from and pay.paid_at < v_to
        group by coalesce(nullif(pr.full_name, ''), 'Unassigned')) s
    ), '[]'::jsonb),
    'attendance', coalesce((
      select jsonb_agg(jsonb_build_object('period', period, 'count', count) order by period)
      from (select case when p_end - p_start > 40
          then to_char(checked_in_at at time zone 'Asia/Kolkata', 'YYYY-MM')
          else to_char(checked_in_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD') end period,
          count(*) count from check_ins
        where org_id = p_org and checked_in_at >= v_from and checked_in_at < v_to
        group by 1) a
    ), '[]'::jsonb),
    'overdue', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'balance', balance)
        order by balance desc)
      from (select m.id, m.full_name name, sum(i.balance_due) balance
        from invoices i join members m on m.id = i.member_id and m.org_id = p_org
        where i.org_id = p_org and i.due_date < ist_today()
          and i.balance_due > 0 and i.status <> 'void' and m.deleted_at is null
        group by m.id, m.full_name order by balance desc limit 25) o
    ), '[]'::jsonb),
    'overdue_count', (select count(distinct i.member_id) from invoices i
      join members m on m.id = i.member_id and m.org_id = p_org
      where i.org_id = p_org and i.due_date < ist_today()
        and i.balance_due > 0 and i.status <> 'void' and m.deleted_at is null)
  );
end;
$$;

revoke execute on function public.save_expense(uuid, uuid, public.expense_category, numeric, date, text, text) from public, anon;
revoke execute on function public.delete_expense(uuid, uuid) from public, anon;
revoke execute on function public.report_overview(uuid, date, date) from public, anon;
grant execute on function public.save_expense(uuid, uuid, public.expense_category, numeric, date, text, text) to authenticated;
grant execute on function public.delete_expense(uuid, uuid) to authenticated;
grant execute on function public.report_overview(uuid, date, date) to authenticated;
