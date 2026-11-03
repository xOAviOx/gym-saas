import { createHmac, timingSafeEqual } from 'node:crypto';

const PREFIX = 'GDM1';
const PAYLOAD_BYTES = 20; // 16-byte member id + 4-byte QR version
const SIGNATURE_BYTES = 16;
const TOKEN = /^GDM1\.([A-Za-z0-9_-]{27})\.([A-Za-z0-9_-]{22})$/;
/** Card pages carry the same token, so scanning a card link also works. */
const CARD_URL = /\/p\/card\/(GDM1\.[A-Za-z0-9_-]{27}\.[A-Za-z0-9_-]{22})(?:[/?#]|$)/;

/** A purpose-specific key, so a check-in signature can never be replayed as another token type. */
function signingKey(secret: string): Buffer {
  return createHmac('sha256', secret).update('gymdesk:checkin-qr:v1').digest();
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
    throw new Error('Invalid member id');
  }
  return Buffer.from(hex, 'hex');
}

function bytesToUuid(bytes: Buffer): string {
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Member check-in code: `GDM1.<payload>.<signature>` (55 characters). It does not
 * expire like a membership card; bumping the member's QR version stops old codes.
 */
export function createMemberQrToken(memberId: string, version: number, secret: string): string {
  if (!Number.isInteger(version) || version < 1 || version > 0xffffffff) {
    throw new Error('Invalid QR version');
  }
  const payload = Buffer.alloc(PAYLOAD_BYTES);
  uuidBytes(memberId).copy(payload, 0);
  payload.writeUInt32BE(version, 16);
  return `${PREFIX}.${payload.toString('base64url')}.${sign(payload, secret).toString('base64url')}`;
}

export function verifyMemberQrToken(
  token: string,
  secret: string,
): { memberId: string; version: number } | null {
  const match = typeof token === 'string' ? TOKEN.exec(token) : null;
  if (!match) {
    return null;
  }
  const payload = Buffer.from(match[1]!, 'base64url');
  const signature = Buffer.from(match[2]!, 'base64url');
  // Reject non-canonical encodings so each code has exactly one valid spelling.
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
  return { memberId: bytesToUuid(payload.subarray(0, 16)), version: payload.readUInt32BE(16) };
}

/** Pulls a check-in token out of whatever a camera read: the raw code or a card link. */
export function extractQrToken(scanned: string): string | null {
  if (typeof scanned !== 'string' || scanned.length > 500) {
    return null;
  }
  const text = scanned.trim();
  if (TOKEN.test(text)) {
    return text;
  }
  return CARD_URL.exec(text)?.[1] ?? null;
}
