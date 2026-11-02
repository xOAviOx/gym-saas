'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { FormDialog } from '@/components/shared/form-dialog';
import { SubmitButton } from '@/components/shared/submit-button';
import { applyActionResult } from '@/components/shared/apply-action-result';
import { Button } from '@/components/ui/button';
import { confirmClaim, rejectClaim, reversePayment, voidInvoice } from '@/features/billing/actions';
import type { InvoiceClaim } from '@/features/billing/types';
import { copy } from '@/lib/copy';
import { formatDateTime } from '@/lib/dates';
import { formatMoney } from '@/lib/money';

import { ReasonDialog } from './reason-dialog';

export function ReversePaymentButton({
  invoiceId,
  paymentId,
  label,
}: {
  invoiceId: string;
  paymentId: string;
  /** Names the payment for screen readers, since each row has its own button. */
  label: string;
}) {
  return (
    <ReasonDialog
      trigger={
        <Button variant="ghost" size="sm" className="text-destructive min-h-11" aria-label={label}>
          {copy.payments.reverse}
        </Button>
      }
      title={copy.payments.reverseTitle}
      description={copy.payments.reverseBody}
      reasonLabel={copy.payments.reverseReason}
      submitLabel={copy.payments.reverse}
      success={copy.payments.reversed}
      destructive
      onSubmit={(reason) => reversePayment({ invoiceId, paymentId, reason })}
    />
  );
}

export function VoidInvoiceButton({ invoiceId }: { invoiceId: string }) {
  return (
    <ReasonDialog
      trigger={
        <Button variant="outline" className="text-destructive">
          {copy.invoices.void}
        </Button>
      }
      title={copy.invoices.voidTitle}
      description={copy.invoices.voidBody}
      reasonLabel={copy.invoices.voidReason}
      submitLabel={copy.invoices.void}
      success={copy.invoices.voided}
      destructive
      onSubmit={(reason) => voidInvoice({ invoiceId, reason })}
    />
  );
}

function ConfirmClaimButton({ invoiceId, claim }: { invoiceId: string; claim: InvoiceClaim }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const amount = formatMoney(claim.amount);
  async function confirm() {
    setPending(true);
    try {
      const result = await confirmClaim({ invoiceId, claimId: claim.id });
      if (applyActionResult(result)) {
        toast.success(copy.claims.confirmed);
        if (result.data.linkCancelled) toast.info(copy.payments.linkCancelled);
        setOpen(false);
        router.refresh();
      }
    } catch {
      toast.error(copy.errors.network);
    }
    setPending(false);
  }
  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) setOpen(next);
      }}
      title={copy.claims.confirmTitle}
      description={copy.claims.confirmBody(amount, claim.utr)}
      trigger={
        <Button
          className="flex-1 sm:flex-none"
          aria-label={copy.claims.confirmFor(amount, claim.utr)}
        >
          {copy.claims.confirm}
        </Button>
      }
    >
      <div className="flex gap-3">
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => setOpen(false)}
          className="flex-1"
        >
          {copy.common.cancel}
        </Button>
        <SubmitButton
          type="button"
          pending={pending}
          pendingLabel={copy.common.saving}
          onClick={confirm}
          className="flex-1"
        >
          {copy.claims.confirm}
        </SubmitButton>
      </div>
    </FormDialog>
  );
}

/** One member-submitted UPI claim waiting for the desk to check the bank. */
export function ClaimReview({ invoiceId, claim }: { invoiceId: string; claim: InvoiceClaim }) {
  const amount = formatMoney(claim.amount);
  return (
    <li className="bg-card grid gap-3 rounded-xl border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="tabular text-lg font-semibold">{amount}</p>
          <p className="tabular mt-1 text-sm break-all">{copy.claims.utr(claim.utr)}</p>
          <p className="text-muted-foreground mt-1 text-xs">
            {copy.claims.claimedAt(formatDateTime(claim.claimedAt))}
          </p>
          {claim.note ? (
            <p className="text-muted-foreground mt-2 text-sm break-words">
              {copy.claims.noteLine(claim.note)}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <ConfirmClaimButton invoiceId={invoiceId} claim={claim} />
        <ReasonDialog
          trigger={
            <Button
              variant="outline"
              className="flex-1 sm:flex-none"
              aria-label={copy.claims.rejectFor(amount, claim.utr)}
            >
              {copy.claims.reject}
            </Button>
          }
          title={copy.claims.rejectTitle}
          description={copy.claims.rejectBody}
          reasonLabel={copy.claims.rejectReason}
          submitLabel={copy.claims.reject}
          success={copy.claims.rejected}
          destructive
          onSubmit={(reason) => rejectClaim({ invoiceId, claimId: claim.id, reason })}
        />
      </div>
    </li>
  );
}
