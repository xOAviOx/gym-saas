import { UsersIcon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { requireOrg } from '@/lib/auth/session';
import { copy } from '@/lib/copy';

export const metadata: Metadata = { title: copy.members.title };

export default async function MembersPage() {
  await requireOrg();

  return (
    <>
      <PageHeader title={copy.members.title} />
      <EmptyState
        icon={UsersIcon}
        title={copy.members.emptyTitle}
        body={copy.members.emptyBody}
        action={
          <Button asChild>
            <Link href="/members/new">{copy.members.addMember}</Link>
          </Button>
        }
      />
    </>
  );
}
