'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { copy } from '@/lib/copy';
import { cn } from '@/lib/utils';

import { isActivePath, PRIMARY_NAV } from './nav-items';

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label={copy.nav.mainNavigation}
      className="bg-background/85 border-border pb-safe fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur-md md:hidden"
    >
      <ul className="grid grid-cols-5">
        {PRIMARY_NAV.map((item) => {
          const active = isActivePath(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'focus-visible:bg-muted flex h-14 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors duration-150 outline-none',
                  active ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                <Icon className="size-5" weight={active ? 'fill' : 'bold'} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
