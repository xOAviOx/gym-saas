import type { Metadata } from 'next';
import Link from 'next/link';

import { AcceptTeamInvite } from '@/components/settings/accept-team-invite';
import { getUser } from '@/lib/auth/session';
import { copy } from '@/lib/copy';

export const metadata: Metadata = {
  title: copy.team.acceptTitle,
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function TeamInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await getUser();
  const next = `/invite/${encodeURIComponent(token)}`;
  return (
    <main className="bg-background grid min-h-dvh place-items-center px-4 py-8">
      <section className="bg-card grid w-full max-w-sm gap-4 rounded-xl border p-6 text-center">
        <h1 className="font-serif text-3xl">{copy.team.acceptTitle}</h1>
        <p className="text-muted-foreground text-sm">{copy.team.acceptBody}</p>
        {user ? (
          <AcceptTeamInvite token={token} />
        ) : (
          <>
            <Link
              href={`/sign-in?next=${encodeURIComponent(next)}`}
              className="bg-primary text-primary-foreground rounded-lg px-4 py-3 text-sm"
            >
              {copy.auth.signIn}
            </Link>
            <Link href={`/sign-up?next=${encodeURIComponent(next)}`} className="text-sm underline">
              {copy.auth.createOne}
            </Link>
          </>
        )}
      </section>
    </main>
  );
}
