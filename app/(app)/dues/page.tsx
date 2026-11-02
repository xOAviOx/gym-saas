import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { DuesList } from '@/components/billing/dues-list';
import { PageHeader } from '@/components/shared/page-header';
import { getDues } from '@/features/billing/queries';
import { DUES_PAGE_SIZE, duesFilterSchema } from '@/features/billing/schema';
import { requireOrg } from '@/lib/auth/session';
import { copy } from '@/lib/copy';
import { todayIST } from '@/lib/dates';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: copy.dues.title };

export default async function DuesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string; page?: string }>;
}) {
  const ctx = await requireOrg();
  const params = await searchParams;
  const q = (typeof params.q === 'string' ? params.q : '').trim().slice(0, 100);
  const requested = duesFilterSchema.safeParse(params.filter ?? 'all');
  const filter = requested.success ? requested.data : 'all';
  const page = Math.min(100000, Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1));
  const data = await getDues(await createClient(), ctx.org.id, q, filter, page);
  if (page > 1 && (page - 1) * DUES_PAGE_SIZE >= data.total) {
    const query = new URLSearchParams({
      ...(q ? { q } : {}),
      ...(filter !== 'all' ? { filter } : {}),
      page: String(Math.max(1, Math.ceil(data.total / DUES_PAGE_SIZE))),
    });
    redirect(`/dues?${query}`);
  }

  return (
    <>
      <PageHeader title={copy.dues.title} description={copy.dues.description} />
      <DuesList {...data} today={todayIST()} q={q} filter={filter} page={page} />
    </>
  );
}
