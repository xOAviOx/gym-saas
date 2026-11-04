import { z } from 'zod';

import { copy } from '@/lib/copy';
import {
  MAX_TEMPLATE_LENGTH,
  MESSAGE_KINDS,
  MESSAGE_LANGUAGES,
  parseDayList,
  unknownVariables,
} from '@/lib/messaging/templates';

import { MESSAGING_PROVIDERS } from './settings';

export const messageKindSchema = z.enum(MESSAGE_KINDS);
export const messageLanguageSchema = z.enum(MESSAGE_LANGUAGES);

const dayListSchema = (min: number, max: number) =>
  z.string().transform((value, ctx) => {
    const days = parseDayList(value, min, max);
    if (!days) {
      ctx.addIssue({ code: 'custom', message: copy.messagingSettings.dayListInvalid(min, max) });
      return z.NEVER;
    }
    return days;
  });

export const messagingSettingsSchema = z.strictObject({
  kinds: z.strictObject(
    Object.fromEntries(MESSAGE_KINDS.map((kind) => [kind, z.boolean()])) as Record<
      (typeof MESSAGE_KINDS)[number],
      z.ZodBoolean
    >,
  ),
  reminderDaysBefore: dayListSchema(0, 30),
  expiredDaysAfter: dayListSchema(1, 60),
  duesDaysAfter: dayListSchema(1, 90),
  defaultLanguage: messageLanguageSchema,
  provider: z.enum(MESSAGING_PROVIDERS),
});
export type MessagingSettingsInput = z.input<typeof messagingSettingsSchema>;

export const messageTemplateSchema = z
  .strictObject({
    kind: messageKindSchema,
    language: messageLanguageSchema,
    body: z
      .string()
      .trim()
      .min(1, copy.validation.required)
      .max(MAX_TEMPLATE_LENGTH, copy.validation.tooLong(MAX_TEMPLATE_LENGTH)),
  })
  .superRefine((value, ctx) => {
    const unknown = unknownVariables(value.kind, value.body);
    if (unknown.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['body'],
        message: copy.messageTemplates.unknownVariable(unknown.map((v) => `{${v}}`).join(', ')),
      });
    }
  });
export type MessageTemplateInput = z.input<typeof messageTemplateSchema>;

export const templateRefSchema = z.strictObject({
  kind: messageKindSchema,
  language: messageLanguageSchema,
});

export const whatsappCredentialsSchema = z.strictObject({
  phoneNumberId: z
    .string()
    .trim()
    .regex(/^[0-9]{5,30}$/, copy.messagingSettings.phoneNumberIdInvalid),
  accessToken: z
    .string()
    .trim()
    .min(20, copy.messagingSettings.accessTokenInvalid)
    .max(1000, copy.messagingSettings.accessTokenInvalid)
    .regex(/^\S+$/, copy.messagingSettings.accessTokenInvalid),
});
export type WhatsAppCredentialsInput = z.input<typeof whatsappCredentialsSchema>;

export const messageRefSchema = z.strictObject({ messageId: z.uuid() });

export const messageListSchema = z.enum(['queue', 'history']);
export type MessageList = z.infer<typeof messageListSchema>;
