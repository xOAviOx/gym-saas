import type { Metadata } from 'next';
import Link from 'next/link';

import { PageHeader } from '@/components/shared/page-header';
import { OWNER_ONLY } from '@/lib/auth/roles';
import { requireOrg } from '@/lib/auth/session';
import { copy } from '@/lib/copy';
import { formatDateTime } from '@/lib/dates';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: copy.audit.title };

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const ctx = await requireOrg(OWNER_ONLY);
  const rawPage = Number((await searchParams).page ?? '1');
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 1000) : 1;
  const { data, error } = await (
    await createClient()
  )
    .from('audit_logs')
    .select('id,action,entity_type,created_at,actor_user_id')
    .eq('org_id', ctx.org.id)
    .order('created_at', { ascending: false })
    .range((page - 1) * 50, page * 50);
  if (error) throw error;
  const rows = data ?? [];
  return (
    <>
      <Link
        href="/more"
        className="text-muted-foreground mb-4 inline-flex min-h-11 items-center text-sm"
      >
        {copy.nav.more}
      </Link>
      <PageHeader title={copy.audit.title} description={copy.audit.description} />
      <section className="bg-card rounded-xl border p-5">
        {rows.length ? (
          <ul className="divide-border divide-y">
            {rows.slice(0, 50).map((item) => (
              <li key={item.id} className="grid gap-1 py-3 text-sm sm:grid-cols-[1fr_auto]">
                <div>
                  <p className="font-medium">
                    {item.action.replaceAll('.', ' · ').replaceAll('_', ' ')}
                  </p>
                  <p className="text-muted-foreground capitalize">
                    {item.entity_type.replaceAll('_', ' ')}
                  </p>
                </div>
                <time className="text-muted-foreground text-xs" dateTime={item.created_at}>
                  {formatDateTime(item.created_at)}
                </time>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">{copy.audit.empty}</p>
        )}
      </section>
      <nav className="mt-4 flex justify-between text-sm">
        {page > 1 ? (
          <Link href={`/settings/audit?page=${page - 1}`} className="underline">
            {copy.audit.newer}
          </Link>
        ) : (
          <span />
        )}
        {rows.length > 50 ? (
          <Link href={`/settings/audit?page=${page + 1}`} className="underline">
            {copy.audit.older}
          </Link>
        ) : null}
      </nav>
    </>
  );
}
