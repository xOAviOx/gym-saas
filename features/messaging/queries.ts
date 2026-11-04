import 'server-only';

import {
  isMessageKind,
  isMessageLanguage,
  type MessageKind,
  type MessageLanguage,
} from '@/lib/messaging/templates';
import type { ServerSupabase } from '@/lib/supabase/server';

import type { MessageList } from './schema';
import type { MessageRow, MessageTemplateRow, WhatsAppConnection } from './types';

export const MESSAGE_PAGE_SIZE = 50;
const QUEUE_LIMIT = 200;
const SENDING_WINDOW_MS = 10 * 60_000;

export async function getMessages(
  supabase: ServerSupabase,
  orgId: string,
  list: MessageList,
  page = 1,
): Promise<{ rows: MessageRow[]; hasMore: boolean }> {
  const query = supabase
    .from('message_logs')
    .select(
      'id,template_key,language,body,status,channel,error,created_at,updated_at,sent_at,api_attempted_at,invoice_id,members!inner(id,full_name,member_code,phone,consent_messaging,deleted_at)',
    )
    .eq('org_id', orgId);
  const from = (page - 1) * MESSAGE_PAGE_SIZE;
  const { data, error } =
    list === 'queue'
      ? await query
          .in('status', ['prepared', 'failed'])
          .order('created_at', { ascending: false })
          .limit(QUEUE_LIMIT)
      : await query
          .in('status', ['sent', 'delivered', 'skipped'])
          .order('updated_at', { ascending: false })
          .range(from, from + MESSAGE_PAGE_SIZE);
  if (error) throw error;
  const now = Date.now();
  const rows: MessageRow[] = (data ?? []).map((row) => ({
    id: row.id,
    kind: (isMessageKind(row.template_key) ? row.template_key : 'welcome') as MessageKind,
    language: (isMessageLanguage(row.language) ? row.language : 'en') as MessageLanguage,
    body: row.body,
    status: row.status,
    channel: row.channel,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sentAt: row.sent_at,
    sending:
      row.status === 'prepared' &&
      !!row.api_attempted_at &&
      now - new Date(row.api_attempted_at).getTime() < SENDING_WINDOW_MS,
    invoiceId: row.invoice_id,
    member: {
      id: row.members.id,
      name: row.members.full_name,
      code: row.members.member_code,
      phone: row.members.phone,
      consent: row.members.consent_messaging,
      deleted: row.members.deleted_at !== null,
    },
  }));
  if (list === 'history') {
    return { rows: rows.slice(0, MESSAGE_PAGE_SIZE), hasMore: rows.length > MESSAGE_PAGE_SIZE };
  }
  return { rows, hasMore: false };
}

/** Messages waiting for staff: prepared by hand or failed at WhatsApp. */
export async function countPendingMessages(
  supabase: ServerSupabase,
  orgId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('message_logs')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .in('status', ['prepared', 'failed']);
  if (error) throw error;
  return count ?? 0;
}

export async function getMessageTemplates(
  supabase: ServerSupabase,
  orgId: string,
): Promise<MessageTemplateRow[]> {
  const { data, error } = await supabase
    .from('message_templates')
    .select('template_key,language,body,updated_at')
    .eq('org_id', orgId);
  if (error) throw error;
  return (data ?? []).flatMap((row) =>
    isMessageKind(row.template_key) && isMessageLanguage(row.language)
      ? [
          {
            kind: row.template_key,
            language: row.language,
            body: row.body,
            updatedAt: row.updated_at,
          },
        ]
      : [],
  );
}

/** Owner and manager only: RLS hides the secrets row from staff. */
export async function getWhatsAppConnection(
  supabase: ServerSupabase,
  orgId: string,
): Promise<WhatsAppConnection | null> {
  const { data, error } = await supabase
    .from('organization_secrets')
    .select('whatsapp_phone_number_id,whatsapp_display_phone,whatsapp_verified_at')
    .eq('org_id', orgId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.whatsapp_phone_number_id) return null;
  return {
    phoneNumberId: data.whatsapp_phone_number_id,
    displayPhone: data.whatsapp_display_phone,
    verifiedAt: data.whatsapp_verified_at,
  };
}
