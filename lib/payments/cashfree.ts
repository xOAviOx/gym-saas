import { createHmac, timingSafeEqual } from 'node:crypto';

import { formatInTimeZone } from 'date-fns-tz';
import { z } from 'zod';

import { IST } from '@/lib/dates';
import { fromPaise, type Paise } from '@/lib/money';

export type CashfreeEnvironment = 'sandbox' | 'production';

export type CashfreeCredentials = {
  appId: string;
  secretKey: string;
  environment: CashfreeEnvironment;
};

export const CASHFREE_API_VERSION = '2025-01-01';

const BASE_URL: Record<CashfreeEnvironment, string> = {
  sandbox: 'https://sandbox.cashfree.com/pg',
  production: 'https://api.cashfree.com/pg',
};

const TIMEOUT_MS = 15_000;

export class CashfreeError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly type: string | null = null,
    readonly code: string | null = null,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'CashfreeError';
  }

  get isAuthError(): boolean {
    return this.status === 401 || this.status === 403 || this.type === 'authentication_error';
  }

  /** Network failures, timeouts and Cashfree-side outages: worth retrying later. */
  get isUnavailable(): boolean {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
}

const errorBodySchema = z.looseObject({
  message: z.string().optional(),
  code: z.string().optional(),
  type: z.string().optional(),
});

type RequestOptions = { body?: unknown; idempotencyKey?: string };

