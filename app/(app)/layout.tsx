import type { ReactNode } from 'react';

import { AppShell } from '@/components/shell/app-shell';
import { requireOrg } from '@/lib/auth/session';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const ctx = await requireOrg();
  return <AppShell ctx={ctx}>{children}</AppShell>;
}
