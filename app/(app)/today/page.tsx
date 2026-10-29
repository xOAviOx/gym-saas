import type { Metadata } from 'next';

import { Money } from '@/components/shared/money';
import { PageHeader } from '@/components/shared/page-header';
import { StatTile } from '@/components/shared/stat-tile';
import { getDashboardStats } from '@/features/dashboard/queries';
import { requireOrg } from '@/lib/auth/session';
import { copy } from '@/lib/copy';
import { formatDate, todayIST } from '@/lib/dates';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: copy.today.title };

export default async function TodayPage() {
  const ctx = await requireOrg();
  const supabase = await createClient();
  const stats = await getDashboardStats(supabase, ctx.org.id);

  return (
    <>
      <PageHeader
        title={copy.today.title}
        description={`${copy.today.greeting(ctx.org.name)} · ${formatDate(todayIST())}`}
      />
      <section aria-label={copy.today.title} className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile
          label={copy.today.tiles.collectedToday}
          value={<Money paise={stats.collectedToday} />}
          tone="success"
        />
        <StatTile
          label={copy.today.tiles.pendingDues}
          value={<Money paise={stats.pendingDues} />}
          tone={stats.pendingDues > 0 ? 'danger' : 'default'}
        />
        <StatTile
          label={copy.today.tiles.expiringSoon}
          value={stats.expiringIn7Days}
          tone={stats.expiringIn7Days > 0 ? 'warning' : 'default'}
        />
        <StatTile label={copy.today.tiles.checkInsToday} value={stats.checkInsToday} />
      </section>
    </>
  );
}
