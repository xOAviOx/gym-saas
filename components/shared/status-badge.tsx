import { copy } from '@/lib/copy';
import type { MemberState } from '@/lib/membership';
import { cn } from '@/lib/utils';

const tones: Record<MemberState, string> = {
  active: 'bg-success-soft text-success',
  expiring: 'bg-warning-soft text-warning',
  expired: 'bg-danger-soft text-danger',
  frozen: 'bg-info-soft text-info',
  upcoming: 'bg-info-soft text-info',
  new: 'bg-muted text-muted-foreground',
  cancelled: 'bg-muted text-muted-foreground',
};

export function StatusBadge({ status }: { status: MemberState }) {
  return (
    <span
      className={cn(
        'inline-flex min-h-6 items-center rounded-full px-2.5 py-1 text-[11px] leading-4 font-medium tracking-[0.05em] uppercase',
        tones[status],
      )}
    >
      {copy.status.membership[status]}
    </span>
  );
}
