import Link from 'next/link';
import type { ReactNode } from 'react';

import { BrandMark } from '@/components/shared/brand-mark';
import { APP_NAME } from '@/lib/copy';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative isolate flex min-h-dvh flex-col">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_70%_50%_at_50%_0%,rgba(196,140,64,0.05),transparent_70%)]"
      />
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-10">
        <Link
          href="/"
          className="focus-visible:ring-ring/20 mb-8 flex items-center gap-2.5 self-center rounded-md outline-none focus-visible:ring-3"
        >
          <BrandMark />
          <span className="text-xl font-semibold tracking-tight">{APP_NAME}</span>
        </Link>
        {children}
      </main>
    </div>
  );
}
