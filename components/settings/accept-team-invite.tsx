'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { acceptTeamInvite } from '@/features/team/actions';
import { copy } from '@/lib/copy';

export function AcceptTeamInvite({ token }: { token: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function accept() {
    setPending(true);
    const result = await acceptTeamInvite({ token });
    if (result.ok) router.push('/today');
    else {
      setError(result.error);
      setPending(false);
    }
  }
  return (
    <>
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      <Button type="button" disabled={pending} onClick={accept}>
        {pending ? copy.common.saving : copy.team.accept}
      </Button>
    </>
  );
}
