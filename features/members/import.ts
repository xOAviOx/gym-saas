import { format, parse } from 'date-fns';
import { z } from 'zod';

import type { Plan } from '@/features/plans/types';
import { copy } from '@/lib/copy';
import { addDays, isDateOnly } from '@/lib/dates';
import { fromPaise, parseMoneyInput } from '@/lib/money';
import { normalizePhone } from '@/lib/phone';

import { memberDatabaseData } from './data';
import { emptyMemberValues, memberDetailsSchema } from './schema';

export const MAX_IMPORT_ROWS = 500;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const IMPORT_FIELDS = [
  {
    key: 'fullName',
    label: copy.members.fullName,
    required: true,
    aliases: ['name', 'member name', 'full name'],
  },
  {
    key: 'phone',
    label: copy.members.phone,
    required: true,
    aliases: ['phone', 'mobile', 'mobile number', 'phone number', 'contact number'],
  },
  { key: 'email', label: copy.members.email, aliases: ['email', 'email address'] },
  { key: 'gender', label: copy.members.gender, aliases: ['gender', 'sex'] },
  { key: 'dob', label: copy.members.dob, aliases: ['dob', 'date of birth', 'birth date'] },
  {
    key: 'joinedOn',
    label: copy.members.joinedOn,
    aliases: ['joined on', 'joining date', 'join date'],
  },
  {
    key: 'planName',
    label: copy.memberImport.plan,
    aliases: ['plan', 'plan name', 'membership plan'],
  },
  {
    key: 'startDate',
    label: copy.memberImport.startDate,
    aliases: ['start date', 'membership start date'],
  },
  { key: 'discount', label: copy.memberImport.discount, aliases: ['discount', 'discount amount'] },
  {
    key: 'consentMessaging',
    label: copy.members.consentMessaging,
    aliases: ['consent', 'messaging consent', 'whatsapp consent'],
  },
  { key: 'address', label: copy.members.address, aliases: ['address'] },
  {
    key: 'altPhone',
    label: copy.members.altPhone,
    aliases: ['alternate phone', 'alternate number', 'alt phone'],
  },
  {
    key: 'emergencyContactName',
    label: copy.members.emergencyContactName,
    aliases: ['emergency contact name'],
  },
  {
    key: 'emergencyContactPhone',
    label: copy.members.emergencyContactPhone,
    aliases: ['emergency contact phone', 'emergency contact number'],
  },
  { key: 'source', label: copy.members.source, aliases: ['source'] },
  { key: 'tags', label: copy.members.tags, aliases: ['tags'] },
  { key: 'notes', label: copy.members.notes, aliases: ['notes', 'remarks'] },
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number]['key'];
export type ColumnMapping = Partial<Record<ImportField, number>>;
export type ImportValues = Partial<Record<ImportField, string>>;

const importValuesSchema = z.strictObject({
  fullName: z.string().max(1000),
  phone: z.string().max(1000),
  email: z.string().max(1000).optional(),
  gender: z.string().max(1000).optional(),
  dob: z.string().max(1000).optional(),
  joinedOn: z.string().max(1000).optional(),
  planName: z.string().max(1000).optional(),
  startDate: z.string().max(1000).optional(),
  discount: z.string().max(1000).optional(),
  consentMessaging: z.string().max(1000).optional(),
  address: z.string().max(1000).optional(),
  altPhone: z.string().max(1000).optional(),
  emergencyContactName: z.string().max(1000).optional(),
  emergencyContactPhone: z.string().max(1000).optional(),
  source: z.string().max(1000).optional(),
  tags: z.string().max(1000).optional(),
  notes: z.string().max(5000).optional(),
});
export const importInputSchema = z.strictObject({
  rows: z
    .array(
      z.strictObject({
        rowNumber: z.number().int().min(2).max(1000000),
        requestId: z.uuid(),
        values: importValuesSchema,
      }),
    )
    .min(1)
    .max(MAX_IMPORT_ROWS),
});
export type ImportInput = z.input<typeof importInputSchema>;
export type ImportPreviewRow = {
  rowNumber: number;
  fullName: string;
  phone: string;
  planName: string;
  status: 'ready' | 'invalid' | 'duplicateFile' | 'duplicateExisting';
  issues: string[];
};
export type ReadyImportRow = {
  id: string;
  data: ReturnType<typeof memberDatabaseData>;
  membership?: { plan_id: string; start_date: string; discount_amount: number };
};

function normalizedHeader(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
export function suggestColumnMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<number>();
  for (const field of IMPORT_FIELDS) {
    const index = headers.findIndex(
      (h, i) =>
        !used.has(i) &&
        ((field.aliases as readonly string[]).includes(normalizedHeader(h)) ||
          normalizedHeader(h) === normalizedHeader(field.label)),
    );
    if (index >= 0) {
      mapping[field.key] = index;
      used.add(index);
    }
  }
  return mapping;
}
export function validColumnMapping(mapping: ColumnMapping): boolean {
  const indices = Object.values(mapping).filter((v) => v !== undefined);
  return (
    mapping.fullName !== undefined &&
    mapping.phone !== undefined &&
    new Set(indices).size === indices.length
  );
}

