import { createHash, randomBytes } from 'node:crypto';

export const KIOSK_COOKIE = 'gd_kiosk';
/** Browsers cap cookie lifetime at 400 days. */
export const KIOSK_COOKIE_MAX_AGE = 400 * 24 * 60 * 60;

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** A fresh device credential. Only the SHA-256 hex digest is stored. */
export function createKioskToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashKioskToken(token)! };
}

export function hashKioskToken(token: string | undefined | null): string | null {
  if (!token || !TOKEN.test(token)) {
    return null;
  }
  return createHash('sha256').update(token).digest('hex');
}
