import { copy } from '@/lib/copy';
import {
  metaTemplateName,
  type MessageKind,
  type MessageLanguage,
} from '@/lib/messaging/templates';

/** Staff-facing reason for a failed or expired message, from the stored error key. */
export function messageErrorText(
  error: string | null,
  kind: MessageKind,
  language: MessageLanguage,
): string | null {
  if (!error) return null;
  const t = copy.messages.errors;
  switch (error) {
    case 'expired':
      return copy.messages.expired;
    case 'template_missing':
      return t.templateMissing(metaTemplateName(kind), language);
    case 'template_mismatch':
      return t.templateMismatch(metaTemplateName(kind));
    case 'template_paused':
      return t.templatePaused;
    case 'undeliverable':
      return t.undeliverable;
    case 'marketing_limit':
      return t.marketingLimit;
    case 'opted_out':
      return t.optedOut;
    case 'not_allowed':
      return t.notAllowed;
    case 'token':
      return t.token;
    case 'billing':
      return t.billing;
    case 'unavailable':
      return t.unavailable;
  }
  const code = /^meta_(\d+)$/.exec(error)?.[1];
  return t.generic(code ? Number(code) : null);
}
