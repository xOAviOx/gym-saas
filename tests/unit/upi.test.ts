import { describe, expect, it } from 'vitest';

import { buildStaticUpiUri, buildUpiUri, isValidUpiId, isValidUtr, upiNote } from '@/lib/upi';

describe('buildUpiUri', () => {
  it('builds the standard pay intent with a two-decimal amount', () => {
    const uri = buildUpiUri({
      vpa: 'irontemple@okaxis',
      payeeName: 'Iron Temple Fitness',
      amount: 150000,
      note: 'ITF/25-26/0001 M-0001',
    });
    expect(uri).toBe(
      'upi://pay?pa=irontemple%40okaxis&pn=Iron%20Temple%20Fitness&am=1500.00&cu=INR&tn=ITF%2F25-26%2F0001%20M-0001',
    );
  });

  it('formats paise amounts without floating point noise', () => {
    expect(buildUpiUri({ vpa: 'ab@bank', payeeName: 'X', amount: 99, note: 'n' })).toContain(
      'am=0.99',
    );
    expect(buildUpiUri({ vpa: 'ab@bank', payeeName: 'X', amount: 100005, note: 'n' })).toContain(
      'am=1000.05',
    );
  });

  it('percent-encodes reserved characters in the payee name and note', () => {
    const uri = buildUpiUri({
      vpa: 'ab@bank',
      payeeName: 'Fit & Fine',
      amount: 100,
      note: 'A=B&C',
    });
    expect(uri).toContain('pn=Fit%20%26%20Fine');
    expect(uri).toContain('tn=A%3DB%26C');
    expect(uri).not.toContain('+');
  });

  it('trims the note to 40 characters', () => {
    const uri = buildUpiUri({ vpa: 'ab@bank', payeeName: 'X', amount: 100, note: 'x'.repeat(60) });
    const tn = new URL(uri.replace('upi://', 'https://')).searchParams.get('tn');
    expect(tn).toHaveLength(40);
  });

  it('rejects an invalid UPI ID or amount', () => {
    expect(() => buildUpiUri({ vpa: 'bad', payeeName: 'X', amount: 100, note: 'n' })).toThrow();
    expect(() => buildUpiUri({ vpa: 'ab@bank', payeeName: 'X', amount: 0, note: 'n' })).toThrow();
    expect(() =>
      buildUpiUri({ vpa: 'ab@bank', payeeName: 'X', amount: 10.5, note: 'n' }),
    ).toThrow();
  });
});

describe('buildStaticUpiUri', () => {
  it('omits the amount for counter posters', () => {
    expect(buildStaticUpiUri({ vpa: 'irontemple@okaxis', payeeName: 'Iron Temple' })).toBe(
      'upi://pay?pa=irontemple%40okaxis&pn=Iron%20Temple&cu=INR',
    );
  });
});

describe('upiNote', () => {
  it('combines invoice number and member code', () => {
    expect(upiNote('ITF/25-26/0001', 'M-0001')).toBe('ITF/25-26/0001 M-0001');
  });
});

describe('isValidUpiId', () => {
  it('accepts common handles', () => {
    expect(isValidUpiId('name@okaxis')).toBe(true);
    expect(isValidUpiId('9876543210@ybl')).toBe(true);
    expect(isValidUpiId('iron.temple-01@icici')).toBe(true);
  });

  it('rejects malformed handles', () => {
    expect(isValidUpiId('ab@bank')).toBe(true);
    expect(isValidUpiId('a@bank')).toBe(false);
    expect(isValidUpiId('ab@b')).toBe(false);
    expect(isValidUpiId('@okaxis')).toBe(false);
    expect(isValidUpiId('name@')).toBe(false);
    expect(isValidUpiId('name@ok1')).toBe(false);
    expect(isValidUpiId('name okaxis')).toBe(false);
    expect(isValidUpiId('')).toBe(false);
  });
});

describe('isValidUtr', () => {
  it('requires exactly twelve digits', () => {
    expect(isValidUtr('123456789012')).toBe(true);
    expect(isValidUtr('12345678901')).toBe(false);
    expect(isValidUtr('1234567890123')).toBe(false);
    expect(isValidUtr('12345678901a')).toBe(false);
  });
});
