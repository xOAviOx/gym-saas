'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { copy } from '@/lib/copy';
import { cn } from '@/lib/utils';

import { isActivePath, PRIMARY_NAV } from './nav-items';

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav aria-label={copy.nav.mainNavigation} className="flex-1 px-3">
      <ul className="grid gap-1">
        {PRIMARY_NAV.map((item) => {
          const active = isActivePath(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'focus-visible:ring-ring/40 flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors duration-150 outline-none focus-visible:ring-3',
                  active
                    ? 'bg-success-soft text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon className="size-5" aria-hidden="true" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
