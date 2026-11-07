'use server';

import { createHash, randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { PRIVILEGED_ROLES } from '@/lib/auth/roles';
import { authorize, authorizeUser } from '@/lib/auth/session';
import { copy } from '@/lib/copy';
import { env } from '@/lib/env';
import { ActionError, parseInput, runAction, unwrap, type ActionResult } from '@/lib/errors';

const inviteSchema = z.strictObject({
  email: z.email().trim().toLowerCase(),
  role: z.enum(['manager', 'staff']),
});
const memberSchema = z.strictObject({ id: z.uuid() });
const roleSchema = memberSchema.extend({ role: z.enum(['manager', 'staff']) });
const activeSchema = memberSchema.extend({ active: z.boolean() });
const acceptSchema = z.strictObject({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) });

function inviteHash(token: string) {
  return createHash('sha256').update(`gymdesk:invite:v1:${token}`).digest('hex');
}

export async function issueTeamInvite(input: unknown): Promise<ActionResult<{ url: string }>> {
  return runAction(async () => {
    const data = parseInput(inviteSchema, input);
    const { supabase, ctx } = await authorize(PRIVILEGED_ROLES);
    const token = randomBytes(32).toString('base64url');
    unwrap(
      await supabase.rpc('issue_invitation', {
        p_org: ctx.org.id,
        p_email: data.email,
        p_role: data.role,
        p_token_hash: inviteHash(token),
      }),
    );
    revalidatePath('/settings/team');
    return { url: `${env.NEXT_PUBLIC_APP_URL}/invite/${token}` };
  });
}

export async function acceptTeamInvite(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const { token } = parseInput(acceptSchema, input);
    const { supabase } = await authorizeUser();
    const { error } = await supabase.rpc('accept_invitation', { p_token_hash: inviteHash(token) });
    if (error) throw error;
    revalidatePath('/', 'layout');
    return null;
  });
}

export async function changeTeamRole(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const { id, role } = parseInput(roleSchema, input);
    const { supabase, ctx } = await authorize(PRIVILEGED_ROLES);
    const member = unwrap(
      await supabase
        .from('team_members')
        .select('org_id')
        .eq('id', id)
        .eq('org_id', ctx.org.id)
        .maybeSingle(),
    );
    if (!member) throw new ActionError(copy.errors.notFound, 'not_found');
    unwrap(await supabase.rpc('change_team_role', { p_team_member_id: id, p_role: role }));
    revalidatePath('/settings/team');
    return null;
  });
}

export async function setTeamActive(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const { id, active } = parseInput(activeSchema, input);
    const { supabase, ctx } = await authorize(PRIVILEGED_ROLES);
    const member = unwrap(
      await supabase
        .from('team_members')
        .select('org_id')
        .eq('id', id)
        .eq('org_id', ctx.org.id)
        .maybeSingle(),
    );
    if (!member) throw new ActionError(copy.errors.notFound, 'not_found');
    unwrap(
      await supabase.rpc('set_team_member_active', { p_team_member_id: id, p_active: active }),
    );
    revalidatePath('/settings/team');
    return null;
  });
}
