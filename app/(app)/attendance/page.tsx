import { ScanLineIcon } from 'lucide-react';
import type { Metadata } from 'next';

import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { requireOrg } from '@/lib/auth/session';
import { copy } from '@/lib/copy';

export const metadata: Metadata = { title: copy.attendance.title };

export default async function AttendancePage() {
  await requireOrg();

  return (
    <>
      <PageHeader title={copy.attendance.title} />
      <EmptyState
        icon={ScanLineIcon}
        title={copy.attendance.emptyTitle}
        body={copy.attendance.emptyBody}
      />
    </>
  );
}
