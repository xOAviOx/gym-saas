import type { Metadata } from 'next';
import Image from 'next/image';

import { CheckCircle2Icon, DownloadIcon } from '@/components/icons';
import { BrandMark } from '@/components/shared/brand-mark';
import { CheckoutStatus, PayClaimForm, PayOnlineButton } from '@/components/pay/pay-actions';
import { Button } from '@/components/ui/button';
import { loadPayPage, type PayPage } from '@/features/billing/public';
import { copy } from '@/lib/copy';
import { formatDate, formatDateTime } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { formatPhone, telUrl } from '@/lib/phone';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: copy.pay.metaTitle,
  robots: { index: false, follow: false },
  // The URL is the member's access token; never send it to another site.
  referrer: 'no-referrer',
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="bg-background min-h-dvh px-4 py-8">
      <div className="mx-auto grid max-w-md gap-4">{children}</div>
    </main>
  );
}

function Expired() {
  return (
    <Shell>
      <section className="bg-card grid gap-2 rounded-xl border p-6 text-center">
        <h1 className="font-serif text-3xl leading-[1.1] font-normal tracking-[-0.02em]">
          {copy.pay.expiredTitle}
        </h1>
        <p className="text-muted-foreground text-sm">{copy.pay.expiredBody}</p>
      </section>
    </Shell>
  );
}

function UpiSection({ upi, amount }: { upi: NonNullable<PayPage['upi']>; amount: string }) {
  return (
    <section aria-labelledby="pay-upi" className="bg-card grid gap-4 rounded-xl border p-5">
      <div>
        <h2 id="pay-upi" className="text-base font-semibold">
          {copy.pay.payUpi}
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">{copy.pay.payUpiBody}</p>
      </div>
      <div className="mx-auto rounded-xl border bg-white p-3">
        <Image
          src={upi.qr}
          alt={copy.upiCollect.qrAlt(amount)}
          width={224}
          height={224}
          unoptimized
          className="size-56"
        />
      </div>
      <Button asChild className="w-full">
        <a href={upi.uri}>{copy.pay.openApp(amount)}</a>
      </Button>
      <p className="text-muted-foreground text-center text-xs break-all">
        {copy.upiCollect.payee(upi.payee, upi.vpa)}
      </p>
    </section>
  );
}

function OnlineSection({ page }: { page: PayPage }) {
  return (
    <section aria-labelledby="pay-online" className="bg-card grid gap-4 rounded-xl border p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="pay-online" className="text-base font-semibold">
            {copy.pay.payOnline}
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">{copy.pay.payOnlineBody}</p>
        </div>
        {page.online.sandbox ? (
          <span className="bg-warning-soft text-warning inline-flex min-h-6 items-center rounded-full px-2.5 py-1 text-[11px] leading-4 font-medium tracking-[0.05em] uppercase">
            {copy.gateway.sandbox}
          </span>
        ) : null}
      </div>
      <PayOnlineButton token={page.token} amount={page.invoice.balance} />
    </section>
  );
}

