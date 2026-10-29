import { divRound, type Paise } from '@/lib/money';

export const SAC_CODE = '999723';
export const DEFAULT_GST_RATE = 5;

export type GstSplit = {
  taxable: Paise;
  cgst: Paise;
  sgst: Paise;
  total: Paise;
  rate: number;
};

/**
 * Splits a GST-inclusive total into taxable value, CGST and SGST while keeping
 * the total exact. Mirrors the SQL function split_gst():
 * taxable = round(total / (1 + r/100)); tax = total − taxable; cgst = round(tax / 2); sgst = tax − cgst.
 */
export function splitGst(totalPaise: Paise, ratePercent: number): GstSplit {
  const total = Math.round(totalPaise);
  if (!ratePercent || ratePercent <= 0) {
    return { taxable: total, cgst: 0, sgst: 0, total, rate: 0 };
  }
  // Work in basis points so 5.00% stays exact: total × 10000 / (10000 + rate × 100).
  const rateBp = Math.round(ratePercent * 100);
  const taxable = divRound(total * 10000, 10000 + rateBp);
  const tax = total - taxable;
  const cgst = divRound(tax, 2);
  const sgst = tax - cgst;
  return { taxable, cgst, sgst, total, rate: ratePercent };
}

export function invoiceTitle(gstEnabled: boolean): 'Tax Invoice' | 'Receipt' {
  return gstEnabled ? 'Tax Invoice' : 'Receipt';
}

export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function isValidGstin(value: string): boolean {
  return GSTIN_REGEX.test(value.trim().toUpperCase());
}
