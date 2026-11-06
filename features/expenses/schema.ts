import { z } from 'zod';

import { moneyInputSchema } from '@/features/plans/schema';
import { copy } from '@/lib/copy';
import { isDateOnly } from '@/lib/dates';

export const EXPENSE_CATEGORIES = [
  'rent',
  'salaries',
  'electricity',
  'equipment',
  'maintenance',
  'marketing',
  'supplies',
  'other',
] as const;

export const expenseSchema = z.strictObject({
  id: z.uuid().nullable(),
  category: z.enum(EXPENSE_CATEGORIES),
  amount: moneyInputSchema.refine((value) => value > 0, copy.validation.amountInvalid),
  expenseDate: z.string().refine(isDateOnly, copy.validation.dateInvalid),
  vendor: z.string().trim().max(120, copy.validation.tooLong(120)),
  notes: z.string().trim().max(500, copy.validation.tooLong(500)),
});

export const expenseIdSchema = z.strictObject({ id: z.uuid() });
export type ExpenseInput = z.input<typeof expenseSchema>;
