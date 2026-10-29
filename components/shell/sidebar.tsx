import { LogOutIcon } from 'lucide-react';

import { BrandMark } from '@/components/shared/brand-mark';
import { RolePill } from '@/components/shared/role-pill';
import { Button } from '@/components/ui/button';
import { signOut } from '@/features/auth/actions';
import type { OrgContext } from '@/lib/auth/session';
import { APP_NAME, copy } from '@/lib/copy';

import { SidebarNav } from './sidebar-nav';

export function Sidebar({ ctx }: { ctx: OrgContext }) {
  const displayName = ctx.profile?.full_name?.trim() || ctx.user.email || '';

  return (
    <aside className="bg-card sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r md:flex">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <BrandMark />
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs">{APP_NAME}</p>
          <p className="truncate text-sm font-semibold">{ctx.org.name}</p>
        </div>
      </div>

      <SidebarNav />

      <div className="border-t p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{displayName}</p>
            {ctx.user.email && displayName !== ctx.user.email ? (
              <p className="text-muted-foreground truncate text-xs">{ctx.user.email}</p>
            ) : null}
          </div>
          <RolePill role={ctx.role} />
        </div>
        <form action={signOut} className="mt-3">
          <Button type="submit" variant="ghost" size="sm" className="w-full justify-start">
            <LogOutIcon />
            {copy.nav.signOut}
          </Button>
        </form>
      </div>
    </aside>
  );
}
