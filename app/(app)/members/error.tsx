'use client';

import { InlineError } from '@/components/shared/inline-error';
import { Button } from '@/components/ui/button';
import { copy } from '@/lib/copy';

export default function MembersError({ reset }: { reset: () => void }) {
  return (
    <InlineError
      title={copy.common.errorBody}
      action={
        <Button variant="outline" onClick={reset}>
          {copy.common.retry}
        </Button>
      }
    />
  );
}
