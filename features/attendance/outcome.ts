import { toPaise } from '@/lib/money';
import type { MemberState } from '@/lib/membership';

import type { CheckInFlag, CheckInMember, CheckInResult, PinError } from './types';

const RESULTS: readonly CheckInResult[] = ['checked_in', 'duplicate', 'blocked'];
const PIN_ERRORS: readonly PinError[] = ['pin_required', 'invalid', 'locked', 'not_set'];
const FLAGS: readonly CheckInFlag[] = ['expiring', 'expired', 'dues_pending'];
const STATES: readonly MemberState[] = [
  'new',
  'upcoming',
  'active',
  'expiring',
  'expired',
  'frozen',
  'cancelled',
];

export type ParsedCheckIn = {
  result: CheckInResult;
  pinError: PinError | null;
  overridden: boolean;
  checkedInAt: string | null;
  member: CheckInMember;
};

function pick<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

function int(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : null;
}

/** Turns the jsonb returned by check_in_member / kiosk_check_in into a typed outcome. */
export function parseCheckInResult(raw: unknown): ParsedCheckIn {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Unexpected check-in response');
  }
  const r = raw as Record<string, unknown>;
  const result = pick(r.result, RESULTS);
  const m = (typeof r.member === 'object' && r.member !== null ? r.member : null) as Record<
    string,
    unknown
  > | null;
  if (!result || !m || typeof m.id !== 'string') {
    throw new Error('Unexpected check-in response');
  }
  const total = int(m.sessions_total);
  const used = int(m.sessions_used) ?? 0;
  const checkIn = (
    typeof r.check_in === 'object' && r.check_in !== null ? r.check_in : null
  ) as Record<string, unknown> | null;
  const balance = m.balance_due;
  return {
    result,
    pinError: pick(r.pin_error, PIN_ERRORS),
    overridden: r.overridden === true,
    checkedInAt: text(checkIn?.checked_in_at),
    member: {
      id: m.id,
      name: text(m.full_name) ?? '',
      code: text(m.member_code) ?? '',
      status: pick(m.status, STATES) ?? 'new',
      flag: pick(m.flag, FLAGS) ?? pick(checkIn?.flag, FLAGS),
      endDate: text(m.end_date),
      sessionsLeft: total === null ? null : Math.max(total - used, 0),
      balanceDue: typeof balance === 'number' || typeof balance === 'string' ? toPaise(balance) : 0,
      photoPath: text(m.photo_url),
    },
  };
}

/** "Priya Sharma" -> "Priya". The kiosk greets people without showing full names. */
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? '';
}

/** Kiosk keypad input: a member code ("M-0042", "m42", "42") or a phone number. */
export function parseKioskLookup(
  input: string,
): { kind: 'code'; code: string } | { kind: 'phone'; digits: string } | null {
  const value = input.trim();
  const code = /^m-?\s*0*([0-9]{1,6})$/i.exec(value);
  if (code) {
    return { kind: 'code', code: `M-${code[1]!.padStart(4, '0')}` };
  }
  const digits = value.replace(/\D/g, '');
  if (digits.length >= 10 && digits.length <= 13 && /^[0-9+\s-]+$/.test(value)) {
    return { kind: 'phone', digits };
  }
  return null;
}

/** Counts per IST hour (0-23) from IST hour numbers. */
export function hourlyCounts(hours: Iterable<number>): number[] {
  const counts = Array.from({ length: 24 }, () => 0);
  for (const hour of hours) {
    if (Number.isInteger(hour) && hour >= 0 && hour < 24) counts[hour]! += 1;
  }
  return counts;
}
