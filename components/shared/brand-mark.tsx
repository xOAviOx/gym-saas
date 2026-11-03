import { cn } from '@/lib/utils';

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'bg-primary text-primary-foreground inline-flex size-8 shrink-0 items-center justify-center rounded-md font-serif text-lg leading-none',
        className,
      )}
    >
      G
    </span>
  );
}
