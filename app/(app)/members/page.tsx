import type { Metadata } from 'next';
import Link from 'next/link';
import { PlusIcon } from 'lucide-react';
import { redirect } from 'next/navigation';

import { MemberDirectory } from '@/components/members/member-directory';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { getMembers } from '@/features/members/queries';
import { MEMBER_PAGE_SIZE } from '@/features/members/queries-constants';
import { memberFilterSchema } from '@/features/members/schema';
import { can } from '@/lib/auth/roles';
import { requireOrg } from '@/lib/auth/session';
import { copy } from '@/lib/copy';
import { todayIST } from '@/lib/dates';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: copy.members.title };

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string; page?: string }>;
}) {
  const ctx = await requireOrg();
  const params = await searchParams;
  const q = (typeof params.q === 'string' ? params.q : '').trim().slice(0, 100);
  const requestedFilter = memberFilterSchema.safeParse(params.filter ?? 'all');
  const filter =
    requestedFilter.success && (requestedFilter.data !== 'deleted' || can.deleteMembers(ctx.role))
      ? requestedFilter.data
      : 'all';
  const page = Math.min(100000, Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1));
  const data = await getMembers(await createClient(), ctx.org.id, q, filter, page);
  if (page > 1 && (page - 1) * MEMBER_PAGE_SIZE >= data.total) {
    const query = new URLSearchParams({
      ...(q ? { q } : {}),
      filter,
      page: String(Math.max(1, Math.ceil(data.total / MEMBER_PAGE_SIZE))),
    });
    redirect(`/members?${query}`);
  }

  return (
    <>
      <PageHeader
        title={copy.members.title}
        action={
          <Button asChild>
            <Link href="/members/new">
              <PlusIcon aria-hidden="true" />
              {copy.members.addMember}
            </Link>
          </Button>
        }
      />
      <MemberDirectory
        {...data}
        today={todayIST()}
        q={q}
        filter={filter}
        page={page}
        canRestore={can.deleteMembers(ctx.role)}
      />
      <Link
        href="/members/import"
        className="text-primary mt-5 inline-flex min-h-11 items-center text-sm"
      >
        {copy.members.import}
      </Link>
    </>
  );
}
