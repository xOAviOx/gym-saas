import { CheckIcon } from 'lucide-react';

import { copy } from '@/lib/copy';
import { cn } from '@/lib/utils';

type StepsProps = {
  current: number;
  labels: readonly string[];
};

export function Steps({ current, labels }: StepsProps) {
  return (
    <nav aria-label={copy.onboarding.title} className="mb-6">
      <p className="text-muted-foreground mb-3 text-sm">
        {copy.onboarding.stepLabel(current, labels.length)}
      </p>
      <ol className="flex items-center gap-2">
        {labels.map((label, index) => {
          const step = index + 1;
          const done = step < current;
          const active = step === current;
          return (
            <li key={label} className="flex flex-1 items-center gap-2">
              <span
                aria-current={active ? 'step' : undefined}
                className={cn(
                  'inline-flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium',
                  done && 'border-primary bg-primary text-primary-foreground',
                  active && 'border-primary text-primary',
                  !done && !active && 'text-muted-foreground',
                )}
              >
                {done ? <CheckIcon className="size-3.5" aria-hidden="true" /> : step}
              </span>
              <span
                className={cn(
                  'truncate text-sm',
                  active ? 'text-foreground font-medium' : 'text-muted-foreground',
                )}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
