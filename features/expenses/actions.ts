'use server';

import { revalidatePath } from 'next/cache';

import { PRIVILEGED_ROLES } from '@/lib/auth/roles';
import { authorize } from '@/lib/auth/session';
import { parseInput, runAction, unwrap, type ActionResult } from '@/lib/errors';
import { fromPaise } from '@/lib/money';

import { expenseIdSchema, expenseSchema } from './schema';

export async function saveExpense(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const { supabase, ctx } = await authorize(PRIVILEGED_ROLES);
    const data = parseInput(expenseSchema, input);
    const id = unwrap(
      await supabase.rpc('save_expense', {
        p_org: ctx.org.id,
        // PostgREST accepts null for a new expense; generated RPC types mark input args non-null.
        p_id: data.id as string,
        p_category: data.category,
        p_amount: fromPaise(data.amount),
        p_date: data.expenseDate,
        p_vendor: data.vendor,
        p_notes: data.notes,
      }),
    );
    revalidatePath('/expenses');
    revalidatePath('/reports');
    revalidatePath('/today');
    return { id };
  });
}

export async function deleteExpense(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const { supabase, ctx } = await authorize(PRIVILEGED_ROLES);
    const { id } = parseInput(expenseIdSchema, input);
    const { error } = await supabase.rpc('delete_expense', { p_org: ctx.org.id, p_id: id });
    if (error) throw error;
    revalidatePath('/expenses');
    revalidatePath('/reports');
    revalidatePath('/today');
    return null;
  });
}
