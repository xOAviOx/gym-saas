import { describe, expect, it } from 'vitest';

import {
  currentMembership,
  effectiveEndDate,
  membershipState,
  renewalStartDate,
  type MembershipDates,
} from '@/lib/membership';

const today = '2026-10-30';
function membership(overrides: Partial<MembershipDates> = {}): MembershipDates {
  return {
    id: 'one',
    start_date: '2026-10-01',
    end_date: '2026-11-15',
    status: 'active',
    frozen_from: null,
    frozen_to: null,
    sessions_total: null,
    sessions_used: 0,
    created_at: '2026-10-01T00:00:00Z',
    ...overrides,
  };
}
describe('membership status and renewal (IST date supplied by server)', () => {
  it('distinguishes future, active, expiring and expired memberships', () => {
    expect(membershipState(membership({ start_date: '2026-11-01' }), today)).toBe('upcoming');
    expect(membershipState(membership(), today)).toBe('active');
    expect(membershipState(membership({ end_date: '2026-11-06' }), today)).toBe('expiring');
    expect(membershipState(membership({ end_date: today }), today)).toBe('expiring');
    expect(membershipState(membership({ end_date: '2026-10-29' }), today)).toBe('expired');
  });
  it('exhausted session plans expire even before the end date', () => {
    expect(membershipState(membership({ sessions_total: 10, sessions_used: 10 }), today)).toBe(
      'expired',
    );
    expect(renewalStartDate([membership({ sessions_total: 10, sessions_used: 10 })], today)).toBe(
      today,
    );
  });
  it('cancelled is terminal and does not block renewal', () => {
    const m = membership({ status: 'cancelled', frozen_from: today, frozen_to: '2026-11-01' });
    expect(membershipState(m, today)).toBe('cancelled');
    expect(currentMembership([m], today)).toBeNull();
    expect(renewalStartDate([m], today)).toBe(today);
  });
  it('an ongoing freeze wins over expiry', () => {
    expect(
      membershipState(
        membership({ frozen_from: '2026-10-20', frozen_to: '2026-11-10', end_date: '2026-10-25' }),
        today,
      ),
    ).toBe('frozen');
  });
  it('scheduled freezes do not start early', () => {
    expect(
      membershipState(membership({ frozen_from: '2026-11-02', frozen_to: '2026-11-10' }), today),
    ).toBe('active');
  });
  it('reads an elapsed freeze correctly before midnight maintenance', () => {
    const m = membership({
      end_date: '2026-10-29',
      frozen_from: '2026-10-20',
      frozen_to: '2026-10-24',
    });
    expect(effectiveEndDate(m, today)).toBe('2026-11-03');
    expect(membershipState(m, today)).toBe('expiring');
    expect(renewalStartDate([m], today)).toBe('2026-11-04');
  });
  it('active coverage is shown instead of a future queued renewal', () => {
    const active = membership();
    const next = membership({ id: 'two', start_date: '2026-11-16', end_date: '2026-12-15' });
    expect(currentMembership([next, active], today)?.id).toBe('one');
    expect(renewalStartDate([active, next], today)).toBe('2026-12-16');
  });
  it('the earliest upcoming plan is current when there is no active coverage', () => {
    const a = membership({ id: 'first', start_date: '2026-11-01' });
    const b = membership({ id: 'second', start_date: '2026-11-20' });
    expect(currentMembership([b, a], today)?.id).toBe('first');
  });
  it('active renewal starts after the inclusive end date, expired starts today', () => {
    expect(renewalStartDate([membership()], today)).toBe('2026-11-16');
    expect(renewalStartDate([membership({ end_date: '2026-10-29' })], today)).toBe(today);
    expect(renewalStartDate([], today)).toBe(today);
  });
});