/** Excel date cells are serial calendar dates, never UTC instants. CSV dates are India-first. */
export function importDate(value: string, date1904 = false): string {
  const text = value.trim();
  if (!text || isDateOnly(text)) return text;
  if (/^\d+(?:\.0+)?$/.test(text)) {
    const serial = Number(text);
    if (serial >= (date1904 ? 0 : 1) && serial <= 150000) {
      if (date1904) return addDays('1904-01-01', serial);
      if (serial === 60) return text; // Excel's fictitious 29 Feb 1900 is not a calendar date.
      return addDays(serial < 60 ? '1899-12-31' : '1899-12-30', serial);
    }
    return text;
  }
  if (!/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(text) && !/^\d{1,2} [a-z]{3} \d{4}$/i.test(text))
    return text;
  for (const pattern of ['d/M/yyyy', 'd-M-yyyy', 'd MMM yyyy']) {
    const result = parse(text, pattern, new Date(2000, 0, 1));
    if (!Number.isNaN(result.getTime())) {
      const iso = format(result, 'yyyy-MM-dd');
      if (isDateOnly(iso)) return iso;
    }
  }
  return text;
}

function consent(value: string | undefined): boolean | null {
  const text = (value ?? '').trim().toLowerCase();
  if (['', 'no', 'false', '0'].includes(text)) return false;
  if (['yes', 'true', '1'].includes(text)) return true;
  return null;
}

export function buildImportPreview(
  input: ImportInput,
  plans: Plan[],
  existingPhones: Set<string>,
  today: string,
) {
  const seen = new Set<string>();
  const rows: ImportPreviewRow[] = [];
  const ready: ReadyImportRow[] = [];
  for (const row of input.rows) {
    const v = row.values;
    const consentValue = consent(v.consentMessaging);
    const gender = (v.gender ?? '').trim().toLowerCase();
    const values = {
      ...emptyMemberValues(today),
      ...v,
      joinedOn: v.joinedOn?.trim() ? importDate(v.joinedOn) : today,
      dob: importDate(v.dob ?? ''),
      gender: gender === 'm' ? 'male' : gender === 'f' ? 'female' : gender,
      source: v.source?.trim().toLowerCase().replace(/[- ]/g, '_') || 'walk_in',
      consentMessaging: consentValue ?? false,
    };
    // Membership-only fields must not enter the strict member schema.
    const { planName: _planName, startDate: _startDate, discount: _discount, ...details } = values;
    void _planName;
    void _startDate;
    void _discount;
    const parsed = memberDetailsSchema.safeParse(details);
    const issues = parsed.success
      ? []
      : parsed.error.issues.map((issue) => {
          const key = issue.path[0];
          const label = IMPORT_FIELDS.find((field) => field.key === key)?.label;
          return label ? `${label}: ${issue.message}` : issue.message;
        });
    if (consentValue === null) issues.push(copy.memberImport.invalidConsent);
    if (parsed.success && parsed.data.dob && parsed.data.dob > today)
      issues.push(`${copy.members.dob}: ${copy.validation.dateInvalid}`);
    const planName = (v.planName ?? '').trim();
    const matchedPlans = plans.filter(
      (plan) => plan.isActive && plan.name.trim().toLowerCase() === planName.toLowerCase(),
    );
    const plan = matchedPlans.length === 1 ? matchedPlans[0] : null;
    let membership: ReadyImportRow['membership'];
    if (planName) {
      if (!plan) issues.push(copy.memberImport.unknownPlan);
      const start = importDate(v.startDate ?? '');
      if (!isDateOnly(start))
        issues.push(`${copy.memberImport.startDate}: ${copy.validation.dateInvalid}`);
      const discount = parseMoneyInput(v.discount?.trim() || '0');
      if (discount === null)
        issues.push(`${copy.memberImport.discount}: ${copy.validation.amountInvalid}`);
      else if (plan && discount > plan.price) issues.push(copy.memberships.discountTooHigh);
      if (plan && isDateOnly(start) && discount !== null) {
        membership = { plan_id: plan.id, start_date: start, discount_amount: fromPaise(discount) };
      }
    } else if (v.startDate?.trim() || (v.discount?.trim() && parseMoneyInput(v.discount) !== 0)) {
      issues.push(copy.memberships.choosePlan);
    }
    const phone = normalizePhone(v.phone);
    const status: ImportPreviewRow['status'] =
      issues.length || !parsed.success
        ? 'invalid'
        : phone && existingPhones.has(phone)
          ? 'duplicateExisting'
          : phone && seen.has(phone)
            ? 'duplicateFile'
            : 'ready';
    rows.push({
      rowNumber: row.rowNumber,
      fullName: v.fullName.trim(),
      phone: phone ?? v.phone,
      planName,
      status,
      issues,
    });
    if (status === 'ready' && parsed.success) {
      seen.add(parsed.data.phone);
      ready.push({
        id: row.requestId,
        data: memberDatabaseData(parsed.data),
        ...(membership ? { membership } : {}),
      });
    }
  }
  return { rows, ready };
}
