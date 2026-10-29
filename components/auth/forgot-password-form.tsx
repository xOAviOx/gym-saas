'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { MailCheckIcon } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { applyActionResult } from '@/components/shared/apply-action-result';
import { SubmitButton } from '@/components/shared/submit-button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { requestPasswordReset } from '@/features/auth/actions';
import { forgotPasswordSchema, type ForgotPasswordInput } from '@/features/auth/schema';
import { copy } from '@/lib/copy';

export function ForgotPasswordForm() {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  async function onSubmit(values: ForgotPasswordInput) {
    setPending(true);
    const result = await requestPasswordReset(values);
    if (applyActionResult(result, form.setError)) {
      setSent(true);
    }
    setPending(false);
  }

  if (sent) {
    return (
      <Alert>
        <MailCheckIcon aria-hidden="true" />
        <AlertDescription>{copy.auth.resetLinkSent}</AlertDescription>
      </Alert>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{copy.auth.email}</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="email" inputMode="email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <SubmitButton
          className="w-full"
          pending={pending}
          pendingLabel={copy.auth.sendingResetLink}
        >
          {copy.auth.sendResetLink}
        </SubmitButton>
      </form>
    </Form>
  );
}
