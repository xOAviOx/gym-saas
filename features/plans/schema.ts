import { z } from 'zod';

import { copy } from '@/lib/copy';
import { parseMoneyInput } from '@/lib/money';

export const DURATION_PRESETS = [
  { days: 30, months: 1 },
  { days: 60, months: 2 },
  { days: 90, months: 3 },
  { days: 180, months: 6 },
  { days: 365, months: 12 },
] as const;

/** Rupees typed by a person ("1,500" or "1500.50") → paise. */
export const moneyInputSchema = z
  .string({ error: copy.validation.required })
  .trim()
  .min(1, copy.validation.required)
  .transform((value, ctx) => {
    const paise = parseMoneyInput(value);
    if (paise === null) {
      ctx.addIssue({ code: 'custom', message: copy.validation.amountInvalid });
      return z.NEVER;
    }
    return paise;
  });

export const onboardingPlanSchema = z.strictObject({
  name: z
    .string({ error: copy.validation.required })
    .trim()
    .min(1, copy.validation.required)
    .max(60, copy.validation.tooLong(60)),
  durationDays: z.number({ error: copy.validation.required }).int().min(1).max(3660),
  price: moneyInputSchema,
});

export const savePlansSchema = z.strictObject({
  plans: z.array(onboardingPlanSchema).min(1, copy.onboarding.plans.minOne).max(20),
});

export type SavePlansInput = z.input<typeof savePlansSchema>;

export const DEFAULT_PLANS: SavePlansInput['plans'] = [
  { name: copy.onboarding.plans.defaults.monthly, durationDays: 30, price: '1500' },
  { name: copy.onboarding.plans.defaults.quarterly, durationDays: 90, price: '4000' },
  { name: copy.onboarding.plans.defaults.annual, durationDays: 365, price: '12000' },
];
