import { Skeleton } from '@/components/ui/skeleton';

export default function AppLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <Skeleton className="mb-6 h-8 w-40" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
      <Skeleton className="mt-6 h-40 rounded-xl" />
    </div>
  );
}
