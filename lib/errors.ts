import { z } from 'zod';

import { copy } from '@/lib/copy';

export type ActionErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'validation'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'unknown';

export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: ActionErrorCode; fieldErrors?: Record<string, string[]> };

export class ActionError extends Error {
  constructor(
    message: string,
    public readonly code: ActionErrorCode = 'unknown',
    public readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ActionError';
  }
}

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail<T = null>(
  error: string,
  code: ActionErrorCode = 'unknown',
  fieldErrors?: Record<string, string[]>,
): ActionResult<T> {
  return { ok: false, error, code, fieldErrors };
}

/**
 * Validates input with a zod schema and converts issues into field errors.
 * Unknown keys are rejected because every schema is a strict object.
 */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const flattened = z.flattenError(result.error);
    const fieldErrors: Record<string, string[]> = {};
    for (const [key, messages] of Object.entries<unknown>(flattened.fieldErrors)) {
      if (Array.isArray(messages) && messages.length > 0) {
        fieldErrors[key] = messages.filter((m): m is string => typeof m === 'string');
      }
    }
    const hasUnknownKeys = result.error.issues.some((issue) => issue.code === 'unrecognized_keys');
    const message =
      flattened.formErrors[0] ??
      (hasUnknownKeys ? copy.validation.unknownFields : copy.errors.validation);
    throw new ActionError(message, 'validation', fieldErrors);
  }
  return result.data;
}

type PostgrestLikeError = { code?: string; message?: string; details?: string; hint?: string };

function isPostgrestError(error: unknown): error is PostgrestLikeError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as PostgrestLikeError).message === 'string'
  );
}

/** Maps database errors (from RPCs, triggers and constraints) to friendly copy. */
export function toActionError(error: unknown): ActionError {
  if (error instanceof ActionError) {
    return error;
  }
  if (isPostgrestError(error)) {
    const message = error.message ?? '';
    const code = error.code ?? '';

    if (code === '42501' || /forbidden|permission denied/i.test(message)) {
      return new ActionError(copy.errors.forbidden, 'forbidden');
    }
    if (/unauthenticated/i.test(message)) {
      return new ActionError(copy.errors.unauthenticated, 'unauthenticated');
    }
    if (code === '23505') {
      if (/members_org_phone_unique/.test(message)) {
        return new ActionError(copy.errors.db.duplicate_phone, 'conflict');
      }
      if (/payments_org_utr_unique/.test(message)) {
        return new ActionError(copy.errors.db.duplicate_utr, 'conflict');
      }
      if (/invoices_org_id_invoice_number_key/.test(message)) {
        return new ActionError(copy.errors.db.duplicate_invoice_number, 'conflict');
      }
      return new ActionError(copy.errors.conflict, 'conflict');
    }
    if (code === 'PGRST116') {
      return new ActionError(copy.errors.notFound, 'not_found');
    }
    const key = message.split(':')[0]?.trim();
    if (key && copy.errors.db[key]) {
      const friendly = copy.errors.db[key];
      const errorCode: ActionErrorCode =
        key === 'forbidden'
          ? 'forbidden'
          : key === 'unauthenticated'
            ? 'unauthenticated'
            : /not_found/.test(key)
              ? 'not_found'
              : /duplicate|limit/.test(key)
                ? 'conflict'
                : 'unknown';
      return new ActionError(friendly, errorCode);
    }
    if (/fetch failed|ECONNREFUSED|network/i.test(message)) {
      return new ActionError(copy.errors.network, 'unknown');
    }
  }
  if (error instanceof Error && /fetch failed|ECONNREFUSED/i.test(error.message)) {
    return new ActionError(copy.errors.network, 'unknown');
  }
  return new ActionError(copy.errors.generic, 'unknown');
}

/** redirect() and notFound() work by throwing; those must propagate to Next.js. */
function isNextInterrupt(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('digest' in error)) {
    return false;
  }
  const digest = (error as { digest?: unknown }).digest;
  return (
    typeof digest === 'string' &&
    (digest.startsWith('NEXT_REDIRECT') ||
      digest === 'NEXT_NOT_FOUND' ||
      digest.startsWith('NEXT_HTTP_ERROR_FALLBACK'))
  );
}

/**
 * Wraps a server action body so every failure becomes a typed result instead of
 * an opaque 500. Next.js redirects thrown inside are re-thrown untouched.
 */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return ok(await fn());
  } catch (error) {
    if (isNextInterrupt(error)) {
      throw error;
    }
    const actionError = toActionError(error);
    if (actionError.code === 'unknown') {
      console.error('[action]', error);
    }
    return fail<T>(actionError.message, actionError.code, actionError.fieldErrors);
  }
}

/** Throws the mapped error for a Supabase `{ data, error }` response. */
export function unwrap<T>(response: { data: T | null; error: unknown }): T {
  if (response.error) {
    throw toActionError(response.error);
  }
  if (response.data === null || response.data === undefined) {
    throw new ActionError(copy.errors.notFound, 'not_found');
  }
  return response.data;
}
