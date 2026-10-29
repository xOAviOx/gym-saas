import Link from 'next/link';
import type { ReactNode } from 'react';

import { BrandMark } from '@/components/shared/brand-mark';
import { APP_NAME } from '@/lib/copy';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-10">
        <Link
          href="/"
          className="focus-visible:ring-ring/40 mb-8 flex items-center gap-2.5 self-center rounded-lg outline-none focus-visible:ring-3"
        >
          <BrandMark />
          <span className="text-xl font-semibold tracking-tight">{APP_NAME}</span>
        </Link>
        {children}
      </main>
    </div>
  );
}
