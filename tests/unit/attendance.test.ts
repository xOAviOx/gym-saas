import { describe, expect, it } from 'vitest';

import {
  firstName,
  hourlyCounts,
  parseCheckInResult,
  parseKioskLookup,
} from '@/features/attendance/outcome';
import {
  checkInSchema,
  kioskCheckInSchema,
  kioskPinSchema,
  pairKioskSchema,
} from '@/features/attendance/schema';
import { createKioskToken, hashKioskToken } from '@/lib/attendance/kiosk-token';
import {
  createMemberQrToken,
  extractQrToken,
  verifyMemberQrToken,
} from '@/lib/attendance/qr-token';
import { qrPngDataUrl } from '@/lib/qr';

const SECRET = 'test-portal-secret-with-enough-length';
const MEMBER = '3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b';

describe('member QR tokens', () => {
  it('generates a real PNG for the QR download', async () => {
    const url = await qrPngDataUrl(createMemberQrToken(MEMBER, 1, SECRET));
    expect(url.startsWith('data:image/png;base64,')).toBe(true);
    const bytes = Buffer.from(url.split(',')[1]!, 'base64');
    expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(bytes.readUInt32BE(16)).toBe(1024);
  });
  it('round-trips the member id and version', () => {
    const token = createMemberQrToken(MEMBER, 3, SECRET);
    expect(token).toMatch(/^GDM1\.[A-Za-z0-9_-]{27}\.[A-Za-z0-9_-]{22}$/);
    expect(token).toHaveLength(55);
    expect(verifyMemberQrToken(token, SECRET)).toEqual({ memberId: MEMBER, version: 3 });
  });

  it('gives each version a different code', () => {
    expect(createMemberQrToken(MEMBER, 1, SECRET)).not.toBe(createMemberQrToken(MEMBER, 2, SECRET));
  });

  it('rejects another secret, tampering and junk', () => {
    const token = createMemberQrToken(MEMBER, 1, SECRET);
    expect(verifyMemberQrToken(token, 'another-secret-entirely-different')).toBeNull();
    const [prefix, payload, signature] = token.split('.') as [string, string, string];
    const flipped = payload[0] === 'A' ? `B${payload.slice(1)}` : `A${payload.slice(1)}`;
    expect(verifyMemberQrToken(`${prefix}.${flipped}.${signature}`, SECRET)).toBeNull();
    expect(verifyMemberQrToken(`GDM2.${payload}.${signature}`, SECRET)).toBeNull();
    expect(verifyMemberQrToken('', SECRET)).toBeNull();
    expect(verifyMemberQrToken(MEMBER, SECRET)).toBeNull();
  });

  it('rejects non-canonical base64url spellings', () => {
    const token = createMemberQrToken(MEMBER, 1, SECRET);
    const [prefix, payload, signature] = token.split('.') as [string, string, string];
    // The last character of a 22-char signature only carries 2 data bits; changing the padding bits
    // decodes to the same bytes but must not be accepted.
    const last = signature.at(-1)!;
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const sibling = alphabet[alphabet.indexOf(last) ^ 1]!;
    const variant = `${prefix}.${payload}.${signature.slice(0, -1)}${sibling}`;
    expect(verifyMemberQrToken(variant, SECRET)).toBeNull();
  });

  it('refuses bad inputs when creating', () => {
    expect(() => createMemberQrToken('not-a-uuid', 1, SECRET)).toThrow();
    expect(() => createMemberQrToken(MEMBER, 0, SECRET)).toThrow();
    expect(() => createMemberQrToken(MEMBER, 1.5, SECRET)).toThrow();
  });

  it('extracts the token from a raw scan or a card link', () => {
    const token = createMemberQrToken(MEMBER, 1, SECRET);
    expect(extractQrToken(token)).toBe(token);
    expect(extractQrToken(`  ${token}\n`)).toBe(token);
    expect(extractQrToken(`https://app.gymdesk.in/p/card/${token}`)).toBe(token);
    expect(extractQrToken(`https://app.gymdesk.in/p/card/${token}?ref=wa`)).toBe(token);
    expect(extractQrToken(`https://app.gymdesk.in/p/card/${token}extra`)).toBeNull();
    expect(extractQrToken('https://example.com')).toBeNull();
    expect(extractQrToken('x'.repeat(501))).toBeNull();
  });
});

describe('kiosk device tokens', () => {
  it('creates a 43-character token and stores only its hash', () => {
    const { token, hash } = createKioskToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashKioskToken(token)).toBe(hash);
    expect(createKioskToken().token).not.toBe(token);
  });

  it('ignores missing or malformed cookies', () => {
    expect(hashKioskToken(undefined)).toBeNull();
    expect(hashKioskToken(null)).toBeNull();
    expect(hashKioskToken('')).toBeNull();
    expect(hashKioskToken('short')).toBeNull();
    expect(hashKioskToken(`${'a'.repeat(42)}=`)).toBeNull();
  });
});

