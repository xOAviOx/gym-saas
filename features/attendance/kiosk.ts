import 'server-only';

import { cookies } from 'next/headers';

import { hashKioskToken, KIOSK_COOKIE } from '@/lib/attendance/kiosk-token';
import { createAdminClient, type AdminSupabase } from '@/lib/supabase/admin';

export type KioskDevice = {
  id: string;
  orgId: string;
  label: string;
  gymName: string;
};

/**
 * The kiosk this browser is paired as, from its httpOnly device cookie, or null.
 * Kiosk routes have no user session; this is their only credential.
 */
export async function currentKioskDevice(
  admin: AdminSupabase = createAdminClient(),
): Promise<KioskDevice | null> {
  const hash = hashKioskToken((await cookies()).get(KIOSK_COOKIE)?.value);
  if (!hash) return null;
  const { data, error } = await admin
    .from('kiosk_devices')
    .select('id,org_id,label,organizations!inner(name)')
    .eq('token_hash', hash)
    .is('revoked_at', null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { id: data.id, orgId: data.org_id, label: data.label, gymName: data.organizations.name };
}

/** Short-lived photo link for the kiosk greeting; only paths inside that member's folder. */
export async function kioskPhotoUrl(
  admin: AdminSupabase,
  orgId: string,
  memberId: string,
  path: string | null,
): Promise<string | null> {
  if (!path?.startsWith(`${orgId}/members/${memberId}/`)) return null;
  const { data } = await admin.storage.from('uploads').createSignedUrl(path, 120);
  return data?.signedUrl ?? null;
}
