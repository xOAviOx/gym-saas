import Link from 'next/link';

import type { AttendanceRow } from '@/features/attendance/types';
import { copy } from '@/lib/copy';
import { formatTime } from '@/lib/dates';
import { cn } from '@/lib/utils';

const flagTone = {
  expiring: 'bg-warning-soft text-warning',
  expired: 'bg-danger-soft text-danger',
  dues_pending: 'bg-warning-soft text-warning',
} as const;

function Tag({ className, children }: { className: string; children: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] leading-4 font-medium tracking-[0.05em] uppercase',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function AttendanceList({ rows }: { rows: AttendanceRow[] }) {
  return (
    <ol className="bg-card divide-border divide-y rounded-xl border">
      {rows.map((row) => (
        <li key={row.id} className="flex items-center gap-4 px-4 py-3 sm:px-5">
          <time
            dateTime={row.checkedInAt}
            className="tabular text-muted-foreground w-16 shrink-0 font-mono text-xs"
          >
            {formatTime(row.checkedInAt)}
          </time>
          <div className="min-w-0 flex-1">
            {row.member.deleted ? (
              <span className="text-muted-foreground text-sm">{copy.attendance.deletedMember}</span>
            ) : (
              <Link
                href={`/members/${row.member.id}`}
                className="block truncate text-sm font-medium underline-offset-4 hover:underline"
              >
                {row.member.name}
              </Link>
            )}
            <p className="text-muted-foreground font-mono text-xs">{row.member.code}</p>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
            {row.flag ? (
              <Tag className={flagTone[row.flag]}>{copy.attendance.flags[row.flag]}</Tag>
            ) : null}
            {row.overridden ? (
              <Tag className="bg-danger-soft text-danger">{copy.attendance.overriddenTag}</Tag>
            ) : null}
            <Tag className="bg-muted text-muted-foreground">
              {row.viaKiosk ? copy.attendance.kioskTag : copy.attendance.method[row.method]}
            </Tag>
          </div>
        </li>
      ))}
    </ol>
  );
}
