import { z } from 'zod';

/** Meta keeps each Graph API version for about two years; bump this deliberately. */
export const GRAPH_API_VERSION = 'v26.0';
const GRAPH_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;
const TIMEOUT_MS = 15_000;

export type WhatsAppCredentials = {
  phoneNumberId: string;
  accessToken: string;
};

/** Meta error codes that mean "try again later" rather than "this will never work". */
const RETRYABLE_CODES = new Set([1, 2, 4, 80007, 130429, 131000, 131016, 131056, 133004]);

export class WhatsAppError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: number | null = null,
    readonly subcode: number | null = null,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'WhatsAppError';
  }

  get isAuthError(): boolean {
    return this.status === 401 || this.code === 190 || this.code === 10 || this.code === 200;
  }

  get isUnavailable(): boolean {
    return (
      this.status === 0 ||
      this.status === 429 ||
      this.status >= 500 ||
      (this.code !== null && RETRYABLE_CODES.has(this.code))
    );
  }
}

const errorBodySchema = z.looseObject({
  error: z.looseObject({
    message: z.string().optional(),
    code: z.number().optional(),
    error_subcode: z.number().optional(),
  }),
});

async function call<S extends z.ZodType>(
  credentials: WhatsAppCredentials,
  method: 'GET' | 'POST',
  path: string,
  schema: S,
  body?: unknown,
): Promise<z.output<S>> {
  let response: Response;
  try {
    response = await fetch(`${GRAPH_URL}${path}`, {
      method,
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${credentials.accessToken}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new WhatsAppError('WhatsApp request failed', 0, null, null, { cause: error });
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
    const detail = parsed.success ? parsed.data.error : {};
    throw new WhatsAppError(
      detail.message ?? `WhatsApp returned HTTP ${response.status}`,
      response.status,
      detail.code ?? null,
      detail.error_subcode ?? null,
    );
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new WhatsAppError('Unexpected WhatsApp response', response.status);
  }
  return parsed.data;
}

/** WhatsApp wants the international number as digits only. */
export function whatsappRecipient(e164: string): string {
  return e164.replace(/\D/g, '');
}

const phoneNumberSchema = z
  .looseObject({
    id: z.string(),
    display_phone_number: z.string().optional(),
    verified_name: z.string().optional(),
  })
  .transform((row) => ({
    id: row.id,
    displayPhone: row.display_phone_number ?? null,
    verifiedName: row.verified_name ?? null,
  }));

export type WhatsAppPhoneNumber = z.output<typeof phoneNumberSchema>;

/** Reads the business number; this is how a token and phone number ID are verified together. */
export function getPhoneNumber(credentials: WhatsAppCredentials): Promise<WhatsAppPhoneNumber> {
  return call(
    credentials,
    'GET',
    `/${encodeURIComponent(credentials.phoneNumberId)}?fields=display_phone_number,verified_name`,
    phoneNumberSchema,
  );
}

const sendResultSchema = z
  .looseObject({
    messages: z.array(z.looseObject({ id: z.string().min(1) })).min(1),
  })
  .transform((result) => result.messages[0]!.id);

export type TemplateMessage = {
  /** E.164, for example +919876543210. */
  to: string;
  name: string;
  language: string;
  parameters: string[];
};

/** Sends an approved template and returns WhatsApp's message id. */
export function sendTemplateMessage(
  credentials: WhatsAppCredentials,
  message: TemplateMessage,
): Promise<string> {
  return call(
    credentials,
    'POST',
    `/${encodeURIComponent(credentials.phoneNumberId)}/messages`,
    sendResultSchema,
    {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: whatsappRecipient(message.to),
      type: 'template',
      template: {
        name: message.name,
        language: { code: message.language },
        components: message.parameters.length
          ? [
              {
                type: 'body',
                parameters: message.parameters.map((text) => ({ type: 'text', text })),
              },
            ]
          : [],
      },
    },
  );
}

/** Message log `error` values; presentation turns them into staff-facing text. */
export type MessageErrorKey =
  | 'template_missing'
  | 'template_mismatch'
  | 'template_paused'
  | 'undeliverable'
  | 'marketing_limit'
  | 'opted_out'
  | 'not_allowed'
  | 'token'
  | 'billing'
  | 'unavailable'
  | `meta_${number}`
  | 'unknown';

/** Meta's error codes for template sends, reduced to what staff can act on. */
export function whatsappErrorKey(error: unknown): MessageErrorKey {
  if (!(error instanceof WhatsAppError)) return 'unknown';
  if (error.isAuthError) return 'token';
  switch (error.code) {
    case 132001:
      return 'template_missing';
    case 132000:
    case 132005:
    case 132007:
    case 132012:
      return 'template_mismatch';
    case 132015:
    case 132016:
      return 'template_paused';
    case 131026:
      return 'undeliverable';
    case 131049:
      return 'marketing_limit';
    case 131050:
      return 'opted_out';
    case 131030:
      return 'not_allowed';
    case 131042:
      return 'billing';
  }
  if (error.isUnavailable) return 'unavailable';
  return error.code ? `meta_${error.code}` : 'unknown';
}
