import { randomUUID } from 'node:crypto';
import type { Metadata } from 'next';
import Link from 'next/link';

import { CreateMemberForm } from '@/components/members/create-member-form';
import { PageHeader } from '@/components/shared/page-header';
import { getPlans } from '@/features/plans/queries';
import { requireOrg } from '@/lib/auth/session';
import { copy } from '@/lib/copy';
import { todayIST } from '@/lib/dates';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: copy.members.addMember };

export default async function NewMemberPage() {
  const ctx = await requireOrg();
  const plans = await getPlans(await createClient(), ctx.org.id, true);
  return (
    <>
      <Link href="/members" className="text-primary mb-4 inline-flex min-h-11 items-center text-sm">
        {copy.members.back}
      </Link>
      <PageHeader title={copy.members.addMember} />
      <CreateMemberForm
        today={todayIST()}
        plans={plans}
        gstEnabled={ctx.org.gst_enabled}
        requestId={randomUUID()}
      />
    </>
  );
}
