'use client';

import { toast } from 'sonner';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';

import type { ActionResult } from '@/lib/errors';

/**
 * Pushes server-side field errors back into react-hook-form and toasts the
 * top-level message. Returns true when the action succeeded.
 */
export function applyActionResult<T, V extends FieldValues>(
  result: ActionResult<T>,
  setError?: UseFormSetError<V>,
): result is { ok: true; data: T } {
  if (result.ok) {
    return true;
  }
  if (result.fieldErrors && setError) {
    for (const [field, messages] of Object.entries(result.fieldErrors)) {
      const message = messages[0];
      if (message) {
        setError(field as Path<V>, { type: 'server', message });
      }
    }
  }
  toast.error(result.error);
  return false;
}
