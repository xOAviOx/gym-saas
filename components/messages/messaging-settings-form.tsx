'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { nativeSelectClass } from '@/components/members/member-fields';
import { applyActionResult } from '@/components/shared/apply-action-result';
import { SubmitButton } from '@/components/shared/submit-button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { saveMessagingSettings } from '@/features/messaging/actions';
import { messagingSettingsSchema, type MessagingSettingsInput } from '@/features/messaging/schema';
import { MESSAGING_PROVIDERS } from '@/features/messaging/settings';
import { copy } from '@/lib/copy';
import { MESSAGE_KINDS } from '@/lib/messaging/templates';

const t = copy.messagingSettings;

export function MessagingSettingsForm({
  values,
  connected,
}: {
  values: MessagingSettingsInput;
  connected: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const form = useForm<MessagingSettingsInput>({
    resolver: zodResolver(messagingSettingsSchema, undefined, { raw: true }),
    defaultValues: values,
  });

  async function submit(input: MessagingSettingsInput) {
    setPending(true);
    try {
      if (applyActionResult(await saveMessagingSettings(input), form.setError)) {
        toast.success(t.saved);
        router.refresh();
      }
    } catch {
      toast.error(copy.errors.network);
    }
    setPending(false);
  }

  const dayField = (
    name: 'reminderDaysBefore' | 'expiredDaysAfter' | 'duesDaysAfter',
    label: string,
    help: string,
  ) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem hasDescription>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input inputMode="numeric" autoComplete="off" maxLength={40} {...field} />
          </FormControl>
          <FormDescription>{help}</FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <Form {...form}>
      <form method="post" onSubmit={form.handleSubmit(submit)} noValidate className="grid gap-8">
        <fieldset disabled={pending} className="grid gap-8">
          <div className="grid gap-4">
            <div>
              <h3 className="text-base font-semibold">{t.kindsTitle}</h3>
              <p className="text-muted-foreground mt-1 text-sm">{t.kindsBody}</p>
            </div>
            <ul className="divide-border divide-y rounded-xl border">
              {MESSAGE_KINDS.map((kind) => (
                <li key={kind} className="px-4 py-3">
                  <FormField
                    control={form.control}
                    name={`kinds.${kind}`}
                    render={({ field }) => (
                      <FormItem hasDescription>
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <FormLabel>{copy.messageKinds[kind]}</FormLabel>
                            <FormDescription className="mt-1">
                              {copy.messageKindHelp[kind]}
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              className="shrink-0"
                            />
                          </FormControl>
                        </div>
                      </FormItem>
                    )}
                  />
                </li>
              ))}
            </ul>
          </div>

          <div className="grid gap-4">
            <div>
              <h3 className="text-base font-semibold">{t.timingTitle}</h3>
              <p className="text-muted-foreground mt-1 text-sm">{t.timingBody}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {dayField('reminderDaysBefore', t.daysBefore, t.daysBeforeHelp)}
              {dayField('expiredDaysAfter', t.daysAfterExpiry, t.daysAfterExpiryHelp)}
              {dayField('duesDaysAfter', t.duesDays, t.duesDaysHelp)}
            </div>
            <FormField
              control={form.control}
              name="defaultLanguage"
              render={({ field }) => (
                <FormItem hasDescription>
                  <FormLabel>{t.language}</FormLabel>
                  <FormControl>
                    <select className={nativeSelectClass} {...field}>
                      {Object.entries(copy.languages).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </FormControl>
                  <FormDescription>{t.languageHelp}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="provider"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-base font-semibold">{t.deliveryTitle}</FormLabel>
                <FormControl>
                  <RadioGroup
                    value={field.value}
                    onValueChange={field.onChange}
                    className="grid gap-2"
                  >
                    {MESSAGING_PROVIDERS.map((provider) => {
                      const unavailable = provider === 'whatsapp_api' && !connected;
                      return (
                        <label
                          key={provider}
                          className="has-[[data-state=checked]]:border-foreground has-[[data-state=checked]]:bg-muted/60 flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
                        >
                          <RadioGroupItem
                            value={provider}
                            disabled={unavailable}
                            className="mt-0.5"
                          />
                          <span className="grid gap-1">
                            <span className="font-medium">{t.providers[provider]}</span>
                            <span className="text-muted-foreground">
                              {unavailable ? t.apiNeedsConnection : t.providerHelp[provider]}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </fieldset>
        <div>
          <SubmitButton pending={pending} pendingLabel={copy.common.saving}>
            {t.save}
          </SubmitButton>
        </div>
      </form>
    </Form>
  );
}
