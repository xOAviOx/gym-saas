'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useId, useState } from 'react';
import { toast } from 'sonner';

import { applyActionResult } from '@/components/shared/apply-action-result';
import { SubmitButton } from '@/components/shared/submit-button';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type { CheckInOutcome } from '@/features/attendance/types';
import { copy } from '@/lib/copy';
import { formatTime } from '@/lib/dates';
import type { ActionResult } from '@/lib/errors';

export type CheckInExtra = { override?: boolean; pin?: string };
export type CheckInRequest = (extra: CheckInExtra) => Promise<ActionResult<CheckInOutcome>>;

/**
 * Runs a check-in request and owns the "membership has expired" step: owners
 * and managers confirm, staff enter the kiosk PIN. The SQL function checks both.
 */
export function useCheckIn({
  canOverride,
  onCheckedIn,
}: {
  canOverride: boolean;
  onCheckedIn?: (outcome: CheckInOutcome) => void;
}) {
  const router = useRouter();
  const id = useId();
  const [blocked, setBlocked] = useState<{
    outcome: CheckInOutcome;
    request: CheckInRequest;
  } | null>(null);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [overriding, setOverriding] = useState(false);

  const run = useCallback(
    async (request: CheckInRequest, extra: CheckInExtra = {}): Promise<CheckInOutcome | null> => {
      let result: ActionResult<CheckInOutcome>;
      try {
        result = await request(extra);
      } catch {
        toast.error(copy.errors.network);
        return null;
      }
      if (!applyActionResult(result)) return null;
      const outcome = result.data;
      if (outcome.result === 'blocked') {
        setBlocked({ outcome, request });
        setPinError(
          outcome.pinError && (extra.override || outcome.pinError !== 'pin_required')
            ? copy.attendance.pinErrors[outcome.pinError]
            : null,
        );
        return outcome;
      }
      setBlocked(null);
      setPin('');
      setPinError(null);
      if (outcome.result === 'duplicate' && outcome.checkedInAt) {
        toast.info(
          copy.attendance.results.duplicate(outcome.member.name, formatTime(outcome.checkedInAt)),
        );
      } else {
        toast.success(copy.attendance.results.checkedIn(outcome.member.name));
        router.refresh();
      }
      onCheckedIn?.(outcome);
      return outcome;
    },
    [router, onCheckedIn],
  );

  async function letIn() {
    if (!blocked) return;
    if (!canOverride && !/^[0-9]{4,6}$/.test(pin)) {
      setPinError(copy.attendance.pinInvalid);
      return;
    }
    setOverriding(true);
    await run(blocked.request, canOverride ? { override: true } : { override: true, pin });
    setOverriding(false);
  }

  const dialog = (
    <Dialog
      open={blocked !== null}
      onOpenChange={(open) => {
        if (!open && !overriding) {
          setBlocked(null);
          setPin('');
          setPinError(null);
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{copy.attendance.results.blockedTitle}</DialogTitle>
          <DialogDescription>
            {blocked ? copy.attendance.results.blockedBody(blocked.outcome.member.name) : ''}
          </DialogDescription>
        </DialogHeader>
        {!canOverride ? (
          <div className="grid gap-1.5">
            <label htmlFor={`${id}-pin`} className="text-sm font-medium">
              {copy.attendance.results.pinTitle}
            </label>
            <Input
              id={`${id}-pin`}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={6}
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
              aria-invalid={pinError ? true : undefined}
              aria-describedby={`${id}-pin-help`}
              className="font-mono tracking-[0.3em]"
            />
            <p
              id={`${id}-pin-help`}
              className={pinError ? 'text-destructive text-xs' : 'text-muted-foreground text-xs'}
            >
              {pinError ?? copy.attendance.results.pinBody}
            </p>
          </div>
        ) : pinError ? (
          <p className="text-destructive text-sm">{pinError}</p>
        ) : null}
        <div className="flex flex-col-reverse gap-3 sm:flex-row">
          {blocked ? (
            <Button asChild variant="outline" className="flex-1">
              <Link href={`/members/${blocked.outcome.member.id}`}>
                {copy.attendance.results.renew}
              </Link>
            </Button>
          ) : null}
          <SubmitButton type="button" pending={overriding} onClick={letIn} className="flex-1">
            {copy.attendance.results.letIn}
          </SubmitButton>
        </div>
      </DialogContent>
    </Dialog>
  );

  return { run, dialog, blocked: blocked !== null };
}
