'use client';

import { toast } from 'sonner';

import type { QueuedMessage } from '@/features/messaging/hooks';
import { copy } from '@/lib/copy';

/** Tells staff what happened to the automatic receipt or welcome message. */
export function announceMessage(message: QueuedMessage, kind: 'receipt' | 'welcome') {
  const t = copy.messages;
  if (message === 'sent') toast.success(kind === 'receipt' ? t.receiptSent : t.welcomeSent);
  if (message === 'queued') toast.info(kind === 'receipt' ? t.receiptQueued : t.welcomeQueued);
  if (message === 'failed') toast.warning(kind === 'receipt' ? t.receiptFailed : t.welcomeFailed);
}
