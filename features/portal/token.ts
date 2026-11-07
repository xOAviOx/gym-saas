import { createHash, randomBytes } from 'node:crypto';

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function createPortalToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashPortalToken(token)! };
}

export function hashPortalToken(token: string): string | null {
  if (!TOKEN_RE.test(token)) return null;
  return createHash('sha256').update(`gymdesk:portal:v1:${token}`).digest('hex');
}
