import { copy } from '@/lib/copy';
import { formatDateShort } from '@/lib/dates';
import { cn } from '@/lib/utils';

/** Gyms open early and close late; the axis widens only when check-ins fall outside it. */
function hourWindow(hourly: number[]): [number, number] {
  let first = 5;
  let last = 22;
  hourly.forEach((count, hour) => {
    if (count > 0) {
      first = Math.min(first, hour);
      last = Math.max(last, hour);
    }
  });
  return [first, last];
}

export function HourlyChart({
  hourly,
  currentHour,
}: {
  hourly: number[];
  /** Highlighted when viewing today. */
  currentHour: number | null;
}) {
  const [first, last] = hourWindow(hourly);
  const hours = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const max = Math.max(1, ...hourly);
  const empty = hourly.every((n) => n === 0);
  return (
    <figure className="bg-card animate-enter rounded-xl border p-5 [--index:2]">
      <figcaption className="text-muted-foreground text-[11px] font-medium tracking-[0.05em] uppercase">
        {copy.attendance.hourlyTitle}
      </figcaption>
      {empty ? (
        <p className="text-muted-foreground mt-6 text-sm">{copy.attendance.hourlyEmpty}</p>
      ) : (
        <ol className="mt-5 flex h-28 items-end gap-[3px]" aria-label={copy.attendance.hourlyTitle}>
          {hours.map((hour) => {
            const count = hourly[hour] ?? 0;
            return (
              <li
                key={hour}
                className="flex h-full flex-1 flex-col justify-end"
                aria-label={copy.attendance.hourAria(copy.attendance.hourLabel(hour), count)}
              >
                <span
                  className={cn(
                    'block w-full rounded-[3px] transition-[height] duration-500',
                    count === 0
                      ? 'bg-muted'
                      : hour === currentHour
                        ? 'bg-foreground'
                        : 'bg-[#C9C8C4]',
                  )}
                  style={{ height: count === 0 ? 3 : `${Math.max(8, (count / max) * 100)}%` }}
                />
              </li>
            );
          })}
        </ol>
      )}
      {!empty ? (
        <div
          aria-hidden="true"
          className="text-muted-foreground tabular mt-2 flex justify-between font-mono text-[10px]"
        >
          <span>{copy.attendance.hourLabel(first)}</span>
          <span>{copy.attendance.hourLabel(Math.round((first + last) / 2))}</span>
          <span>{copy.attendance.hourLabel(last)}</span>
        </div>
      ) : null}
    </figure>
  );
}

export function WeekChart({
  days,
  selected,
}: {
  days: { date: string; count: number }[];
  selected: string;
}) {
  const max = Math.max(1, ...days.map((d) => d.count));
  return (
    <figure className="bg-card animate-enter rounded-xl border p-5 [--index:3]">
      <figcaption className="text-muted-foreground text-[11px] font-medium tracking-[0.05em] uppercase">
        {copy.attendance.weekTitle}
      </figcaption>
      <ol className="mt-5 grid grid-cols-7 items-end gap-2">
        {days.map((day) => (
          <li
            key={day.date}
            className="grid justify-items-center gap-2"
            aria-label={copy.attendance.weekAria(formatDateShort(day.date), day.count)}
          >
            <span aria-hidden="true" className="tabular text-xs font-medium">
              {day.count}
            </span>
            <span aria-hidden="true" className="flex h-16 w-full items-end">
              <span
                className={cn(
                  'block w-full rounded-[3px]',
                  day.count === 0
                    ? 'bg-muted'
                    : day.date === selected
                      ? 'bg-foreground'
                      : 'bg-[#C9C8C4]',
                )}
                style={{
                  height: day.count === 0 ? 3 : `${Math.max(10, (day.count / max) * 100)}%`,
                }}
              />
            </span>
            <span aria-hidden="true" className="text-muted-foreground font-mono text-[10px]">
              {formatDateShort(day.date)}
            </span>
          </li>
        ))}
      </ol>
    </figure>
  );
}
