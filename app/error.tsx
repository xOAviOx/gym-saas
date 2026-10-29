'use client';

import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { copy } from '@/lib/copy';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl">{copy.common.errorTitle}</h1>
      <p className="text-muted-foreground mt-2 text-sm">{copy.common.errorBody}</p>
      <Button className="mt-6" onClick={reset}>
        {copy.common.retry}
      </Button>
    </main>
  );
}
