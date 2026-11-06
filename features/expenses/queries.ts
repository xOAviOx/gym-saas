import 'server-only';

import { toPaise } from '@/lib/money';
import type { ServerSupabase } from '@/lib/supabase/server';

export async function getExpenses(supabase: ServerSupabase, orgId: string, page: number) {
  const pageSize = 30;
  const { data, error, count } = await supabase
    .from('expenses')
    .select('id,category,amount,expense_date,vendor,notes', { count: 'exact' })
    .eq('org_id', orgId)
    .order('expense_date', { ascending: false })
    .order('id', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (error) throw error;
  return {
    rows: (data ?? []).map((row) => ({
      id: row.id,
      category: row.category,
      amount: toPaise(row.amount),
      expenseDate: row.expense_date,
      vendor: row.vendor ?? '',
      notes: row.notes ?? '',
    })),
    total: count ?? 0,
    pageSize,
  };
}
