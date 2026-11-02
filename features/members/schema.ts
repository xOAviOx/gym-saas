import { z } from 'zod';

import { moneyInputSchema } from '@/features/plans/schema';
import { phoneInputSchema } from '@/features/organizations/schema';
import { copy } from '@/lib/copy';
import { isDateOnly } from '@/lib/dates';

export const dateInputSchema = z.string().refine(isDateOnly, copy.validation.dateInvalid);
const optionalPhone = z.union([z.literal(''), phoneInputSchema]).transform((v) => v || null);
const optionalDate = z.union([z.literal(''), dateInputSchema]).transform((v) => v || null);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, copy.validation.tooLong(max))
    .transform((v) => v || null);

export const memberDetailsSchema = z.strictObject({
  fullName: z
    .string()
    .trim()
    .min(1, copy.validation.required)
    .max(100, copy.validation.tooLong(100)),
  phone: phoneInputSchema,
  altPhone: optionalPhone,
  email: z
    .union([z.literal(''), z.email(copy.validation.emailInvalid)])
    .transform((v) => v || null),
  gender: z.enum(['', 'male', 'female', 'other']).transform((v) => v || null),
  dob: optionalDate,
  address: optionalText(500),
  joinedOn: dateInputSchema,
  source: z.enum(['walk_in', 'instagram', 'referral', 'google', 'other']),
  emergencyContactName: optionalText(100),
  emergencyContactPhone: optionalPhone,
  notes: optionalText(5000),
  tags: z
    .string()
    .max(320)
    .transform((value) => [
      ...new Set(
        value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ])
    .refine(
      (tags) => tags.length <= 10 && tags.every((tag) => tag.length <= 30),
      copy.members.tagsHelp,
    ),
  consentMessaging: z.boolean(),
});

export const memberIdSchema = z.strictObject({ memberId: z.uuid() });
export const updateMemberSchema = memberDetailsSchema.extend({ memberId: z.uuid() });
export const createMemberSchema = memberDetailsSchema
  .extend({
    requestId: z.uuid(),
    planId: z.union([z.literal(''), z.uuid()]),
    startDate: z.union([z.literal(''), dateInputSchema]),
    discount: moneyInputSchema,
  })
  .refine((v) => !v.planId || !!v.startDate, {
    path: ['startDate'],
    message: copy.validation.dateInvalid,
  });
export const notesSchema = z.strictObject({ memberId: z.uuid(), notes: optionalText(5000) });

export const memberFilterSchema = z.enum([
  'all',
  'active',
  'expiring',
  'expired',
  'dues',
  'frozen',
  'new',
  'upcoming',
  'deleted',
]);
export type MemberFilter = z.infer<typeof memberFilterSchema>;
export type MemberDetailsInput = z.input<typeof memberDetailsSchema>;
export type MemberDetailsValues = z.output<typeof memberDetailsSchema>;
export type CreateMemberInput = z.input<typeof createMemberSchema>;

export function emptyMemberValues(today: string): MemberDetailsInput {
  return {
    fullName: '',
    phone: '',
    altPhone: '',
    email: '',
    gender: '',
    dob: '',
    address: '',
    joinedOn: today,
    source: 'walk_in',
    emergencyContactName: '',
    emergencyContactPhone: '',
    notes: '',
    tags: '',
    consentMessaging: false,
  };
}
