import type { Metadata } from 'next';
import Link from 'next/link';

import { ExpenseManager } from '@/components/expenses/expense-manager';
import { PageHeader } from '@/components/shared/page-header';
import { getExpenses } from '@/features/expenses/queries';
import { PRIVILEGED_ROLES } from '@/lib/auth/roles';
import { requireOrg } from '@/lib/auth/session';
import { copy } from '@/lib/copy';
import { todayIST } from '@/lib/dates';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: copy.expenses.title };

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const ctx = await requireOrg(PRIVILEGED_ROLES);
  const raw = Number.parseInt((await searchParams).page ?? '1', 10);
  const page = Number.isFinite(raw) ? Math.min(100000, Math.max(1, raw)) : 1;
  const data = await getExpenses(await createClient(), ctx.org.id, page);
  return (
    <>
      <PageHeader title={copy.expenses.title} description={copy.expenses.description} />
      <ExpenseManager rows={data.rows} today={todayIST()} />
      <nav
        aria-label={copy.expenses.title}
        className="mt-5 flex items-center justify-between text-sm"
      >
        {page > 1 ? (
          <Link href={`/expenses?page=${page - 1}`} className="underline underline-offset-4">
            {copy.common.back}
          </Link>
        ) : (
          <span />
        )}
        <span className="text-muted-foreground">{copy.expenses.count(data.total)}</span>
        {page * data.pageSize < data.total ? (
          <Link href={`/expenses?page=${page + 1}`} className="underline underline-offset-4">
            {copy.common.next}
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </>
  );
}
