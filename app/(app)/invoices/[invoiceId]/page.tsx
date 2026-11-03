import { randomUUID } from 'node:crypto';

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { PayLinkDialog, UpiQrDialog } from '@/components/billing/collect-dialogs';
import { GatewayPanel } from '@/components/billing/gateway-panel';
import {
  ClaimReview,
  ReversePaymentButton,
  VoidInvoiceButton,
} from '@/components/billing/invoice-actions';
import { InvoiceStatusBadge } from '@/components/billing/invoice-status-badge';
import { RecordPaymentDialog } from '@/components/billing/record-payment-dialog';
import { DownloadIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { cashfreeEnvironment } from '@/features/billing/gateway';
import { payLinkFor } from '@/features/billing/pay-link';
import { getInvoiceDetail } from '@/features/billing/queries';
import { can } from '@/lib/auth/roles';
import { requireOrg } from '@/lib/auth/session';
import { copy } from '@/lib/copy';
import { daysAgo, formatDate, formatDateTime, relativeDueDate, todayIST } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { waMeUrl } from '@/lib/phone';
import { qrDataUrl } from '@/lib/qr';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { buildUpiUri, upiNote } from '@/lib/upi';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: copy.invoices.title };

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn('flex justify-between gap-4', strong && 'border-t pt-3 font-semibold')}>
      <dt className={strong ? '' : 'text-muted-foreground'}>{label}</dt>
      <dd className="tabular text-right">{value}</dd>
    </div>
  );
}

