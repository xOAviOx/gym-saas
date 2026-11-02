'use server';

import { revalidatePath } from 'next/cache';

import { authorize } from '@/lib/auth/session';
import { copy } from '@/lib/copy';
import { todayIST } from '@/lib/dates';
import { ActionError, parseInput, runAction, unwrap, type ActionResult } from '@/lib/errors';
import { fromPaise, toPaise } from '@/lib/money';

import { enrollmentSchema, freezeSchema, membershipIdSchema } from './schema';

function revalidateMember(id: string) {
  revalidatePath(`/members/${id}`);
  revalidatePath('/members');
  revalidatePath('/today');
}

export async function enrollMember(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const { supabase, ctx } = await authorize();
    const data = parseInput(enrollmentSchema, input);
    const response = await supabase
      .from('plans')
      .select('price')
      .eq('org_id', ctx.org.id)
      .eq('id', data.planId)
      .eq('is_active', true)
      .single();
    const plan = unwrap(response);
    if (data.discount > toPaise(plan.price))
      throw new ActionError(copy.memberships.discountTooHigh, 'validation', {
        discount: [copy.memberships.discountTooHigh],
      });
    unwrap(
      await supabase.rpc('enroll_member', {
        p_org: ctx.org.id,
        p_member_id: data.memberId,
        p_plan_id: data.planId,
        p_start_date: data.startDate,
        p_discount_amount: fromPaise(data.discount),
        p_request_id: data.requestId,
      }),
    );
    revalidateMember(data.memberId);
    return null;
  });
}

export async function freezeMembership(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const { supabase, ctx } = await authorize();
    const data = parseInput(freezeSchema, input);
    const response = await supabase
      .from('memberships')
      .select('id,start_date,end_date,members!inner(deleted_at)')
      .eq('org_id', ctx.org.id)
      .eq('id', data.membershipId)
      .eq('member_id', data.memberId)
      .single();
    const membership = unwrap(response);
    if (membership.members.deleted_at) throw new ActionError(copy.errors.notFound, 'not_found');
    if (
      data.from < todayIST() ||
      data.from < membership.start_date ||
      data.from > membership.end_date
    )
      throw new ActionError(copy.memberships.freezeDateInvalid, 'validation');
    unwrap(
      await supabase.rpc('freeze_membership', {
        p_membership_id: data.membershipId,
        p_from: data.from,
        p_to: data.to,
      }),
    );
    revalidateMember(data.memberId);
    return null;
  });
}

export async function unfreezeMembership(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const { supabase, ctx } = await authorize();
    const data = parseInput(membershipIdSchema, input);
    const response = await supabase
      .from('memberships')
      .select('id,members!inner(deleted_at)')
      .eq('org_id', ctx.org.id)
      .eq('id', data.membershipId)
      .eq('member_id', data.memberId)
      .single();
    const membership = unwrap(response);
    if (membership.members.deleted_at) throw new ActionError(copy.errors.notFound, 'not_found');
    unwrap(await supabase.rpc('unfreeze_membership', { p_membership_id: data.membershipId }));
    revalidateMember(data.memberId);
    return null;
  });
}
