import type { Metadata } from 'next';
import Link from 'next/link';

import { PageHeader } from '@/components/shared/page-header';
import { StatTile } from '@/components/shared/stat-tile';
import { Button } from '@/components/ui/button';
import { getReport, type ReportPeriod } from '@/features/reports/queries';
import { PRIVILEGED_ROLES } from '@/lib/auth/roles';
import { requireOrg } from '@/lib/auth/session';
import { copy } from '@/lib/copy';
import { formatDate, isDateOnly, todayIST } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: copy.reports.title };

function AmountGroup({ title, rows }: { title: string; rows: { name: string; amount: number }[] }) {
  const max = Math.max(1, ...rows.map((row) => Math.abs(row.amount)));
  return (
    <section className="bg-card rounded-xl border p-5">
      <h2 className="mb-4 text-base font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{copy.reports.empty}</p>
      ) : (
        <div className="space-y-4">
          {rows.map((row) => (
            <div key={row.name}>
              <div className="mb-1 flex justify-between gap-3 text-sm">
                <span>{row.name}</span>
                <span className="tabular font-medium">{formatMoney(row.amount)}</span>
              </div>
              <div className="bg-muted h-1.5 rounded-full">
                <div
                  className="bg-foreground h-full rounded-full"
                  style={{ width: `${Math.max(0, (Math.abs(row.amount) / max) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; date?: string }>;
}) {
  const ctx = await requireOrg(PRIVILEGED_ROLES);
  const params = await searchParams;
  const period: ReportPeriod = params.period === 'fy' ? 'fy' : 'month';
  const date =
    typeof params.date === 'string' && isDateOnly(params.date) ? params.date : todayIST();
  const report = await getReport(await createClient(), ctx.org.id, period, date);
  const attendanceMax = Math.max(1, ...report.attendance.map((row) => row.count));
  return (
    <>
      <PageHeader title={copy.reports.title} description={copy.reports.description} />
      <form
        method="get"
        className="bg-card mb-5 flex flex-wrap items-end gap-3 rounded-xl border p-4"
      >
        <label className="grid gap-1 text-sm">
          <span>{copy.reports.period}</span>
          <select
            name="period"
            defaultValue={period}
            className="border-input bg-background h-11 rounded-md border px-3"
          >
            <option value="month">{copy.reports.month}</option>
            <option value="fy">{copy.reports.financialYear}</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span>{copy.reports.date}</span>
          <input
            name="date"
            type="date"
            defaultValue={date}
            className="border-input bg-background h-11 rounded-md border px-3"
          />
        </label>
        <Button type="submit">{copy.reports.apply}</Button>
      </form>
      <p className="text-muted-foreground mb-4 text-sm">
        {formatDate(report.range.start)} – {formatDate(report.range.end)}
      </p>
      <section
        aria-label={copy.reports.title}
        className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
        <StatTile label={copy.reports.revenue} value={formatMoney(report.revenue)} tone="success" />
        <StatTile
          label={copy.reports.expenses}
          value={formatMoney(report.expenses)}
          href="/expenses"
        />
        <StatTile
          label={copy.reports.net}
          value={formatMoney(report.net)}
          tone={report.net < 0 ? 'danger' : 'default'}
        />
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <AmountGroup
          title={copy.reports.byMethod}
          rows={report.byMethod.map((r) => ({
            ...r,
            name:
              copy.members.paymentMethod[r.name as keyof typeof copy.members.paymentMethod] ??
              r.name,
          }))}
        />
        <AmountGroup title={copy.reports.byPlan} rows={report.byPlan} />
        <AmountGroup title={copy.reports.byStaff} rows={report.byStaff} />
        <section className="bg-card rounded-xl border p-5">
          <h2 className="mb-4 text-base font-semibold">{copy.reports.attendance}</h2>
          {report.attendance.length === 0 ? (
            <p className="text-muted-foreground text-sm">{copy.reports.empty}</p>
          ) : (
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {report.attendance.map((row) => (
                <div key={row.period} className="flex items-center gap-3 text-sm">
                  <span className="text-muted-foreground tabular w-20 shrink-0">{row.period}</span>
                  <div className="bg-muted h-2 flex-1 rounded-full">
                    <div
                      className="bg-foreground h-full rounded-full"
                      style={{ width: `${(row.count / attendanceMax) * 100}%` }}
                    />
                  </div>
                  <span className="tabular w-8 text-right">{row.count}</span>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="bg-card rounded-xl border p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">{copy.reports.overdue}</h2>
              <p className="text-muted-foreground text-sm">
                {copy.reports.overdueCount(report.overdueCount)}
              </p>
            </div>
            <Link href="/dues" className="text-sm underline underline-offset-4">
              {copy.reports.viewAllDues}
            </Link>
          </div>
          {report.overdue.length === 0 ? (
            <p className="text-muted-foreground text-sm">{copy.reports.empty}</p>
          ) : (
            <ul className="divide-border divide-y">
              {report.overdue.map((row) => (
                <li key={row.id} className="flex justify-between gap-3 py-2 text-sm">
                  <Link href={`/members/${row.id}`} className="underline underline-offset-4">
                    {row.name}
                  </Link>
                  <span className="tabular">{formatMoney(row.balance)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <section className="mt-5">
        <h2 className="mb-3 text-base font-semibold">{copy.reports.exports}</h2>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/exports/members" prefetch={false} download>
              {copy.exports.members}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/exports/invoices" prefetch={false} download>
              {copy.exports.invoices}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/exports/payments" prefetch={false} download>
              {copy.exports.payments}
            </Link>
          </Button>
        </div>
      </section>
    </>
  );
}
