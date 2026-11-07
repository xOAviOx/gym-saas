import { z } from 'zod';

import { GSTIN_REGEX } from '@/lib/gst';
import { copy } from '@/lib/copy';

import { INVOICE_PREFIX_REGEX, phoneInputSchema } from './schema';

export const gymSettingsSchema = z
  .strictObject({
    name: z.string().trim().min(2).max(80),
    city: z.string().trim().max(80),
    state: z.string().trim().max(80),
    addressLine: z.string().trim().max(200),
    phone: phoneInputSchema,
    email: z.union([z.email(), z.literal('')]),
    invoicePrefix: z
      .string()
      .trim()
      .toUpperCase()
      .regex(INVOICE_PREFIX_REGEX, copy.validation.invoicePrefixInvalid),
    gstEnabled: z.boolean(),
    gstin: z.string().trim().toUpperCase(),
    gstRate: z.coerce.number().min(0).max(28),
  })
  .superRefine((value, ctx) => {
    if (value.gstEnabled && !GSTIN_REGEX.test(value.gstin)) {
      ctx.addIssue({ code: 'custom', path: ['gstin'], message: copy.validation.gstinInvalid });
    }
  });
