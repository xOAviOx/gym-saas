import type { Metadata } from 'next';
import Link from 'next/link';

import { TemplateEditor } from '@/components/messages/template-editor';
import { PageHeader } from '@/components/shared/page-header';
import { getMessageTemplates } from '@/features/messaging/queries';
import { messageLanguageSchema } from '@/features/messaging/schema';
import { readMessagingSettings } from '@/features/messaging/settings';
import { PRIVILEGED_ROLES } from '@/lib/auth/roles';
import { requireOrg } from '@/lib/auth/session';
import { copy } from '@/lib/copy';
import { MESSAGE_KINDS, MESSAGE_LANGUAGES, defaultTemplate } from '@/lib/messaging/templates';
import { createClient } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: copy.messageTemplates.title };

const t = copy.messageTemplates;

export default async function MessageTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const ctx = await requireOrg(PRIVILEGED_ROLES);
  const params = await searchParams;
  const settings = readMessagingSettings(ctx.org.settings);
  const requested = messageLanguageSchema.safeParse(params.lang ?? settings.defaultLanguage);
  const language = requested.success ? requested.data : 'en';
  const templates = await getMessageTemplates(await createClient(), ctx.org.id);

  return (
    <>
      <Link
        href="/settings/messaging"
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex min-h-11 items-center text-sm transition-colors"
      >
        {t.back}
      </Link>
      <PageHeader title={t.title} description={t.description} />
      <div className="grid gap-4">
        <nav aria-label={t.languageLabel} className="flex gap-2">
          {MESSAGE_LANGUAGES.map((value) => (
            <Link
              key={value}
              href={`/settings/messaging/templates?lang=${value}`}
              aria-current={language === value ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm transition-colors duration-150',
                language === value
                  ? 'bg-card border-foreground text-foreground font-medium'
                  : 'bg-card text-muted-foreground hover:border-input hover:text-foreground',
              )}
            >
              {copy.languages[value]}
            </Link>
          ))}
        </nav>
        {settings.provider === 'whatsapp_api' ? (
          <p className="bg-info-soft rounded-lg p-3 text-sm">{t.apiNote}</p>
        ) : null}
        <ul className="grid gap-4">
          {MESSAGE_KINDS.map((kind, index) => {
            const saved = templates.find((row) => row.kind === kind && row.language === language);
            return (
              <li
                key={`${kind}:${language}:${saved?.updatedAt ?? 'default'}`}
                className="bg-card animate-enter rounded-xl border p-5 md:p-6"
                style={{ '--index': index + 1 } as React.CSSProperties}
              >
                <TemplateEditor
                  kind={kind}
                  language={language}
                  body={saved?.body ?? defaultTemplate(kind, language)}
                  edited={!!saved}
                  gym={ctx.org.name}
                />
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}
