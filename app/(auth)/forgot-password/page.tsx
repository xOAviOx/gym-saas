import type { Metadata } from 'next';
import Link from 'next/link';

import { AuthCard } from '@/components/auth/auth-card';
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';
import { copy } from '@/lib/copy';

export const metadata: Metadata = { title: copy.auth.forgotTitle };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title={copy.auth.forgotTitle}
      subtitle={copy.auth.forgotSubtitle}
      footer={
        <Link
          href="/sign-in"
          className="text-primary font-medium underline-offset-4 hover:underline"
        >
          {copy.auth.backToSignIn}
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