export default async function InvoicePage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const ctx = await requireOrg();
  const { invoiceId } = await params;
  if (!z.uuid().safeParse(invoiceId).success) notFound();
  const invoice = await getInvoiceDetail(await createClient(), ctx.org.id, invoiceId);
  if (!invoice || (invoice.member.deleted && !can.deleteMembers(ctx.role))) notFound();

  const today = todayIST();
  const privileged = can.voidInvoices(ctx.role);
  const isVoid = invoice.status === 'void';
  const payable = !isVoid && invoice.balance > 0 && !invoice.member.deleted;
  const balanceLabel = formatMoney(invoice.balance);
  const { upi_vpa: vpa, upi_payee_name: payee } = ctx.org;
  const upiUri =
    payable && vpa && payee
      ? buildUpiUri({
          vpa,
          payeeName: payee,
          amount: invoice.balance,
          note: upiNote(invoice.number, invoice.member.memberCode),
        })
      : null;
  const [environment, qr] = await Promise.all([
    cashfreeEnvironment(createAdminClient(), ctx.org.id),
    upiUri ? qrDataUrl(upiUri) : null,
  ]);
  const payLink = payable ? payLinkFor(invoice.id) : null;
  const firstName = invoice.member.fullName.trim().split(/\s+/)[0] ?? invoice.member.fullName;
  const whatsappUrl =
    payLink && invoice.member.consentMessaging
      ? waMeUrl(
          invoice.member.phone,
          copy.payLink.message(firstName, ctx.org.name, balanceLabel, invoice.number, payLink.url),
        )
      : null;
  const pendingClaims = invoice.claims.filter((claim) => claim.status === 'pending');
  const reviewedClaims = invoice.claims.filter((claim) => claim.status !== 'pending');
  const halfRate = String(invoice.gstRate / 2);
  const due = relativeDueDate(invoice.dueDate, today);
  const recordRequestId = randomUUID();

  return (
    <>
      <Link
        href="/dues"
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex min-h-11 items-center text-sm transition-colors"
      >
        {copy.invoices.backToDues}
      </Link>
      <header className="animate-enter mb-6 grid gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-serif text-3xl leading-[1.1] font-normal tracking-[-0.02em] break-words sm:text-4xl">
            {copy.invoices.heading(invoice.number)}
          </h1>
          <InvoiceStatusBadge status={invoice.status} />
        </div>
        <p className="text-muted-foreground text-sm">
          <Link
            href={`/members/${invoice.member.id}`}
            className="text-foreground font-medium underline-offset-4 hover:underline"
          >
            {invoice.member.fullName}
          </Link>
          {' · '}
          <span className="font-mono">{invoice.member.memberCode}</span>
          {` · ${copy.invoices.issuedOn(formatDate(invoice.issueDate))}`}
        </p>
      </header>

      {isVoid ? (
        <section className="bg-muted mb-5 grid gap-1 rounded-xl border p-4">
          <h2 className="text-base font-semibold">{copy.invoices.voidedTitle}</h2>
          <p className="text-muted-foreground text-sm">
            {copy.invoices.voidedBody(
              invoice.voidReason ?? '',
              invoice.voidedAt ? formatDate(new Date(invoice.voidedAt)) : '',
            )}
          </p>
        </section>
      ) : null}
      {invoice.member.deleted ? (
        <p className="bg-warning-soft mb-5 rounded-xl border p-4 text-sm">
          {copy.invoices.memberDeleted}
        </p>
      ) : null}

      <section
        aria-label={copy.invoices.collectTitle}
        className="bg-card animate-enter mb-5 grid gap-4 rounded-xl border p-5 [--index:1] md:p-6"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-muted-foreground text-[11px] font-medium tracking-[0.05em] uppercase">
              {copy.invoices.balance}
            </p>
            <p
              className={cn(
                'tabular mt-2 text-4xl leading-none font-semibold tracking-tight',
                invoice.balance > 0 && !isVoid && 'text-danger',
              )}
            >
              {balanceLabel}
            </p>
            <p className="text-muted-foreground mt-1 text-sm">
              {copy.invoices.totalPaid(formatMoney(invoice.total), formatMoney(invoice.paid))}
            </p>
          </div>
          {!isVoid ? (
            <p
              className={cn(
                'text-sm font-medium',
                invoice.balance <= 0
                  ? 'text-success'
                  : due.days < 0
                    ? 'text-danger'
                    : 'text-muted-foreground',
              )}
            >
              {invoice.balance > 0
                ? `${formatDate(invoice.dueDate)} · ${due.label}`
                : copy.invoices.settled}
            </p>
          ) : null}
        </div>
        {invoice.balance < 0 ? (
          <p className="bg-warning-soft rounded-lg p-3 text-sm">
            {copy.invoices.overpaid(formatMoney(-invoice.balance))}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          {payable ? (
            <RecordPaymentDialog
              key={recordRequestId}
              invoiceId={invoice.id}
              requestId={recordRequestId}
              balance={invoice.balance}
              today={today}
              earliest={daysAgo(90, today)}
            />
          ) : null}
          {qr && vpa && payee ? (
            <UpiQrDialog qr={qr} amount={balanceLabel} payee={payee} vpa={vpa} />
          ) : null}
          {payLink ? (
            <PayLinkDialog
              url={payLink.url}
              expires={formatDate(payLink.expiresAt)}
              whatsappUrl={whatsappUrl}
            />
          ) : null}
          <Button asChild variant="outline" className="flex-1 sm:flex-none">
            <a href={`/invoices/${invoice.id}/pdf`} target="_blank" rel="noopener">
              <DownloadIcon aria-hidden="true" />
              {copy.invoices.downloadPdf}
            </a>
          </Button>
        </div>
        {payable && !upiUri ? (
          <p className="text-muted-foreground text-xs">{copy.upiCollect.notConfigured}</p>
        ) : null}
      </section>

      {pendingClaims.length ? (
        <section
          aria-labelledby="claims-title"
          className="bg-warning-soft mb-5 grid gap-3 rounded-xl border p-4"
        >
          <div>
            <h2 id="claims-title" className="text-base font-semibold">
              {copy.claims.title}
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">{copy.claims.body}</p>
          </div>
          <ul className="grid gap-3">
            {pendingClaims.map((claim) => (
              <ClaimReview key={claim.id} invoiceId={invoice.id} claim={claim} />
            ))}
          </ul>
        </section>
      ) : null}

      {!isVoid && !invoice.member.deleted && (payable || invoice.links.length) ? (
        <div className="mb-5">
          <GatewayPanel
            invoiceId={invoice.id}
            requestId={randomUUID()}
            configured={environment !== null}
            sandbox={environment === 'sandbox'}
            canConfigure={can.manageSettings(ctx.role)}
            payable={payable}
            links={invoice.links}
          />
        </div>
      ) : null}

      <div className="animate-enter grid gap-5 [--index:2] lg:grid-cols-2">
        <section className="bg-card grid content-start gap-4 rounded-xl border p-5 md:p-6">
          <h2 className="text-base font-semibold">{copy.invoices.breakdown}</h2>
          <ul className="grid gap-3">
            {invoice.items.map((item) => (
              <li key={item.id} className="flex justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium break-words">{item.description}</p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {copy.invoices.sac(item.sac)}
                  </p>
                </div>
                <span className="tabular shrink-0">{formatMoney(item.amount)}</span>
              </li>
            ))}
          </ul>
          <dl className="grid gap-2 border-t pt-4 text-sm">
            <Row label={copy.invoices.subtotal} value={formatMoney(invoice.subtotal)} />
            {invoice.discount > 0 ? (
              <Row label={copy.invoices.discount} value={formatMoney(-invoice.discount)} />
            ) : null}
            {invoice.gstRate > 0 ? (
              <>
                <Row label={copy.invoices.taxableValue} value={formatMoney(invoice.taxable)} />
                <Row label={copy.invoices.cgst(halfRate)} value={formatMoney(invoice.cgst)} />
                <Row label={copy.invoices.sgst(halfRate)} value={formatMoney(invoice.sgst)} />
              </>
            ) : null}
            <Row
              label={invoice.gstRate > 0 ? copy.invoices.totalInclusive : copy.invoices.total}
              value={formatMoney(invoice.total)}
              strong
            />
          </dl>
          <p className="text-muted-foreground text-xs">
            {copy.invoices.fiscalYear(invoice.fiscalYear)} · {copy.invoices.due}{' '}
            {formatDate(invoice.dueDate)}
          </p>
        </section>

        <section className="bg-card grid content-start gap-4 rounded-xl border p-5 md:p-6">
          <h2 className="text-base font-semibold">{copy.invoices.payments}</h2>
          {invoice.payments.length ? (
            <ul className="-mx-5 divide-y border-t md:-mx-6">
              {invoice.payments.map((payment) => (
                <li
                  key={payment.id}
                  className="flex items-start justify-between gap-3 px-5 py-3 md:px-6"
                >
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {copy.members.paymentMethod[payment.method]}
                      {payment.isReversal || payment.reversed ? (
                        <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[11px] font-medium tracking-[0.05em] uppercase">
                          {payment.isReversal
                            ? copy.payments.reversalTag
                            : copy.payments.reversedTag}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {formatDateTime(payment.paidAt)}
                    </p>
                    {payment.reference ? (
                      <p className="text-muted-foreground mt-1 text-xs break-all">
                        {copy.members.reference}: {payment.reference}
                      </p>
                    ) : null}
                    {payment.reversalReason ? (
                      <p className="text-muted-foreground mt-1 text-xs break-words">
                        {copy.payments.reasonLine(payment.reversalReason)}
                      </p>
                    ) : null}
                  </div>
                  <div className="grid shrink-0 justify-items-end gap-1">
                    <span
                      className={cn(
                        'tabular text-sm font-medium',
                        payment.isReversal && 'text-danger',
                        payment.reversed && 'text-muted-foreground line-through',
                      )}
                    >
                      {formatMoney(payment.amount)}
                    </span>
                    {privileged && !payment.isReversal && !payment.reversed && !isVoid ? (
                      <ReversePaymentButton
                        invoiceId={invoice.id}
                        paymentId={payment.id}
                        label={copy.payments.reverseLabelFor(
                          formatMoney(payment.amount),
                          formatDateTime(payment.paidAt),
                        )}
                      />
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div>
              <p className="text-sm font-medium">{copy.invoices.noPayments}</p>
              <p className="text-muted-foreground mt-1 text-sm">{copy.invoices.noPaymentsBody}</p>
            </div>
          )}
        </section>
      </div>

      {reviewedClaims.length ? (
        <details className="bg-card mt-5 rounded-xl border p-5">
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">
            {copy.claims.history}
          </summary>
          <ul className="mt-2 grid gap-3">
            {reviewedClaims.map((claim) => (
              <li key={claim.id} className="flex items-start justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="font-mono break-all">{copy.claims.utr(claim.utr)}</p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {copy.claims.claimedAt(formatDateTime(claim.claimedAt))}
                  </p>
                  {claim.rejectReason ? (
                    <p className="text-muted-foreground mt-1 text-xs break-words">
                      {copy.claims.reasonLine(claim.rejectReason)}
                    </p>
                  ) : null}
                </div>
                <div className="grid shrink-0 justify-items-end gap-1">
                  <span className="tabular">{formatMoney(claim.amount)}</span>
                  <span
                    className={cn(
                      'text-xs',
                      claim.status === 'confirmed' ? 'text-success' : 'text-muted-foreground',
                    )}
                  >
                    {copy.claims.statuses[claim.status]}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {privileged && !isVoid && invoice.paid === 0 ? (
        <div className="mt-8 border-t pt-5">
          <VoidInvoiceButton invoiceId={invoice.id} />
        </div>
      ) : null}
    </>
  );
}
