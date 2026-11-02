import type { Metadata } from 'next';
import Link from 'next/link';

import { MemberImport } from '@/components/members/member-import';
import { PageHeader } from '@/components/shared/page-header';
import { requireOrg } from '@/lib/auth/session';
import { copy } from '@/lib/copy';

export const metadata: Metadata = { title: copy.memberImport.title };
export default async function ImportPage() {
  await requireOrg();
  return (
    <>
      <Link href="/members" className="text-primary mb-4 inline-flex min-h-11 items-center text-sm">
        {copy.members.back}
      </Link>
      <PageHeader title={copy.memberImport.title} description={copy.memberImport.description} />
      <MemberImport />
    </>
  );
}
