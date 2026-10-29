import { describe, expect, it } from 'vitest';

import { invoiceTitle, isValidGstin, splitGst } from '@/lib/gst';

describe('splitGst', () => {
  it('splits an inclusive ₹1,500 at 5% exactly like the SQL function', () => {
    const split = splitGst(150000, 5);
    expect(split.taxable).toBe(142857);
    expect(split.cgst).toBe(3572);
    expect(split.sgst).toBe(3571);
    expect(split.taxable + split.cgst + split.sgst).toBe(150000);
  });

  it('keeps the total exact for many amounts and rates', () => {
    const rates = [5, 12, 18, 28, 0.25];
    for (let total = 1; total < 200000; total += 997) {
      for (const rate of rates) {
        const split = splitGst(total, rate);
        expect(split.taxable + split.cgst + split.sgst).toBe(total);
        expect(Math.abs(split.cgst - split.sgst)).toBeLessThanOrEqual(1);
        expect(split.taxable).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('returns no tax when GST is off', () => {
    expect(splitGst(150000, 0)).toEqual({
      taxable: 150000,
      cgst: 0,
      sgst: 0,
      total: 150000,
      rate: 0,
    });
  });

  it('handles an annual plan at 5%', () => {
    const split = splitGst(1200000, 5);
    expect(split.taxable).toBe(1142857);
    expect(split.cgst + split.sgst).toBe(57143);
  });
});

describe('invoiceTitle', () => {
  it('is a Tax Invoice only with GST on', () => {
    expect(invoiceTitle(true)).toBe('Tax Invoice');
    expect(invoiceTitle(false)).toBe('Receipt');
  });
});

describe('isValidGstin', () => {
  it('accepts a well-formed GSTIN', () => {
    expect(isValidGstin('27ABCDE1234F1Z5')).toBe(true);
    expect(isValidGstin(' 27abcde1234f1z5 ')).toBe(true);
  });

  it('rejects malformed values', () => {
    expect(isValidGstin('27ABCDE1234F1Z')).toBe(false);
    expect(isValidGstin('27ABCDE1234F1X5')).toBe(false);
    expect(isValidGstin('')).toBe(false);
  });
});
