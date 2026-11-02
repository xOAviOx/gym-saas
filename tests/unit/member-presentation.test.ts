import { describe, expect, it } from 'vitest';

import { buildMemberActivity } from '@/features/members/activity';
import { memberQuickAction, membershipHint } from '@/features/members/presentation';
import type { DirectoryMember } from '@/features/members/types';
import { copy } from '@/lib/copy';
import { formatMoney } from '@/lib/money';

const today = '2026-10-30';
const member: DirectoryMember = {
  id: 'member-one',
  memberCode: 'M-0001',
  fullName: 'Test Member',
  phone: '+919876543210',
  status: 'active',
  planName: 'Monthly',
  startDate: '2026-10-01',
  endDate: '2026-11-15',
  balanceDue: 0,
  deletedAt: null,
};

describe('membership context', () => {
  it('explains remaining validity and membership ending today', () => {
    expect(membershipHint(member, today)).toBe('16 days left');
    expect(membershipHint({ ...member, status: 'expiring', endDate: today }, today)).toBe(
      copy.dates.endsToday,
    );
  });
  it('distinguishes elapsed validity from exhausted sessions', () => {
    expect(membershipHint({ ...member, status: 'expired', endDate: '2026-10-29' }, today)).toBe(
      copy.dates.endedDaysAgo(1),
    );
    expect(membershipHint({ ...member, status: 'expired' }, today)).toBe(
      copy.memberships.sessionsExhausted,
    );
  });
  it('does not show a running countdown while frozen', () => {
    expect(membershipHint({ ...member, status: 'frozen' }, today)).toBe(copy.memberships.paused);
  });
  it('uses the future start date and has a clear no-membership state', () => {
    expect(membershipHint({ ...member, status: 'upcoming', startDate: '2026-11-01' }, today)).toBe(
      'Starts 1 Nov 2026',
    );
    expect(
      membershipHint({ ...member, status: 'new', startDate: null, endDate: null }, today),
    ).toBe(copy.members.noMembership);
  });
});

describe('member directory actions', () => {
  it('links expiring and expired members into the existing renewal workflow', () => {
    for (const status of ['expiring', 'expired'] as const) {
      expect(memberQuickAction({ ...member, status })).toEqual({
        href: '/members/member-one?action=renew',
        label: copy.memberships.renew,
      });
    }
  });
  it('offers enrollment when no plan exists and dues context without claiming collection', () => {
    expect(memberQuickAction({ ...member, status: 'new' })?.label).toBe(copy.members.addMembership);
    expect(memberQuickAction({ ...member, balanceDue: 150050 })).toEqual({
      href: '/members/member-one#member-dues',
      label: copy.members.viewDues,
    });
  });
  it('offers no mutation shortcut for a deleted or settled active member', () => {
    expect(memberQuickAction(member)).toBeNull();
    expect(
      memberQuickAction({ ...member, status: 'expired', deletedAt: '2026-10-30T00:00:00Z' }),
    ).toBeNull();
  });
});

describe('recorded member activity', () => {
  const base = { createdAt: '2026-10-01T00:00:00Z', memberships: [], payments: [], attendance: [] };
  it('never invents activity when only the member creation is recorded', () => {
    expect(buildMemberActivity(base)).toEqual([
      { id: 'member-created', at: base.createdAt, kind: 'joined', detail: null },
    ]);
  });
  it('sorts actual instants rather than timestamp text and keeps reversal amounts negative', () => {
    const items = buildMemberActivity({
      ...base,
      memberships: [{ id: 'one', created_at: '2026-10-30T18:00:00Z', planName: 'Monthly' }],
      payments: [
        {
          id: 'two',
          paidAt: '2026-10-30T23:00:00+05:30',
          amount: -150050,
          isReversal: true,
          invoiceNumber: 'GYM/26-27/0001',
        },
      ],
      attendance: ['2026-10-30T18:30:00Z'],
    });
    expect(items.map((item) => item.kind)).toEqual(['checkIn', 'membership', 'reversal', 'joined']);
    expect(items[2]?.detail).toBe(
      copy.members.activityPayment(formatMoney(-150050), 'GYM/26-27/0001'),
    );
  });
  it('limits the feed to six real events without modifying source arrays', () => {
    const attendance = Array.from({ length: 8 }, (_, i) => `2026-10-${12 + i}T00:00:00Z`);
    const original = [...attendance];
    const result = buildMemberActivity({ ...base, attendance });
    expect(result).toHaveLength(6);
    expect(result[0]?.at).toBe('2026-10-19T00:00:00Z');
    expect(attendance).toEqual(original);
  });
});
