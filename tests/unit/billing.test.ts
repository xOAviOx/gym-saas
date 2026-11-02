import { randomBytes, randomUUID } from 'node:crypto';

import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import {
  cashfreeCredentialsSchema,
  payClaimSchema,
  paymentSettingsSchema,
  recordPaymentSchema,
  reasonInputSchema,
} from '@/features/billing/schema';
import { amountInWords, indianNumberWords } from '@/lib/amount-in-words';
import { openSecret, parseSecretKey, sealSecret } from '@/lib/crypto/secret-box';
import { addDays, todayIST } from '@/lib/dates';
import { toMoneyInput } from '@/lib/money';
import { createPayToken, verifyPayToken } from '@/lib/payments/pay-token';
import { pdfFileName } from '@/lib/pdf/file-name';
import { buildInvoicePdf, pdfMoney, pdfText, type InvoiceDocument } from '@/lib/pdf/invoice-pdf';

const key = randomBytes(32);

describe('secret box', () => {
  it('round-trips a secret bound to its context', () => {
    const sealed = sealSecret('cfsk_ma_test_secret', key, 'cashfree:org-a');
    expect(sealed).toMatch(/^v1\.[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(sealed).not.toContain('cfsk_ma_test_secret');
    expect(openSecret(sealed, key, 'cashfree:org-a')).toBe('cfsk_ma_test_secret');
  });

  it('uses a fresh IV every time', () => {
    expect(sealSecret('same', key, 'ctx')).not.toBe(sealSecret('same', key, 'ctx'));
  });

  it('refuses ciphertext moved to another gym, a wrong key, or tampering', () => {
    const sealed = sealSecret('secret', key, 'cashfree:org-a');
    expect(() => openSecret(sealed, key, 'cashfree:org-b')).toThrow();
    expect(() => openSecret(sealed, randomBytes(32), 'cashfree:org-a')).toThrow();
    const [v, iv, body, tag] = sealed.split('.');
    const flipped = body!.startsWith('A') ? `B${body!.slice(1)}` : `A${body!.slice(1)}`;
    expect(() => openSecret([v, iv, flipped, tag].join('.'), key, 'cashfree:org-a')).toThrow();
    expect(() => openSecret('v2.a.b.c', key, 'cashfree:org-a')).toThrow();
  });

  it('validates the key and refuses empty secrets', () => {
    expect(parseSecretKey(key.toString('base64'))).toHaveLength(32);
    expect(() => parseSecretKey(randomBytes(16).toString('base64'))).toThrow();
    expect(() => sealSecret('', key, 'ctx')).toThrow();
  });
});

describe('pay tokens', () => {
  const secret = 'a'.repeat(40);
  const invoiceId = randomUUID();
  const now = new Date('2026-04-01T10:00:00Z');

  it('round-trips the invoice id until it expires', () => {
    const { token, expiresAt } = createPayToken(invoiceId, secret, now, 30);
    expect(token).toHaveLength(50);
    expect(verifyPayToken(token, secret, now)?.invoiceId).toBe(invoiceId);
    expect(expiresAt.toISOString()).toBe('2026-05-01T10:00:00.000Z');
    expect(verifyPayToken(token, secret, new Date('2026-05-01T09:59:59Z'))).not.toBeNull();
    expect(verifyPayToken(token, secret, new Date('2026-05-01T10:00:00Z'))).toBeNull();
  });

  it('rejects another secret, edits and malformed input', () => {
    const { token } = createPayToken(invoiceId, secret, now);
    expect(verifyPayToken(token, 'b'.repeat(40), now)).toBeNull();
    const [payload, signature] = token.split('.');
    const other = createPayToken(randomUUID(), secret, now).token.split('.')[0];
    expect(verifyPayToken(`${other}.${signature}`, secret, now)).toBeNull();
    expect(verifyPayToken(`${payload}.${'A'.repeat(22)}`, secret, now)).toBeNull();
    expect(verifyPayToken('not-a-token', secret, now)).toBeNull();
    expect(verifyPayToken('', secret, now)).toBeNull();
    expect(() => createPayToken('nope', secret, now)).toThrow();
  });
});

describe('amount in words', () => {
  it('uses the Indian numbering system', () => {
    expect(indianNumberWords(0)).toBe('Zero');
    expect(indianNumberWords(19)).toBe('Nineteen');
    expect(indianNumberWords(105)).toBe('One Hundred Five');
    expect(indianNumberWords(125000)).toBe('One Lakh Twenty Five Thousand');
    expect(indianNumberWords(12345678)).toBe(
      'One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight',
    );
  });

  it('adds paise only when present', () => {
    expect(amountInWords(150000)).toBe('Indian Rupees One Thousand Five Hundred Only');
    expect(amountInWords(145050)).toBe(
      'Indian Rupees One Thousand Four Hundred Fifty and Fifty Paise Only',
    );
    expect(amountInWords(5)).toBe('Indian Rupees Zero and Five Paise Only');
  });
});

describe('PDF helpers', () => {
  it('keeps only text the built-in font can draw', () => {
    expect(pdfText('₹1,500 → paid')).toBe('Rs.1,500 -> paid');
    expect(pdfText('Rahul  \n Sharma')).toBe('Rahul Sharma');
    expect(pdfText('राहुल', 'Member')).toBe('Member');
    expect(pdfText('Café “Fit”')).toBe('Café “Fit”');
  });

  it('formats rupees with Indian grouping and two decimals', () => {
    expect(pdfMoney(12500050)).toBe('Rs. 1,25,000.50');
    expect(pdfMoney(-150000)).toBe('-Rs. 1,500.00');
  });

  it('builds a safe file name', () => {
    expect(pdfFileName('IRON/25-26/0007')).toBe('IRON-25-26-0007.pdf');
    expect(pdfFileName('"; evil')).toBe('evil.pdf');
    expect(pdfFileName('///')).toBe('invoice.pdf');
  });

  const doc: InvoiceDocument = {
    org: {
      name: 'Iron Temple Fitness',
      addressLines: ['12 MG Road', 'Nagpur, Maharashtra, 440001'],
      phone: '+91 98765 43210',
      email: null,
      gstin: '27ABCDE1234F1Z5',
      state: 'Maharashtra',
    },
    invoice: {
      number: 'IRON/25-26/0007',
      issueDate: '2026-04-01',
      dueDate: '2026-04-01',
      status: 'partially_paid',
      voidReason: null,
      subtotal: 150000,
      discount: 10000,
      taxable: 133333,
      cgst: 3334,
      sgst: 3333,
      total: 140000,
      gstRate: 5,
      amountPaid: 50000,
      balanceDue: 90000,
    },
    member: { name: 'Rahul राहुल Sharma', code: 'M-0007', phone: null },
    items: [{ description: 'Monthly membership', sac: '999723', amount: 150000 }],
    payments: [
      {
        paidAt: '2026-04-01T05:30:00Z',
        method: 'UPI',
        reference: '123456789012',
        amount: 50000,
        isReversal: false,
      },
    ],
    upiUri: 'upi://pay?pa=irontemple%40okaxis&pn=Iron&am=900.00&cu=INR&tn=IRON',
  };

  it('renders a one-page tax invoice and a void receipt', async () => {
    for (const variant of [
      doc,
      {
        ...doc,
        invoice: { ...doc.invoice, gstRate: 0, status: 'void' as const, voidReason: 'Duplicate' },
        upiUri: null,
      },
    ]) {
      const bytes = await buildInvoicePdf(variant);
      expect(Buffer.from(bytes.subarray(0, 5)).toString('latin1')).toBe('%PDF-');
      const parsed = await PDFDocument.load(bytes);
      expect(parsed.getPageCount()).toBe(1);
      expect(parsed.getTitle()).toContain('IRON/25-26/0007');
    }
  });
});

describe('billing input schemas', () => {
  const base = {
    invoiceId: randomUUID(),
    requestId: randomUUID(),
    amount: '1,500',
    method: 'upi' as const,
    utr: '1234 5678 9012',
    reference: '',
    paidOn: todayIST(),
  };

  it('parses a UPI payment, ignoring spaces in the UTR', () => {
    const parsed = recordPaymentSchema.parse(base);
    expect(parsed.amount).toBe(150000);
    expect(parsed.utr).toBe('123456789012');
  });

  it('rejects a UTR on a non-UPI payment, zero amounts, and dates outside 90 days', () => {
    expect(recordPaymentSchema.safeParse({ ...base, method: 'cash' }).success).toBe(false);
    expect(recordPaymentSchema.safeParse({ ...base, method: 'cash', utr: '' }).success).toBe(true);
    expect(recordPaymentSchema.safeParse({ ...base, amount: '0' }).success).toBe(false);
    expect(recordPaymentSchema.safeParse({ ...base, utr: '12345' }).success).toBe(false);
    expect(recordPaymentSchema.safeParse({ ...base, paidOn: addDays(todayIST(), 1) }).success).toBe(
      false,
    );
    expect(
      recordPaymentSchema.safeParse({ ...base, paidOn: addDays(todayIST(), -91) }).success,
    ).toBe(false);
    expect(recordPaymentSchema.safeParse({ ...base, method: 'cashfree' }).success).toBe(false);
    expect(recordPaymentSchema.safeParse({ ...base, orgId: randomUUID() }).success).toBe(false);
  });

  it('requires a meaningful reason', () => {
    expect(reasonInputSchema.safeParse({ reason: '  ab ' }).success).toBe(false);
    expect(reasonInputSchema.parse({ reason: '  Duplicate entry ' }).reason).toBe(
      'Duplicate entry',
    );
    expect(reasonInputSchema.safeParse({ reason: 'x'.repeat(201) }).success).toBe(false);
  });

  it('keeps UPI settings complete and Direct UPI usable', () => {
    const ok = { upiVpa: 'gym@okaxis', upiPayeeName: 'Iron Temple', defaultMode: 'upi_direct' };
    expect(paymentSettingsSchema.safeParse(ok).success).toBe(true);
    expect(paymentSettingsSchema.safeParse({ ...ok, upiPayeeName: '' }).success).toBe(false);
    expect(paymentSettingsSchema.safeParse({ ...ok, upiPayeeName: 'I' }).success).toBe(false);
    expect(paymentSettingsSchema.safeParse({ ...ok, upiVpa: 'bad' }).success).toBe(false);
    expect(
      paymentSettingsSchema.safeParse({ upiVpa: '', upiPayeeName: '', defaultMode: 'upi_direct' })
        .success,
    ).toBe(false);
    expect(
      paymentSettingsSchema.safeParse({ upiVpa: '', upiPayeeName: '', defaultMode: 'cashfree' })
        .success,
    ).toBe(true);
  });

  it('validates Cashfree keys and member claims', () => {
    const keys = {
      appId: 'TEST1234abcd',
      secretKey: 'cfsk_ma_test_abcdef',
      environment: 'sandbox',
    };
    expect(cashfreeCredentialsSchema.safeParse(keys).success).toBe(true);
    expect(cashfreeCredentialsSchema.safeParse({ ...keys, appId: 'has space' }).success).toBe(
      false,
    );
    expect(cashfreeCredentialsSchema.safeParse({ ...keys, secretKey: 'short' }).success).toBe(
      false,
    );
    expect(cashfreeCredentialsSchema.safeParse({ ...keys, environment: 'live' }).success).toBe(
      false,
    );
    const claim = { token: 'x'.repeat(50), utr: '123456789012', amount: '900', note: '' };
    expect(payClaimSchema.parse(claim).amount).toBe(90000);
    expect(payClaimSchema.safeParse({ ...claim, utr: '' }).success).toBe(false);
    expect(payClaimSchema.safeParse({ ...claim, invoiceId: randomUUID() }).success).toBe(false);
  });

  it('prefills amounts without needless decimals', () => {
    expect(toMoneyInput(150000)).toBe('1500');
    expect(toMoneyInput(150050)).toBe('1500.50');
  });
});
