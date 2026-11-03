import Link from 'next/link';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

type StatTileProps = {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: 'default' | 'success' | 'warning' | 'danger';
  href?: string;
  className?: string;
};

const toneClass: Record<NonNullable<StatTileProps['tone']>, string> = {
  default: 'text-foreground',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
};

export function StatTile({ label, value, hint, tone = 'default', href, className }: StatTileProps) {
  const body = (
    <>
      <p className="text-muted-foreground text-[11px] leading-4 font-medium tracking-[0.05em] uppercase">
        {label}
      </p>
      <p
        className={cn(
          'tabular mt-3 text-2xl leading-none font-semibold tracking-tight md:text-3xl',
          toneClass[tone],
        )}
      >
        {value}
      </p>
      {hint ? <p className="text-muted-foreground mt-2 text-xs">{hint}</p> : null}
    </>
  );
  const base = cn('bg-card border-border rounded-xl border p-4 md:p-5', className);
  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          base,
          'hover:shadow-lift focus-visible:ring-ring/20 block transition-shadow duration-200 focus-visible:ring-3 focus-visible:outline-none',
        )}
      >
        {body}
      </Link>
    );
  }
  return <div className={base}>{body}</div>;
}
