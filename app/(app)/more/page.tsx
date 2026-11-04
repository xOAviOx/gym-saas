import type { Metadata } from 'next';
import Link from 'next/link';

import { LogOutIcon } from '@/components/icons';
import { PageHeader } from '@/components/shared/page-header';
import { RolePill } from '@/components/shared/role-pill';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { signOut } from '@/features/auth/actions';
import { requireOrg } from '@/lib/auth/session';
import { can } from '@/lib/auth/roles';
import { copy } from '@/lib/copy';
import { formatPhone } from '@/lib/phone';

export const metadata: Metadata = { title: copy.more.title };

export default async function MorePage() {
  const ctx = await requireOrg();
  const displayName = ctx.profile?.full_name?.trim() || ctx.user.email || '';

  return (
    <>
      <PageHeader title={copy.more.title} />
      <div className="grid gap-4">
        <Link
          href="/messages"
          className="bg-card hover:shadow-lift focus-visible:ring-ring/20 animate-enter flex min-h-14 items-center justify-between rounded-xl border px-5 text-sm font-medium transition-shadow duration-200 outline-none focus-visible:ring-3"
        >
          {copy.messages.manage}
          <span aria-hidden="true">→</span>
        </Link>
        {can.managePlans(ctx.role) ? (
          <Link
            href="/settings/plans"
            className="bg-card hover:shadow-lift focus-visible:ring-ring/20 animate-enter flex min-h-14 items-center justify-between rounded-xl border px-5 text-sm font-medium transition-shadow duration-200 outline-none focus-visible:ring-3"
          >
            {copy.plans.manage}
            <span aria-hidden="true">→</span>
          </Link>
        ) : null}
        {can.manageSettings(ctx.role) ? (
          <Link
            href="/settings/payments"
            className="bg-card hover:shadow-lift focus-visible:ring-ring/20 animate-enter flex min-h-14 items-center justify-between rounded-xl border px-5 text-sm font-medium transition-shadow duration-200 outline-none [--index:1] focus-visible:ring-3"
          >
            {copy.paymentSettings.manage}
            <span aria-hidden="true">→</span>
          </Link>
        ) : null}
        {can.manageSettings(ctx.role) ? (
          <Link
            href="/settings/attendance"
            className="bg-card hover:shadow-lift focus-visible:ring-ring/20 animate-enter flex min-h-14 items-center justify-between rounded-xl border px-5 text-sm font-medium transition-shadow duration-200 outline-none [--index:2] focus-visible:ring-3"
          >
            {copy.attendanceSettings.title}
            <span aria-hidden="true">→</span>
          </Link>
        ) : null}
        {can.manageSettings(ctx.role) ? (
          <Link
            href="/settings/messaging"
            className="bg-card hover:shadow-lift focus-visible:ring-ring/20 animate-enter flex min-h-14 items-center justify-between rounded-xl border px-5 text-sm font-medium transition-shadow duration-200 outline-none [--index:2] focus-visible:ring-3"
          >
            {copy.messagingSettings.manage}
            <span aria-hidden="true">→</span>
          </Link>
        ) : null}
        <Card className="animate-enter [--index:3]">
          <CardHeader>
            <CardTitle>{copy.more.gym}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{copy.onboarding.gym.name}</dt>
                <dd className="text-right font-medium">{ctx.org.name}</dd>
              </div>
              {ctx.org.city ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{copy.onboarding.gym.city}</dt>
                  <dd className="text-right">{ctx.org.city}</dd>
                </div>
              ) : null}
              {ctx.org.phone ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{copy.onboarding.gym.phone}</dt>
                  <dd className="tabular text-right">{formatPhone(ctx.org.phone)}</dd>
                </div>
              ) : null}
              {ctx.org.upi_vpa ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{copy.onboarding.gym.upiVpa}</dt>
                  <dd className="text-right">{ctx.org.upi_vpa}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{copy.onboarding.gym.gstSection}</dt>
                <dd className="text-right">
                  {ctx.org.gst_enabled ? `${copy.common.on} · ${ctx.org.gstin}` : copy.common.off}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{copy.onboarding.gym.invoicePrefix}</dt>
                <dd className="text-right font-mono">{ctx.org.invoice_prefix}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card className="animate-enter [--index:4]">
          <CardHeader>
            <CardTitle>{copy.more.account}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{displayName}</p>
                {ctx.user.email && displayName !== ctx.user.email ? (
                  <p className="text-muted-foreground truncate text-sm">{ctx.user.email}</p>
                ) : null}
              </div>
              <RolePill role={ctx.role} />
            </div>
            <form action={signOut}>
              <Button type="submit" variant="outline" className="w-full sm:w-auto">
                <LogOutIcon />
                {copy.more.signOut}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
