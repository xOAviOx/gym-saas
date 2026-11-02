import { copy } from '@/lib/copy';
import type { Paise } from '@/lib/money';

const words = copy.numberWords;

function belowHundred(n: number): string {
  if (n < 20) return words.ones[n]!;
  const unit = n % 10;
  return unit
    ? `${words.tens[Math.floor(n / 10)]} ${words.ones[unit]}`
    : words.tens[Math.floor(n / 10)]!;
}

function belowThousand(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  return [
    hundreds ? `${words.ones[hundreds]} ${words.hundred}` : '',
    rest ? belowHundred(rest) : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/** Whole number in the Indian system: 1,25,000 → "One Lakh Twenty Five Thousand". */
export function indianNumberWords(value: number): string {
  const n = Math.floor(Math.abs(value));
  if (n === 0) return words.zero;
  const crore = Math.floor(n / 1_00_00_000);
  const lakh = Math.floor(n / 1_00_000) % 100;
  const thousand = Math.floor(n / 1000) % 100;
  const rest = n % 1000;
  return [
    crore ? `${indianNumberWords(crore)} ${words.crore}` : '',
    lakh ? `${belowHundred(lakh)} ${words.lakh}` : '',
    thousand ? `${belowHundred(thousand)} ${words.thousand}` : '',
    rest ? belowThousand(rest) : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/** "Indian Rupees One Thousand Four Hundred and Fifty Paise Only" for invoices. */
export function amountInWords(paise: Paise): string {
  const total = Math.round(Math.abs(paise));
  const rupees = Math.floor(total / 100);
  const rest = total % 100;
  return words.amount(indianNumberWords(rupees), rest ? belowHundred(rest) : null);
}
