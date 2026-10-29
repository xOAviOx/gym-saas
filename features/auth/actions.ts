'use server';

import { redirect } from 'next/navigation';

import { copy } from '@/lib/copy';
import { publicEnv } from '@/lib/env.public';
import { ActionError, parseInput, runAction, type ActionResult } from '@/lib/errors';
import { safeNextPath } from '@/lib/supabase/proxy';
import { createClient } from '@/lib/supabase/server';

import { forgotPasswordSchema, resetPasswordSchema, signInSchema, signUpSchema } from './schema';

export async function signInWithPassword(input: unknown): Promise<ActionResult<{ next: string }>> {
  return runAction(async () => {
    const data = parseInput(signInSchema, input);
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });
    if (error) {
      if (error.code === 'email_not_confirmed') {
        throw new ActionError(copy.auth.checkEmailBody(data.email), 'validation');
      }
      throw new ActionError(copy.auth.invalidCredentials, 'validation');
    }
    return { next: safeNextPath(data.next) };
  });
}

export async function signUpWithPassword(
  input: unknown,
): Promise<ActionResult<{ next: string; needsConfirmation: boolean }>> {
  return runAction(async () => {
    const data = parseInput(signUpSchema, input);
    const supabase = await createClient();
    const { data: result, error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: { full_name: data.fullName },
        emailRedirectTo: `${publicEnv.appUrl}/auth/confirm?next=/onboarding`,
      },
    });
    if (error) {
      if (error.code === 'user_already_exists' || error.code === 'email_exists') {
        throw new ActionError(copy.auth.emailTaken, 'conflict');
      }
      if (error.code === 'weak_password') {
        throw new ActionError(copy.auth.passwordTooShort, 'validation');
      }
      throw new ActionError(error.message, 'unknown');
    }
    // With email confirmation on, Supabase returns a user without identities for a taken email.
    if (result.user && result.user.identities?.length === 0) {
      throw new ActionError(copy.auth.emailTaken, 'conflict');
    }
    return { next: '/onboarding', needsConfirmation: !result.session };
  });
}

export async function requestPasswordReset(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const data = parseInput(forgotPasswordSchema, input);
    const supabase = await createClient();
    // Errors are swallowed on purpose: the response must not reveal whether the email exists.
    await supabase.auth.resetPasswordForEmail(data.email, {
      redirectTo: `${publicEnv.appUrl}/auth/confirm?next=/reset-password`,
    });
    return null;
  });
}

export async function updatePassword(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const data = parseInput(resetPasswordSchema, input);
    const supabase = await createClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      throw new ActionError(copy.auth.linkInvalid, 'unauthenticated');
    }
    const { error } = await supabase.auth.updateUser({ password: data.password });
    if (error) {
      throw new ActionError(error.message, 'unknown');
    }
    return null;
  });
}

export async function signInWithGoogle(formData: FormData): Promise<void> {
  const next = safeNextPath(formData.get('next')?.toString());
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${publicEnv.appUrl}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error || !data.url) {
    redirect(`/sign-in?error=google`);
  }
  redirect(data.url);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/sign-in');
}
