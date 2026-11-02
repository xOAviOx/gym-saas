import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM envelope for per-gym credentials: `v1.<iv>.<ciphertext>.<tag>`
 * (base64url parts). The context (for example `cashfree:<orgId>`) is bound as
 * additional authenticated data, so ciphertext copied to another gym or
 * another purpose fails to decrypt.
 */
const VERSION = 'v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;

export function parseSecretKey(base64: string): Buffer {
  const key = Buffer.from(base64, 'base64');
  if (key.length !== 32) {
    throw new Error('SECRETS_ENCRYPTION_KEY must decode to exactly 32 bytes');
  }
  return key;
}

function additionalData(context: string): Buffer {
  return Buffer.from(`gymdesk:${context}`, 'utf8');
}

export function sealSecret(plaintext: string, key: Buffer, context: string): string {
  if (!plaintext) {
    throw new Error('Refusing to encrypt an empty secret');
  }
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(additionalData(context));
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [
    VERSION,
    iv.toString('base64url'),
    body.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
  ].join('.');
}

export function openSecret(sealed: string, key: Buffer, context: string): string {
  const parts = sealed.split('.');
  const [version, iv, body, tag] = parts;
  if (parts.length !== 4 || version !== VERSION || !iv || !body || !tag) {
    throw new Error('Unrecognised secret format');
  }
  const ivBytes = Buffer.from(iv, 'base64url');
  const tagBytes = Buffer.from(tag, 'base64url');
  if (ivBytes.length !== IV_BYTES || tagBytes.length !== TAG_BYTES) {
    throw new Error('Unrecognised secret format');
  }
  const decipher = createDecipheriv('aes-256-gcm', key, ivBytes, { authTagLength: TAG_BYTES });
  decipher.setAAD(additionalData(context));
  decipher.setAuthTag(tagBytes);
  return Buffer.concat([
    decipher.update(Buffer.from(body, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
