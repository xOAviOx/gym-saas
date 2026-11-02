import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CashfreeError,
  cancelPaymentLink,
  cashfreePhone,
  cashfreeWebhookSignature,
  createPaymentLink,
  getOrderPayments,
  summarizeCashfreeWebhook,
  verifyCashfreeWebhook,
  verifyCredentials,
  type CashfreeCredentials,
} from '@/lib/payments/cashfree';

const credentials: CashfreeCredentials = {
  appId: 'TEST_APP',
  secretKey: 'cfsk_test_secret',
  environment: 'sandbox',
};

const link = {
  cf_link_id: 1234,
  link_id: 'gd_abc',
  link_status: 'ACTIVE',
  link_url: 'https://payments-test.cashfree.com/links/abc',
  link_amount: 900,
  link_amount_paid: 0,
  link_expiry_time: '2026-04-08T10:00:00+05:30',
};

function respond(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Cashfree requests', () => {
  it('creates a link with versioned headers, idempotency and no local callback URLs', async () => {
    const fetchMock = respond(200, link);
    vi.stubGlobal('fetch', fetchMock);
    const result = await createPaymentLink(
      credentials,
      {
        linkId: 'gd_abc',
        amount: 90000,
        purpose: 'Invoice IRON/25-26/0007 - Iron Temple',
        customer: { name: 'Rahul', phone: '+919876543210', email: null },
        expiresAt: new Date('2026-04-08T04:30:00Z'),
        notifyUrl: 'http://localhost:3000/api/webhooks/cashfree',
        returnUrl: 'https://gym.example/p/pay/token?checkout=1',
      },
      'request-1',
    );
    expect(result).toMatchObject({ linkId: 'gd_abc', url: link.link_url, status: 'ACTIVE' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://sandbox.cashfree.com/pg/links');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-api-version']).toBe('2025-01-01');
    expect(headers['x-client-id']).toBe('TEST_APP');
    expect(headers['x-idempotency-key']).toBe('request-1');
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      link_id: 'gd_abc',
      link_amount: 900,
      link_currency: 'INR',
      link_partial_payments: false,
      link_expiry_time: '2026-04-08T10:00:00+05:30',
      customer_details: { customer_phone: '9876543210' },
      link_meta: { return_url: 'https://gym.example/p/pay/token?checkout=1' },
    });
    expect(body.link_meta.notify_url).toBeUndefined();
    expect(body.customer_details.customer_email).toBeUndefined();
  });

  it('maps failures to retryable or permanent errors', async () => {
    vi.stubGlobal('fetch', respond(503, { message: 'down' }));
    await expect(cancelPaymentLink(credentials, 'gd_abc')).rejects.toMatchObject({
      isUnavailable: true,
    });
    vi.stubGlobal('fetch', respond(401, { message: 'auth', type: 'authentication_error' }));
    await expect(cancelPaymentLink(credentials, 'gd_abc')).rejects.toMatchObject({
      isAuthError: true,
      isUnavailable: false,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );
    await expect(cancelPaymentLink(credentials, 'gd_abc')).rejects.toBeInstanceOf(CashfreeError);
    vi.stubGlobal('fetch', respond(200, { unexpected: true }));
    await expect(cancelPaymentLink(credentials, 'gd_abc')).rejects.toMatchObject({
      type: 'invalid_response',
    });
  });

  it('normalises payments read back from Cashfree', async () => {
    vi.stubGlobal(
      'fetch',
      respond(200, [
        {
          cf_payment_id: 5114910,
          payment_status: 'success',
          payment_amount: 900,
          payment_time: '2026-04-01T11:00:00+05:30',
          payment_group: 'upi',
          bank_reference: 123456789012,
        },
      ]),
    );
    expect(await getOrderPayments(credentials, 'order_1')).toEqual([
      {
        cfPaymentId: '5114910',
        status: 'SUCCESS',
        amount: 900,
        currency: 'INR',
        paidAt: '2026-04-01T11:00:00+05:30',
        group: 'upi',
        bankReference: '123456789012',
      },
    ]);
  });

  it('verifies keys by reading a link that cannot exist', async () => {
    vi.stubGlobal('fetch', respond(404, { message: 'link not found' }));
    expect(await verifyCredentials(credentials)).toBe(true);
    vi.stubGlobal('fetch', respond(401, { message: 'authentication Failed' }));
    expect(await verifyCredentials(credentials)).toBe(false);
    vi.stubGlobal('fetch', respond(500, { message: 'oops' }));
    await expect(verifyCredentials(credentials)).rejects.toBeInstanceOf(CashfreeError);
  });

  it('sends a 10-digit Indian phone number', () => {
    expect(cashfreePhone('+919876543210')).toBe('9876543210');
  });
});

describe('Cashfree webhooks', () => {
  const body = JSON.stringify({
    type: 'PAYMENT_LINK_EVENT',
    data: { link_id: 'gd_abc', link_status: 'PAID', order: { order_id: 'order_1' } },
  });

  it('accepts only the exact signed body', () => {
    const timestamp = '1711958400000';
    const signature = cashfreeWebhookSignature(timestamp, body, credentials.secretKey);
    const check = (overrides: Partial<Parameters<typeof verifyCashfreeWebhook>[0]>) =>
      verifyCashfreeWebhook({
        rawBody: body,
        timestamp,
        signature,
        secretKey: credentials.secretKey,
        ...overrides,
      });
    expect(check({})).toBe(true);
    expect(check({ rawBody: body.replace('PAID', 'EXPIRED') })).toBe(false);
    expect(check({ timestamp: '1711958400001' })).toBe(false);
    expect(check({ secretKey: 'other' })).toBe(false);
    expect(check({ signature: null })).toBe(false);
    expect(check({ signature: 'short' })).toBe(false);
  });

  it('extracts identifiers from JSON and form-encoded events', () => {
    expect(summarizeCashfreeWebhook(body, 'application/json')).toEqual({
      type: 'PAYMENT_LINK_EVENT',
      linkId: 'gd_abc',
      linkStatus: 'PAID',
      orderId: 'order_1',
    });
    expect(
      summarizeCashfreeWebhook(
        'link_id=gd_abc&link_status=PAID&order_id=order_1',
        'application/x-www-form-urlencoded',
      ),
    ).toMatchObject({ linkId: 'gd_abc', linkStatus: 'PAID', orderId: 'order_1' });
    expect(summarizeCashfreeWebhook('{"type":"TEST"}', 'application/json')).toMatchObject({
      linkId: null,
    });
    expect(summarizeCashfreeWebhook('not json', 'application/json')).toBeNull();
  });
});
