import { IndianRupeeIcon } from 'lucide-react';
import type { Metadata } from 'next';

import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { requireOrg } from '@/lib/auth/session';
import { copy } from '@/lib/copy';

export const metadata: Metadata = { title: copy.dues.title };

export default async function DuesPage() {
  await requireOrg();

  return (
    <>
      <PageHeader title={copy.dues.title} />
      <EmptyState icon={IndianRupeeIcon} title={copy.dues.emptyTitle} body={copy.dues.emptyBody} />
    </>
  );
}
