import 'server-only';

import { createMemberQrToken, verifyMemberQrToken } from '@/lib/attendance/qr-token';
import { env } from '@/lib/env';

/** The check-in code a member shows, and the public card page that displays it. */
export function memberQrFor(memberId: string, version: number): { token: string; cardUrl: string } {
  const token = createMemberQrToken(memberId, version, env.PORTAL_TOKEN_SECRET);
  return { token, cardUrl: `${env.NEXT_PUBLIC_APP_URL}/p/card/${token}` };
}

export function readMemberQr(token: string): { memberId: string; version: number } | null {
  return verifyMemberQrToken(token, env.PORTAL_TOKEN_SECRET);
}
