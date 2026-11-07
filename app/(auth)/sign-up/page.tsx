import type { Metadata } from 'next';
import Link from 'next/link';

import { AuthCard } from '@/components/auth/auth-card';
import { GoogleButton } from '@/components/auth/google-button';
import { OrDivider } from '@/components/auth/or-divider';
import { SignUpForm } from '@/components/auth/sign-up-form';
import { copy } from '@/lib/copy';
import { safeNextPath } from '@/lib/supabase/proxy';

export const metadata: Metadata = { title: copy.auth.signUpTitle };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeNextPath((await searchParams).next, '/onboarding');
  return (
    <AuthCard
      title={copy.auth.signUpTitle}
      subtitle={copy.auth.signUpSubtitle}
      footer={
        <>
          {copy.auth.haveAccount}{' '}
          <Link
            href={`/sign-in?next=${encodeURIComponent(next)}`}
            className="text-foreground decoration-input font-medium underline underline-offset-4 hover:decoration-current"
          >
            {copy.auth.signIn}
          </Link>
        </>
      }
    >
      <GoogleButton next={next} />
      <OrDivider />
      <SignUpForm next={next} />
    </AuthCard>
  );
}