async function call<S extends z.ZodType>(
  credentials: CashfreeCredentials,
  method: 'GET' | 'POST',
  path: string,
  schema: S,
  { body, idempotencyKey }: RequestOptions = {},
): Promise<z.output<S>> {
  const headers: Record<string, string> = {
    accept: 'application/json',
    'x-api-version': CASHFREE_API_VERSION,
    'x-client-id': credentials.appId,
    'x-client-secret': credentials.secretKey,
  };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (idempotencyKey) headers['x-idempotency-key'] = idempotencyKey;

  let response: Response;
  try {
    response = await fetch(`${BASE_URL[credentials.environment]}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new CashfreeError('Cashfree request failed', 0, 'network_error', null, { cause: error });
  }

  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!response.ok) {
    const parsed = errorBodySchema.safeParse(json);
    const detail = parsed.success ? parsed.data : {};
    throw new CashfreeError(
      detail.message ?? `Cashfree returned HTTP ${response.status}`,
      response.status,
      detail.type ?? null,
      detail.code ?? null,
    );
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new CashfreeError('Unexpected Cashfree response', response.status, 'invalid_response');
  }
  return parsed.data;
}

const idSchema = z.union([z.string(), z.number()]).transform(String);

const linkSchema = z
  .looseObject({
    cf_link_id: idSchema,
    link_id: z.string(),
    link_status: z.string(),
    link_url: z.url(),
    link_amount: z.number(),
    link_amount_paid: z.number().nullish(),
    link_expiry_time: z.string().nullish(),
  })
  .transform((link) => ({
    cfLinkId: link.cf_link_id,
    linkId: link.link_id,
    status: link.link_status.toUpperCase(),
    url: link.link_url,
    amount: link.link_amount,
    amountPaid: link.link_amount_paid ?? 0,
    expiresAt: link.link_expiry_time ?? null,
  }));

export type CashfreeLink = z.output<typeof linkSchema>;

const ordersSchema = z.array(
  z
    .looseObject({ order_id: z.string(), order_status: z.string().nullish() })
    .transform((order) => ({
      orderId: order.order_id,
      status: (order.order_status ?? '').toUpperCase(),
    })),
);

const paymentsSchema = z.array(
  z
    .looseObject({
      cf_payment_id: idSchema,
      payment_status: z.string(),
      payment_amount: z.number(),
      payment_currency: z.string().nullish(),
      payment_time: z.string().nullish(),
      payment_group: z.string().nullish(),
      bank_reference: idSchema.nullish(),
    })
    .transform((payment) => ({
      cfPaymentId: payment.cf_payment_id,
      status: payment.payment_status.toUpperCase(),
      amount: payment.payment_amount,
      currency: (payment.payment_currency ?? 'INR').toUpperCase(),
      paidAt: payment.payment_time ?? null,
      group: payment.payment_group ?? null,
      bankReference: payment.bank_reference ?? null,
    })),
);

export type CashfreePayment = z.output<typeof paymentsSchema>[number];

export type CreateLinkInput = {
  linkId: string;
  amount: Paise;
  purpose: string;
  customer: { name: string; phone: string; email?: string | null };
  expiresAt: Date;
  /** Only HTTPS addresses are sent; Cashfree cannot call back to a local server. */
  notifyUrl?: string | null;
  returnUrl?: string | null;
};

/** Cashfree wants a 10-digit Indian mobile number without the country code. */
export function cashfreePhone(e164: string): string {
  return e164.replace(/^\+91/, '').replace(/\D/g, '').slice(-10);
}

export function createPaymentLink(
  credentials: CashfreeCredentials,
  input: CreateLinkInput,
  idempotencyKey: string,
): Promise<CashfreeLink> {
  const meta: Record<string, string> = {};
  if (input.notifyUrl?.startsWith('https://')) meta.notify_url = input.notifyUrl;
  if (input.returnUrl?.startsWith('https://')) meta.return_url = input.returnUrl;
  return call(credentials, 'POST', '/links', linkSchema, {
    idempotencyKey,
    body: {
      link_id: input.linkId,
      link_amount: fromPaise(input.amount),
      link_currency: 'INR',
      link_purpose: input.purpose.slice(0, 500),
      link_partial_payments: false,
      link_auto_reminders: false,
      link_expiry_time: formatInTimeZone(input.expiresAt, IST, "yyyy-MM-dd'T'HH:mm:ssXXX"),
      link_notify: { send_sms: false, send_email: false },
      customer_details: {
        customer_name: input.customer.name.slice(0, 100),
        customer_phone: cashfreePhone(input.customer.phone),
        ...(input.customer.email ? { customer_email: input.customer.email } : {}),
      },
      ...(Object.keys(meta).length ? { link_meta: meta } : {}),
    },
  });
}

export function getPaymentLink(credentials: CashfreeCredentials, linkId: string) {
  return call(credentials, 'GET', `/links/${encodeURIComponent(linkId)}`, linkSchema);
}

export function getLinkOrders(credentials: CashfreeCredentials, linkId: string) {
  return call(credentials, 'GET', `/links/${encodeURIComponent(linkId)}/orders`, ordersSchema);
}

export function getOrderPayments(credentials: CashfreeCredentials, orderId: string) {
  return call(
    credentials,
    'GET',
    `/orders/${encodeURIComponent(orderId)}/payments`,
    paymentsSchema,
  );
}

export function cancelPaymentLink(credentials: CashfreeCredentials, linkId: string) {
  return call(credentials, 'POST', `/links/${encodeURIComponent(linkId)}/cancel`, linkSchema);
}

/**
 * Reads a link id that cannot exist. Cashfree authenticates before looking the
 * link up, so a 401/403 means bad keys and any other client error means the
 * keys work.
 */
export async function verifyCredentials(credentials: CashfreeCredentials): Promise<boolean> {
  try {
    await getPaymentLink(credentials, 'gymdesk_credentials_check');
    return true;
  } catch (error) {
    if (!(error instanceof CashfreeError)) throw error;
    if (error.isAuthError) return false;
    if (error.isUnavailable) throw error;
    return true;
  }
}

export function cashfreeWebhookSignature(
  timestamp: string,
  rawBody: string,
  secretKey: string,
): string {
  return createHmac('sha256', secretKey)
    .update(timestamp + rawBody)
    .digest('base64');
}

/** Constant-time check of `x-webhook-signature` against the raw request body. */
export function verifyCashfreeWebhook({
  rawBody,
  timestamp,
  signature,
  secretKey,
}: {
  rawBody: string;
  timestamp: string | null;
  signature: string | null;
  secretKey: string;
}): boolean {
  if (!timestamp || !signature) return false;
  const expected = Buffer.from(cashfreeWebhookSignature(timestamp, rawBody, secretKey), 'utf8');
  const received = Buffer.from(signature.trim(), 'utf8');
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export type CashfreeWebhookSummary = {
  type: string;
  linkId: string | null;
  linkStatus: string | null;
  orderId: string | null;
};

function pick(source: unknown, ...path: string[]): unknown {
  let value = source;
  for (const key of path) {
    if (typeof value !== 'object' || value === null) return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

function asText(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 100);
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

/**
 * Pulls the identifiers out of a webhook without trusting it: the handler only
 * uses them to find the gym and re-read the payment from the Cashfree API.
 * Link events are JSON; older link webhooks were form-encoded.
 */
export function summarizeCashfreeWebhook(
  rawBody: string,
  contentType: string | null,
): CashfreeWebhookSummary | null {
  if (contentType?.includes('application/x-www-form-urlencoded')) {
    const form = new URLSearchParams(rawBody);
    return {
      type: asText(form.get('type') ?? form.get('event')) ?? 'PAYMENT_LINK_EVENT',
      linkId: asText(form.get('link_id') ?? form.get('linkId')),
      linkStatus: asText(form.get('link_status') ?? form.get('linkStatus')),
      orderId: asText(form.get('order_id') ?? form.get('orderId')),
    };
  }
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return null;
  }
  return {
    type: asText(pick(json, 'type')) ?? 'unknown',
    linkId:
      asText(pick(json, 'data', 'link_id')) ??
      asText(pick(json, 'data', 'order', 'order_tags', 'link_id')),
    linkStatus: asText(pick(json, 'data', 'link_status')),
    orderId: asText(pick(json, 'data', 'order', 'order_id')),
  };
}
