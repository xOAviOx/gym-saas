import { toRupeeString, type Paise } from '@/lib/money';

export const UPI_ID_REGEX = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/;
export const UTR_REGEX = /^[0-9]{12}$/;
export const UPI_NOTE_MAX_LENGTH = 40;

export function isValidUpiId(value: string): boolean {
  return UPI_ID_REGEX.test(value.trim());
}

export function isValidUtr(value: string): boolean {
  return UTR_REGEX.test(value.trim());
}

export type UpiPaymentParams = {
  vpa: string;
  payeeName: string;
  /** Amount in paise; must be positive. */
  amount: Paise;
  /** Transaction note, trimmed to 40 characters. */
  note: string;
};

/**
 * Builds a dynamic UPI deep link: upi://pay?pa=&pn=&am=&cu=INR&tn=
 * Always called on the server with the gym's saved UPI settings.
 */
export function buildUpiUri({ vpa, payeeName, amount, note }: UpiPaymentParams): string {
  const cleanVpa = vpa.trim();
  if (!isValidUpiId(cleanVpa)) {
    throw new Error('Invalid UPI ID');
  }
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error('UPI amount must be a positive integer number of paise');
  }
  const params = new URLSearchParams();
  params.set('pa', cleanVpa);
  params.set('pn', payeeName.trim());
  params.set('am', toRupeeString(amount));
  params.set('cu', 'INR');
  params.set('tn', normalizeUpiNote(note));
  return `upi://pay?${encodeParams(params)}`;
}

/** Static QR for the counter poster: no amount, the member types it in. */
export function buildStaticUpiUri({ vpa, payeeName }: { vpa: string; payeeName: string }): string {
  const cleanVpa = vpa.trim();
  if (!isValidUpiId(cleanVpa)) {
    throw new Error('Invalid UPI ID');
  }
  const params = new URLSearchParams();
  params.set('pa', cleanVpa);
  params.set('pn', payeeName.trim());
  params.set('cu', 'INR');
  return `upi://pay?${encodeParams(params)}`;
}

/** Note shown in the payer's UPI app: invoice number and member code, ≤ 40 chars. */
export function upiNote(invoiceNumber: string, memberCode: string): string {
  return normalizeUpiNote(`${invoiceNumber} ${memberCode}`);
}

function normalizeUpiNote(note: string): string {
  return note.replace(/\s+/g, ' ').trim().slice(0, UPI_NOTE_MAX_LENGTH);
}

/**
 * URLSearchParams encodes spaces as "+", which some UPI apps show literally.
 * Percent-encode spaces instead so names render correctly.
 */
function encodeParams(params: URLSearchParams): string {
  return params.toString().replace(/\+/g, '%20');
}
