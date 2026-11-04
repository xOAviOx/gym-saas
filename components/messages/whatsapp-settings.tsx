'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { applyActionResult } from '@/components/shared/apply-action-result';
import { ConfirmAction } from '@/components/shared/confirm-action';
import { FormDialog } from '@/components/shared/form-dialog';
import { SubmitButton } from '@/components/shared/submit-button';
import { Button } from '@/components/ui/button';
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
import { removeWhatsAppCredentials, saveWhatsAppCredentials } from '@/features/messaging/actions';
import {
  whatsappCredentialsSchema,
  type WhatsAppCredentialsInput,
} from '@/features/messaging/schema';
import type { WhatsAppConnection } from '@/features/messaging/types';
import { copy } from '@/lib/copy';
import { formatDateTime } from '@/lib/dates';
import { cn } from '@/lib/utils';

const t = copy.messagingSettings;

function CredentialsDialog({ connection }: { connection: WhatsAppConnection | null }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const form = useForm<WhatsAppCredentialsInput>({
    resolver: zodResolver(whatsappCredentialsSchema),
    defaultValues: { phoneNumberId: connection?.phoneNumberId ?? '', accessToken: '' },
  });
  async function submit(input: WhatsAppCredentialsInput) {
    setPending(true);
    try {
      const result = await saveWhatsAppCredentials(input);
      if (applyActionResult(result, form.setError)) {
        toast.success(t.verified);
        form.reset({ phoneNumberId: input.phoneNumberId, accessToken: '' });
        setOpen(false);
        router.refresh();
      }
    } catch {
      toast.error(copy.errors.network);
    }
    setPending(false);
  }
  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) setOpen(next);
      }}
      title={t.keysTitle}
      description={t.keysHelp}
      trigger={
        <Button variant={connection ? 'outline' : 'default'}>
          {connection ? t.replace : t.connect}
        </Button>
      }
    >
      <Form {...form}>
        <form method="post" onSubmit={form.handleSubmit(submit)} noValidate className="grid gap-5">
          <fieldset disabled={pending} className="grid gap-5">
            <FormField
              control={form.control}
              name="phoneNumberId"
              render={({ field }) => (
                <FormItem hasDescription>
                  <FormLabel>{t.phoneNumberId}</FormLabel>
                  <FormControl>
                    <Input
                      inputMode="numeric"
                      autoComplete="off"
                      spellCheck={false}
                      maxLength={30}
                      className="font-mono"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>{t.phoneNumberIdHelp}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="accessToken"
              render={({ field }) => (
                <FormItem hasDescription>
                  <FormLabel>{t.accessToken}</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      spellCheck={false}
                      maxLength={1000}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>{t.accessTokenHelp}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </fieldset>
          <SubmitButton pending={pending} pendingLabel={t.verifying} className="w-full">
            {t.verify}
          </SubmitButton>
        </form>
      </Form>
    </FormDialog>
  );
}

export function WhatsAppSettings({ connection }: { connection: WhatsAppConnection | null }) {
  return (
    <div className="grid gap-5">
      <div>
        <span
          className={cn(
            'inline-flex min-h-6 items-center rounded-full px-2.5 py-1 text-[11px] leading-4 font-medium tracking-[0.05em] uppercase',
            connection ? 'bg-success-soft text-success' : 'bg-muted text-muted-foreground',
          )}
        >
          {connection ? t.connected : t.notConnected}
        </span>
      </div>
      {connection ? (
        <dl className="grid gap-2 text-sm">
          {connection.displayPhone ? (
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{t.displayPhone}</dt>
              <dd className="tabular text-right">{connection.displayPhone}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{t.phoneNumberId}</dt>
            <dd className="text-right font-mono break-all">{connection.phoneNumberId}</dd>
          </div>
          {connection.verifiedAt ? (
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{t.checked}</dt>
              <dd className="text-right">{formatDateTime(connection.verifiedAt)}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <CredentialsDialog connection={connection} />
        {connection ? (
          <ConfirmAction
            label={t.disconnect}
            description={t.disconnectBody}
            success={t.disconnected}
            action={() => removeWhatsAppCredentials()}
            destructive
          />
        ) : null}
      </div>
    </div>
  );
}
