import type { Metadata } from 'next';

import { BrandMark } from '@/components/shared/brand-mark';
import { Button } from '@/components/ui/button';
import { loadMemberPortal } from '@/features/portal/public';
import { copy } from '@/lib/copy';
import { formatDate, formatDateTime } from '@/lib/dates';
import { env } from '@/lib/env';
import { formatMoney, toPaise } from '@/lib/money';
import { createPayToken } from '@/lib/payments/pay-token';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: copy.portal.title,
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function MemberPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const page = await loadMemberPortal(token);
  if (!page) {
    return (
      <main className="bg-background grid min-h-dvh place-items-center p-4">
        <section className="bg-card grid max-w-sm gap-2 rounded-xl border p-6 text-center">
          <h1 className="font-serif text-3xl">{copy.portal.unavailableTitle}</h1>
          <p className="text-muted-foreground text-sm">{copy.portal.unavailableBody}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="bg-background min-h-dvh px-4 py-8">
      <div className="mx-auto grid max-w-xl gap-5">
        <header className="grid gap-2 text-center">
          <p className="text-muted-foreground text-xs font-medium uppercase">
            {page.member.organizations.name}
          </p>
          <h1 className="font-serif text-4xl">{copy.portal.greeting(page.member.full_name)}</h1>
          <p className="text-muted-foreground font-mono text-sm">{page.member.member_code}</p>
        </header>

        <section className="bg-card rounded-xl border p-5">
          <h2 className="mb-4 text-lg font-semibold">{copy.portal.memberships}</h2>
          {page.memberships.length ? (
            <ul className="divide-border divide-y">
              {page.memberships.map((item) => (
                <li key={item.id} className="flex justify-between gap-4 py-3 text-sm">
                  <div>
                    <p className="font-medium">{item.plans.name}</p>
                    <p className="text-muted-foreground mt-1">
                      {formatDate(item.start_date)} – {formatDate(item.end_date)}
                    </p>
                    {item.sessions_total !== null ? (
                      <p className="text-muted-foreground mt-1">
                        {copy.portal.sessionsLeft(
                          Math.max(0, item.sessions_total - item.sessions_used),
                        )}
                      </p>
                    ) : null}
                  </div>
                  <span className="capitalize">{item.status}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">{copy.portal.noMemberships}</p>
          )}
        </section>

        <section className="bg-card rounded-xl border p-5">
          <h2 className="mb-4 text-lg font-semibold">{copy.portal.invoices}</h2>
          {page.invoices.length ? (
            <ul className="divide-border divide-y">
              {page.invoices.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
                >
                  <div>
                    <p className="font-mono font-medium">{item.invoice_number}</p>
                    <p className="text-muted-foreground mt-1">
                      {formatDate(item.issue_date)} ·{' '}
                      {copy.portal.total(formatMoney(toPaise(item.total_amount)))}
                    </p>
                    <p className="mt-1">
                      {copy.portal.balance(formatMoney(toPaise(item.balance_due)))}
                    </p>
                  </div>
                  {item.status !== 'void' ? (
                    <Button asChild variant="outline" size="sm">
                      <a href={`/p/pay/${createPayToken(item.id, env.PORTAL_TOKEN_SECRET).token}`}>
                        {copy.portal.viewInvoice}
                      </a>
                    </Button>
                  ) : (
                    <span className="capitalize">{item.status}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">{copy.portal.noInvoices}</p>
          )}
        </section>

        <section className="bg-card rounded-xl border p-5">
          <h2 className="mb-4 text-lg font-semibold">{copy.portal.attendance}</h2>
          {page.attendance.length ? (
            <ul className="divide-border divide-y text-sm">
              {page.attendance.map((item) => (
                <li key={item.id} className="py-3">
                  {formatDateTime(item.checked_in_at)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">{copy.portal.noAttendance}</p>
          )}
        </section>

        <footer className="text-muted-foreground flex items-center justify-center gap-2 text-xs">
          <BrandMark className="size-5 rounded-md text-xs" /> {copy.pay.poweredBy}
        </footer>
      </div>
    </main>
  );
}
