import 'server-only';

import { mapWithLimit } from '@/lib/concurrency';
import { todayIST } from '@/lib/dates';
import type { AdminSupabase } from '@/lib/supabase/admin';
import type { Tables } from '@/lib/supabase/types';

import { deliverMessage, loadWhatsAppCredentials } from './delivery';
import { candidateMessage, loadTemplateOverrides } from './render';

export type DailyMessageSummary = {
  due: number;
  prepared: number;
  sent: number;
  failed: number;
  errors: number;
};

const PREPARE_CONCURRENCY = 8;
const SEND_CONCURRENCY = 4;

/**
 * Prepares today's reminders and birthday wishes, then sends the ones whose
 * gym uses the WhatsApp Cloud API. Safe to run again the same day: members
 * already messaged today are not candidates, and prepare_message is idempotent.
 */
export async function runDailyMessages(
  admin: AdminSupabase,
  orgId?: string,
  sentBy: string | null = null,
): Promise<DailyMessageSummary> {
  const summary: DailyMessageSummary = { due: 0, prepared: 0, sent: 0, failed: 0, errors: 0 };
  const { data: candidates, error } = await admin.rpc(
    'daily_message_candidates',
    orgId ? { p_org: orgId } : {},
  );
  if (error) throw error;
  summary.due = candidates?.length ?? 0;
  if (!candidates?.length) return summary;

  const overrides = await loadTemplateOverrides(
    admin,
    candidates.map((c) => c.org_id),
  );
  const today = todayIST();

  const rows = await mapWithLimit(candidates, PREPARE_CONCURRENCY, async (candidate) => {
    const message = candidateMessage(candidate, overrides.get(candidate.org_id));
    if (!message) {
      console.error('[messages] candidate skipped', candidate.member_id, candidate.kind);
      summary.errors += 1;
      return null;
    }
    const { data, error: prepareError } = await admin.rpc('prepare_message', {
      p_org: candidate.org_id,
      p_member_id: candidate.member_id,
      p_kind: message.kind,
      p_language: message.language,
      p_body: message.body,
      p_variables: message.variables,
      p_reminder_date: today,
      ...(candidate.invoice_id ? { p_invoice_id: candidate.invoice_id } : {}),
    });
    if (prepareError || !data) {
      console.error('[messages] prepare failed', candidate.member_id, prepareError);
      summary.errors += 1;
      return null;
    }
    summary.prepared += 1;
    return data;
  });

  const automatic = new Map<string, Tables<'message_logs'>[]>();
  for (const row of rows) {
    if (row?.channel === 'whatsapp_api' && row.status === 'prepared') {
      automatic.set(row.org_id, [...(automatic.get(row.org_id) ?? []), row]);
    }
  }

  for (const [org, messages] of automatic) {
    let credentials;
    try {
      credentials = await loadWhatsAppCredentials(admin, org);
    } catch (credentialError) {
      console.error('[messages] could not read WhatsApp credentials', org, credentialError);
      summary.errors += 1;
      continue;
    }
    if (!credentials) continue;
    // One rejected token means every message would fail; leave the rest for staff.
    let tokenRejected = false;
    await mapWithLimit(messages, SEND_CONCURRENCY, async (message) => {
      if (tokenRejected) return;
      try {
        const result = await deliverMessage(admin, credentials, message.id, sentBy);
        if (result.status === 'sent') summary.sent += 1;
        if (result.status === 'failed') {
          summary.failed += 1;
          if (result.authFailed) tokenRejected = true;
        }
      } catch (sendError) {
        console.error('[messages] send failed', message.id, sendError);
        summary.errors += 1;
      }
    });
  }
  return summary;
}
