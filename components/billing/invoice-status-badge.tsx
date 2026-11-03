import type { InvoiceStatus } from '@/features/billing/types';
import { copy } from '@/lib/copy';
import { cn } from '@/lib/utils';

const tones: Record<InvoiceStatus, string> = {
  unpaid: 'bg-danger-soft text-danger',
  partially_paid: 'bg-warning-soft text-warning',
  paid: 'bg-success-soft text-success',
  void: 'bg-muted text-muted-foreground',
};

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return (
    <span
      className={cn(
        'inline-flex min-h-6 shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] leading-4 font-medium tracking-[0.05em] uppercase',
        tones[status],
      )}
    >
      {copy.status.invoice[status]}
    </span>
  );
}
