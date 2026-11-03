import type { ReactNode } from 'react';

import type { AppIcon } from '@/components/icons';
import { cn } from '@/lib/utils';

type EmptyStateProps = {
  icon?: AppIcon;
  title: string;
  body?: string;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ icon: Icon, title, body, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'bg-card border-border flex flex-col items-center justify-center rounded-xl border px-6 py-12 text-center',
        className,
      )}
    >
      {Icon ? (
        <span className="bg-muted text-foreground mb-4 inline-flex size-10 items-center justify-center rounded-md">
          <Icon className="size-5" />
        </span>
      ) : null}
      <h2 className="text-base font-semibold">{title}</h2>
      {body ? (
        <p className="text-muted-foreground leading-prose mt-1 max-w-sm text-sm">{body}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
