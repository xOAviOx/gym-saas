'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { applyActionResult } from '@/components/shared/apply-action-result';
import { ConfirmAction } from '@/components/shared/confirm-action';
import { CopyButton } from '@/components/shared/copy-button';
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { removeCashfreeCredentials, saveCashfreeCredentials } from '@/features/billing/actions';
import {
  cashfreeCredentialsSchema,
  type CashfreeCredentialsInput,
} from '@/features/billing/schema';
import { copy } from '@/lib/copy';
import { formatDateTime } from '@/lib/dates';
import { cn } from '@/lib/utils';

type Environment = CashfreeCredentialsInput['environment'];
const ENVIRONMENTS = Object.entries(copy.paymentSettings.environments) as [Environment, string][];

function CredentialsDialog({
  connected,
  environment,
}: {
  connected: boolean;
  environment: Environment;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const form = useForm<CashfreeCredentialsInput>({
    resolver: zodResolver(cashfreeCredentialsSchema),
    defaultValues: { appId: '', secretKey: '', environment },
  });
  async function submit(input: CashfreeCredentialsInput) {
    setPending(true);
    try {
      if (applyActionResult(await saveCashfreeCredentials(input), form.setError)) {
        toast.success(copy.paymentSettings.verified);
        form.reset({ appId: '', secretKey: '', environment: input.environment });
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
      title={copy.paymentSettings.keysTitle}
      description={copy.paymentSettings.keysHelp}
      trigger={
        <Button variant={connected ? 'outline' : 'default'}>
          {connected ? copy.paymentSettings.replace : copy.paymentSettings.connect}
        </Button>
      }
    >
      <Form {...form}>
        <form method="post" onSubmit={form.handleSubmit(submit)} noValidate className="grid gap-5">
          <fieldset disabled={pending} className="grid gap-5">
            <FormField
              control={form.control}
              name="environment"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{copy.paymentSettings.environment}</FormLabel>
                  <FormControl>
                    <RadioGroup
                      value={field.value}
                      onValueChange={field.onChange}
                      className="grid gap-2 sm:grid-cols-2"
                    >
                      {ENVIRONMENTS.map(([value, label]) => (
                        <label
                          key={value}
                          className="has-[[data-state=checked]]:border-foreground has-[[data-state=checked]]:bg-muted/60 flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 text-sm transition-colors"
                        >
                          <RadioGroupItem value={value} />
                          {label}
                        </label>
                      ))}
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="appId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{copy.paymentSettings.appId}</FormLabel>
                  <FormControl>
                    <Input
                      autoComplete="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      maxLength={128}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="secretKey"
              render={({ field }) => (
                <FormItem hasDescription>
                  <FormLabel>{copy.paymentSettings.secretKey}</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      autoComplete="new-password"
                      spellCheck={false}
                      maxLength={256}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>{copy.paymentSettings.secretHelp}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </fieldset>
          <SubmitButton
            pending={pending}
            pendingLabel={copy.paymentSettings.verifying}
            className="w-full"
          >
            {copy.paymentSettings.verify}
          </SubmitButton>
        </form>
      </Form>
    </FormDialog>
  );
}

export function CashfreeSettings({
  connection,
  webhookUrl,
  webhookReachable,
}: {
  connection: { appId: string; environment: Environment; verifiedAt: string | null } | null;
  webhookUrl: string;
  /** False on local or plain-HTTP setups that Cashfree cannot call. */
  webhookReachable: boolean;
}) {
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            'inline-flex min-h-6 items-center rounded-full px-2.5 py-1 text-[11px] leading-4 font-medium tracking-[0.05em] uppercase',
            connection ? 'bg-success-soft text-success' : 'bg-muted text-muted-foreground',
          )}
        >
          {connection ? copy.paymentSettings.connected : copy.paymentSettings.notConnected}
        </span>
        {connection?.environment === 'sandbox' ? (
          <span className="bg-warning-soft text-warning inline-flex min-h-6 items-center rounded-full px-2.5 py-1 text-[11px] leading-4 font-medium tracking-[0.05em] uppercase">
            {copy.gateway.sandbox}
          </span>
        ) : null}
      </div>
      {connection ? (
        <dl className="grid gap-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{copy.paymentSettings.appId}</dt>
            <dd className="text-right font-mono break-all">{connection.appId}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{copy.paymentSettings.environment}</dt>
            <dd className="text-right">
              {copy.paymentSettings.environments[connection.environment]}
            </dd>
          </div>
          {connection.verifiedAt ? (
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{copy.paymentSettings.connected}</dt>
              <dd className="text-right">
                {copy.paymentSettings.verifiedOn(formatDateTime(connection.verifiedAt))}
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      {connection?.environment === 'sandbox' ? (
        <p className="bg-muted rounded-lg p-3 text-sm">{copy.paymentSettings.sandboxNote}</p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <CredentialsDialog
          connected={!!connection}
          environment={connection?.environment ?? 'sandbox'}
        />
        {connection ? (
          <ConfirmAction
            label={copy.paymentSettings.disconnect}
            description={copy.paymentSettings.disconnectBody}
            success={copy.paymentSettings.disconnected}
            action={() => removeCashfreeCredentials()}
            destructive
          />
        ) : null}
      </div>
      {connection ? (
        <div className="grid gap-2 border-t pt-5">
          <h3 className="text-sm font-semibold">{copy.paymentSettings.webhookTitle}</h3>
          <p className="text-muted-foreground text-sm">
            {webhookReachable
              ? copy.paymentSettings.webhookBody
              : copy.paymentSettings.webhookLocal}
          </p>
          <div className="flex gap-2">
            <Input
              readOnly
              value={webhookUrl}
              aria-label={copy.paymentSettings.webhookTitle}
              onFocus={(event) => event.currentTarget.select()}
              className="text-muted-foreground font-mono text-sm md:text-xs"
            />
            <CopyButton value={webhookUrl} copiedMessage={copy.paymentSettings.webhookCopied} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
