import { afterEach, describe, expect, it, vi } from 'vitest';

import { messagingSettingsSchema, messageTemplateSchema } from '@/features/messaging/schema';
import { messageErrorText } from '@/features/messaging/presentation';
import {
  DEFAULT_MESSAGING_SETTINGS,
  messagingSettingsRecord,
  readMessagingSettings,
} from '@/features/messaging/settings';
import { isCronAuthorized } from '@/lib/cron-auth';
import { formatDate } from '@/lib/dates';
import {
  MESSAGE_KINDS,
  MESSAGE_LANGUAGES,
  defaultTemplate,
  firstName,
  formatMessageDate,
  metaParameters,
  metaTemplateBody,
  parseDayList,
  renderTemplate,
  unknownVariables,
  variablesInOrder,
} from '@/lib/messaging/templates';
import {
  WhatsAppError,
  getPhoneNumber,
  sendTemplateMessage,
  whatsappErrorKey,
  whatsappRecipient,
} from '@/lib/messaging/whatsapp-cloud';

const credentials = { phoneNumberId: '1234567890', accessToken: 'EAAG-test-token-value' };

function respond(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }));
}

function metaError(status: number, code: number) {
  return new WhatsAppError('error', status, code);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('message templates', () => {
  it('fills placeholders and drops ones without a value', () => {
    expect(renderTemplate('Hi {name}, see you at {gym}.', { name: 'Rahul', gym: 'Iron' })).toBe(
      'Hi Rahul, see you at Iron.',
    );
    expect(renderTemplate('Hi {name} {plan} today', { name: 'Rahul' })).toBe('Hi Rahul today');
    expect(renderTemplate('{unknown} Hello', {})).toBe('Hello');
  });

  it('only allows placeholders each kind can fill', () => {
    expect(unknownVariables('birthday', 'Happy birthday {name} from {gym}')).toEqual([]);
    expect(unknownVariables('birthday', '{name} owes {amount} {amount} {link}')).toEqual([
      'amount',
      'link',
    ]);
    expect(unknownVariables('dues_overdue', 'Pay {amount} here {link}')).toEqual([]);
  });

  it('ships defaults that use only allowed placeholders in both languages', () => {
    for (const kind of MESSAGE_KINDS) {
      for (const language of MESSAGE_LANGUAGES) {
        expect(unknownVariables(kind, defaultTemplate(kind, language))).toEqual([]);
      }
    }
  });

  it('numbers Meta placeholders by first use', () => {
    expect(variablesInOrder('{gym} {name} {gym} {date}')).toEqual(['gym', 'name', 'date']);
    const body = metaTemplateBody('membership_expiring', 'en');
    expect(body).not.toMatch(/\{[a-z]+\}/);
    expect(body).toMatch(/^Hi \{\{1\}\}, your \{\{2\}\} membership at \{\{3\}\} ends on \{\{4\}\}/);
  });

  it('builds Meta parameters in template order, never empty or multi-line', () => {
    const params = metaParameters('payment_receipt', 'en', {
      name: 'Rahul',
      gym: 'Iron\nTemple',
      amount: '₹900',
      invoice: 'IRON/25-26/0007',
      balance: '',
      link: 'https://gym.example/r/abc',
    });
    expect(params).toEqual([
      'Rahul',
      'Iron Temple',
      '₹900',
      'IRON/25-26/0007',
      '-',
      'https://gym.example/r/abc',
    ]);
    const order = variablesInOrder(defaultTemplate('payment_receipt', 'hi'));
    expect(metaParameters('payment_receipt', 'hi', { name: 'R', gym: 'G' })).toHaveLength(
      order.length,
    );
  });

  it('uses the first name and formats dates per language', () => {
    expect(firstName('  Rahul   Sharma ')).toBe('Rahul');
    expect(firstName('Rahul')).toBe('Rahul');
    expect(formatMessageDate('2026-03-12', 'en')).toBe(formatDate('2026-03-12'));
    expect(formatMessageDate('2026-03-12', 'hi')).toBe('12 मार्च 2026');
    expect(() => formatMessageDate('2026-02-30', 'hi')).toThrow();
  });

  it('parses day lists, removing duplicates and sorting largest first', () => {
    expect(parseDayList('0, 7,3,7', 0, 30)).toEqual([7, 3, 0]);
    expect(parseDayList(' 5 ', 1, 60)).toEqual([5]);
    expect(parseDayList('', 0, 30)).toBeNull();
    expect(parseDayList('1,2,3,4,5,6', 0, 30)).toBeNull();
    expect(parseDayList('31', 0, 30)).toBeNull();
    expect(parseDayList('0', 1, 60)).toBeNull();
    expect(parseDayList('2.5', 0, 30)).toBeNull();
    expect(parseDayList('-1', 0, 30)).toBeNull();
  });
});

describe('messaging settings', () => {
  it('fills in defaults for missing or malformed settings', () => {
    expect(readMessagingSettings(null)).toEqual(DEFAULT_MESSAGING_SETTINGS);
    expect(readMessagingSettings([])).toEqual(DEFAULT_MESSAGING_SETTINGS);
    expect(
      readMessagingSettings({
        reminder_days_before: 'soon',
        default_language: 'fr',
        messaging_provider: 'sms',
      }),
    ).toEqual(DEFAULT_MESSAGING_SETTINGS);
  });

  it('reads saved settings and round-trips them', () => {
    const settings = readMessagingSettings({
      message_kinds: { birthday: false },
      reminder_days_before: [3, 7, 3, 1.5],
      expired_reminder_days_after: [2],
      dues_reminder_days_after: [],
      default_language: 'hi',
      messaging_provider: 'whatsapp_api',
    });
    expect(settings.kinds.birthday).toBe(false);
    expect(settings.kinds.welcome).toBe(true);
    expect(settings.reminderDaysBefore).toEqual([7, 3]);
    expect(settings.expiredDaysAfter).toEqual([2]);
    expect(settings.duesDaysAfter).toEqual([]);
    expect(settings.defaultLanguage).toBe('hi');
    expect(settings.provider).toBe('whatsapp_api');
    expect(readMessagingSettings(messagingSettingsRecord(settings))).toEqual(settings);
  });

  it('validates the settings form', () => {
    const kinds = DEFAULT_MESSAGING_SETTINGS.kinds;
    const valid = messagingSettingsSchema.safeParse({
      kinds,
      reminderDaysBefore: '7, 3, 0',
      expiredDaysAfter: '1',
      duesDaysAfter: '3, 7',
      defaultLanguage: 'en',
      provider: 'manual',
    });
    expect(valid.success && valid.data.duesDaysAfter).toEqual([7, 3]);
    const invalid = messagingSettingsSchema.safeParse({
      kinds,
      reminderDaysBefore: '7',
      expiredDaysAfter: '0',
      duesDaysAfter: '3',
      defaultLanguage: 'en',
      provider: 'manual',
    });
    expect(invalid.success).toBe(false);
    expect(invalid.error?.issues[0]?.path).toEqual(['expiredDaysAfter']);
  });

  it('rejects templates with placeholders the kind cannot fill', () => {
    expect(
      messageTemplateSchema.safeParse({ kind: 'birthday', language: 'en', body: 'Hi {name}' })
        .success,
    ).toBe(true);
    const result = messageTemplateSchema.safeParse({
      kind: 'birthday',
      language: 'en',
      body: 'Hi {name}, pay {amount}',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['body']);
    expect(result.error?.issues[0]?.message).toContain('{amount}');
  });
});

describe('cron authorization', () => {
  it('accepts only the exact bearer secret', () => {
    expect(isCronAuthorized('Bearer s3cret-value', 's3cret-value')).toBe(true);
    expect(isCronAuthorized('Bearer s3cret-valuE', 's3cret-value')).toBe(false);
    expect(isCronAuthorized('s3cret-value', 's3cret-value')).toBe(false);
    expect(isCronAuthorized(null, 's3cret-value')).toBe(false);
    expect(isCronAuthorized('Bearer ', '')).toBe(false);
  });
});

describe('WhatsApp Cloud API', () => {
  it('sends a template to the digits-only number with body parameters', async () => {
    const fetchMock = respond(200, { messages: [{ id: 'wamid.ABC' }] });
    vi.stubGlobal('fetch', fetchMock);
    const id = await sendTemplateMessage(credentials, {
      to: '+919876543210',
      name: 'gymdesk_birthday',
      language: 'hi',
      parameters: ['Rahul', 'Iron'],
    });
    expect(id).toBe('wamid.ABC');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/^https:\/\/graph\.facebook\.com\/v\d+\.0\/1234567890\/messages$/);
    expect((init.headers as Record<string, string>).authorization).toBe(
      `Bearer ${credentials.accessToken}`,
    );
    expect(JSON.parse(String(init.body))).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '919876543210',
      type: 'template',
      template: {
        name: 'gymdesk_birthday',
        language: { code: 'hi' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: 'Rahul' },
              { type: 'text', text: 'Iron' },
            ],
          },
        ],
      },
    });
  });

  it('reads the business number to verify credentials', async () => {
    vi.stubGlobal(
      'fetch',
      respond(200, { id: '1234567890', display_phone_number: '+91 98765 43210' }),
    );
    expect(await getPhoneNumber(credentials)).toEqual({
      id: '1234567890',
      displayPhone: '+91 98765 43210',
      verifiedName: null,
    });
  });

  it('turns Meta errors into WhatsAppError with code and subcode', async () => {
    vi.stubGlobal(
      'fetch',
      respond(400, {
        error: { message: 'Template missing', code: 132001, error_subcode: 2494073 },
      }),
    );
    const failure = sendTemplateMessage(credentials, {
      to: '+919876543210',
      name: 'gymdesk_welcome',
      language: 'en',
      parameters: [],
    });
    await expect(failure).rejects.toMatchObject({
      status: 400,
      code: 132001,
      subcode: 2494073,
      message: 'Template missing',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );
    await expect(getPhoneNumber(credentials)).rejects.toMatchObject({
      status: 0,
      isUnavailable: true,
    });
    vi.stubGlobal('fetch', respond(200, { messages: [] }));
    await expect(
      sendTemplateMessage(credentials, {
        to: '+919876543210',
        name: 'gymdesk_welcome',
        language: 'en',
        parameters: [],
      }),
    ).rejects.toMatchObject({ message: 'Unexpected WhatsApp response' });
  });

  it('maps errors to keys staff can act on', () => {
    expect(whatsappErrorKey(new Error('x'))).toBe('unknown');
    expect(whatsappErrorKey(new WhatsAppError('auth', 401))).toBe('token');
    expect(whatsappErrorKey(metaError(400, 190))).toBe('token');
    expect(whatsappErrorKey(metaError(400, 132001))).toBe('template_missing');
    expect(whatsappErrorKey(metaError(400, 132000))).toBe('template_mismatch');
    expect(whatsappErrorKey(metaError(400, 132015))).toBe('template_paused');
    expect(whatsappErrorKey(metaError(400, 131026))).toBe('undeliverable');
    expect(whatsappErrorKey(metaError(400, 131049))).toBe('marketing_limit');
    expect(whatsappErrorKey(metaError(400, 131050))).toBe('opted_out');
    expect(whatsappErrorKey(metaError(400, 131030))).toBe('not_allowed');
    expect(whatsappErrorKey(metaError(400, 131042))).toBe('billing');
    expect(whatsappErrorKey(metaError(429, 130429))).toBe('unavailable');
    expect(whatsappErrorKey(new WhatsAppError('down', 503))).toBe('unavailable');
    expect(whatsappErrorKey(metaError(400, 100))).toBe('meta_100');
    expect(whatsappErrorKey(new WhatsAppError('bad', 400))).toBe('unknown');
  });

  it('strips formatting from recipient numbers', () => {
    expect(whatsappRecipient('+91 98765-43210')).toBe('919876543210');
  });
});

describe('message error text', () => {
  it('explains each stored error key', () => {
    expect(messageErrorText(null, 'welcome', 'en')).toBeNull();
    expect(messageErrorText('template_missing', 'welcome', 'hi')).toContain('gymdesk_welcome');
    expect(messageErrorText('template_missing', 'welcome', 'hi')).toContain('(hi)');
    expect(messageErrorText('meta_100', 'welcome', 'en')).toContain('100');
    expect(messageErrorText('something_else', 'welcome', 'en')).toBe(
      messageErrorText('unknown', 'welcome', 'en'),
    );
  });
});
