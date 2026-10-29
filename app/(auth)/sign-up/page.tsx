import type { Metadata } from 'next';
import Link from 'next/link';

import { AuthCard } from '@/components/auth/auth-card';
import { GoogleButton } from '@/components/auth/google-button';
import { OrDivider } from '@/components/auth/or-divider';
import { SignUpForm } from '@/components/auth/sign-up-form';
import { copy } from '@/lib/copy';

export const metadata: Metadata = { title: copy.auth.signUpTitle };

export default function SignUpPage() {
  return (
    <AuthCard
      title={copy.auth.signUpTitle}
      subtitle={copy.auth.signUpSubtitle}
      footer={
        <>
          {copy.auth.haveAccount}{' '}
          <Link
            href="/sign-in"
            className="text-primary font-medium underline-offset-4 hover:underline"
          >
            {copy.auth.signIn}
          </Link>
        </>
      }
    >
      <GoogleButton next="/onboarding" />
      <OrDivider />
      <SignUpForm />
    </AuthCard>
  );
}
