import { CheckIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

export function WorkflowSteps({
  label,
  steps,
  current,
  complete = false,
}: {
  label: string;
  steps: readonly string[];
  current: number;
  complete?: boolean;
}) {
  return (
    <ol
      aria-label={label}
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
    >
      {steps.map((step, index) => (
        <li
          key={step}
          aria-current={!complete && index === current ? 'step' : undefined}
          className={cn(
            'flex min-w-0 items-start gap-2 border-t-2 pt-3 text-xs sm:text-sm',
            complete || index <= current ? 'border-primary' : 'border-border',
            !complete && index > current ? 'text-muted-foreground' : 'text-foreground',
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              'flex size-5 shrink-0 items-center justify-center rounded-full text-xs',
              complete || index < current
                ? 'bg-primary text-primary-foreground'
                : index === current
                  ? 'bg-success-soft text-primary'
                  : 'bg-muted text-muted-foreground',
            )}
          >
            {complete || index < current ? <CheckIcon className="size-3" /> : index + 1}
          </span>
          <span className="min-w-0 pt-0.5 leading-snug">{step}</span>
        </li>
      ))}
    </ol>
  );
}
