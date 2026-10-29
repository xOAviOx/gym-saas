import type { ReactNode } from 'react';

import { BrandMark } from '@/components/shared/brand-mark';
import { Button } from '@/components/ui/button';
import { signOut } from '@/features/auth/actions';
import { requireUser } from '@/lib/auth/session';
import { APP_NAME, copy } from '@/lib/copy';

export default async function OnboardingLayout({ children }: { children: ReactNode }) {
  await requireUser();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-4 py-3 md:px-8">
        <div className="flex items-center gap-2.5">
          <BrandMark />
          <span className="text-base font-semibold tracking-tight">{APP_NAME}</span>
        </div>
        <form action={signOut}>
          <Button type="submit" variant="ghost" size="sm">
            {copy.nav.signOut}
          </Button>
        </form>
      </header>
      <main className="mx-auto w-full max-w-xl flex-1 px-4 pt-4 pb-10 md:pt-8">{children}</main>
    </div>
  );
}
