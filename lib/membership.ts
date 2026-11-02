import { addDays, daysBetween } from '@/lib/dates';

export type MembershipState =
  'upcoming' | 'active' | 'expiring' | 'expired' | 'frozen' | 'cancelled';
export type MemberState = MembershipState | 'new';

export type MembershipDates = {
  id: string;
  start_date: string;
  end_date: string;
  status: string;
  frozen_from: string | null;
  frozen_to: string | null;
  sessions_total: number | null;
  sessions_used: number;
  created_at: string;
};

/** Includes an elapsed freeze even when midnight maintenance has not run yet. */
export function effectiveEndDate(m: MembershipDates, today: string): string {
  if (m.status !== 'cancelled' && m.frozen_from && m.frozen_to && m.frozen_to < today) {
    return addDays(m.end_date, daysBetween(m.frozen_from, m.frozen_to) + 1);
  }
  return m.end_date;
}

export function membershipState(m: MembershipDates, today: string): MembershipState {
  if (m.status === 'cancelled') return 'cancelled';
  if (m.frozen_from && m.frozen_to && m.frozen_from <= today && m.frozen_to >= today)
    return 'frozen';
  if (m.start_date > today) return 'upcoming';
  const end = effectiveEndDate(m, today);
  if (end < today || (m.sessions_total !== null && m.sessions_used >= m.sessions_total))
    return 'expired';
  return daysBetween(today, end) <= 7 ? 'expiring' : 'active';
}

const rank: Record<MembershipState, number> = {
  frozen: 0,
  active: 1,
  expiring: 1,
  upcoming: 2,
  expired: 3,
  cancelled: 4,
};

/** Current coverage wins over a future renewal; otherwise show the next start or latest expiry. */
export function currentMembership<T extends MembershipDates>(
  memberships: T[],
  today: string,
): T | null {
  return (
    memberships
      .filter((m) => m.status !== 'cancelled')
      .sort((a, b) => {
        const aState = membershipState(a, today);
        const bState = membershipState(b, today);
        const priority = rank[aState] - rank[bState];
        if (priority) return priority;
        if (aState === 'upcoming' && a.start_date !== b.start_date)
          return a.start_date.localeCompare(b.start_date);
        return (
          effectiveEndDate(b, today).localeCompare(effectiveEndDate(a, today)) ||
          b.created_at.localeCompare(a.created_at) ||
          a.id.localeCompare(b.id)
        );
      })[0] ?? null
  );
}

export function renewalStartDate(memberships: MembershipDates[], today: string): string {
  const latestCoverage = memberships
    .filter((m) => {
      const state = membershipState(m, today);
      return state !== 'cancelled' && state !== 'expired';
    })
    .map((m) => effectiveEndDate(m, today))
    .sort()
    .at(-1);
  return latestCoverage && latestCoverage >= today ? addDays(latestCoverage, 1) : today;
}
