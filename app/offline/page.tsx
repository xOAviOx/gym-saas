import type { Metadata } from 'next';

import { BrandMark } from '@/components/shared/brand-mark';
import { copy } from '@/lib/copy';

export const metadata: Metadata = { title: copy.offline.title };

export default function OfflinePage() {
  return (
    <main className="bg-background grid min-h-dvh place-items-center p-4">
      <section className="bg-card grid max-w-sm justify-items-center gap-3 rounded-xl border p-6 text-center">
        <BrandMark className="size-10 rounded-lg" />
        <h1 className="font-serif text-3xl">{copy.offline.title}</h1>
        <p className="text-muted-foreground text-sm">{copy.offline.body}</p>
      </section>
    </main>
  );
}
