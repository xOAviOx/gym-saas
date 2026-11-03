import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { copy } from '@/lib/copy';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col items-center justify-center px-4 text-center">
      <h1 className="font-serif text-3xl leading-[1.1] font-normal tracking-[-0.02em] sm:text-4xl">
        {copy.common.notFoundTitle}
      </h1>
      <p className="text-muted-foreground leading-prose mt-3 text-sm">{copy.common.notFoundBody}</p>
      <Button asChild className="mt-6">
        <Link href="/today">{copy.common.goToToday}</Link>
      </Button>
    </main>
  );
}
