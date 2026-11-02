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
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className={cn('tabular mt-1 text-2xl font-semibold md:text-3xl', toneClass[tone])}>
        {value}
      </p>
      {hint ? <p className="text-muted-foreground mt-1 text-xs">{hint}</p> : null}
    </>
  );
  const base = cn('bg-card rounded-xl border p-4', className);
  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          base,
          'hover:bg-muted/50 focus-visible:ring-ring block transition-colors focus-visible:ring-2 focus-visible:outline-none',
        )}
      >
        {body}
      </Link>
    );
  }
  return <div className={base}>{body}</div>;
}
