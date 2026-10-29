/**
 * Money is handled as integer paise everywhere in TypeScript. The database
 * stores numeric(10,2) rupees; convert at the boundary with toPaise/fromPaise.
 */
export type Paise = number;

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const inrFormatterWithDecimals = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 2,
});

/** Converts a rupee amount (number from the database, or a string) to paise. */
export function toPaise(rupees: number | string): Paise {
  const value = typeof rupees === 'string' ? Number(rupees) : rupees;
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid rupee amount: ${String(rupees)}`);
  }
  return Math.round(value * 100);
}

/** Converts paise to a rupee number with at most two decimals (for the database). */
export function fromPaise(paise: Paise): number {
  return Math.round(paise) / 100;
}

/** Rupees as a fixed two-decimal string, e.g. for UPI `am=` and CSV exports. */
export function toRupeeString(paise: Paise): string {
  const abs = Math.abs(Math.round(paise));
  const rupees = Math.floor(abs / 100);
  const rest = abs % 100;
  return `${paise < 0 ? '-' : ''}${rupees}.${rest.toString().padStart(2, '0')}`;
}

export type MoneyFormat = 'auto' | 'always' | 'never';

/**
 * Indian grouping with the rupee symbol: 125000 paise → "₹1,250"; 12500050 → "₹1,25,000.50".
 * `decimals: 'auto'` shows paise only when they are non-zero.
 */
export function formatMoney(paise: Paise, decimals: MoneyFormat = 'auto'): string {
  const rounded = Math.round(paise);
  const hasPaise = rounded % 100 !== 0;
  const useDecimals = decimals === 'always' || (decimals === 'auto' && hasPaise);
  const formatter = useDecimals ? inrFormatterWithDecimals : inrFormatter;
  const formatted = formatter.format(Math.abs(rounded) / 100);
  return rounded < 0 ? `-${formatted}` : formatted;
}

/** Plain Indian number grouping without a symbol: 125000 → "1,25,000". */
export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

const MONEY_INPUT = /^\d{1,8}(\.\d{1,2})?$/;

/**
 * Parses what a person types into an amount field ("₹1,500", "1500.5", " 1 500 ").
 * Returns null when the input is not a valid non-negative amount.
 */
export function parseMoneyInput(input: string): Paise | null {
  const cleaned = input.replace(/[₹,\s]/g, '').replace(/^Rs\.?/i, '');
  if (!MONEY_INPUT.test(cleaned)) {
    return null;
  }
  const [whole, fraction = ''] = cleaned.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

export function sumPaise(values: Iterable<Paise>): Paise {
  let total = 0;
  for (const v of values) {
    total += Math.round(v);
  }
  return total;
}

/** Integer division rounded half away from zero, matching Postgres round(). */
export function divRound(numerator: number, denominator: number): number {
  const sign = Math.sign(numerator) * Math.sign(denominator) || 1;
  const n = Math.abs(numerator);
  const d = Math.abs(denominator);
  const q = Math.floor(n / d);
  const r = n - q * d;
  return sign * (r * 2 >= d ? q + 1 : q);
}
