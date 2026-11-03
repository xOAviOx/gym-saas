import Image from 'next/image';
import Link from 'next/link';

import { CheckCircle2Icon, ClockIcon, TriangleAlertIcon } from '@/components/icons';
import { StatusBadge } from '@/components/shared/status-badge';
import type { CheckInOutcome } from '@/features/attendance/types';
import { copy } from '@/lib/copy';
import { formatDate, formatTime, relativeEndDate } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { cn } from '@/lib/utils';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

export function MemberAvatar({
  name,
  photoUrl,
  size = 48,
  className,
}: {
  name: string;
  photoUrl: string | null;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'bg-muted text-muted-foreground relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full text-sm font-medium',
        className,
      )}
      style={{ width: size, height: size }}
    >
      {photoUrl ? (
        <Image
          src={photoUrl}
          alt=""
          fill
          sizes={`${size}px`}
          unoptimized
          className="object-cover"
        />
      ) : (
        <span aria-hidden="true">{initials(name)}</span>
      )}
    </span>
  );
}

/** Outcome notes in priority order, shared by the desk card. */
export function outcomeNotes(outcome: CheckInOutcome, today: string): string[] {
  const { member } = outcome;
  const notes: string[] = [];
  if (member.flag === 'expired') notes.push(copy.attendance.flagNotes.expired);
  if (member.flag === 'expiring') notes.push(copy.attendance.flagNotes.expiring);
  if (member.balanceDue > 0) {
    notes.push(copy.attendance.flagNotes.dues_pending(formatMoney(member.balanceDue)));
  }
  if (member.sessionsLeft !== null) notes.push(copy.attendance.sessionsLeft(member.sessionsLeft));
  if (member.endDate && member.flag !== 'expired') {
    notes.push(`${formatDate(member.endDate)} · ${relativeEndDate(member.endDate, today).label}`);
  }
  return notes;
}

export function CheckInResultCard({
  outcome,
  today,
  className,
}: {
  outcome: CheckInOutcome;
  today: string;
  className?: string;
}) {
  const { member } = outcome;
  const warn = member.flag === 'expired' || member.balanceDue > 0;
  const headline =
    outcome.result === 'duplicate' && outcome.checkedInAt
      ? copy.attendance.results.duplicate(member.name, formatTime(outcome.checkedInAt))
      : copy.attendance.results.checkedIn(member.name);
  const Icon =
    outcome.result === 'duplicate' ? ClockIcon : warn ? TriangleAlertIcon : CheckCircle2Icon;
  return (
    <div
      role="status"
      className={cn('bg-card animate-enter flex gap-4 rounded-xl border p-4 sm:p-5', className)}
    >
      <MemberAvatar name={member.name} photoUrl={member.photoUrl} />
      <div className="min-w-0 flex-1">
        <p className="flex items-start gap-2 text-sm font-medium">
          <Icon
            className={cn(
              'mt-0.5 size-4 shrink-0',
              outcome.result === 'duplicate'
                ? 'text-muted-foreground'
                : warn
                  ? 'text-warning'
                  : 'text-success',
            )}
          />
          <span>{headline}</span>
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StatusBadge status={member.status} />
          <Link
            href={`/members/${member.id}`}
            className="text-muted-foreground font-mono text-xs underline-offset-4 hover:underline"
          >
            {member.code}
          </Link>
        </div>
        {outcomeNotes(outcome, today).length ? (
          <ul className="text-muted-foreground mt-3 grid gap-1 text-sm">
            {outcomeNotes(outcome, today).map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
