import type { Metadata } from 'next';
import Link from 'next/link';

import { Money } from '@/components/shared/money';
import { PageHeader } from '@/components/shared/page-header';
import { StatTile } from '@/components/shared/stat-tile';
import { getDashboardStats } from '@/features/dashboard/queries';
import { countPendingMessages } from '@/features/messaging/queries';
import { can } from '@/lib/auth/roles';
import { requireOrg } from '@/lib/auth/session';
import { copy } from '@/lib/copy';
import { formatDate, todayIST } from '@/lib/dates';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: copy.today.title };

export default async function TodayPage() {
  const ctx = await requireOrg();
  const supabase = await createClient();
  const [stats, pendingMessages] = await Promise.all([
    getDashboardStats(supabase, ctx.org.id),
    countPendingMessages(supabase, ctx.org.id),
  ]);

  return (
    <>
      <PageHeader
        title={copy.today.title}
        description={`${copy.today.greeting(ctx.org.name)} · ${formatDate(todayIST())}`}
        action={
          can.viewReports(ctx.role) ? (
            <Link href="/reports" className="text-sm underline underline-offset-4">
              {copy.reports.title}
            </Link>
          ) : undefined
        }
      />
      <section aria-label={copy.today.title} className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatTile
          label={copy.today.tiles.collectedToday}
          value={<Money paise={stats.collectedToday} />}
          tone="success"
          className="animate-enter [--index:1]"
        />
        <StatTile
          label={copy.today.tiles.pendingDues}
          value={<Money paise={stats.pendingDues} />}
          tone={stats.pendingDues > 0 ? 'danger' : 'default'}
          hint={
            stats.pendingDuesCount > 0 ? copy.today.invoices(stats.pendingDuesCount) : undefined
          }
          href="/dues"
          className="animate-enter [--index:2]"
        />
        <StatTile
          label={copy.today.tiles.expiringSoon}
          value={stats.expiringIn7Days}
          tone={stats.expiringIn7Days > 0 ? 'warning' : 'default'}
          href="/members?filter=expiring"
          className="animate-enter [--index:3]"
        />
        <StatTile
          label={copy.today.tiles.checkInsToday}
          value={stats.checkInsToday}
          href="/attendance"
          className="animate-enter [--index:4]"
        />
        <StatTile
          label={copy.today.tiles.activeMembers}
          value={stats.activeMembers}
          href="/members?filter=active"
          className="animate-enter [--index:5]"
        />
        <StatTile
          label={copy.today.tiles.totalMembers}
          value={stats.totalMembers}
          href="/members"
          className="animate-enter [--index:6]"
        />
      </section>
      {pendingMessages > 0 ? (
        <Link
          href="/messages"
          className="bg-card hover:shadow-lift focus-visible:ring-ring/20 animate-enter mt-4 flex min-h-14 items-center justify-between gap-3 rounded-xl border px-5 text-sm font-medium transition-shadow duration-200 outline-none [--index:5] focus-visible:ring-3"
        >
          {copy.messages.readyCount(pendingMessages)}
          <span aria-hidden="true">→</span>
        </Link>
      ) : null}
    </>
  );
}
