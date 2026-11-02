import { createHmac, timingSafeEqual } from 'node:crypto';

/** How long a shared pay link keeps working. Staff can share a fresh one at any time. */
export const PAY_LINK_TTL_DAYS = 30;

const PAYLOAD_BYTES = 20; // 16-byte invoice id + 4-byte expiry (unix seconds)
const SIGNATURE_BYTES = 16;
const TOKEN = /^([A-Za-z0-9_-]{27})\.([A-Za-z0-9_-]{22})$/;

/** A purpose-specific key, so a pay-link signature can never be replayed as another token type. */
function signingKey(secret: string): Buffer {
  return createHmac('sha256', secret).update('gymdesk:pay-link:v1').digest();
}

function sign(payload: Buffer, secret: string): Buffer {
  return createHmac('sha256', signingKey(secret))
    .update(payload)
    .digest()
    .subarray(0, SIGNATURE_BYTES);
}

function uuidBytes(uuid: string): Buffer {
  const hex = uuid.replace(/-/g, '');
  if (!/^[0-9a-f]{32}$/i.test(hex)) {
    throw new Error('Invalid invoice id');
  }
  return Buffer.from(hex, 'hex');
}

function bytesToUuid(bytes: Buffer): string {
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export type PayToken = { token: string; expiresAt: Date };

/**
 * Stateless, signed link to pay one invoice: `<payload>.<signature>` in
 * base64url (50 characters). Holding it lets someone view that invoice and
 * pay it, nothing more.
 */
export function createPayToken(
  invoiceId: string,
  secret: string,
  now: Date = new Date(),
  ttlDays: number = PAY_LINK_TTL_DAYS,
): PayToken {
  const expires = Math.floor(now.getTime() / 1000) + Math.round(ttlDays * 86400);
  const payload = Buffer.alloc(PAYLOAD_BYTES);
  uuidBytes(invoiceId).copy(payload, 0);
  payload.writeUInt32BE(expires, 16);
  return {
    token: `${payload.toString('base64url')}.${sign(payload, secret).toString('base64url')}`,
    expiresAt: new Date(expires * 1000),
  };
}

export function verifyPayToken(
  token: string,
  secret: string,
  now: Date = new Date(),
): { invoiceId: string; expiresAt: Date } | null {
  const match = typeof token === 'string' ? TOKEN.exec(token) : null;
  if (!match) {
    return null;
  }
  const payload = Buffer.from(match[1]!, 'base64url');
  const signature = Buffer.from(match[2]!, 'base64url');
  // Reject non-canonical encodings so each invoice has exactly one valid spelling.
  if (
    payload.length !== PAYLOAD_BYTES ||
    signature.length !== SIGNATURE_BYTES ||
    payload.toString('base64url') !== match[1] ||
    signature.toString('base64url') !== match[2]
  ) {
    return null;
  }
  if (!timingSafeEqual(signature, sign(payload, secret))) {
    return null;
  }
  const expires = payload.readUInt32BE(16);
  if (expires * 1000 <= now.getTime()) {
    return null;
  }
  return { invoiceId: bytesToUuid(payload.subarray(0, 16)), expiresAt: new Date(expires * 1000) };
}
