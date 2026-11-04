import 'server-only';

import type { MessageKind } from '@/lib/messaging/templates';
import { createAdminClient, type AdminSupabase } from '@/lib/supabase/admin';
import type { ServerSupabase } from '@/lib/supabase/server';
import type { Tables } from '@/lib/supabase/types';

import { deliverMessage, loadWhatsAppCredentials } from './delivery';
import {
  composeMessage,
  languageOf,
  loadTemplateOverrides,
  receiptVariables,
  welcomeVariables,
  type ComposedMessage,
} from './render';
import { readMessagingSettings } from './settings';

/** What happened to an automatic receipt or welcome message, for the toast. */
export type QueuedMessage = 'queued' | 'sent' | 'failed' | null;

type Db = ServerSupabase | AdminSupabase;

async function prepare(
  db: Db,
  orgId: string,
  memberId: string,
  message: ComposedMessage,
  refs: { invoiceId?: string; paymentId?: string },
): Promise<Tables<'message_logs'>> {
  const { data, error } = await db.rpc('prepare_message', {
    p_org: orgId,
    p_member_id: memberId,
    p_kind: message.kind,
    p_language: message.language,
    p_body: message.body,
    p_variables: message.variables,
    ...(refs.invoiceId ? { p_invoice_id: refs.invoiceId } : {}),
    ...(refs.paymentId ? { p_payment_id: refs.paymentId } : {}),
  });
  if (error) throw error;
  if (!data) throw new Error('prepare_message returned no row');
  return data;
}

/** Sends right away when the gym uses the WhatsApp Cloud API; otherwise it waits in Messages. */
async function sendIfAutomatic(
  orgId: string,
  row: Tables<'message_logs'>,
  sentBy: string | null,
): Promise<QueuedMessage> {
  if (row.status === 'sent' || row.status === 'delivered') return 'sent';
  if (row.status !== 'prepared') return null;
  if (row.channel !== 'whatsapp_api') return 'queued';
  const admin = createAdminClient();
  const credentials = await loadWhatsAppCredentials(admin, orgId);
  if (!credentials) return 'queued';
  const result = await deliverMessage(admin, credentials, row.id, sentBy);
  return result.status === 'sent' ? 'sent' : result.status === 'failed' ? 'failed' : 'queued';
}

function enabled(settings: Tables<'organizations'>['settings'], kind: MessageKind): boolean {
  return readMessagingSettings(settings).kinds[kind];
}

/**
 * Prepares (and with the Cloud API, sends) the receipt for a payment. Never
 * throws: the payment is already recorded, and a message problem must not
 * look like a failed payment.
 */
export async function queuePaymentReceipt(
  db: Db,
  paymentId: string,
  sentBy: string | null,
): Promise<QueuedMessage> {
  try {
    const { data, error } = await db
      .from('payments')
      .select(
        'id,org_id,amount,is_reversal,member_id,invoice_id,invoices!inner(invoice_number,balance_due),members!inner(full_name,consent_messaging,preferred_language,deleted_at),organizations!inner(name,settings)',
      )
      .eq('id', paymentId)
      .maybeSingle();
    if (error) throw error;
    if (!data || data.is_reversal || data.amount <= 0) return null;
    const member = data.members;
    if (!member.consent_messaging || member.deleted_at) return null;
    if (!enabled(data.organizations.settings, 'payment_receipt')) return null;
    const overrides = (await loadTemplateOverrides(db, [data.org_id])).get(data.org_id);
    const message = composeMessage(
      overrides,
      'payment_receipt',
      languageOf(member.preferred_language),
      receiptVariables({
        fullName: member.full_name,
        gym: data.organizations.name,
        amount: data.amount,
        invoiceNumber: data.invoices.invoice_number,
        balanceDue: data.invoices.balance_due,
        invoiceId: data.invoice_id,
      }),
    );
    const row = await prepare(db, data.org_id, data.member_id, message, {
      invoiceId: data.invoice_id,
      paymentId: data.id,
    });
    return await sendIfAutomatic(data.org_id, row, sentBy);
  } catch (error) {
    console.error('[messages] receipt not prepared', paymentId, error);
    return null;
  }
}

/** Prepares (and with the Cloud API, sends) the welcome message. Never throws. */
export async function queueWelcome(
  db: Db,
  orgId: string,
  memberId: string,
  sentBy: string | null,
): Promise<QueuedMessage> {
  try {
    const { data, error } = await db
      .from('members')
      .select(
        'id,org_id,full_name,member_code,qr_version,consent_messaging,preferred_language,deleted_at,organizations!inner(name,settings)',
      )
      .eq('org_id', orgId)
      .eq('id', memberId)
      .maybeSingle();
    if (error) throw error;
    if (!data || !data.consent_messaging || data.deleted_at) return null;
    if (!enabled(data.organizations.settings, 'welcome')) return null;
    const overrides = (await loadTemplateOverrides(db, [orgId])).get(orgId);
    const message = composeMessage(
      overrides,
      'welcome',
      languageOf(data.preferred_language),
      welcomeVariables({
        memberId: data.id,
        qrVersion: data.qr_version,
        fullName: data.full_name,
        gym: data.organizations.name,
        code: data.member_code,
      }),
    );
    const row = await prepare(db, orgId, data.id, message, {});
    return await sendIfAutomatic(orgId, row, sentBy);
  } catch (error) {
    console.error('[messages] welcome not prepared', memberId, error);
    return null;
  }
}
