'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

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
import { savePaymentSettings } from '@/features/billing/actions';
import { paymentSettingsSchema, type PaymentSettingsInput } from '@/features/billing/schema';
import { copy } from '@/lib/copy';
import { cn } from '@/lib/utils';

const MODES = Object.entries(copy.paymentSettings.modes) as [
  PaymentSettingsInput['defaultMode'],
  string,
][];

export function PaymentSettingsForm({
  values,
  cashfreeConnected,
}: {
  values: PaymentSettingsInput;
  cashfreeConnected: boolean;
}) {
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const form = useForm<PaymentSettingsInput>({
    resolver: zodResolver(paymentSettingsSchema),
    defaultValues: values,
  });
  async function submit(input: PaymentSettingsInput) {
    setPending(true);
    try {
      if (applyActionResult(await savePaymentSettings(input), form.setError)) {
        toast.success(copy.paymentSettings.saved);
        router.refresh();
      }
    } catch {
      toast.error(copy.errors.network);
    }
    setPending(false);
  }
  return (
    <Form {...form}>
      <form method="post" onSubmit={form.handleSubmit(submit)} noValidate className="grid gap-5">
        <fieldset disabled={pending} className="grid gap-5">
          <FormField
            control={form.control}
            name="upiVpa"
            render={({ field }) => (
              <FormItem hasDescription>
                <FormLabel>{copy.onboarding.gym.upiVpa}</FormLabel>
                <FormControl>
                  <Input
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder={copy.onboarding.gym.upiVpaPlaceholder}
                    maxLength={256}
                    {...field}
                  />
                </FormControl>
                <FormDescription>{copy.onboarding.gym.upiVpaHelp}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="upiPayeeName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{copy.onboarding.gym.upiPayeeName}</FormLabel>
                <FormControl>
                  <Input
                    autoComplete="off"
                    placeholder={copy.onboarding.gym.upiPayeeNamePlaceholder}
                    maxLength={60}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="defaultMode"
            render={({ field }) => (
              <FormItem hasDescription>
                <FormLabel>{copy.paymentSettings.defaultMode}</FormLabel>
                <FormControl>
                  <RadioGroup
                    value={field.value}
                    onValueChange={field.onChange}
                    className="grid gap-2 sm:grid-cols-2"
                  >
                    {MODES.map(([value, label]) => {
                      const disabled = value === 'cashfree' && !cashfreeConnected;
                      return (
                        <label
                          key={value}
                          className={cn(
                            'has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-success-soft flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 text-sm transition-colors',
                            disabled && 'cursor-not-allowed opacity-60',
                          )}
                        >
                          <RadioGroupItem value={value} disabled={disabled} />
                          {label}
                        </label>
                      );
                    })}
                  </RadioGroup>
                </FormControl>
                <FormDescription>
                  {cashfreeConnected
                    ? copy.paymentSettings.modeHelp
                    : copy.paymentSettings.cashfreeNeedsConnect}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </fieldset>
        <div>
          <SubmitButton pending={pending} pendingLabel={copy.common.saving}>
            {copy.paymentSettings.save}
          </SubmitButton>
        </div>
      </form>
    </Form>
  );
}
