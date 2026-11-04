import { NextResponse } from 'next/server';

import { runDailyMessages } from '@/features/messaging/daily';
import { isCronAuthorized } from '@/lib/cron-auth';
import { env } from '@/lib/env';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function reply(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * Daily job, called by Vercel Cron at 04:30 UTC (10:00 IST). Statuses are
 * refreshed first so reminders see today's expiries. Every step is safe to
 * repeat, so a retried or manual run does no harm.
 */
export async function GET(request: Request) {
  if (!isCronAuthorized(request.headers.get('authorization'), env.CRON_SECRET)) {
    return reply(401, { error: 'unauthorized' });
  }
  const admin = createAdminClient();
  const result: Record<string, unknown> = {};
  let failed = false;

  async function step(name: string, run: () => Promise<unknown>) {
    try {
      result[name] = await run();
    } catch (error) {
      failed = true;
      result[name] = 'failed';
      console.error(`[cron] ${name} failed`, error);
    }
  }

  async function rpc<T>(call: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
    const { data, error } = await call;
    if (error) throw error;
    return data;
  }

  await step('statuses', () => rpc(admin.rpc('recompute_all_statuses', {})));
  await step('maintenance', () => rpc(admin.rpc('daily_maintenance')));
  await step('staleMessages', () => rpc(admin.rpc('expire_stale_messages')));
  await step('messages', () => runDailyMessages(admin));

  return reply(failed ? 500 : 200, { ok: !failed, ...result });
}
