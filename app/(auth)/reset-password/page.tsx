import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { AuthCard } from '@/components/auth/auth-card';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';
import { getUser } from '@/lib/auth/session';
import { copy } from '@/lib/copy';

export const metadata: Metadata = { title: copy.auth.resetTitle };

export default async function ResetPasswordPage() {
  // The recovery link signs the user in first; without a session there is nothing to update.
  const user = await getUser();
  if (!user) {
    redirect('/sign-in?error=link');
  }

  return (
    <AuthCard title={copy.auth.resetTitle} subtitle={copy.auth.resetSubtitle}>
      <ResetPasswordForm />
    </AuthCard>
  );
}
