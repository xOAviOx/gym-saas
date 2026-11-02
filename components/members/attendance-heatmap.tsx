import { addDays, dateOnlyInIST, daysAgo, formatDate } from '@/lib/dates';
import { copy } from '@/lib/copy';
import { cn } from '@/lib/utils';

export function AttendanceHeatmap({ timestamps, today }: { timestamps: string[]; today: string }) {
  const attended = new Set(timestamps.map(dateOnlyInIST));
  const start = daysAgo(89, today);
  return (
    <section className="grid gap-4">
      <p className="text-sm">{copy.members.attendanceCount(timestamps.length)}</p>
      <ol
        aria-label={copy.members.attendance90}
        className="grid w-fit grid-flow-col grid-rows-7 gap-1.5"
      >
        {Array.from({ length: 90 }, (_, i) => {
          const day = addDays(start, i);
          const label = `${formatDate(day)}: ${attended.has(day) ? copy.members.checkedIn : copy.members.notCheckedIn}`;
          return (
            <li
              key={day}
              title={label}
              aria-label={label}
              className={cn(
                'size-4 rounded-sm border',
                attended.has(day) ? 'border-primary bg-primary' : 'border-border bg-muted',
              )}
            >
              <span className="sr-only">{label}</span>
            </li>
          );
        })}
      </ol>
      <div className="text-muted-foreground flex max-w-xs justify-between text-xs">
        <span>{formatDate(start)}</span>
        <span>{formatDate(today)}</span>
      </div>
      <div className="text-muted-foreground flex gap-4 text-xs">
        <span className="flex items-center gap-2">
          <span className="bg-primary size-3 rounded-sm" aria-hidden="true" />
          {copy.members.checkedIn}
        </span>
        <span className="flex items-center gap-2">
          <span className="bg-muted border-border size-3 rounded-sm border" aria-hidden="true" />
          {copy.members.notCheckedIn}
        </span>
      </div>
    </section>
  );
}
