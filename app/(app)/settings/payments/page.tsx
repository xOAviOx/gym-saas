import type { Metadata } from 'next';
import Link from 'next/link';

import { CashfreeSettings } from '@/components/billing/cashfree-settings';
import { PaymentSettingsForm } from '@/components/billing/payment-settings-form';
import { PageHeader } from '@/components/shared/page-header';
import { getPaymentSettings } from '@/features/billing/queries';
import { PRIVILEGED_ROLES } from '@/lib/auth/roles';
import { requireOrg } from '@/lib/auth/session';
import { copy } from '@/lib/copy';
import { env } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: copy.paymentSettings.title };

/** Cashfree can only deliver webhooks to a public HTTPS address. */
function isPublicHttps(url: string): boolean {
  const { protocol, hostname } = new URL(url);
  return (
    protocol === 'https:' &&
    hostname !== 'localhost' &&
    !hostname.endsWith('.localhost') &&
    !/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname)
  );
}

export default async function PaymentSettingsPage() {
  const ctx = await requireOrg(PRIVILEGED_ROLES);
  const settings = await getPaymentSettings(await createClient(), ctx.org.id);
  const webhookUrl = `${env.NEXT_PUBLIC_APP_URL}/api/webhooks/cashfree`;
  return (
    <>
      <Link href="/more" className="text-primary mb-4 inline-flex min-h-11 items-center text-sm">
        {copy.nav.more}
      </Link>
      <PageHeader
        title={copy.paymentSettings.title}
        description={copy.paymentSettings.description}
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <section
          aria-labelledby="upi-title"
          className="bg-card grid content-start gap-5 rounded-xl border p-5"
        >
          <div>
            <h2 id="upi-title" className="text-base font-semibold">
              {copy.paymentSettings.upiTitle}
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">{copy.paymentSettings.upiBody}</p>
          </div>
          {!settings.upiVpa ? (
            <p className="bg-warning-soft rounded-lg p-3 text-sm">
              {copy.paymentSettings.upiMissing}
            </p>
          ) : null}
          <PaymentSettingsForm
            key={`${settings.upiVpa}:${settings.upiPayeeName}:${settings.defaultMode}:${!!settings.cashfree}`}
            values={{
              upiVpa: settings.upiVpa,
              upiPayeeName: settings.upiPayeeName,
              defaultMode: settings.defaultMode === 'cashfree' ? 'cashfree' : 'upi_direct',
            }}
            cashfreeConnected={!!settings.cashfree}
          />
        </section>
        <section
          aria-labelledby="cashfree-title"
          className="bg-card grid content-start gap-5 rounded-xl border p-5"
        >
          <div>
            <h2 id="cashfree-title" className="text-base font-semibold">
              {copy.paymentSettings.cashfreeTitle}
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {copy.paymentSettings.cashfreeBody}
            </p>
          </div>
          <CashfreeSettings
            key={`${settings.cashfree?.appId}:${settings.cashfree?.verifiedAt}`}
            connection={settings.cashfree}
            webhookUrl={webhookUrl}
            webhookReachable={isPublicHttps(webhookUrl)}
          />
        </section>
      </div>
    </>
  );
}
