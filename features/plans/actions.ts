'use server';

import { revalidatePath } from 'next/cache';

import { writeAudit } from '@/lib/audit';
import { PRIVILEGED_ROLES } from '@/lib/auth/roles';
import { authorize } from '@/lib/auth/session';
import { parseInput, runAction, unwrap, type ActionResult } from '@/lib/errors';
import { fromPaise } from '@/lib/money';

import { savePlansSchema } from './schema';

/** Creates the first set of plans during onboarding. */
export async function saveOnboardingPlans(
  input: unknown,
): Promise<ActionResult<{ count: number }>> {
  return runAction(async () => {
    const data = parseInput(savePlansSchema, input);
    const { supabase, ctx } = await authorize(PRIVILEGED_ROLES);

    const rows = data.plans.map((plan, index) => ({
      org_id: ctx.org.id,
      name: plan.name,
      type: 'duration' as const,
      duration_days: plan.durationDays,
      price: fromPaise(plan.price),
      sort_order: index,
    }));

    const inserted = unwrap(
      await supabase.from('plans').insert(rows).select('id, name, duration_days, price'),
    );

    await writeAudit(supabase, {
      orgId: ctx.org.id,
      action: 'plans.created',
      entityType: 'plan',
      after: { plans: inserted },
    });

    revalidatePath('/onboarding');
    return { count: inserted.length };
  });
}
