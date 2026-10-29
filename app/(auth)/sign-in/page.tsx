import type { Metadata } from 'next';
import Link from 'next/link';

import { AuthCard } from '@/components/auth/auth-card';
import { GoogleButton } from '@/components/auth/google-button';
import { OrDivider } from '@/components/auth/or-divider';
import { SignInForm } from '@/components/auth/sign-in-form';
import { InlineError } from '@/components/shared/inline-error';
import { copy } from '@/lib/copy';
import { safeNextPath } from '@/lib/supabase/proxy';

export const metadata: Metadata = { title: copy.auth.signInTitle };

type SearchParams = Promise<{ next?: string; error?: string }>;

export default async function SignInPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const next = safeNextPath(params.next);

  return (
    <AuthCard
      title={copy.auth.signInTitle}
      subtitle={copy.auth.signInSubtitle}
      footer={
        <>
          {copy.auth.noAccount}{' '}
          <Link
            href="/sign-up"
            className="text-primary font-medium underline-offset-4 hover:underline"
          >
            {copy.auth.createOne}
          </Link>
        </>
      }
    >
      {params.error ? (
        <div className="mb-4">
          <InlineError
            title={params.error === 'google' ? copy.auth.googleUnavailable : copy.auth.linkInvalid}
          />
        </div>
      ) : null}
      <GoogleButton next={next} />
      <OrDivider />
      <SignInForm next={next} />
    </AuthCard>
  );
}
