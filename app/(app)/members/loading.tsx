import { Skeleton } from '@/components/ui/skeleton';
import { copy } from '@/lib/copy';

export default function MembersLoading() {
  return (
    <div role="status" aria-label={copy.common.loading} className="grid gap-4">
      <Skeleton className="mb-2 h-9 w-40" />
      <Skeleton className="h-5 w-44" />
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((n) => (
          <Skeleton key={n} className="h-32 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-11 w-full" />
      <div className="flex gap-2">
        {[0, 1, 2, 3].map((n) => (
          <Skeleton key={n} className="h-11 w-20 rounded-full" />
        ))}
      </div>
      {[0, 1, 2, 3, 4].map((n) => (
        <Skeleton key={n} className="h-24 w-full rounded-xl" />
      ))}
    </div>
  );
}
