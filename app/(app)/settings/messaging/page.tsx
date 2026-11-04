import type { Metadata } from 'next';
import Link from 'next/link';

import { MessagingSettingsForm } from '@/components/messages/messaging-settings-form';
import { WhatsAppSettings } from '@/components/messages/whatsapp-settings';
import { CopyButton } from '@/components/shared/copy-button';
import { PageHeader } from '@/components/shared/page-header';
import { getWhatsAppConnection } from '@/features/messaging/queries';
import { readMessagingSettings } from '@/features/messaging/settings';
import { PRIVILEGED_ROLES } from '@/lib/auth/roles';
import { requireOrg } from '@/lib/auth/session';
import { copy } from '@/lib/copy';
import {
  MESSAGE_KINDS,
  MESSAGE_LANGUAGES,
  META_CATEGORY,
  formatDayList,
  metaTemplateBody,
  metaTemplateName,
} from '@/lib/messaging/templates';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: copy.messagingSettings.title };

const t = copy.messagingSettings;

export default async function MessagingSettingsPage() {
  const ctx = await requireOrg(PRIVILEGED_ROLES);
  const connection = await getWhatsAppConnection(await createClient(), ctx.org.id);
  const settings = readMessagingSettings(ctx.org.settings);
  const values = {
    kinds: settings.kinds,
    reminderDaysBefore: formatDayList(settings.reminderDaysBefore),
    expiredDaysAfter: formatDayList(settings.expiredDaysAfter),
    duesDaysAfter: formatDayList(settings.duesDaysAfter),
    defaultLanguage: settings.defaultLanguage,
    provider: settings.provider,
  };

  return (
    <>
      <Link
        href="/more"
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex min-h-11 items-center text-sm transition-colors"
      >
        {copy.nav.more}
      </Link>
      <PageHeader
        title={t.title}
        description={t.description}
        action={
          <Link
            href="/settings/messaging/templates"
            className="border-input bg-card hover:bg-muted inline-flex min-h-11 items-center rounded-lg border px-4 text-sm font-medium transition-colors"
          >
            {t.templatesLink}
          </Link>
        }
      />
      <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
        <section
          aria-label={t.title}
          className="bg-card animate-enter grid content-start gap-5 rounded-xl border p-5 [--index:1] md:p-6"
        >
          <MessagingSettingsForm
            key={JSON.stringify(values) + String(!!connection)}
            values={values}
            connected={!!connection}
          />
        </section>
        <section
          aria-labelledby="whatsapp-title"
          className="bg-card animate-enter grid content-start gap-5 rounded-xl border p-5 [--index:2] md:p-6"
        >
          <div>
            <h2 id="whatsapp-title" className="text-base font-semibold">
              {t.connectionTitle}
            </h2>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">{t.connectionBody}</p>
          </div>
          <WhatsAppSettings
            key={`${connection?.phoneNumberId}:${connection?.verifiedAt}`}
            connection={connection}
          />
        </section>
        {connection ? (
          <section
            aria-labelledby="meta-title"
            className="bg-card animate-enter grid content-start gap-5 rounded-xl border p-5 [--index:3] md:p-6 lg:col-span-2"
          >
            <div>
              <h2 id="meta-title" className="text-base font-semibold">
                {t.metaTitle}
              </h2>
              <p className="text-muted-foreground mt-1 text-sm leading-relaxed">{t.metaBody}</p>
            </div>
            <ul className="divide-border divide-y rounded-xl border">
              {MESSAGE_KINDS.map((kind) => (
                <li key={kind} className="grid gap-3 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-sm font-semibold">{copy.messageKinds[kind]}</h3>
                    <p className="text-muted-foreground text-xs">
                      {t.metaName}: <span className="font-mono">{metaTemplateName(kind)}</span> ·{' '}
                      {t.metaCategory}: {t.metaCategories[META_CATEGORY[kind]]}
                    </p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {MESSAGE_LANGUAGES.map((language) => {
                      const body = metaTemplateBody(kind, language);
                      return (
                        <div key={language} className="bg-muted/50 grid gap-2 rounded-lg p-3">
                          <p className="text-muted-foreground text-[11px] font-medium tracking-[0.05em] uppercase">
                            {copy.messages.languageShort[language]} ({language})
                          </p>
                          <p className="text-sm leading-relaxed break-words">{body}</p>
                          <div>
                            <CopyButton
                              value={body}
                              label={t.metaCopy}
                              copiedMessage={t.metaCopied}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </>
  );
}
