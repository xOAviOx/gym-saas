import { describe, expect, it } from 'vitest';

import {
  divRound,
  formatMoney,
  formatNumber,
  fromPaise,
  parseMoneyInput,
  sumPaise,
  toPaise,
  toRupeeString,
} from '@/lib/money';

describe('toPaise / fromPaise', () => {
  it('converts database rupees to integer paise', () => {
    expect(toPaise(1500)).toBe(150000);
    expect(toPaise('1500.50')).toBe(150050);
    expect(toPaise(0.1 + 0.2)).toBe(30);
  });

  it('round-trips through fromPaise', () => {
    expect(fromPaise(150050)).toBe(1500.5);
    expect(toPaise(fromPaise(123456789))).toBe(123456789);
  });

  it('rejects non-numeric input', () => {
    expect(() => toPaise('abc')).toThrow();
  });
});

describe('formatMoney', () => {
  it('uses Indian grouping with the rupee symbol', () => {
    expect(formatMoney(12500000)).toBe('₹1,25,000');
    expect(formatMoney(150000)).toBe('₹1,500');
    expect(formatMoney(0)).toBe('₹0');
  });

  it('shows paise only when present in auto mode', () => {
    expect(formatMoney(12500050)).toBe('₹1,25,000.50');
    expect(formatMoney(12500000, 'always')).toBe('₹1,25,000.00');
    expect(formatMoney(12500050, 'never')).toBe('₹1,25,001');
  });

  it('formats negatives (reversals) with a leading minus', () => {
    expect(formatMoney(-50000)).toBe('-₹500');
  });
});

describe('formatNumber', () => {
  it('groups in lakhs and crores', () => {
    expect(formatNumber(125000)).toBe('1,25,000');
    expect(formatNumber(12345678)).toBe('1,23,45,678');
  });
});

describe('toRupeeString', () => {
  it('always has two decimals for UPI and exports', () => {
    expect(toRupeeString(150000)).toBe('1500.00');
    expect(toRupeeString(99)).toBe('0.99');
    expect(toRupeeString(100005)).toBe('1000.05');
    expect(toRupeeString(-50000)).toBe('-500.00');
  });
});

describe('parseMoneyInput', () => {
  it('accepts what people type', () => {
    expect(parseMoneyInput('1500')).toBe(150000);
    expect(parseMoneyInput('₹1,500')).toBe(150000);
    expect(parseMoneyInput(' 1 500.5 ')).toBe(150050);
    expect(parseMoneyInput('Rs. 999.99')).toBe(99999);
    expect(parseMoneyInput('0')).toBe(0);
  });

  it('rejects malformed amounts', () => {
    expect(parseMoneyInput('')).toBeNull();
    expect(parseMoneyInput('-100')).toBeNull();
    expect(parseMoneyInput('12.345')).toBeNull();
    expect(parseMoneyInput('abc')).toBeNull();
    expect(parseMoneyInput('1e5')).toBeNull();
  });
});

describe('sumPaise / divRound', () => {
  it('sums an iterable', () => {
    expect(sumPaise([100, 250, -50])).toBe(300);
  });

  it('rounds half away from zero like Postgres', () => {
    expect(divRound(7, 2)).toBe(4);
    expect(divRound(5, 2)).toBe(3);
    expect(divRound(-7, 2)).toBe(-4);
    expect(divRound(10, 3)).toBe(3);
    expect(divRound(11, 3)).toBe(4);
  });
});
