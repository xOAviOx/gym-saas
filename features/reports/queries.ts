import 'server-only';

import { z } from 'zod';

import { addDays, istMonthRange, todayIST } from '@/lib/dates';
import { toPaise } from '@/lib/money';
import type { ServerSupabase } from '@/lib/supabase/server';

const amount = z.union([z.number(), z.string()]);
const reportSchema = z.object({
  revenue: amount,
  expenses: amount,
  net: amount,
  by_method: z.array(z.object({ name: z.string(), amount })),
  by_plan: z.array(z.object({ name: z.string(), amount })),
  by_staff: z.array(z.object({ name: z.string(), amount })),
  attendance: z.array(z.object({ period: z.string(), count: z.number() })),
  overdue: z.array(z.object({ id: z.uuid(), name: z.string(), balance: amount })),
  overdue_count: z.number(),
});

export type ReportPeriod = 'month' | 'fy';

export function reportRange(period: ReportPeriod, date: string) {
  if (period === 'month') return istMonthRange(date);
  const year = Number(date.slice(0, 4));
  const startYear = Number(date.slice(5, 7)) >= 4 ? year : year - 1;
  return { start: `${startYear}-04-01`, end: `${startYear + 1}-03-31` };
}

export async function getReport(
  supabase: ServerSupabase,
  orgId: string,
  period: ReportPeriod,
  date = todayIST(),
) {
  const range = reportRange(period, date);
  const { data, error } = await supabase.rpc('report_overview', {
    p_org: orgId,
    p_start: range.start,
    p_end: range.end,
  });
  if (error) throw error;
  const raw = reportSchema.parse(data);
  const groups = (rows: { name: string; amount: number | string }[]) =>
    rows.map((row) => ({ name: row.name, amount: toPaise(row.amount) }));
  const attendanceByPeriod = new Map(raw.attendance.map((row) => [row.period, row.count]));
  const attendance: { period: string; count: number }[] = [];
  if (period === 'month') {
    for (let day = range.start; day <= range.end; day = addDays(day, 1)) {
      attendance.push({ period: day, count: attendanceByPeriod.get(day) ?? 0 });
    }
  } else {
    for (let i = 0; i < 12; i++) {
      const month = new Date(Date.UTC(Number(range.start.slice(0, 4)), 3 + i, 1))
        .toISOString()
        .slice(0, 7);
      attendance.push({ period: month, count: attendanceByPeriod.get(month) ?? 0 });
    }
  }
  return {
    range,
    revenue: toPaise(raw.revenue),
    expenses: toPaise(raw.expenses),
    net: toPaise(raw.net),
    byMethod: groups(raw.by_method),
    byPlan: groups(raw.by_plan),
    byStaff: groups(raw.by_staff),
    attendance,
    overdue: raw.overdue.map((row) => ({ ...row, balance: toPaise(row.balance) })),
    overdueCount: raw.overdue_count,
  };
}
