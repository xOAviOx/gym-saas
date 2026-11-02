import { z } from 'zod';

import { dateInputSchema } from '@/features/members/schema';
import { moneyInputSchema } from '@/features/plans/schema';
import { copy } from '@/lib/copy';
import { daysBetween } from '@/lib/dates';

export const enrollmentSchema = z.strictObject({
  memberId: z.uuid(),
  requestId: z.uuid(),
  planId: z.uuid(copy.memberships.choosePlan),
  startDate: dateInputSchema,
  discount: moneyInputSchema,
});
export const membershipIdSchema = z.strictObject({ memberId: z.uuid(), membershipId: z.uuid() });
export const freezeSchema = membershipIdSchema
  .extend({ from: dateInputSchema, to: dateInputSchema })
  .refine((v) => v.to >= v.from && daysBetween(v.from, v.to) < 90, {
    path: ['to'],
    message: copy.memberships.freezeDateInvalid,
  });
export type EnrollmentInput = z.input<typeof enrollmentSchema>;
