import type { Metadata } from 'next';
import Link from 'next/link';

import { MessageIcon } from '@/components/icons';
import { MessageList, PrepareNowButton } from '@/components/messages/message-list';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { countPendingMessages, getMessages } from '@/features/messaging/queries';
import { messageListSchema, type MessageList as ListName } from '@/features/messaging/schema';
import { readMessagingSettings } from '@/features/messaging/settings';
import { can } from '@/lib/auth/roles';
import { requireOrg } from '@/lib/auth/session';
import { copy } from '@/lib/copy';
import { createClient } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: copy.messages.title };

function messagesUrl(list: ListName, page = 1) {
  const params = new URLSearchParams();
  if (list !== 'queue') params.set('list', list);
  if (page > 1) params.set('page', String(page));
  return `/messages${params.size ? `?${params}` : ''}`;
}

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ list?: string; page?: string }>;
}) {
  const ctx = await requireOrg();
  const params = await searchParams;
  const requested = messageListSchema.safeParse(params.list ?? 'queue');
  const list = requested.success ? requested.data : 'queue';
  const page = Math.min(1000, Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1));
  const supabase = await createClient();
  const [{ rows, hasMore }, pendingCount] = await Promise.all([
    getMessages(supabase, ctx.org.id, list, list === 'history' ? page : 1),
    countPendingMessages(supabase, ctx.org.id),
  ]);
  const automatic = readMessagingSettings(ctx.org.settings).provider === 'whatsapp_api';
  const tabs: [ListName, string, number | null][] = [
    ['queue', copy.messages.queueTab, pendingCount],
    ['history', copy.messages.historyTab, null],
  ];

  return (
    <>
      <PageHeader
        title={copy.messages.title}
        description={copy.messages.description}
        action={<PrepareNowButton />}
      />
      <div className="grid gap-4">
        <div className="bg-card animate-enter flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 text-sm [--index:1]">
          <p className="text-muted-foreground leading-relaxed">
            {automatic ? copy.messages.autoNote : copy.messages.manualNote}
          </p>
          {can.manageSettings(ctx.role) ? (
            <Link
              href="/settings/messaging"
              className="decoration-input shrink-0 font-medium underline underline-offset-4 hover:decoration-current"
            >
              {copy.messages.settings}
            </Link>
          ) : null}
        </div>
        <nav aria-label={copy.messages.tabs} className="flex gap-2">
          {tabs.map(([value, label, count]) => (
            <Link
              key={value}
              href={messagesUrl(value)}
              aria-current={list === value ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm transition-colors duration-150',
                list === value
                  ? 'bg-card border-foreground text-foreground font-medium'
                  : 'bg-card text-muted-foreground hover:border-input hover:text-foreground',
              )}
            >
              {label}
              {count !== null ? (
                <span className="bg-muted tabular ml-2 rounded-full px-1.5 py-0.5 text-xs">
                  {count.toLocaleString('en-IN')}
                </span>
              ) : null}
            </Link>
          ))}
        </nav>
        {rows.length === 0 ? (
          <EmptyState
            icon={MessageIcon}
            title={list === 'queue' ? copy.messages.emptyQueue : copy.messages.emptyHistory}
            body={list === 'queue' ? copy.messages.emptyQueueBody : copy.messages.emptyHistoryBody}
          />
        ) : (
          <div className="animate-enter [--index:2]">
            <MessageList rows={rows} pending={list === 'queue'} automatic={automatic} />
          </div>
        )}
        {list === 'history' && (page > 1 || hasMore) ? (
          <nav
            aria-label={copy.messages.pagination}
            className="flex items-center justify-between gap-2"
          >
            {page > 1 ? (
              <Button asChild variant="outline">
                <Link href={messagesUrl('history', page - 1)}>{copy.messages.newer}</Link>
              </Button>
            ) : (
              <span />
            )}
            {hasMore ? (
              <Button asChild variant="outline">
                <Link href={messagesUrl('history', page + 1)}>{copy.messages.older}</Link>
              </Button>
            ) : null}
          </nav>
        ) : null}
      </div>
    </>
  );
}
