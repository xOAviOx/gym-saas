'use client';

import { useState } from 'react';

import { UserCheckIcon } from '@/components/icons';
import { SubmitButton } from '@/components/shared/submit-button';
import { checkInMember } from '@/features/attendance/actions';
import { copy } from '@/lib/copy';

import { useCheckIn } from './use-check-in';

export function MemberCheckInButton({
  memberId,
  name,
  canOverride,
}: {
  memberId: string;
  name: string;
  canOverride: boolean;
}) {
  const [pending, setPending] = useState(false);
  const { run, dialog } = useCheckIn({ canOverride });

  async function checkIn() {
    setPending(true);
    await run((extra) => checkInMember({ memberId, ...extra }));
    setPending(false);
  }

  return (
    <>
      <SubmitButton
        type="button"
        variant="outline"
        pending={pending}
        onClick={checkIn}
        aria-label={copy.attendance.checkInFor(name)}
        className="flex-1 sm:flex-none"
      >
        <UserCheckIcon aria-hidden="true" />
        {copy.attendance.checkIn}
      </SubmitButton>
      {dialog}
    </>
  );
}
