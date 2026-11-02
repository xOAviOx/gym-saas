import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  IMPORT_FIELDS,
  buildImportPreview,
  importDate,
  importInputSchema,
  suggestColumnMapping,
  validColumnMapping,
  type ImportInput,
} from '@/features/members/import';
import type { Plan } from '@/features/plans/types';
import { isDateOnly } from '@/lib/dates';

const plan: Plan = {
  id: randomUUID(),
  name: 'Monthly',
  type: 'duration',
  durationDays: 30,
  sessionCount: null,
  price: 150000,
  description: '',
  isActive: true,
};
const today = '2026-10-30';
function row(
  values: Partial<ImportInput['rows'][number]['values']> = {},
  rowNumber = 2,
): ImportInput['rows'][number] {
  return {
    rowNumber,
    requestId: randomUUID(),
    values: { fullName: 'Import Test', phone: '9876543210', ...values },
  };
}
const preview = (rows: ImportInput['rows'], phones = new Set<string>(), plans = [plan]) =>
  buildImportPreview({ rows }, plans, phones, today);
describe('spreadsheet mapping and dates', () => {
  it('recognizes aliases and the generated template, without reusing columns', () => {
    expect(suggestColumnMapping(['Name', 'Mobile', 'Plan'])).toEqual({
      fullName: 0,
      phone: 1,
      planName: 2,
    });
    const mapping = suggestColumnMapping(IMPORT_FIELDS.map((f) => f.label));
    expect(Object.keys(mapping)).toHaveLength(IMPORT_FIELDS.length);
    expect(validColumnMapping(mapping)).toBe(true);
    expect(validColumnMapping({ fullName: 0, phone: 0 })).toBe(false);
    expect(validColumnMapping({ fullName: 0 })).toBe(false);
  });
  it('supports India-first dates and text month dates', () => {
    expect(importDate('12/03/2026')).toBe('2026-03-12');
    expect(importDate('12-03-2026')).toBe('2026-03-12');
    expect(importDate('12 Mar 2026')).toBe('2026-03-12');
    expect(importDate('2026-03-12')).toBe('2026-03-12');
    expect(isDateOnly(importDate('31/02/2026'))).toBe(false);
    expect(isDateOnly(importDate('1/2/26'))).toBe(false);
  });
  it('handles Excel 1900/1904 calendars and rejects the fictitious leap day', () => {
    expect(importDate('1')).toBe('1900-01-01');
    expect(importDate('61')).toBe('1900-03-01');
    expect(isDateOnly(importDate('60'))).toBe(false);
    expect(importDate('0', true)).toBe('1904-01-01');
    expect(importDate('1', true)).toBe('1904-01-02');
  });
});
describe('import preview', () => {
  it('normalizes duplicate phones within the sheet and existing gym members', () => {
    const result = preview(
      [row(), row({ phone: '+91 98765 43210' }, 3), row({ phone: '9876543211' }, 4)],
      new Set(['+919876543211']),
    );
    expect(result.rows.map((r) => r.status)).toEqual([
      'ready',
      'duplicateFile',
      'duplicateExisting',
    ]);
    expect(result.ready).toHaveLength(1);
  });
  it('never opts members into messaging by default, and parses explicit yes/no', () => {
    expect(preview([row()]).ready[0]?.data.consent_messaging).toBe(false);
    expect(preview([row({ consentMessaging: 'yes' })]).ready[0]?.data.consent_messaging).toBe(true);
    expect(preview([row({ consentMessaging: 'NO' })]).ready[0]?.data.consent_messaging).toBe(false);
    expect(preview([row({ consentMessaging: 'maybe' })]).rows[0]?.status).toBe('invalid');
  });
  it('uses the shared member validation, including future birth dates', () => {
    for (const values of [{ phone: '123' }, { email: 'bad' }, { dob: '2026-11-01' }]) {
      expect(preview([row(values)]).ready).toHaveLength(0);
    }
  });
  it('creates optional membership data with rupees at the database boundary', () => {
    const result = preview([
      row({ planName: 'monthly', startDate: '30/10/2026', discount: '100.50' }),
    ]);
    expect(result.ready[0]?.membership).toEqual({
      plan_id: plan.id,
      start_date: today,
      discount_amount: 100.5,
    });
    expect(result.ready[0]?.data.joined_on).toBe(today);
  });
  it('rejects missing/ambiguous/inactive plans, missing starts, and excessive discounts', () => {
    const values = { planName: 'Monthly', startDate: today };
    expect(preview([row({ ...values, planName: 'Unknown' })]).ready).toHaveLength(0);
    expect(
      preview([row(values)], new Set(), [plan, { ...plan, id: randomUUID() }]).ready,
    ).toHaveLength(0);
    expect(preview([row(values)], new Set(), [{ ...plan, isActive: false }]).ready).toHaveLength(0);
    expect(preview([row({ planName: 'Monthly' })]).ready).toHaveLength(0);
    expect(preview([row({ ...values, discount: '1501' })]).ready).toHaveLength(0);
    expect(preview([row({ startDate: today })]).ready).toHaveLength(0);
  });
  it('does not let an invalid first row suppress a later valid row with the same phone', () => {
    const result = preview([row({ email: 'bad' }), row({}, 3)]);
    expect(result.rows.map((r) => r.status)).toEqual(['invalid', 'ready']);
  });
  it('rejects unknown fields and batches over 500', () => {
    expect(
      importInputSchema.safeParse({
        rows: [
          { ...row(), values: { fullName: 'Test', phone: '9876543210', org_id: randomUUID() } },
        ],
      }).success,
    ).toBe(false);
    expect(
      importInputSchema.safeParse({ rows: Array.from({ length: 501 }, (_, i) => row({}, i + 2)) })
        .success,
    ).toBe(false);
  });
});
