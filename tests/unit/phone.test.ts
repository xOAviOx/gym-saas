import { describe, expect, it } from 'vitest';

import { formatPhone, formatPhoneNational, isE164, normalizePhone, waMeUrl } from '@/lib/phone';

describe('normalizePhone', () => {
  it('normalises Indian mobiles in every common shape', () => {
    expect(normalizePhone('9876543210')).toBe('+919876543210');
    expect(normalizePhone('98765 43210')).toBe('+919876543210');
    expect(normalizePhone('098765-43210')).toBe('+919876543210');
    expect(normalizePhone('91 9876543210')).toBe('+919876543210');
    expect(normalizePhone('+91 98765 43210')).toBe('+919876543210');
    expect(normalizePhone('0091 9876543210')).toBe('+919876543210');
  });

  it('rejects numbers that are not valid mobiles', () => {
    expect(normalizePhone('12345')).toBeNull();
    expect(normalizePhone('1234567890')).toBeNull();
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('abc')).toBeNull();
  });

  it('passes through other valid E.164 numbers', () => {
    expect(normalizePhone('+971501234567')).toBe('+971501234567');
    expect(normalizePhone('+1 (415) 555-2671')).toBe('+14155552671');
  });
});

describe('formatPhone', () => {
  it('formats Indian numbers for reading', () => {
    expect(formatPhone('+919876543210')).toBe('+91 98765 43210');
    expect(formatPhoneNational('+919876543210')).toBe('98765 43210');
    expect(formatPhone('+971501234567')).toBe('+971501234567');
  });
});

describe('waMeUrl / isE164', () => {
  it('builds click-to-chat links with an encoded message', () => {
    expect(waMeUrl('+919876543210')).toBe('https://wa.me/919876543210');
    expect(waMeUrl('+919876543210', 'Hi Ravi, ₹500 is pending')).toBe(
      'https://wa.me/919876543210?text=Hi%20Ravi%2C%20%E2%82%B9500%20is%20pending',
    );
  });

  it('validates E.164', () => {
    expect(isE164('+919876543210')).toBe(true);
    expect(isE164('919876543210')).toBe(false);
  });
});
