'use server';

import { revalidatePath } from 'next/cache';

import { PRIVILEGED_ROLES } from '@/lib/auth/roles';
import { authorize } from '@/lib/auth/session';
import { copy } from '@/lib/copy';
import { ActionError, parseInput, runAction, unwrap, type ActionResult } from '@/lib/errors';
import { WhatsAppError, getPhoneNumber } from '@/lib/messaging/whatsapp-cloud';
import { createAdminClient } from '@/lib/supabase/admin';

import { runDailyMessages } from './daily';
import { deliverMessage, loadWhatsAppCredentials, sealWhatsAppToken } from './delivery';
import {
  messageRefSchema,
  messageTemplateSchema,
  messagingSettingsSchema,
  templateRefSchema,
  whatsappCredentialsSchema,
} from './schema';
import { messagingSettingsRecord, readMessagingSettings } from './settings';

function revalidateMessages() {
  revalidatePath('/messages');
  revalidatePath('/today');
  revalidatePath('/more');
}

function revalidateMessagingSettings() {
  revalidatePath('/settings/messaging');
  revalidatePath('/settings/messaging/templates');
  revalidateMessages();
}

export async function markMessageSent(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const { supabase } = await authorize();
    const { messageId } = parseInput(messageRefSchema, input);
    unwrap(await supabase.rpc('mark_message_sent', { p_message_id: messageId }));
    revalidateMessages();
    return null;
  });
}

export async function skipMessage(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const { supabase } = await authorize();
    const { messageId } = parseInput(messageRefSchema, input);
    unwrap(await supabase.rpc('skip_message', { p_message_id: messageId }));
    revalidateMessages();
    return null;
  });
}

/** Sends one waiting or failed message again through the WhatsApp Cloud API. */
export async function retryMessage(
  input: unknown,
): Promise<ActionResult<{ status: 'sent' | 'failed' }>> {
  return runAction(async () => {
    const { supabase, ctx } = await authorize();
    const { messageId } = parseInput(messageRefSchema, input);
    const response = await supabase
      .from('message_logs')
      .select('id,status')
      .eq('org_id', ctx.org.id)
      .eq('id', messageId)
      .maybeSingle();
    const message = unwrap(response);
    if (message.status !== 'prepared' && message.status !== 'failed') {
      throw new ActionError(copy.errors.db.message_not_pending!, 'conflict');
    }
    const notConfigured = new ActionError(copy.errors.db.whatsapp_not_configured!, 'validation');
    if (readMessagingSettings(ctx.org.settings).provider !== 'whatsapp_api') throw notConfigured;
    const admin = createAdminClient();
    const credentials = await loadWhatsAppCredentials(admin, ctx.org.id);
    if (!credentials) throw notConfigured;
    const result = await deliverMessage(admin, credentials, message.id, ctx.teamMemberId);
    revalidateMessages();
    if (result.status === 'busy') {
      throw new ActionError(copy.errors.db.message_sending!, 'conflict');
    }
    return { status: result.status };
  });
}

/** Runs today's reminder preparation for this gym now instead of waiting for 10:00. */
export async function prepareTodayMessages(): Promise<
  ActionResult<{ prepared: number; sent: number }>
> {
  return runAction(async () => {
    const { ctx } = await authorize();
    const summary = await runDailyMessages(createAdminClient(), ctx.org.id, ctx.teamMemberId);
    revalidateMessages();
    return { prepared: summary.prepared, sent: summary.sent };
  });
}

export async function saveMessagingSettings(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const { supabase, ctx } = await authorize(PRIVILEGED_ROLES);
    const data = parseInput(messagingSettingsSchema, input);
    const { error } = await supabase.rpc('save_messaging_settings', {
      p_org: ctx.org.id,
      p_settings: messagingSettingsRecord(data),
    });
    if (error) throw error;
    revalidateMessagingSettings();
    return null;
  });
}

export async function saveMessageTemplate(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const { supabase, ctx } = await authorize(PRIVILEGED_ROLES);
    const data = parseInput(messageTemplateSchema, input);
    const { error } = await supabase.rpc('save_message_template', {
      p_org: ctx.org.id,
      p_kind: data.kind,
      p_language: data.language,
      p_body: data.body,
    });
    if (error) throw error;
    revalidateMessagingSettings();
    return null;
  });
}

export async function resetMessageTemplate(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const { supabase, ctx } = await authorize(PRIVILEGED_ROLES);
    const data = parseInput(templateRefSchema, input);
    const { error } = await supabase.rpc('save_message_template', {
      p_org: ctx.org.id,
      p_kind: data.kind,
      p_language: data.language,
      p_body: '',
    });
    if (error) throw error;
    revalidateMessagingSettings();
    return null;
  });
}

/** Checks the token and number with WhatsApp before anything is stored. */
export async function saveWhatsAppCredentials(
  input: unknown,
): Promise<ActionResult<{ displayPhone: string | null; verifiedName: string | null }>> {
  return runAction(async () => {
    const { supabase, ctx } = await authorize(PRIVILEGED_ROLES);
    const data = parseInput(whatsappCredentialsSchema, input);
    const t = copy.messagingSettings;
    let phone;
    try {
      phone = await getPhoneNumber(data);
    } catch (error) {
      if (!(error instanceof WhatsAppError)) throw error;
      console.error('[whatsapp] verify failed', error.status, error.code, error.message);
      if (error.isAuthError) {
        throw new ActionError(t.invalidCredentials, 'validation', {
          accessToken: [t.invalidCredentials],
        });
      }
      if (error.code === 100 || error.status === 404) {
        throw new ActionError(t.numberNotFound, 'validation', {
          phoneNumberId: [t.numberNotFound],
        });
      }
      if (error.isUnavailable) throw new ActionError(copy.messages.errors.unavailable, 'unknown');
      throw new ActionError(t.invalidCredentials, 'validation', {
        accessToken: [t.invalidCredentials],
      });
    }
    if (phone.id !== data.phoneNumberId) {
      throw new ActionError(t.numberNotFound, 'validation', { phoneNumberId: [t.numberNotFound] });
    }
    const displayPhone = phone.displayPhone?.slice(0, 40) ?? null;
    const { error } = await supabase.rpc('save_whatsapp_credentials', {
      p_org: ctx.org.id,
      p_phone_number_id: data.phoneNumberId,
      p_token_enc: sealWhatsAppToken(ctx.org.id, data.accessToken),
      p_display_phone: displayPhone ?? '',
    });
    if (error) throw error;
    revalidateMessagingSettings();
    return { displayPhone, verifiedName: phone.verifiedName };
  });
}

export async function removeWhatsAppCredentials(): Promise<ActionResult<null>> {
  return runAction(async () => {
    const { supabase, ctx } = await authorize(PRIVILEGED_ROLES);
    const { error } = await supabase.rpc('remove_whatsapp_credentials', { p_org: ctx.org.id });
    if (error) throw error;
    revalidateMessagingSettings();
    return null;
  });
}
