import { z } from 'zod';

import { copy } from '@/lib/copy';
import { GSTIN_REGEX } from '@/lib/gst';
import { normalizePhone } from '@/lib/phone';
import { UPI_ID_REGEX } from '@/lib/upi';

export const INVOICE_PREFIX_REGEX = /^[A-Z]{3,4}$/;

export const phoneInputSchema = z
  .string({ error: copy.validation.required })
  .trim()
  .min(1, copy.validation.required)
  .transform((value, ctx) => {
    const normalized = normalizePhone(value);
    if (!normalized) {
      ctx.addIssue({ code: 'custom', message: copy.validation.phoneInvalid });
      return z.NEVER;
    }
    return normalized;
  });

export const upiIdSchema = z
  .string({ error: copy.validation.required })
  .trim()
  .regex(UPI_ID_REGEX, copy.validation.upiInvalid);

export const createOrganizationSchema = z
  .strictObject({
    name: z
      .string({ error: copy.validation.required })
      .trim()
      .min(2, copy.validation.tooShort(2))
      .max(80, copy.validation.tooLong(80)),
    city: z
      .string({ error: copy.validation.required })
      .trim()
      .min(2, copy.validation.tooShort(2))
      .max(60, copy.validation.tooLong(60)),
    phone: phoneInputSchema,
    upiVpa: upiIdSchema,
    upiPayeeName: z
      .string({ error: copy.validation.required })
      .trim()
      .min(2, copy.validation.tooShort(2))
      .max(60, copy.validation.tooLong(60)),
    gstEnabled: z.boolean(),
    gstin: z.string().trim().toUpperCase().max(15, copy.validation.gstinInvalid).optional(),
    invoicePrefix: z
      .string({ error: copy.validation.required })
      .trim()
      .toUpperCase()
      .regex(INVOICE_PREFIX_REGEX, copy.validation.invoicePrefixInvalid),
  })
  .refine((value) => !value.gstEnabled || (value.gstin && value.gstin.length > 0), {
    message: copy.validation.gstinRequired,
    path: ['gstin'],
  })
  .refine((value) => !value.gstEnabled || !value.gstin || GSTIN_REGEX.test(value.gstin), {
    message: copy.validation.gstinInvalid,
    path: ['gstin'],
  });

export type CreateOrganizationInput = z.input<typeof createOrganizationSchema>;
export type CreateOrganizationValues = z.output<typeof createOrganizationSchema>;

/**
 * Suggests a 3–4 letter invoice prefix from the gym name:
 * "Iron Temple Fitness" → "ITF", "Gold's Gym Nagpur" → "GGN", "Fitness" → "FIT".
 */
export function suggestInvoicePrefix(name: string): string {
  const words = name
    .toUpperCase()
    .replace(/[^A-Z\s]/g, '')
    .split(/\s+/)
    .filter(Boolean);
  let prefix = words
    .map((word) => word[0]!)
    .join('')
    .slice(0, 4);
  if (prefix.length < 3) {
    prefix = words.join('').slice(0, 3);
  }
  while (prefix.length < 3) {
    prefix += 'X';
  }
  return prefix;
}
