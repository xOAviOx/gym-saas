import {
  addDays as addDaysFns,
  differenceInCalendarDays,
  format,
  isValid,
  parseISO,
  startOfMonth,
  endOfMonth,
  subDays,
} from 'date-fns';
import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz';

import { copy } from '@/lib/copy';

export const IST = 'Asia/Kolkata';

/** A calendar date as 'yyyy-MM-dd' (the shape of Postgres `date` columns). */
export type DateOnly = string;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function isDateOnly(value: string): value is DateOnly {
  return DATE_ONLY.test(value) && isValid(parseISO(value));
}

/** Today's calendar date in India, regardless of the server's clock zone. */
export function todayIST(now: Date = new Date()): DateOnly {
  return formatInTimeZone(now, IST, 'yyyy-MM-dd');
}

/** Current wall-clock time in India as a Date whose local fields are IST. */
export function nowIST(now: Date = new Date()): Date {
  return toZonedTime(now, IST);
}

/** Parses a date-only string into a Date at local midnight (for arithmetic only). */
export function parseDateOnly(value: DateOnly): Date {
  const parsed = parseISO(value);
  if (!isValid(parsed)) {
    throw new Error(`Invalid date: ${value}`);
  }
  return parsed;
}

export function toDateOnly(date: Date): DateOnly {
  return format(date, 'yyyy-MM-dd');
}

export function addDays(date: DateOnly, days: number): DateOnly {
  return toDateOnly(addDaysFns(parseDateOnly(date), days));
}

/** b − a in whole calendar days. */
export function daysBetween(a: DateOnly, b: DateOnly): number {
  return differenceInCalendarDays(parseDateOnly(b), parseDateOnly(a));
}

/** "12 Mar 2026" */
export function formatDate(value: DateOnly | Date): string {
  const date = typeof value === 'string' ? parseDateOnly(value) : toZonedTime(value, IST);
  return format(date, 'd MMM yyyy');
}

/** "12 Mar" */
export function formatDateShort(value: DateOnly | Date): string {
  const date = typeof value === 'string' ? parseDateOnly(value) : toZonedTime(value, IST);
  return format(date, 'd MMM');
}

/** "12 Mar 2026, 6:45 pm" in IST, from a timestamptz string or Date. */
export function formatDateTime(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return formatInTimeZone(date, IST, 'd MMM yyyy, h:mm aaa');
}

/** "6:45 pm" in IST. */
export function formatTime(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return formatInTimeZone(date, IST, 'h:mm aaa');
}

/** The IST calendar day that a timestamp falls on. */
export function dateOnlyInIST(value: string | Date): DateOnly {
  const date = typeof value === 'string' ? new Date(value) : value;
  return formatInTimeZone(date, IST, 'yyyy-MM-dd');
}

/** UTC instants for the start (inclusive) and end (exclusive) of an IST calendar day. */
export function istDayRange(date: DateOnly): { start: string; end: string } {
  const start = fromZonedTime(`${date}T00:00:00`, IST);
  const end = fromZonedTime(`${addDays(date, 1)}T00:00:00`, IST);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function istMonthRange(date: DateOnly): { start: DateOnly; end: DateOnly } {
  const parsed = parseDateOnly(date);
  return { start: toDateOnly(startOfMonth(parsed)), end: toDateOnly(endOfMonth(parsed)) };
}

export function daysAgo(days: number, today: DateOnly = todayIST()): DateOnly {
  return toDateOnly(subDays(parseDateOnly(today), days));
}

/** Indian fiscal year label, April to March: 2025-06-01 → "25-26", 2026-02-01 → "25-26". */
export function fiscalYearLabel(date: DateOnly): string {
  const parsed = parseDateOnly(date);
  const year = parsed.getFullYear();
  const month = parsed.getMonth() + 1;
  const startYear = month >= 4 ? year : year - 1;
  const yy = (y: number) => String(y % 100).padStart(2, '0');
  return `${yy(startYear)}-${yy(startYear + 1)}`;
}

export type RelativeDays = { days: number; label: string };

/** Membership end date relative to today: "3 days left", "Ends today", "Ended 5 days ago". */
export function relativeEndDate(endDate: DateOnly, today: DateOnly = todayIST()): RelativeDays {
  const days = daysBetween(today, endDate);
  if (days > 0) {
    return { days, label: copy.dates.daysLeft(days) };
  }
  if (days === 0) {
    return { days, label: copy.dates.endsToday };
  }
  return { days, label: copy.dates.endedDaysAgo(-days) };
}

/** Invoice due date relative to today: "Due in 3 days", "Due today", "5 days overdue". */
export function relativeDueDate(dueDate: DateOnly, today: DateOnly = todayIST()): RelativeDays {
  const days = daysBetween(today, dueDate);
  if (days > 0) {
    return { days, label: copy.dates.dueInDays(days) };
  }
  if (days === 0) {
    return { days, label: copy.dates.dueToday };
  }
  return { days, label: copy.dates.overdue(-days) };
}

/** Human label for a date relative to today, falling back to "12 Mar 2026". */
export function describeDate(date: DateOnly, today: DateOnly = todayIST()): string {
  const diff = daysBetween(today, date);
  if (diff === 0) return copy.dates.today;
  if (diff === 1) return copy.dates.tomorrow;
  if (diff === -1) return copy.dates.yesterday;
  return formatDate(date);
}
