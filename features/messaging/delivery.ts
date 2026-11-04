import 'server-only';

import { parseSecretKey, openSecret, sealSecret } from '@/lib/crypto/secret-box';
import { env } from '@/lib/env';
import {
  isMessageKind,
  metaParameters,
  metaTemplateName,
  type MessageVariables,
} from '@/lib/messaging/templates';
import {
  sendTemplateMessage,
  whatsappErrorKey,
  type WhatsAppCredentials,
} from '@/lib/messaging/whatsapp-cloud';
import type { AdminSupabase } from '@/lib/supabase/admin';

import { languageOf } from './render';

function encryptionKey(): Buffer {
  return parseSecretKey(env.SECRETS_ENCRYPTION_KEY);
}

function secretContext(orgId: string): string {
  return `whatsapp:${orgId}`;
}

export function sealWhatsAppToken(orgId: string, accessToken: string): string {
  return sealSecret(accessToken, encryptionKey(), secretContext(orgId));
}

/** Decrypts the gym's WhatsApp token. Only the service role can read it for staff. */
export async function loadWhatsAppCredentials(
  admin: AdminSupabase,
  orgId: string,
): Promise<WhatsAppCredentials | null> {
  const { data, error } = await admin
    .from('organization_secrets')
    .select('whatsapp_phone_number_id,whatsapp_access_token_enc')
    .eq('org_id', orgId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.whatsapp_phone_number_id || !data.whatsapp_access_token_enc) return null;
  return {
    phoneNumberId: data.whatsapp_phone_number_id,
    accessToken: openSecret(data.whatsapp_access_token_enc, encryptionKey(), secretContext(orgId)),
  };
}

export type DeliveryResult =
  | { status: 'sent' }
  | { status: 'failed'; error: string; authFailed: boolean }
  /** Another sender holds the message, or it no longer needs sending. */
  | { status: 'busy' };

/**
 * Sends one prepared message through the gym's approved WhatsApp template.
 * The claim in begin_api_send makes concurrent senders (the daily job, a staff
 * retry) send it at most once.
 */
export async function deliverMessage(
  admin: AdminSupabase,
  credentials: WhatsAppCredentials,
  messageId: string,
  sentBy: string | null = null,
): Promise<DeliveryResult> {
  const claimed = await admin.rpc('begin_api_send', { p_message_id: messageId });
  if (claimed.error) throw claimed.error;
  if (!claimed.data) return { status: 'busy' };

  let providerId: string | null = null;
  let errorKey: string | null = null;
  let authFailed = false;
  try {
    const { data, error } = await admin
      .from('message_logs')
      .select('id,template_key,language,variables,members!inner(phone)')
      .eq('id', messageId)
      .single();
    if (error) throw error;
    if (!isMessageKind(data.template_key)) throw new Error('Unknown message kind');
    const language = languageOf(data.language);
    providerId = await sendTemplateMessage(credentials, {
      to: data.members.phone,
      name: metaTemplateName(data.template_key),
      language,
      parameters: metaParameters(
        data.template_key,
        language,
        (data.variables ?? {}) as MessageVariables,
      ),
    });
  } catch (error) {
    errorKey = whatsappErrorKey(error);
    authFailed = errorKey === 'token';
    console.error('[whatsapp] send failed', messageId, errorKey, error);
  }

  const recorded = await admin.rpc('record_message_result', {
    p_message_id: messageId,
    p_provider_message_id: providerId ?? '',
    p_error: errorKey ?? '',
    ...(sentBy ? { p_sent_by: sentBy } : {}),
  });
  if (recorded.error) {
    // The message may have gone out; the claim expires in 10 minutes either way.
    console.error('[whatsapp] could not record result', messageId, recorded.error);
    throw recorded.error;
  }
  return providerId
    ? { status: 'sent' }
    : { status: 'failed', error: errorKey ?? 'unknown', authFailed };
}