describe('parseCheckInResult', () => {
  const member = {
    id: MEMBER,
    full_name: 'Priya Sharma',
    member_code: 'M-0042',
    status: 'active',
    flag: null,
    end_date: '2026-12-31',
    sessions_total: 12,
    sessions_used: 5,
    balance_due: '500.50',
    photo_url: null,
  };

  it('parses a fresh check-in', () => {
    const parsed = parseCheckInResult({
      result: 'checked_in',
      overridden: false,
      check_in: { checked_in_at: '2026-11-03T04:30:00Z', flag: 'dues_pending' },
      member,
    });
    expect(parsed).toEqual({
      result: 'checked_in',
      pinError: null,
      overridden: false,
      checkedInAt: '2026-11-03T04:30:00Z',
      member: {
        id: MEMBER,
        name: 'Priya Sharma',
        code: 'M-0042',
        status: 'active',
        flag: 'dues_pending',
        endDate: '2026-12-31',
        sessionsLeft: 7,
        balanceDue: 50050,
        photoPath: null,
      },
    });
  });

  it('parses a blocked result with a PIN error', () => {
    const parsed = parseCheckInResult({
      result: 'blocked',
      pin_error: 'invalid',
      member: { ...member, status: 'expired', sessions_total: null },
    });
    expect(parsed.result).toBe('blocked');
    expect(parsed.pinError).toBe('invalid');
    expect(parsed.checkedInAt).toBeNull();
    expect(parsed.member.sessionsLeft).toBeNull();
    expect(parsed.member.status).toBe('expired');
  });

  it('drops unknown enum values instead of trusting them', () => {
    const parsed = parseCheckInResult({
      result: 'duplicate',
      pin_error: 'something',
      member: { ...member, status: 'weird', flag: 'nope', sessions_used: 99 },
    });
    expect(parsed.pinError).toBeNull();
    expect(parsed.member.status).toBe('new');
    expect(parsed.member.flag).toBeNull();
    expect(parsed.member.sessionsLeft).toBe(0);
  });

  it('throws on a malformed response', () => {
    expect(() => parseCheckInResult(null)).toThrow();
    expect(() => parseCheckInResult({ result: 'checked_in' })).toThrow();
    expect(() => parseCheckInResult({ result: 'maybe', member })).toThrow();
  });
});

describe('kiosk helpers', () => {
  it('greets by first name', () => {
    expect(firstName('  Priya   Sharma ')).toBe('Priya');
    expect(firstName('Arjun')).toBe('Arjun');
    expect(firstName('')).toBe('');
  });

  it('reads member codes and phone numbers from the keypad', () => {
    expect(parseKioskLookup('M-0042')).toEqual({ kind: 'code', code: 'M-0042' });
    expect(parseKioskLookup('m42')).toEqual({ kind: 'code', code: 'M-0042' });
    expect(parseKioskLookup('M12345')).toEqual({ kind: 'code', code: 'M-12345' });
    expect(parseKioskLookup('98765 43210')).toEqual({ kind: 'phone', digits: '9876543210' });
    expect(parseKioskLookup('+91 98765-43210')).toEqual({ kind: 'phone', digits: '919876543210' });
    expect(parseKioskLookup('12345')).toBeNull();
    expect(parseKioskLookup('abc')).toBeNull();
    expect(parseKioskLookup('9876543210; drop')).toBeNull();
  });

  it('buckets check-ins by IST hour and ignores out-of-range hours', () => {
    const counts = hourlyCounts([6, 6, 7, 18, 23, 24, -1, 6.5]);
    expect(counts).toHaveLength(24);
    expect(counts[6]).toBe(2);
    expect(counts[7]).toBe(1);
    expect(counts[18]).toBe(1);
    expect(counts[23]).toBe(1);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(5);
  });
});

describe('attendance schemas', () => {
  it('accepts a 4-6 digit PIN only', () => {
    expect(checkInSchema.safeParse({ memberId: MEMBER, pin: '1234' }).success).toBe(true);
    expect(checkInSchema.safeParse({ memberId: MEMBER, pin: '123456' }).success).toBe(true);
    expect(checkInSchema.safeParse({ memberId: MEMBER, pin: '123' }).success).toBe(false);
    expect(checkInSchema.safeParse({ memberId: MEMBER, pin: '1234567' }).success).toBe(false);
    expect(checkInSchema.safeParse({ memberId: MEMBER, pin: '12a4' }).success).toBe(false);
    expect(checkInSchema.safeParse({ memberId: MEMBER, extra: 1 }).success).toBe(false);
  });

  it('needs exactly one of a QR code or a typed lookup at the kiosk', () => {
    expect(kioskCheckInSchema.safeParse({ code: 'GDM1.x.y' }).success).toBe(true);
    expect(kioskCheckInSchema.safeParse({ lookup: 'M-0042' }).success).toBe(true);
    expect(kioskCheckInSchema.safeParse({}).success).toBe(false);
    expect(kioskCheckInSchema.safeParse({ code: 'GDM1.x.y', lookup: 'M-0042' }).success).toBe(
      false,
    );
  });

  it('requires the repeated PIN to match', () => {
    expect(kioskPinSchema.safeParse({ pin: '2468', confirm: '2468' }).success).toBe(true);
    const mismatch = kioskPinSchema.safeParse({ pin: '2468', confirm: '2469' });
    expect(mismatch.success).toBe(false);
    expect(mismatch.error?.issues[0]?.path).toEqual(['confirm']);
  });

  it('trims and limits kiosk device names', () => {
    expect(pairKioskSchema.parse({ label: '  Front desk  ' })).toEqual({ label: 'Front desk' });
    expect(pairKioskSchema.safeParse({ label: '   ' }).success).toBe(false);
    expect(pairKioskSchema.safeParse({ label: 'x'.repeat(41) }).success).toBe(false);
  });
});
