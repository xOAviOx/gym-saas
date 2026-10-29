'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { MailCheckIcon } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { applyActionResult } from '@/components/shared/apply-action-result';
import { SubmitButton } from '@/components/shared/submit-button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { signUpWithPassword } from '@/features/auth/actions';
import { signUpSchema, type SignUpInput } from '@/features/auth/schema';
import { copy } from '@/lib/copy';

export function SignUpForm() {
  const [pending, setPending] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState<string | null>(null);
  const form = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { fullName: '', email: '', password: '' },
  });

  async function onSubmit(values: SignUpInput) {
    setPending(true);
    const result = await signUpWithPassword(values);
    if (applyActionResult(result, form.setError)) {
      if (result.data.needsConfirmation) {
        setConfirmEmail(values.email);
        setPending(false);
        return;
      }
      window.location.assign(result.data.next);
      return;
    }
    setPending(false);
  }

  if (confirmEmail) {
    return (
      <Alert>
        <MailCheckIcon aria-hidden="true" />
        <AlertTitle>{copy.auth.checkEmailTitle}</AlertTitle>
        <AlertDescription>{copy.auth.checkEmailBody(confirmEmail)}</AlertDescription>
      </Alert>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
        <FormField
          control={form.control}
          name="fullName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{copy.auth.fullName}</FormLabel>
              <FormControl>
                <Input autoComplete="name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
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
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{copy.auth.password}</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <FormDescription>{copy.auth.passwordTooShort}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <SubmitButton className="mt-2 w-full" pending={pending} pendingLabel={copy.auth.signingUp}>
          {copy.auth.signUp}
        </SubmitButton>
        <p className="text-muted-foreground text-center text-xs">{copy.auth.termsNotice}</p>
      </form>
    </Form>
  );
}
