'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

import { KIOSK_COOKIE } from '@/lib/attendance/kiosk-token';
import { extractQrToken } from '@/lib/attendance/qr-token';
import { copy } from '@/lib/copy';
import { ActionError, parseInput, runAction, type ActionResult } from '@/lib/errors';
import { normalizePhone } from '@/lib/phone';
import { allowRequest } from '@/lib/rate-limit';
import { createAdminClient, type AdminSupabase } from '@/lib/supabase/admin';

import { currentKioskDevice, kioskPhotoUrl, type KioskDevice } from './kiosk';
import { readMemberQr } from './member-qr';
import { firstName, parseCheckInResult, parseKioskLookup } from './outcome';
import { kioskCheckInSchema, kioskExitSchema } from './schema';
import type { KioskOutcome } from './types';

const notPaired = () => new ActionError(copy.kiosk.turnedOff, 'unauthenticated');
const limited = () => new ActionError(copy.errors.rateLimited, 'rate_limited');
const notFound = () => new ActionError(copy.kiosk.notFound, 'not_found');

async function pairedDevice(admin: AdminSupabase): Promise<KioskDevice> {
  const device = await currentKioskDevice(admin);
  if (!device) throw notPaired();
  return device;
}

async function findMemberId(
  admin: AdminSupabase,
  orgId: string,
  input: { code?: string | undefined; lookup?: string | undefined },
): Promise<string> {
  if (input.code) {
    const token = extractQrToken(input.code);
    const decoded = token ? readMemberQr(token) : null;
    if (!decoded) throw new ActionError(copy.attendance.qrInvalid, 'validation');
    const { data, error } = await admin
      .from('members')
      .select('id,qr_version')
      .eq('org_id', orgId)
      .eq('id', decoded.memberId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new ActionError(copy.attendance.qrInvalid, 'not_found');
    if (data.qr_version !== decoded.version) {
      throw new ActionError(copy.attendance.qrReplaced, 'validation');
    }
    return data.id;
  }

  const parsed = parseKioskLookup(input.lookup ?? '');
  if (!parsed) throw notFound();
  let query = admin.from('members').select('id').eq('org_id', orgId).is('deleted_at', null);
  if (parsed.kind === 'code') {
    query = query.eq('member_code', parsed.code);
  } else {
    const phone = normalizePhone(parsed.digits);
    if (!phone) throw notFound();
    query = query.eq('phone', phone);
  }
  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw error;
  if (!data) throw notFound();
  return data.id;
}

export async function kioskCheckIn(input: unknown): Promise<ActionResult<KioskOutcome>> {
  return runAction(async () => {
    const data = parseInput(kioskCheckInSchema, input);
    const admin = createAdminClient();
    const device = await pairedDevice(admin);
    if (!(await allowRequest(admin, `kiosk:${device.id}`, 60, 60))) throw limited();
    if (data.pin && !(await allowRequest(admin, `kiosk-pin:${device.id}`, 10, 300))) {
      throw limited();
    }
    const memberId = await findMemberId(admin, device.orgId, data);
    const { data: raw, error } = await admin.rpc('kiosk_check_in', {
      p_device_id: device.id,
      p_member_id: memberId,
      p_method: data.code ? 'qr' : 'manual',
      ...(data.pin ? { p_pin: data.pin } : {}),
    });
    if (error) {
      if (/kiosk_not_paired/.test(error.message)) throw notPaired();
      throw error;
    }
    const parsed = parseCheckInResult(raw);
    if (parsed.result === 'checked_in') {
      revalidatePath('/attendance');
      revalidatePath('/today');
    }
    return {
      result: parsed.result,
      pinError: parsed.pinError,
      checkedInAt: parsed.checkedInAt,
      member: {
        firstName: firstName(parsed.member.name),
        status: parsed.member.status,
        flag: parsed.member.flag,
        endDate: parsed.member.endDate,
        sessionsLeft: parsed.member.sessionsLeft,
        photoUrl: await kioskPhotoUrl(admin, device.orgId, memberId, parsed.member.photoPath),
      },
    };
  });
}

export async function kioskExit(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const { pin } = parseInput(kioskExitSchema, input);
    const admin = createAdminClient();
    const device = await currentKioskDevice(admin);
    const store = await cookies();
    if (!device) {
      store.delete(KIOSK_COOKIE);
      return null;
    }
    if (!(await allowRequest(admin, `kiosk-pin:${device.id}`, 10, 300))) throw limited();
    const { data, error } = await admin.rpc('kiosk_exit', { p_device_id: device.id, p_pin: pin });
    if (error) throw error;
    if (data !== 'ok') {
      const key = (data ?? 'invalid') as keyof typeof copy.attendance.pinErrors;
      throw new ActionError(
        copy.attendance.pinErrors[key] ?? copy.attendance.pinErrors.invalid,
        'validation',
        { pin: [copy.attendance.pinErrors[key] ?? copy.attendance.pinErrors.invalid] },
      );
    }
    store.delete(KIOSK_COOKIE);
    return null;
  });
}
