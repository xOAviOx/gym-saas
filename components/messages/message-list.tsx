'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { applyActionResult } from '@/components/shared/apply-action-result';
import { SubmitButton } from '@/components/shared/submit-button';
import { Button } from '@/components/ui/button';
import {
  markMessageSent,
  prepareTodayMessages,
  retryMessage,
  skipMessage,
} from '@/features/messaging/actions';
import { messageErrorText } from '@/features/messaging/presentation';
import type { MessageRow, MessageStatus } from '@/features/messaging/types';
import { copy } from '@/lib/copy';
import { formatDateTime } from '@/lib/dates';
import { waMeUrl } from '@/lib/phone';
import { cn } from '@/lib/utils';

const STATUS_CLASS: Record<MessageStatus, string> = {
  prepared: 'bg-info-soft text-info',
  sent: 'bg-success-soft text-success',
  delivered: 'bg-success-soft text-success',
  failed: 'bg-danger-soft text-danger',
  skipped: 'bg-muted text-muted-foreground',
};

const pillClass =
  'inline-flex min-h-6 items-center rounded-full px-2.5 py-1 text-[11px] leading-4 font-medium tracking-[0.05em] uppercase';

export function PrepareNowButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function run() {
    setPending(true);
    try {
      const result = await prepareTodayMessages();
      if (applyActionResult(result)) {
        toast.success(copy.messages.preparedNow(result.data.prepared, result.data.sent));
        router.refresh();
      }
    } catch {
      toast.error(copy.errors.network);
    }
    setPending(false);
  }
  return (
    <SubmitButton
      type="button"
      variant="outline"
      pending={pending}
      pendingLabel={copy.messages.preparing}
      onClick={run}
    >
      {copy.messages.prepareNow}
    </SubmitButton>
  );
}

function MessageActions({ message, automatic }: { message: MessageRow; automatic: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState<'send' | 'skip' | 'retry' | null>(null);
  const reachable = message.member.consent && !message.member.deleted;
  const canRetry =
    automatic &&
    reachable &&
    !message.sending &&
    (message.status === 'failed' || message.channel === 'whatsapp_api');

  async function run(kind: 'send' | 'skip' | 'retry') {
    setPending(kind);
    try {
      if (kind === 'retry') {
        const result = await retryMessage({ messageId: message.id });
        if (applyActionResult(result)) {
          if (result.data.status === 'sent') toast.success(copy.messages.retrySent);
          else toast.warning(copy.messages.retryFailed);
          router.refresh();
        }
      } else {
        const action = kind === 'send' ? markMessageSent : skipMessage;
        if (applyActionResult(await action({ messageId: message.id }))) {
          toast.success(kind === 'send' ? copy.messages.marked : copy.messages.skipped);
          router.refresh();
        }
      }
    } catch {
      toast.error(copy.errors.network);
    }
    setPending(null);
  }

  return (
    <div className="flex flex-wrap gap-2">
      {reachable && !message.sending ? (
        <Button asChild aria-disabled={pending !== null}>
          <a
            href={waMeUrl(message.member.phone, message.body)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={copy.messages.sendFor(message.member.name)}
            onClick={(event) => {
              if (pending) {
                event.preventDefault();
                return;
              }
              void run('send');
            }}
          >
            {copy.messages.send}
          </a>
        </Button>
      ) : (
        <Button disabled>{copy.messages.send}</Button>
      )}
      {canRetry ? (
        <SubmitButton
          type="button"
          variant="outline"
          pending={pending === 'retry'}
          disabled={pending !== null}
          onClick={() => run('retry')}
        >
          {copy.messages.retry}
        </SubmitButton>
      ) : null}
      <SubmitButton
        type="button"
        variant="ghost"
        pending={pending === 'skip'}
        disabled={pending !== null || message.sending}
        onClick={() => run('skip')}
        aria-label={copy.messages.skipFor(message.member.name)}
      >
        {copy.messages.skip}
      </SubmitButton>
    </div>
  );
}

function timeLine(message: MessageRow): string {
  if (message.status === 'sent' || message.status === 'delivered') {
    return `${copy.messages.sentAt(formatDateTime(message.sentAt ?? message.updatedAt))} · ${copy.messages.channels[message.channel]}`;
  }
  if (message.status === 'skipped') {
    return copy.messages.skippedAt(formatDateTime(message.updatedAt));
  }
  return copy.messages.preparedAt(formatDateTime(message.createdAt));
}

export function MessageList({
  rows,
  pending,
  automatic,
}: {
  rows: MessageRow[];
  /** True on the "To send" list, where staff act on each message. */
  pending: boolean;
  automatic: boolean;
}) {
  return (
    <ul className="grid gap-3">
      {rows.map((message) => {
        const reason = messageErrorText(message.error, message.kind, message.language);
        return (
          <li key={message.id} className="bg-card grid gap-3 rounded-xl border p-4 md:p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <Link
                  href={`/members/${message.member.id}`}
                  className="decoration-input text-base font-semibold underline-offset-4 hover:underline"
                >
                  {message.member.name}
                </Link>
                <p className="text-muted-foreground mt-1 text-xs">
                  {copy.messageKinds[message.kind]} ·{' '}
                  {copy.messages.languageShort[message.language]}
                </p>
              </div>
              <span className={cn(pillClass, STATUS_CLASS[message.status])}>
                {message.sending ? copy.messages.queuedApi : copy.messages.statuses[message.status]}
              </span>
            </div>
            <p className="bg-muted/50 rounded-lg p-3 text-sm leading-relaxed break-words whitespace-pre-wrap">
              {message.body}
            </p>
            <p className="text-muted-foreground text-xs">{timeLine(message)}</p>
            {reason ? <p className="text-danger text-sm">{reason}</p> : null}
            {pending && !message.member.consent ? (
              <p className="text-warning text-sm">{copy.errors.db.messaging_consent_missing}</p>
            ) : null}
            {pending ? <MessageActions message={message} automatic={automatic} /> : null}
          </li>
        );
      })}
    </ul>
  );
}
