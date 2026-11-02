import { z } from 'zod';

import { dateInputSchema } from '@/features/members/schema';
import { moneyInputSchema } from '@/features/plans/schema';
import { copy } from '@/lib/copy';
import { daysAgo, todayIST } from '@/lib/dates';
import { UPI_ID_REGEX, UTR_REGEX } from '@/lib/upi';

export const DUES_PAGE_SIZE = 25;

export const duesFilterSchema = z.enum(['all', 'overdue', 'today', 'upcoming', 'claims']);
export type DuesFilter = z.infer<typeof duesFilterSchema>;

export const staffPaymentMethodSchema = z.enum(['cash', 'upi', 'card', 'bank_transfer']);
export type StaffPaymentMethod = z.infer<typeof staffPaymentMethodSchema>;

/** UPI apps often show the UTR in groups of digits; spaces are ignored. */
const utrSchema = z
  .string()
  .transform((value) => value.replace(/\s+/g, ''))
  .refine((value) => UTR_REGEX.test(value), copy.validation.utrInvalid);

const optionalUtrSchema = z
  .string()
  .transform((value) => value.replace(/\s+/g, ''))
  .refine((value) => value === '' || UTR_REGEX.test(value), copy.validation.utrInvalid);

const positiveMoneySchema = moneyInputSchema.refine(
  (paise) => paise > 0,
  copy.validation.amountPositive,
);

const reasonSchema = z
  .string()
  .trim()
  .min(3, copy.payments.reasonInvalid)
  .max(200, copy.payments.reasonInvalid);

export const recordPaymentSchema = z
  .strictObject({
    invoiceId: z.uuid(),
    requestId: z.uuid(),
    amount: positiveMoneySchema,
    method: staffPaymentMethodSchema,
    utr: optionalUtrSchema,
    reference: z.string().trim().max(100, copy.validation.tooLong(100)),
    paidOn: dateInputSchema,
  })
  .refine((v) => v.method === 'upi' || v.utr === '', {
    path: ['utr'],
    message: copy.payments.utrOnlyUpi,
  })
  .refine((v) => v.paidOn <= todayIST() && v.paidOn >= daysAgo(90), {
    path: ['paidOn'],
    message: copy.payments.paidOnInvalid,
  });
export type RecordPaymentInput = z.input<typeof recordPaymentSchema>;

export const reasonInputSchema = z.strictObject({ reason: reasonSchema });
export type ReasonInput = z.input<typeof reasonInputSchema>;

export const reversePaymentSchema = z.strictObject({
  invoiceId: z.uuid(),
  paymentId: z.uuid(),
  reason: reasonSchema,
});

export const voidInvoiceSchema = z.strictObject({ invoiceId: z.uuid(), reason: reasonSchema });

export const claimDecisionSchema = z.strictObject({ invoiceId: z.uuid(), claimId: z.uuid() });
export const rejectClaimSchema = claimDecisionSchema.extend({ reason: reasonSchema });

export const invoiceRefSchema = z.strictObject({ invoiceId: z.uuid() });
export const createLinkSchema = z.strictObject({ invoiceId: z.uuid(), requestId: z.uuid() });
export const cancelLinkSchema = z.strictObject({
  invoiceId: z.uuid(),
  collectionRequestId: z.uuid(),
});

export const paymentSettingsSchema = z
  .strictObject({
    upiVpa: z
      .string()
      .trim()
      .refine((v) => v === '' || UPI_ID_REGEX.test(v), copy.validation.upiInvalid),
    upiPayeeName: z
      .string()
      .trim()
      .refine((v) => v === '' || v.length >= 2, copy.validation.tooShort(2))
      .refine((v) => v.length <= 60, copy.validation.tooLong(60)),
    defaultMode: z.enum(['upi_direct', 'cashfree']),
  })
  .refine((v) => v.upiVpa !== '' || v.upiPayeeName === '', {
    path: ['upiVpa'],
    message: copy.paymentSettings.vpaRequired,
  })
  .refine((v) => v.upiPayeeName !== '' || v.upiVpa === '', {
    path: ['upiPayeeName'],
    message: copy.paymentSettings.payeeRequired,
  })
  .refine((v) => v.defaultMode !== 'upi_direct' || v.upiVpa !== '', {
    path: ['upiVpa'],
    message: copy.paymentSettings.vpaRequired,
  });
export type PaymentSettingsInput = z.input<typeof paymentSettingsSchema>;

export const cashfreeCredentialsSchema = z.strictObject({
  appId: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9._-]{4,128}$/, copy.paymentSettings.appIdInvalid),
  secretKey: z
    .string()
    .trim()
    .min(8, copy.paymentSettings.secretInvalid)
    .max(256, copy.paymentSettings.secretInvalid)
    .regex(/^\S+$/, copy.paymentSettings.secretInvalid),
  environment: z.enum(['sandbox', 'production']),
});
export type CashfreeCredentialsInput = z.input<typeof cashfreeCredentialsSchema>;

const payTokenSchema = z.string().min(10).max(100);

export const payClaimSchema = z.strictObject({
  token: payTokenSchema,
  utr: utrSchema,
  amount: positiveMoneySchema,
  note: z.string().trim().max(200, copy.validation.tooLong(200)),
});
export type PayClaimInput = z.input<typeof payClaimSchema>;

export const payTokenInputSchema = z.strictObject({ token: payTokenSchema });
