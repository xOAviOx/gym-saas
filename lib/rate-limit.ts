import 'server-only';

import { createHmac } from 'node:crypto';

import { headers } from 'next/headers';

import { env } from '@/lib/env';
import type { AdminSupabase } from '@/lib/supabase/admin';

/** Fixed-window limiter backed by check_rate_limit(); true when the request may proceed. */
export async function allowRequest(
  admin: AdminSupabase,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const { data, error } = await admin.rpc('check_rate_limit', {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) throw error;
  return data === true;
}

/** The caller's IP as a keyed hash, so rate-limit rows never hold a raw address. */
export async function clientFingerprint(): Promise<string> {
  const list = await headers();
  const ip =
    list.get('x-forwarded-for')?.split(',')[0]?.trim() || list.get('x-real-ip') || 'unknown';
  return createHmac('sha256', env.PORTAL_TOKEN_SECRET)
    .update(`rate-limit:${ip}`)
    .digest('hex')
    .slice(0, 32);
}
