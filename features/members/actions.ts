'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';

import { PRIVILEGED_ROLES } from '@/lib/auth/roles';
import { authorize } from '@/lib/auth/session';
import { copy } from '@/lib/copy';
import { todayIST } from '@/lib/dates';
import { ActionError, parseInput, runAction, unwrap, type ActionResult } from '@/lib/errors';
import { fromPaise, toPaise } from '@/lib/money';

import { memberDatabaseData } from './data';
import { createMemberSchema, memberIdSchema, notesSchema, updateMemberSchema } from './schema';

function revalidateMember(id: string) {
  revalidatePath('/members');
  revalidatePath(`/members/${id}`);
  revalidatePath('/today');
}

export async function createMember(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const { supabase, ctx } = await authorize();
    const data = parseInput(createMemberSchema, input);
    if (data.dob && data.dob > todayIST())
      throw new ActionError(copy.validation.dateInvalid, 'validation', {
        dob: [copy.validation.dateInvalid],
      });
    if (data.planId) {
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
    }
    const id = unwrap(
      await supabase.rpc('create_member', {
        p_org: ctx.org.id,
        p_member_id: data.requestId,
        p_data: memberDatabaseData(data),
        ...(data.planId
          ? {
              p_membership: {
                plan_id: data.planId,
                start_date: data.startDate,
                discount_amount: fromPaise(data.discount),
              },
            }
          : {}),
      }),
    );
    revalidateMember(id);
    return { id };
  });
}

export async function updateMember(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const { supabase, ctx } = await authorize();
    const data = parseInput(updateMemberSchema, input);
    if (data.dob && data.dob > todayIST())
      throw new ActionError(copy.validation.dateInvalid, 'validation', {
        dob: [copy.validation.dateInvalid],
      });
    const id = unwrap(
      await supabase.rpc('update_member', {
        p_org: ctx.org.id,
        p_member_id: data.memberId,
        p_data: memberDatabaseData(data),
      }),
    );
    revalidateMember(id);
    return { id };
  });
}

export async function saveMemberNotes(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const { supabase, ctx } = await authorize();
    const data = parseInput(notesSchema, input);
    unwrap(
      await supabase.rpc('update_member', {
        p_org: ctx.org.id,
        p_member_id: data.memberId,
        p_data: { notes: data.notes },
      }),
    );
    revalidateMember(data.memberId);
    return null;
  });
}

export async function deleteMember(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const { supabase, ctx } = await authorize(PRIVILEGED_ROLES);
    const { memberId } = parseInput(memberIdSchema, input);
    unwrap(
      await supabase
        .from('members')
        .select('id')
        .eq('org_id', ctx.org.id)
        .eq('id', memberId)
        .single(),
    );
    unwrap(await supabase.rpc('soft_delete_member', { p_member_id: memberId }));
    revalidateMember(memberId);
    return null;
  });
}

export async function restoreMember(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const { supabase, ctx } = await authorize(PRIVILEGED_ROLES);
    const { memberId } = parseInput(memberIdSchema, input);
    unwrap(
      await supabase
        .from('members')
        .select('id')
        .eq('org_id', ctx.org.id)
        .eq('id', memberId)
        .single(),
    );
    unwrap(await supabase.rpc('restore_member', { p_member_id: memberId }));
    revalidateMember(memberId);
    return null;
  });
}

export async function saveMemberPhoto(formData: FormData): Promise<ActionResult<null>> {
  return runAction(async () => {
    const { supabase, ctx } = await authorize();
    const { memberId } = parseInput(memberIdSchema, { memberId: formData.get('memberId') });
    if ([...formData.keys()].some((key) => !['memberId', 'photo'].includes(key)))
      throw new ActionError(copy.validation.unknownFields, 'validation');
    const response = await supabase
      .from('members')
      .select('photo_url')
      .eq('org_id', ctx.org.id)
      .eq('id', memberId)
      .is('deleted_at', null)
      .single();
    const member = unwrap(response);
    const file = formData.get('photo');
    let path: string | null = null;
    if (file instanceof File && file.size > 0) {
      if (file.size > 5 * 1024 * 1024)
        throw new ActionError(copy.members.photoInvalid, 'validation');
      const bytes = Buffer.from(await file.arrayBuffer());
      const mime =
        bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
          ? 'image/jpeg'
          : bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
            ? 'image/png'
            : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
              ? 'image/webp'
              : null;
      if (!mime || mime !== file.type)
        throw new ActionError(copy.members.photoInvalid, 'validation');
      path = `${ctx.org.id}/members/${memberId}/${randomUUID()}.${mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1]}`;
      const { error } = await supabase.storage
        .from('uploads')
        .upload(path, bytes, { contentType: mime, upsert: false });
      if (error) throw error;
    } else if (file !== null) {
      throw new ActionError(copy.members.photoInvalid, 'validation');
    }
    const { error } = await supabase.rpc('update_member', {
      p_org: ctx.org.id,
      p_member_id: memberId,
      p_data: { photo_url: path },
    });
    if (error) {
      if (path) await supabase.storage.from('uploads').remove([path]);
      throw error;
    }
    if (member.photo_url?.startsWith(`${ctx.org.id}/members/${memberId}/`)) {
      await supabase.storage.from('uploads').remove([member.photo_url]);
    }
    revalidateMember(memberId);
    return null;
  });
}
