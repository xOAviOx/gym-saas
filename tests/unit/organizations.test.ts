import { describe, expect, it } from 'vitest';

import { createOrganizationSchema, suggestInvoicePrefix } from '@/features/organizations/schema';

describe('suggestInvoicePrefix', () => {
  it('uses initials, capped at four letters', () => {
    expect(suggestInvoicePrefix('Iron Temple Fitness')).toBe('ITF');
    expect(suggestInvoicePrefix("Gold's Gym Nagpur")).toBe('GGN');
    expect(suggestInvoicePrefix('Alpha Beta Gamma Delta Epsilon')).toBe('ABGD');
  });

  it('falls back to leading letters for short names', () => {
    expect(suggestInvoicePrefix('Fitness')).toBe('FIT');
    expect(suggestInvoicePrefix('Go Fit')).toBe('GOF');
    expect(suggestInvoicePrefix('Go')).toBe('GOX');
  });
});

describe('createOrganizationSchema', () => {
  const valid = {
    name: 'Iron Temple Fitness',
    city: 'Nagpur',
    phone: '98765 43210',
    upiVpa: 'irontemple@okaxis',
    upiPayeeName: 'Iron Temple Fitness',
    gstEnabled: false,
    invoicePrefix: 'itf',
  };

  it('normalises the phone and upper-cases the prefix', () => {
    const parsed = createOrganizationSchema.parse(valid);
    expect(parsed.phone).toBe('+919876543210');
    expect(parsed.invoicePrefix).toBe('ITF');
  });

  it('requires a valid GSTIN when GST is on', () => {
    expect(createOrganizationSchema.safeParse({ ...valid, gstEnabled: true }).success).toBe(false);
    expect(
      createOrganizationSchema.safeParse({ ...valid, gstEnabled: true, gstin: 'nope' }).success,
    ).toBe(false);
    const parsed = createOrganizationSchema.parse({
      ...valid,
      gstEnabled: true,
      gstin: '27abcde1234f1z5',
    });
    expect(parsed.gstin).toBe('27ABCDE1234F1Z5');
  });

  it('rejects unknown fields, bad UPI IDs and bad prefixes', () => {
    expect(createOrganizationSchema.safeParse({ ...valid, orgId: 'x' }).success).toBe(false);
    expect(createOrganizationSchema.safeParse({ ...valid, upiVpa: 'not-a-vpa' }).success).toBe(
      false,
    );
    expect(createOrganizationSchema.safeParse({ ...valid, invoicePrefix: 'AB' }).success).toBe(
      false,
    );
    expect(createOrganizationSchema.safeParse({ ...valid, invoicePrefix: 'ABCDE' }).success).toBe(
      false,
    );
    expect(createOrganizationSchema.safeParse({ ...valid, phone: '12345' }).success).toBe(false);
  });
});
