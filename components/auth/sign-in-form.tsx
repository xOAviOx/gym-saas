'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { applyActionResult } from '@/components/shared/apply-action-result';
import { SubmitButton } from '@/components/shared/submit-button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { signInWithPassword } from '@/features/auth/actions';
import { signInSchema, type SignInInput } from '@/features/auth/schema';
import { copy } from '@/lib/copy';

export function SignInForm({ next }: { next?: string }) {
  const [pending, setPending] = useState(false);
  const form = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '', next: next ?? '' },
  });

  async function onSubmit(values: SignInInput) {
    setPending(true);
    const result = await signInWithPassword({ ...values, next: next || undefined });
    if (applyActionResult(result, form.setError)) {
      window.location.assign(result.data.next);
      return;
    }
    setPending(false);
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
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center justify-between">
                <FormLabel>{copy.auth.password}</FormLabel>
                <Link
                  href="/forgot-password"
                  className="text-primary text-sm underline-offset-4 hover:underline"
                >
                  {copy.auth.forgotPassword}
                </Link>
              </div>
              <FormControl>
                <Input type="password" autoComplete="current-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <SubmitButton className="mt-2 w-full" pending={pending} pendingLabel={copy.auth.signingIn}>
          {copy.auth.signIn}
        </SubmitButton>
      </form>
    </Form>
  );
}
