'use server';

import { revalidatePath } from 'next/cache';

import { PRIVILEGED_ROLES } from '@/lib/auth/roles';
import { authorize } from '@/lib/auth/session';
import { parseInput, runAction, unwrap, type ActionResult } from '@/lib/errors';
import { fromPaise } from '@/lib/money';

import { planSchema, savePlansSchema } from './schema';

/** Creates the first set of plans during onboarding. */
export async function saveOnboardingPlans(
  input: unknown,
): Promise<ActionResult<{ count: number }>> {
  return runAction(async () => {
    const { supabase, ctx } = await authorize(PRIVILEGED_ROLES);
    const data = parseInput(savePlansSchema, input);

    const rows = data.plans.map((plan) => ({
      name: plan.name,
      type: 'duration' as const,
      duration_days: plan.durationDays,
      price: fromPaise(plan.price),
    }));

    const count = unwrap(
      await supabase.rpc('save_onboarding_plans', { p_org: ctx.org.id, p_plans: rows }),
    );

    revalidatePath('/onboarding');
    revalidatePath('/settings/plans');
    return { count };
  });
}

export async function savePlan(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const { supabase, ctx } = await authorize(PRIVILEGED_ROLES);
    const data = parseInput(planSchema, input);
    const id = unwrap(
      await supabase.rpc('save_plan', {
        p_org: ctx.org.id,
        ...(data.planId ? { p_plan_id: data.planId } : {}),
        p_data: {
          name: data.name,
          type: data.type,
          duration_days: data.durationDays,
          session_count: data.type === 'sessions' ? data.sessionCount : null,
          price: fromPaise(data.price),
          description: data.description || null,
          is_active: data.isActive,
        },
      }),
    );
    revalidatePath('/settings/plans');
    revalidatePath('/members');
    return { id };
  });
}