export default async function PayInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ checkout?: string }>;
}) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const page = await loadPayPage(token);
  if (!page) return <Expired />;

  const { invoice } = page;
  const payable = invoice.status !== 'void' && invoice.balance > 0;
  const amount = formatMoney(invoice.balance);
  const methods = [
    page.upi ? <UpiSection key="upi" upi={page.upi} amount={amount} /> : null,
    page.online.available ? <OnlineSection key="online" page={page} /> : null,
  ];
  if (page.online.preferred) methods.reverse();

  return (
    <Shell>
      <header className="animate-enter grid justify-items-center gap-2 text-center">
        <p className="text-muted-foreground text-[11px] font-medium tracking-[0.05em] uppercase">
          {page.gym.name}
        </p>
        <h1 className="font-serif text-3xl leading-[1.1] font-normal tracking-[-0.02em] break-words">
          {copy.pay.invoice(invoice.number)}
        </h1>
        <p className="text-muted-foreground text-sm">
          {copy.pay.forMember(page.member.firstName, page.member.code)}
        </p>
      </header>

      {query.checkout === '1' && invoice.status !== 'void' ? (
        <CheckoutStatus token={token} />
      ) : null}

      {invoice.status === 'void' ? (
        <section className="bg-card grid gap-1 rounded-xl border p-6 text-center">
          <h2 className="text-lg font-semibold">{copy.pay.voidTitle}</h2>
          <p className="text-muted-foreground text-sm">{copy.pay.voidBody}</p>
        </section>
      ) : !payable ? (
        <section className="bg-success-soft animate-enter grid justify-items-center gap-2 rounded-xl border border-[#d5e3d3] p-6 text-center [--index:1]">
          <CheckCircle2Icon className="text-success size-8" aria-hidden="true" />
          <h2 className="text-lg font-semibold">{copy.pay.paidTitle}</h2>
          <p className="text-muted-foreground text-sm">{copy.pay.paidBody}</p>
          <p className="tabular text-sm font-medium">{formatMoney(invoice.total)}</p>
        </section>
      ) : (
        <>
          <section className="bg-card animate-enter grid justify-items-center gap-1 rounded-xl border p-6 text-center [--index:1]">
            <p className="text-muted-foreground text-[11px] font-medium tracking-[0.05em] uppercase">
              {copy.pay.due}
            </p>
            <p className="tabular mt-1 text-4xl leading-tight font-semibold tracking-tight">
              {amount}
            </p>
            {invoice.paid > 0 ? (
              <p className="text-muted-foreground text-sm">
                {copy.pay.paidOf(formatMoney(invoice.paid), formatMoney(invoice.total))}
              </p>
            ) : null}
            <p className="text-muted-foreground text-sm">
              {copy.pay.dueOn(formatDate(invoice.dueDate))}
            </p>
          </section>
          {methods}
          {!page.upi && !page.online.available ? (
            <p className="bg-card text-muted-foreground rounded-xl border p-5 text-sm">
              {copy.pay.noMethods}
            </p>
          ) : null}
          {page.upi ? (
            <section
              aria-labelledby="pay-claim"
              className="bg-card grid gap-4 rounded-xl border p-5"
            >
              <div>
                <h2 id="pay-claim" className="text-base font-semibold">
                  {copy.pay.claimTitle}
                </h2>
                <p className="text-muted-foreground mt-1 text-sm">{copy.pay.claimBody}</p>
              </div>
              <PayClaimForm token={token} balance={invoice.balance} />
            </section>
          ) : null}
        </>
      )}

      {page.claims.length ? (
        <section aria-labelledby="pay-updates" className="bg-card grid gap-3 rounded-xl border p-5">
          <h2 id="pay-updates" className="text-base font-semibold">
            {copy.pay.updatesTitle}
          </h2>
          <ul className="grid gap-3">
            {page.claims.map((claim) => (
              <li key={claim.id} className="flex items-start justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="font-mono">{copy.pay.utrEnding(claim.utrLast4)}</p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {formatDateTime(claim.claimedAt)}
                  </p>
                  {claim.status === 'rejected' && claim.reason ? (
                    <p className="text-muted-foreground mt-1 text-xs break-words">
                      {copy.claims.reasonLine(claim.reason)}
                    </p>
                  ) : null}
                </div>
                <div className="grid shrink-0 justify-items-end gap-1">
                  <span className="tabular">{formatMoney(claim.amount)}</span>
                  <span
                    className={cn(
                      'text-xs font-medium',
                      claim.status === 'confirmed' && 'text-success',
                      claim.status === 'rejected' && 'text-danger',
                      claim.status === 'pending' && 'text-warning',
                    )}
                  >
                    {copy.pay.claimStatus[claim.status]}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <footer className="grid justify-items-center gap-3 pt-2 text-center">
        <Button asChild variant="outline">
          <a href={`/p/pay/${token}/pdf`} target="_blank" rel="noopener noreferrer">
            <DownloadIcon aria-hidden="true" />
            {copy.pay.downloadReceipt}
          </a>
        </Button>
        {page.gym.phone ? (
          <a
            href={telUrl(page.gym.phone)}
            className="text-foreground decoration-input min-h-11 py-3 text-sm underline underline-offset-4 hover:decoration-current"
          >
            {copy.pay.contact(formatPhone(page.gym.phone))}
          </a>
        ) : null}
        <p className="text-muted-foreground text-xs">{copy.pay.privacy}</p>
        <p className="text-muted-foreground flex items-center gap-2 text-xs">
          <BrandMark className="size-5 rounded-md text-xs" />
          {copy.pay.poweredBy}
        </p>
      </footer>
    </Shell>
  );
}
