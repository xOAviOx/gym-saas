'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { applyActionResult } from '@/components/shared/apply-action-result';
import { ConfirmAction } from '@/components/shared/confirm-action';
import { SubmitButton } from '@/components/shared/submit-button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { resetMessageTemplate, saveMessageTemplate } from '@/features/messaging/actions';
import { messageTemplateSchema, type MessageTemplateInput } from '@/features/messaging/schema';
import { copy } from '@/lib/copy';
import {
  MAX_TEMPLATE_LENGTH,
  TEMPLATE_VARIABLES,
  formatMessageDate,
  renderTemplate,
  type MessageKind,
  type MessageLanguage,
  type MessageVariables,
} from '@/lib/messaging/templates';

const t = copy.messageTemplates;

function sampleVariables(gym: string, language: MessageLanguage): MessageVariables {
  return { ...t.sample, gym, date: formatMessageDate(t.sample.date, language) };
}

export function TemplateEditor({
  kind,
  language,
  body,
  edited,
  gym,
}: {
  kind: MessageKind;
  language: MessageLanguage;
  body: string;
  edited: boolean;
  gym: string;
}) {
  const router = useRouter();
  const previewId = useId();
  const [pending, setPending] = useState(false);
  const form = useForm<MessageTemplateInput>({
    resolver: zodResolver(messageTemplateSchema),
    defaultValues: { kind, language, body },
  });
  const current = useWatch({ control: form.control, name: 'body' }) ?? '';

  async function submit(input: MessageTemplateInput) {
    setPending(true);
    try {
      if (applyActionResult(await saveMessageTemplate(input), form.setError)) {
        toast.success(t.saved);
        router.refresh();
      }
    } catch {
      toast.error(copy.errors.network);
    }
    setPending(false);
  }

  return (
    <Form {...form}>
      <form method="post" onSubmit={form.handleSubmit(submit)} noValidate className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">{copy.messageKinds[kind]}</h2>
          {edited ? (
            <span className="bg-info-soft text-info inline-flex min-h-6 items-center rounded-full px-2.5 py-1 text-[11px] leading-4 font-medium tracking-[0.05em] uppercase">
              {t.edited}
            </span>
          ) : null}
        </div>
        <fieldset disabled={pending}>
          <FormField
            control={form.control}
            name="body"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="sr-only">
                  {t.bodyLabel(copy.messageKinds[kind], copy.messages.languageShort[language])}
                </FormLabel>
                <FormControl>
                  <Textarea
                    rows={4}
                    maxLength={MAX_TEMPLATE_LENGTH}
                    lang={language}
                    aria-describedby={previewId}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </fieldset>
        <p className="text-muted-foreground text-xs leading-relaxed">
          {t.variablesLabel}:{' '}
          {TEMPLATE_VARIABLES[kind].map((name, index) => (
            <span key={name}>
              {index ? ', ' : ''}
              <code className="text-foreground font-mono">{`{${name}}`}</code> {t.variables[name]}
            </span>
          ))}
        </p>
        <div id={previewId} className="bg-muted/50 grid gap-1 rounded-lg p-3">
          <p className="text-muted-foreground text-[11px] font-medium tracking-[0.05em] uppercase">
            {t.preview}
          </p>
          <p lang={language} className="text-sm leading-relaxed break-words whitespace-pre-wrap">
            {renderTemplate(current, sampleVariables(gym, language))}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <SubmitButton pending={pending} pendingLabel={copy.common.saving}>
            {t.save}
          </SubmitButton>
          {edited ? (
            <ConfirmAction
              label={t.reset}
              description={t.resetBody}
              success={t.resetDone}
              action={() => resetMessageTemplate({ kind, language })}
            />
          ) : null}
        </div>
      </form>
    </Form>
  );
}
