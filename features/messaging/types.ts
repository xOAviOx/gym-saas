import type { MessageKind, MessageLanguage } from '@/lib/messaging/templates';
import type { Enums } from '@/lib/supabase/types';

export type MessageStatus = Enums<'message_status'>;
export type MessageChannel = Enums<'message_channel'>;

export type MessageRow = {
  id: string;
  kind: MessageKind;
  language: MessageLanguage;
  body: string;
  status: MessageStatus;
  channel: MessageChannel;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  /** True while a WhatsApp Cloud API send is in flight. */
  sending: boolean;
  invoiceId: string | null;
  member: {
    id: string;
    name: string;
    code: string;
    phone: string;
    consent: boolean;
    deleted: boolean;
  };
};

export type MessageTemplateRow = {
  kind: MessageKind;
  language: MessageLanguage;
  body: string;
  updatedAt: string;
};

export type WhatsAppConnection = {
  phoneNumberId: string;
  displayPhone: string | null;
  verifiedAt: string | null;
};
