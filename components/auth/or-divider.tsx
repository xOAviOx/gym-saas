import { copy } from '@/lib/copy';

export function OrDivider() {
  return (
    <div className="text-muted-foreground my-5 flex items-center gap-3 text-xs" role="separator">
      <span className="bg-border h-px flex-1" />
      {copy.auth.or}
      <span className="bg-border h-px flex-1" />
    </div>
  );
}
