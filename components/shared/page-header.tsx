import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

type PageHeaderProps = {
  title: string;
  description?: string;
  /** Primary action rendered at the end of the header on all sizes. */
  action?: ReactNode;
  className?: string;
};

export function PageHeader({ title, description, action, className }: PageHeaderProps) {
  return (
    <header className={cn('animate-enter mb-8 flex items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        <h1 className="font-serif text-3xl leading-[1.1] font-normal tracking-[-0.02em] sm:text-4xl">
          {title}
        </h1>
        {description ? (
          <p className="text-muted-foreground leading-prose mt-2 text-sm">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
