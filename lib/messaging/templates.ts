import { copy } from '@/lib/copy';
import { formatDate, parseDateOnly, type DateOnly } from '@/lib/dates';

export const MESSAGE_KINDS = [
  'membership_expiring',
  'membership_expired',
  'dues_overdue',
  'payment_receipt',
  'welcome',
  'birthday',
] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

export const MESSAGE_LANGUAGES = ['en', 'hi'] as const;
export type MessageLanguage = (typeof MESSAGE_LANGUAGES)[number];

export const TEMPLATE_VARIABLES = {
  membership_expiring: ['name', 'gym', 'plan', 'date', 'days'],
  membership_expired: ['name', 'gym', 'plan', 'date'],
  dues_overdue: ['name', 'gym', 'amount', 'invoice', 'date', 'link'],
  payment_receipt: ['name', 'gym', 'amount', 'invoice', 'balance', 'link'],
  welcome: ['name', 'gym', 'code', 'link'],
  birthday: ['name', 'gym'],
} as const satisfies Record<MessageKind, readonly string[]>;

export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[MessageKind][number];
export type MessageVariables = Partial<Record<TemplateVariable, string>>;

/** Meta asks for a category per template; birthday wishes are promotional. */
export const META_CATEGORY: Record<MessageKind, 'utility' | 'marketing'> = {
  membership_expiring: 'utility',
  membership_expired: 'utility',
  dues_overdue: 'utility',
  payment_receipt: 'utility',
  welcome: 'utility',
  birthday: 'marketing',
};

export const MAX_TEMPLATE_LENGTH = 1000;

const TOKEN = /\{([a-z]+)\}/g;

export function isMessageKind(value: string): value is MessageKind {
  return (MESSAGE_KINDS as readonly string[]).includes(value);
}

export function isMessageLanguage(value: string): value is MessageLanguage {
  return (MESSAGE_LANGUAGES as readonly string[]).includes(value);
}

export function defaultTemplate(kind: MessageKind, language: MessageLanguage): string {
  return copy.messageDefaults[language][kind];
}

/**
 * Fills `{name}`-style placeholders. A placeholder without a value is dropped
 * rather than shown to the member as literal braces.
 */
export function renderTemplate(body: string, variables: MessageVariables): string {
  return body
    .replace(TOKEN, (_match, name: string) => variables[name as TemplateVariable] ?? '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** Placeholders in the text that this kind of message cannot fill. */
export function unknownVariables(kind: MessageKind, body: string): string[] {
  const allowed = new Set<string>(TEMPLATE_VARIABLES[kind]);
  return [...new Set([...body.matchAll(TOKEN)].map((m) => m[1]!))].filter((v) => !allowed.has(v));
}

/** Placeholders in order of first use, which is how Meta numbers {{1}}, {{2}}… */
export function variablesInOrder(body: string): TemplateVariable[] {
  return [...new Set([...body.matchAll(TOKEN)].map((m) => m[1] as TemplateVariable))];
}

export function metaTemplateName(kind: MessageKind): string {
  return `gymdesk_${kind}`;
}

/** The default text with Meta's numbered placeholders, for pasting into WhatsApp Manager. */
export function metaTemplateBody(kind: MessageKind, language: MessageLanguage): string {
  const order = variablesInOrder(defaultTemplate(kind, language));
  return defaultTemplate(kind, language).replace(
    TOKEN,
    (_match, name: string) => `{{${order.indexOf(name as TemplateVariable) + 1}}}`,
  );
}

/**
 * Positional values for the approved template. Meta rejects empty values and
 * values with line breaks, tabs or long runs of spaces.
 */
export function metaParameters(
  kind: MessageKind,
  language: MessageLanguage,
  variables: MessageVariables,
): string[] {
  return variablesInOrder(defaultTemplate(kind, language)).map((name) => {
    const value = (variables[name] ?? '').replace(/\s+/g, ' ').trim().slice(0, 1000);
    return value || '-';
  });
}

export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName.trim();
}

const HINDI_DATE = new Intl.DateTimeFormat('hi-IN', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "12 Mar 2026" in English, "12 मार्च 2026" in Hindi. */
export function formatMessageDate(date: DateOnly, language: MessageLanguage): string {
  if (language === 'hi') {
    parseDateOnly(date);
    return HINDI_DATE.format(new Date(`${date}T00:00:00Z`));
  }
  return formatDate(date);
}

/** "7, 3, 0" → [7, 3, 0]; null when any part is not a whole number in range or there are too many. */
export function parseDayList(input: string, min: number, max: number): number[] | null {
  const parts = input
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 1 || parts.length > 5) return null;
  const days: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const value = Number(part);
    if (value < min || value > max) return null;
    if (!days.includes(value)) days.push(value);
  }
  return days.sort((a, b) => b - a);
}

export function formatDayList(days: readonly number[]): string {
  return days.join(', ');
}
