import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { copy } from '@/lib/copy';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl">{copy.common.notFoundTitle}</h1>
      <p className="text-muted-foreground mt-2 text-sm">{copy.common.notFoundBody}</p>
      <Button asChild className="mt-6">
        <Link href="/today">{copy.common.goToToday}</Link>
      </Button>
    </main>
  );
}
