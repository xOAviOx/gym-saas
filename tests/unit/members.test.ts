import { describe, expect, it } from 'vitest';

import {
  createMemberSchema,
  emptyMemberValues,
  memberDetailsSchema,
  memberFilterSchema,
} from '@/features/members/schema';
import { freezeSchema } from '@/features/memberships/schema';
import { planSchema } from '@/features/plans/schema';
import { unwrap } from '@/lib/errors';

const id = '52ea44a0-b95e-48b9-9100-a159f5331b95';
const member = {
  ...emptyMemberValues('2026-10-30'),
  fullName: 'Test Member',
  phone: '98765 43210',
};
describe('member validation', () => {
  it('normalizes phone and optional fields while leaving consent off by default', () => {
    const parsed = memberDetailsSchema.parse(member);
    expect(parsed.phone).toBe('+919876543210');
    expect(parsed.email).toBeNull();
    expect(parsed.consentMessaging).toBe(false);
  });
  it('rejects forged gym, status, consent timestamps and unknown keys', () => {
    for (const field of ['org_id', 'status', 'consent_recorded_at']) {
      expect(memberDetailsSchema.safeParse({ ...member, [field]: id }).success).toBe(false);
    }
  });
  it('requires boolean consent, not truthy text', () => {
    expect(memberDetailsSchema.safeParse({ ...member, consentMessaging: 'false' }).success).toBe(
      false,
    );
  });
  it('checks E.164 numbers, emails and real calendar dates', () => {
    expect(memberDetailsSchema.safeParse({ ...member, phone: '12345' }).success).toBe(false);
    expect(memberDetailsSchema.safeParse({ ...member, email: 'wrong' }).success).toBe(false);
    expect(memberDetailsSchema.safeParse({ ...member, dob: '2026-02-30' }).success).toBe(false);
  });
  it('deduplicates tags, caps their number and length', () => {
    expect(memberDetailsSchema.parse({ ...member, tags: 'Morning, PT, Morning' }).tags).toEqual([
      'Morning',
      'PT',
    ]);
    expect(
      memberDetailsSchema.safeParse({
        ...member,
        tags: Array.from({ length: 11 }, (_, n) => String(n)).join(','),
      }).success,
    ).toBe(false);
  });
  it('allows no membership but requires a start date if a plan is selected', () => {
    const input = { ...member, requestId: id, planId: '', startDate: '', discount: '0' };
    expect(createMemberSchema.safeParse(input).success).toBe(true);
    expect(createMemberSchema.safeParse({ ...input, planId: id }).success).toBe(false);
  });
  it('accepts explicit upcoming and no-membership filters, not arbitrary query values', () => {
    expect(memberFilterSchema.parse('new')).toBe('new');
    expect(memberFilterSchema.parse('upcoming')).toBe('upcoming');
    expect(memberFilterSchema.safeParse('org_id.eq.other').success).toBe(false);
  });
});
describe('plan and freeze validation', () => {
  const plan = {
    name: 'Sessions',
    type: 'sessions',
    durationDays: 30,
    sessionCount: 12,
    price: '1,500.50',
    description: '',
    isActive: true,
  };
  it('uses integer paise and requires session counts', () => {
    expect(planSchema.parse(plan).price).toBe(150050);
    expect(planSchema.safeParse({ ...plan, sessionCount: null }).success).toBe(false);
    expect(planSchema.safeParse({ ...plan, durationDays: 0 }).success).toBe(false);
  });
  it('permits free plans and rejects negative amounts', () => {
    expect(planSchema.parse({ ...plan, price: '0' }).price).toBe(0);
    expect(planSchema.safeParse({ ...plan, price: '-1' }).success).toBe(false);
  });
  it('caps freeze duration at 90 inclusive days', () => {
    const input = { memberId: id, membershipId: id, from: '2026-01-01', to: '2026-03-31' };
    expect(freezeSchema.safeParse(input).success).toBe(true);
    expect(freezeSchema.safeParse({ ...input, to: '2026-04-01' }).success).toBe(false);
    expect(freezeSchema.safeParse({ ...input, to: '2025-12-31' }).success).toBe(false);
  });
});
describe('response unwrapping', () => {
  it('returns non-null data and refuses null/error responses', () => {
    expect(unwrap({ data: { id }, error: null })).toEqual({ id });
    expect(() => unwrap({ data: null, error: null })).toThrow();
    expect(() => unwrap({ data: null, error: { code: '42501', message: 'forbidden' } })).toThrow();
  });
});
