'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { authorize } from '@/lib/auth/session';
import { copy } from '@/lib/copy';
import { env } from '@/lib/env';
import { ActionError, parseInput, runAction, unwrap, type ActionResult } from '@/lib/errors';

import { createPortalToken } from './token';

const inputSchema = z.strictObject({ memberId: z.uuid() });

export async function issuePortalLink(input: unknown): Promise<ActionResult<{ url: string }>> {
  return runAction(async () => {
    const { memberId } = parseInput(inputSchema, input);
    const { supabase, ctx } = await authorize();
    const member = unwrap(
      await supabase
        .from('members')
        .select('id')
        .eq('org_id', ctx.org.id)
        .eq('id', memberId)
        .is('deleted_at', null)
        .maybeSingle(),
    );
    if (!member) throw new ActionError(copy.errors.notFound, 'not_found');

    const { token, hash } = createPortalToken();
    unwrap(
      await supabase.rpc('issue_portal_token', {
        p_org: ctx.org.id,
        p_member_id: memberId,
        p_token_hash: hash,
      }),
    );
    revalidatePath(`/members/${memberId}`);
    return { url: `${env.NEXT_PUBLIC_APP_URL}/p/member/${token}` };
  });
}

export async function revokePortalLinks(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const { memberId } = parseInput(inputSchema, input);
    const { supabase, ctx } = await authorize();
    unwrap(
      await supabase.rpc('revoke_member_portal_tokens', {
        p_org: ctx.org.id,
        p_member_id: memberId,
      }),
    );
    revalidatePath(`/members/${memberId}`);
    return null;
  });
}
