const E164 = /^\+[1-9][0-9]{7,14}$/;
const INDIAN_MOBILE = /^[6-9][0-9]{9}$/;

/**
 * Normalises what people type into a phone field to E.164.
 * "98765 43210", "098765-43210", "91 9876543210", "+91 98765 43210" → "+919876543210".
 * Numbers that already carry a non-Indian country code pass through when valid.
 * Returns null when the input is not a valid number.
 */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');

  if (hasPlus && !digits.startsWith('91')) {
    const candidate = `+${digits}`;
    return E164.test(candidate) ? candidate : null;
  }

  let national = digits;
  if (national.startsWith('0091')) {
    national = national.slice(4);
  } else if (national.length === 12 && national.startsWith('91')) {
    national = national.slice(2);
  } else if (national.length === 11 && national.startsWith('0')) {
    national = national.slice(1);
  }

  return INDIAN_MOBILE.test(national) ? `+91${national}` : null;
}

export function isE164(value: string): boolean {
  return E164.test(value);
}

/** "+919876543210" → "+91 98765 43210"; other countries keep their raw E.164 form. */
export function formatPhone(e164: string): string {
  if (/^\+91[6-9][0-9]{9}$/.test(e164)) {
    return `+91 ${e164.slice(3, 8)} ${e164.slice(8)}`;
  }
  return e164;
}

/** The national 10-digit form for display in dense lists. */
export function formatPhoneNational(e164: string): string {
  if (/^\+91[0-9]{10}$/.test(e164)) {
    return `${e164.slice(3, 8)} ${e164.slice(8)}`;
  }
  return e164;
}

export function telUrl(e164: string): string {
  return `tel:${e164}`;
}

/** WhatsApp click-to-chat link with an optional prefilled message. */
export function waMeUrl(e164: string, text?: string): string {
  const number = e164.replace(/\D/g, '');
  const base = `https://wa.me/${number}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}
