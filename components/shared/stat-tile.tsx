import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

type StatTileProps = {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: 'default' | 'success' | 'warning' | 'danger';
  className?: string;
};

const toneClass: Record<NonNullable<StatTileProps['tone']>, string> = {
  default: 'text-foreground',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
};

export function StatTile({ label, value, hint, tone = 'default', className }: StatTileProps) {
  return (
    <div className={cn('bg-card rounded-xl border p-4', className)}>
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className={cn('tabular mt-1 text-2xl font-semibold md:text-3xl', toneClass[tone])}>
        {value}
      </p>
      {hint ? <p className="text-muted-foreground mt-1 text-xs">{hint}</p> : null}
    </div>
  );
}
