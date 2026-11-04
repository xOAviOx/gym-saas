import { createHash, timingSafeEqual } from 'node:crypto';

/** Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`; compared in constant time. */
export function isCronAuthorized(header: string | null, secret: string): boolean {
  if (!header?.startsWith('Bearer ') || !secret) return false;
  const received = createHash('sha256').update(header.slice('Bearer '.length)).digest();
  const expected = createHash('sha256').update(secret).digest();
  return timingSafeEqual(received, expected);
}
