'use client';

import { ExternalLinkIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { applyActionResult } from '@/components/shared/apply-action-result';
import { ConfirmAction } from '@/components/shared/confirm-action';
import { CopyButton } from '@/components/shared/copy-button';
import { SubmitButton } from '@/components/shared/submit-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  cancelGatewayLink,
  checkGatewayLinks,
  createGatewayLink,
} from '@/features/billing/actions';
import type { GatewayLink } from '@/features/billing/types';
import { copy } from '@/lib/copy';
import { formatDateTime } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { cn } from '@/lib/utils';

const statusTone: Record<GatewayLink['status'], string> = {
  pending: 'bg-info-soft text-info',
  paid: 'bg-success-soft text-success',
  expired: 'bg-muted text-muted-foreground',
  cancelled: 'bg-muted text-muted-foreground',
};

function LinkStatus({ link }: { link: GatewayLink }) {
  const status = link.status === 'pending' && !link.isOpen ? 'expired' : link.status;
  return (
    <span
      className={cn(
        'inline-flex min-h-6 items-center rounded-full px-2.5 py-1 text-xs font-medium',
        statusTone[status],
      )}
    >
      {copy.gateway.statuses[status]}
    </span>
  );
}

export function GatewayPanel({
  invoiceId,
  requestId,
  configured,
  sandbox,
  canConfigure,
  payable,
  links,
}: {
  invoiceId: string;
  requestId: string;
  configured: boolean;
  sandbox: boolean;
  canConfigure: boolean;
  payable: boolean;
  links: GatewayLink[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<'create' | 'check' | null>(null);
  const active = links.find((link) => link.isOpen) ?? null;
  const earlier = links.filter((link) => link !== active);

  async function create() {
    setBusy('create');
    try {
      if (applyActionResult(await createGatewayLink({ invoiceId, requestId }))) {
        toast.success(copy.gateway.created);
      }
      // A fresh request id either way: a link Cashfree made but GymDesk could not save is cancelled.
      router.refresh();
    } catch {
      toast.error(copy.errors.network);
    }
    setBusy(null);
  }

  async function check() {
    setBusy('check');
    try {
      const result = await checkGatewayLinks({ invoiceId });
      if (applyActionResult(result)) {
        if (result.data.recorded) toast.success(copy.gateway.recorded(result.data.recorded));
        else toast.info(copy.gateway.noPayment);
        router.refresh();
      }
    } catch {
      toast.error(copy.errors.network);
    }
    setBusy(null);
  }

  return (
    <section className="bg-card grid gap-4 rounded-xl border p-5" aria-labelledby="gateway-title">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id="gateway-title" className="text-base font-semibold">
            {copy.gateway.title}
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">{copy.gateway.body}</p>
        </div>
        {configured && sandbox ? (
          <span className="bg-warning-soft text-warning inline-flex min-h-6 items-center rounded-full px-2.5 py-1 text-xs font-medium">
            {copy.gateway.sandbox}
          </span>
        ) : null}
      </div>

      {!configured ? (
        <div className="grid justify-items-start gap-3">
          <p className="text-muted-foreground text-sm">
            {canConfigure ? copy.gateway.notConfigured : copy.gateway.askOwner}
          </p>
          {canConfigure ? (
            <Button asChild variant="outline">
              <Link href="/settings/payments">{copy.gateway.openSettings}</Link>
            </Button>
          ) : null}
        </div>
      ) : active ? (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="tabular text-lg font-semibold">
              {copy.gateway.amountLine(formatMoney(active.amount))}
            </p>
            <LinkStatus link={active} />
          </div>
          <p className="text-muted-foreground text-xs">
            {copy.gateway.activeUntil(formatDateTime(active.expiresAt))}
          </p>
          {active.url ? (
            <>
              <Input
                readOnly
                value={active.url}
                aria-label={copy.gateway.title}
                onFocus={(event) => event.currentTarget.select()}
                className="text-muted-foreground"
              />
              <div className="grid gap-3 sm:flex sm:flex-wrap">
                <CopyButton
                  value={active.url}
                  label={copy.gateway.copy}
                  copiedMessage={copy.payLink.copied}
                />
                <Button asChild variant="outline">
                  <a href={active.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLinkIcon aria-hidden="true" />
                    {copy.gateway.open}
                  </a>
                </Button>
              </div>
            </>
          ) : null}
        </div>
      ) : payable ? (
        <div>
          <SubmitButton
            type="button"
            pending={busy === 'create'}
            pendingLabel={copy.gateway.creating}
            disabled={busy !== null}
            onClick={create}
          >
            {copy.gateway.create}
          </SubmitButton>
        </div>
      ) : null}

      {configured && links.length ? (
        <div className="flex flex-wrap gap-3 border-t pt-4">
          <SubmitButton
            type="button"
            variant="outline"
            pending={busy === 'check'}
            pendingLabel={copy.gateway.checking}
            disabled={busy !== null}
            onClick={check}
          >
            {copy.gateway.check}
          </SubmitButton>
          {active ? (
            <ConfirmAction
              label={copy.gateway.cancel}
              description={copy.gateway.cancelBody}
              success={copy.gateway.cancelled}
              action={() => cancelGatewayLink({ invoiceId, collectionRequestId: active.id })}
              destructive
            />
          ) : null}
        </div>
      ) : null}

      {earlier.length ? (
        <details className="border-t pt-3">
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">
            {copy.gateway.history}
          </summary>
          <ul className="grid gap-2">
            {earlier.map((link) => (
              <li key={link.id} className="flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="tabular">{formatMoney(link.amount)}</p>
                  <p className="text-muted-foreground text-xs">
                    {copy.gateway.createdOn(formatDateTime(link.createdAt))}
                  </p>
                </div>
                <LinkStatus link={link} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
