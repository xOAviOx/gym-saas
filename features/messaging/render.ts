import 'server-only';

import { z } from 'zod';

import { memberQrFor } from '@/features/attendance/member-qr';
import { payLinkFor } from '@/features/billing/pay-link';
import { isDateOnly } from '@/lib/dates';
import {
  defaultTemplate,
  firstName,
  formatMessageDate,
  isMessageKind,
  isMessageLanguage,
  renderTemplate,
  type MessageKind,
  type MessageLanguage,
  type MessageVariables,
} from '@/lib/messaging/templates';
import { formatMoney, toPaise } from '@/lib/money';
import type { AdminSupabase } from '@/lib/supabase/admin';
import type { ServerSupabase } from '@/lib/supabase/server';

/** Gym-edited text keyed by `kind:language`; anything missing uses the default. */
export type TemplateOverrides = Map<string, string>;

export async function loadTemplateOverrides(
  db: ServerSupabase | AdminSupabase,
  orgIds: readonly string[],
): Promise<Map<string, TemplateOverrides>> {
  const byOrg = new Map<string, TemplateOverrides>();
  if (!orgIds.length) return byOrg;
  const { data, error } = await db
    .from('message_templates')
    .select('org_id,template_key,language,body')
    .in('org_id', [...new Set(orgIds)]);
  if (error) throw error;
  for (const row of data ?? []) {
    const overrides = byOrg.get(row.org_id) ?? new Map<string, string>();
    overrides.set(`${row.template_key}:${row.language}`, row.body);
    byOrg.set(row.org_id, overrides);
  }
  return byOrg;
}

export function templateBody(
  overrides: TemplateOverrides | undefined,
  kind: MessageKind,
  language: MessageLanguage,
): string {
  return overrides?.get(`${kind}:${language}`) ?? defaultTemplate(kind, language);
}

export function languageOf(value: string | null | undefined): MessageLanguage {
  return value && isMessageLanguage(value) ? value : 'en';
}

export type ComposedMessage = {
  kind: MessageKind;
  language: MessageLanguage;
  body: string;
  variables: MessageVariables;
};

export function composeMessage(
  overrides: TemplateOverrides | undefined,
  kind: MessageKind,
  language: MessageLanguage,
  variables: MessageVariables,
): ComposedMessage {
  return {
    kind,
    language,
    body: renderTemplate(templateBody(overrides, kind, language), variables),
    variables,
  };
}

const dateSchema = z.string().refine(isDateOnly);

const factsSchema = z.looseObject({
  full_name: z.string(),
  org_name: z.string(),
  end_date: dateSchema.nullish(),
  plan_name: z.string().nullish(),
  days: z.number().int().nullish(),
  invoice_number: z.string().nullish(),
  balance_due: z.number().nullish(),
  due_date: dateSchema.nullish(),
});

export type MessageCandidate = {
  org_id: string;
  member_id: string;
  kind: string;
  lang: string;
  invoice_id: string | null;
  facts: unknown;
};

/** Variables for a reminder or birthday wish from daily_message_candidates. */
export function candidateMessage(
  candidate: MessageCandidate,
  overrides: TemplateOverrides | undefined,
): ComposedMessage | null {
  const facts = factsSchema.safeParse(candidate.facts);
  if (!facts.success || !isMessageKind(candidate.kind)) return null;
  const f = facts.data;
  const kind = candidate.kind;
  const language = languageOf(candidate.lang);
  const base: MessageVariables = { name: firstName(f.full_name), gym: f.org_name };
  let variables: MessageVariables;
  switch (kind) {
    case 'membership_expiring':
    case 'membership_expired':
      if (!f.end_date) return null;
      variables = {
        ...base,
        plan: f.plan_name ?? '',
        date: formatMessageDate(f.end_date, language),
        days: String(f.days ?? 0),
      };
      break;
    case 'dues_overdue':
      if (!candidate.invoice_id || f.balance_due == null || !f.invoice_number || !f.due_date) {
        return null;
      }
      variables = {
        ...base,
        amount: formatMoney(toPaise(f.balance_due)),
        invoice: f.invoice_number,
        date: formatMessageDate(f.due_date, language),
        link: payLinkFor(candidate.invoice_id).url,
      };
      break;
    case 'birthday':
      variables = base;
      break;
    default:
      return null;
  }
  return composeMessage(overrides, kind, language, variables);
}

export function receiptVariables(input: {
  fullName: string;
  gym: string;
  amount: number;
  invoiceNumber: string;
  balanceDue: number;
  invoiceId: string;
}): MessageVariables {
  return {
    name: firstName(input.fullName),
    gym: input.gym,
    amount: formatMoney(toPaise(input.amount)),
    invoice: input.invoiceNumber,
    balance: formatMoney(toPaise(input.balanceDue)),
    link: payLinkFor(input.invoiceId).url,
  };
}

export function welcomeVariables(input: {
  memberId: string;
  qrVersion: number;
  fullName: string;
  gym: string;
  code: string;
}): MessageVariables {
  return {
    name: firstName(input.fullName),
    gym: input.gym,
    code: input.code,
    link: memberQrFor(input.memberId, input.qrVersion).cardUrl,
  };
}
