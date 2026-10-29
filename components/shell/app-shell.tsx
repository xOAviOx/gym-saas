import type { ReactNode } from 'react';

import type { OrgContext } from '@/lib/auth/session';

import { BottomNav } from './bottom-nav';
import { Sidebar } from './sidebar';

export function AppShell({ ctx, children }: { ctx: OrgContext; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh">
      <Sidebar ctx={ctx} />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-5 pb-24 md:px-8 md:pt-8 md:pb-12">
          {children}
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
