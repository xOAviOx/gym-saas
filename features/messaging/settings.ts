import {
  MESSAGE_KINDS,
  isMessageLanguage,
  type MessageKind,
  type MessageLanguage,
} from '@/lib/messaging/templates';
import type { Json } from '@/lib/supabase/database.types';

export const MESSAGING_PROVIDERS = ['manual', 'whatsapp_api'] as const;
export type MessagingProvider = (typeof MESSAGING_PROVIDERS)[number];

export type MessagingSettings = {
  kinds: Record<MessageKind, boolean>;
  reminderDaysBefore: number[];
  expiredDaysAfter: number[];
  duesDaysAfter: number[];
  defaultLanguage: MessageLanguage;
  provider: MessagingProvider;
};

/** Mirrors the defaults in daily_message_candidates and message_kind_enabled. */
export const DEFAULT_MESSAGING_SETTINGS: MessagingSettings = {
  kinds: Object.fromEntries(MESSAGE_KINDS.map((kind) => [kind, true])) as Record<
    MessageKind,
    boolean
  >,
  reminderDaysBefore: [7, 3, 0],
  expiredDaysAfter: [1],
  duesDaysAfter: [3, 7],
  defaultLanguage: 'en',
  provider: 'manual',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function dayList(value: unknown, fallback: number[]): number[] {
  if (!Array.isArray(value)) return fallback;
  const days = value.filter((v): v is number => typeof v === 'number' && Number.isInteger(v));
  return [...new Set(days)].sort((a, b) => b - a);
}

/** Reads the messaging keys of organizations.settings, filling in defaults. */
export function readMessagingSettings(settings: Json | null | undefined): MessagingSettings {
  const s = isRecord(settings) ? settings : {};
  const kinds = isRecord(s.message_kinds) ? s.message_kinds : {};
  return {
    kinds: Object.fromEntries(MESSAGE_KINDS.map((kind) => [kind, kinds[kind] !== false])) as Record<
      MessageKind,
      boolean
    >,
    reminderDaysBefore: dayList(
      s.reminder_days_before,
      DEFAULT_MESSAGING_SETTINGS.reminderDaysBefore,
    ),
    expiredDaysAfter: dayList(
      s.expired_reminder_days_after,
      DEFAULT_MESSAGING_SETTINGS.expiredDaysAfter,
    ),
    duesDaysAfter: dayList(s.dues_reminder_days_after, DEFAULT_MESSAGING_SETTINGS.duesDaysAfter),
    defaultLanguage:
      typeof s.default_language === 'string' && isMessageLanguage(s.default_language)
        ? s.default_language
        : DEFAULT_MESSAGING_SETTINGS.defaultLanguage,
    provider: s.messaging_provider === 'whatsapp_api' ? 'whatsapp_api' : 'manual',
  };
}

/** The keys save_messaging_settings expects, all of them every time. */
export function messagingSettingsRecord(settings: MessagingSettings) {
  return {
    reminder_days_before: settings.reminderDaysBefore,
    expired_reminder_days_after: settings.expiredDaysAfter,
    dues_reminder_days_after: settings.duesDaysAfter,
    default_language: settings.defaultLanguage,
    messaging_provider: settings.provider,
    message_kinds: settings.kinds,
  };
}
