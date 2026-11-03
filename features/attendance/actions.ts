'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createKioskToken, KIOSK_COOKIE, KIOSK_COOKIE_MAX_AGE } from '@/lib/attendance/kiosk-token';
import { extractQrToken } from '@/lib/attendance/qr-token';
import { PRIVILEGED_ROLES } from '@/lib/auth/roles';
import { authorize } from '@/lib/auth/session';
import { copy } from '@/lib/copy';
import { env } from '@/lib/env';
import { ActionError, parseInput, runAction, unwrap, type ActionResult } from '@/lib/errors';
import type { ServerSupabase } from '@/lib/supabase/server';

import { getMemberPhotoUrl } from '@/features/members/queries';

import { readMemberQr } from './member-qr';
import { parseCheckInResult } from './outcome';
import { searchCheckInCandidates, type CheckInCandidate } from './queries';
import {
  attendanceSettingsSchema,
  checkInSchema,
  kioskDeviceRefSchema,
  kioskPinSchema,
  memberRefSchema,
  memberSearchSchema,
  pairKioskSchema,
  scanCheckInSchema,
} from './schema';
import type { CheckInMethod, CheckInOutcome } from './types';

function revalidateAttendance(memberId?: string) {
  revalidatePath('/attendance');
  revalidatePath('/today');
  if (memberId) revalidatePath(`/members/${memberId}`);
}

async function runCheckIn(
  supabase: ServerSupabase,
  orgId: string,
  memberId: string,
  method: CheckInMethod,
  override: boolean | undefined,
  pin: string | undefined,
): Promise<CheckInOutcome> {
  const { data, error } = await supabase.rpc('check_in_member', {
    p_member_id: memberId,
    p_method: method,
    p_override: override ?? false,
    ...(pin ? { p_pin: pin } : {}),
  });
  if (error) throw error;
  const parsed = parseCheckInResult(data);
  if (parsed.result === 'checked_in') revalidateAttendance(parsed.member.id);
  const { photoPath, ...member } = parsed.member;
  return {
    result: parsed.result,
    pinError: parsed.pinError,
    overridden: parsed.overridden,
    checkedInAt: parsed.checkedInAt,
    member: {
      ...member,
      photoUrl: await getMemberPhotoUrl(supabase, orgId, member.id, photoPath),
    },
  };
}

export async function checkInMember(input: unknown): Promise<ActionResult<CheckInOutcome>> {
  return runAction(async () => {
    const { supabase, ctx } = await authorize();
    const data = parseInput(checkInSchema, input);
    return runCheckIn(supabase, ctx.org.id, data.memberId, 'manual', data.override, data.pin);
  });
}

export async function checkInByQr(input: unknown): Promise<ActionResult<CheckInOutcome>> {
  return runAction(async () => {
    const { supabase, ctx } = await authorize();
    const data = parseInput(scanCheckInSchema, input);
    const token = extractQrToken(data.code);
    const decoded = token ? readMemberQr(token) : null;
    if (!decoded) throw new ActionError(copy.attendance.qrInvalid, 'validation');
    const { data: member, error } = await supabase
      .from('members')
      .select('id,qr_version')
      .eq('org_id', ctx.org.id)
      .eq('id', decoded.memberId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    // A code from another gym looks the same as a forged one: not ours.
    if (!member) throw new ActionError(copy.attendance.qrInvalid, 'not_found');
    if (member.qr_version !== decoded.version) {
      throw new ActionError(copy.attendance.qrReplaced, 'validation');
    }
    return runCheckIn(supabase, ctx.org.id, member.id, 'qr', data.override, data.pin);
  });
}

export async function searchMembersForCheckIn(
  input: unknown,
): Promise<ActionResult<CheckInCandidate[]>> {
  return runAction(async () => {
    const { supabase, ctx } = await authorize();
    const { query } = parseInput(memberSearchSchema, input);
    return searchCheckInCandidates(supabase, ctx.org.id, query);
  });
}

export async function resetMemberQr(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const { supabase } = await authorize();
    const { memberId } = parseInput(memberRefSchema, input);
    const { error } = await supabase.rpc('reset_member_qr', { p_member_id: memberId });
    if (error) throw error;
    revalidatePath(`/members/${memberId}`);
    return null;
  });
}

export async function saveAttendanceSettings(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const { supabase, ctx } = await authorize(PRIVILEGED_ROLES);
    const { blockExpired } = parseInput(attendanceSettingsSchema, input);
    const { error } = await supabase.rpc('save_attendance_settings', {
      p_org: ctx.org.id,
      p_block_expired: blockExpired,
    });
    if (error) throw error;
    revalidatePath('/settings/attendance');
    return null;
  });
}

export async function setKioskPin(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const { supabase, ctx } = await authorize(PRIVILEGED_ROLES);
    const { pin } = parseInput(kioskPinSchema, input);
    const { error } = await supabase.rpc('set_kiosk_pin', { p_org: ctx.org.id, p_pin: pin });
    if (error) throw error;
    revalidatePath('/settings/attendance');
    return null;
  });
}

export async function removeKioskPin(): Promise<ActionResult<null>> {
  return runAction(async () => {
    const { supabase, ctx } = await authorize(PRIVILEGED_ROLES);
    // The generated type marks p_pin as string, but SQL treats null as "remove".
    const { error } = await supabase.rpc('set_kiosk_pin', {
      p_org: ctx.org.id,
      p_pin: null as unknown as string,
    });
    if (error) throw error;
    revalidatePath('/settings/attendance');
    return null;
  });
}

export async function revokeKioskDevice(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const { supabase } = await authorize(PRIVILEGED_ROLES);
    const { deviceId } = parseInput(kioskDeviceRefSchema, input);
    const { error } = await supabase.rpc('revoke_kiosk_device', { p_device_id: deviceId });
    if (error) throw error;
    revalidatePath('/settings/attendance');
    return null;
  });
}

/**
 * Turns the current browser into a kiosk: stores a device credential in an
 * httpOnly cookie and signs the user out here, so a member at the kiosk can
 * never reach the rest of the app.
 */
export async function pairKioskDevice(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const { supabase, ctx } = await authorize(PRIVILEGED_ROLES);
    const { label } = parseInput(pairKioskSchema, input);
    const { token, hash } = createKioskToken();
    unwrap(
      await supabase.rpc('create_kiosk_device', {
        p_org: ctx.org.id,
        p_label: label,
        p_token_hash: hash,
      }),
    );
    const store = await cookies();
    store.set(KIOSK_COOKIE, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: env.NEXT_PUBLIC_APP_URL.startsWith('https://'),
      path: '/',
      maxAge: KIOSK_COOKIE_MAX_AGE,
    });
    await supabase.auth.signOut({ scope: 'local' });
    revalidatePath('/settings/attendance');
    redirect('/kiosk');
  });
}
