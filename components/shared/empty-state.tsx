import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

type EmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  body?: string;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ icon: Icon, title, body, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'bg-card flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-12 text-center',
        className,
      )}
    >
      {Icon ? (
        <span className="bg-muted text-muted-foreground mb-4 inline-flex size-12 items-center justify-center rounded-full">
          <Icon className="size-6" aria-hidden="true" />
        </span>
      ) : null}
      <h2 className="text-base font-semibold">{title}</h2>
      {body ? <p className="text-muted-foreground mt-1 max-w-sm text-sm">{body}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
