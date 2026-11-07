import type { Metadata } from 'next';
import Link from 'next/link';

import { GymSettingsForm } from '@/components/settings/gym-settings-form';
import { PageHeader } from '@/components/shared/page-header';
import { PRIVILEGED_ROLES } from '@/lib/auth/roles';
import { requireOrg } from '@/lib/auth/session';
import { copy } from '@/lib/copy';

export const metadata: Metadata = { title: copy.gymSettings.title };

export default async function GymSettingsPage() {
  const { org } = await requireOrg(PRIVILEGED_ROLES);
  return (
    <>
      <Link
        href="/more"
        className="text-muted-foreground mb-4 inline-flex min-h-11 items-center text-sm"
      >
        {copy.nav.more}
      </Link>
      <PageHeader title={copy.gymSettings.title} description={copy.gymSettings.description} />
      <GymSettingsForm
        initial={{
          name: org.name,
          city: org.city ?? '',
          state: org.state ?? '',
          addressLine: org.address_line ?? '',
          phone: org.phone ?? '',
          email: org.email ?? '',
          invoicePrefix: org.invoice_prefix,
          gstEnabled: org.gst_enabled,
          gstin: org.gstin ?? '',
          gstRate: String(org.gst_rate),
        }}
      />
    </>
  );
}
