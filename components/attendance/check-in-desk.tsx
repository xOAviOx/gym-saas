'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { toast } from 'sonner';

import { ScanLineIcon, SearchIcon } from '@/components/icons';
import { applyActionResult } from '@/components/shared/apply-action-result';
import { FormDialog } from '@/components/shared/form-dialog';
import { StatusBadge } from '@/components/shared/status-badge';
import { SubmitButton } from '@/components/shared/submit-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { checkInByQr, checkInMember, searchMembersForCheckIn } from '@/features/attendance/actions';
import type { CheckInCandidate } from '@/features/attendance/queries';
import type { CheckInOutcome } from '@/features/attendance/types';
import { copy } from '@/lib/copy';
import type { MemberState } from '@/lib/membership';
import { formatPhoneNational } from '@/lib/phone';

import { CheckInResultCard } from './check-in-result';
import { QrScanner } from './qr-scanner';
import { useCheckIn } from './use-check-in';

const SEARCH_DELAY_MS = 250;

export function CheckInDesk({ canOverride, today }: { canOverride: boolean; today: string }) {
  const searchId = useId();
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<CheckInCandidate[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [last, setLast] = useState<CheckInOutcome | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const searchSeq = useRef(0);
  const { run, dialog, blocked } = useCheckIn({ canOverride, onCheckedIn: setLast });

  function changeQuery(value: string) {
    setQuery(value);
    const searchable = value.trim().length >= 2;
    setSearching(searchable);
    if (!searchable) {
      searchSeq.current++;
      setCandidates(null);
    }
  }

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) return;
    const seq = ++searchSeq.current;
    const timer = setTimeout(async () => {
      try {
        const result = await searchMembersForCheckIn({ query: term });
        if (seq !== searchSeq.current) return;
        if (applyActionResult(result)) setCandidates(result.data);
      } catch {
        if (seq === searchSeq.current) toast.error(copy.errors.network);
      }
      if (seq === searchSeq.current) setSearching(false);
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query]);

  async function checkInCandidate(candidate: CheckInCandidate) {
    setPendingId(candidate.id);
    const outcome = await run((extra) => checkInMember({ memberId: candidate.id, ...extra }));
    setPendingId(null);
    if (outcome && outcome.result !== 'blocked') changeQuery('');
  }

  const onScan = useCallback(
    async (code: string) => {
      setScanBusy(true);
      await run((extra) => checkInByQr({ code, ...extra }));
      // A short pause stops the same card from being read again while it is still in view.
      setTimeout(() => setScanBusy(false), 1200);
    },
    [run],
  );

  return (
    <section aria-labelledby={`${searchId}-title`} className="grid gap-4">
      <div className="flex items-end justify-between gap-3">
        <h2 id={`${searchId}-title`} className="text-base font-semibold">
          {copy.attendance.checkInTitle}
        </h2>
        <FormDialog
          open={scanOpen}
          onOpenChange={setScanOpen}
          title={copy.attendance.scanTitle}
          description={copy.attendance.scanBody}
          trigger={
            <Button variant="default">
              <ScanLineIcon />
              {copy.attendance.scan}
            </Button>
          }
        >
          <div className="grid gap-4">
            {scanOpen ? <QrScanner onScan={onScan} paused={scanBusy || blocked} /> : null}
            {last ? <CheckInResultCard outcome={last} today={today} /> : null}
          </div>
        </FormDialog>
      </div>

      <div className="grid gap-1.5">
        <label htmlFor={searchId} className="text-sm font-medium">
          {copy.attendance.searchLabel}
        </label>
        <div className="relative">
          <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            id={searchId}
            type="search"
            autoComplete="off"
            value={query}
            onChange={(event) => changeQuery(event.target.value)}
            placeholder={copy.attendance.searchPlaceholder}
            className="pl-9"
            aria-describedby={`${searchId}-hint`}
          />
          {searching ? (
            <Spinner className="text-muted-foreground absolute top-1/2 right-3 -translate-y-1/2" />
          ) : null}
        </div>
        <p id={`${searchId}-hint`} className="text-muted-foreground text-xs">
          {copy.attendance.searchHint}
        </p>
      </div>

      {candidates ? (
        candidates.length ? (
          <ul className="bg-card divide-border divide-y rounded-xl border">
            {candidates.map((candidate) => (
              <li key={candidate.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/members/${candidate.id}`}
                    className="block truncate text-sm font-medium underline-offset-4 hover:underline"
                  >
                    {candidate.name}
                  </Link>
                  <p className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2 text-xs">
                    <span className="font-mono">{candidate.code}</span>
                    <span>{formatPhoneNational(candidate.phone)}</span>
                  </p>
                </div>
                <span className="hidden sm:inline-flex">
                  <StatusBadge status={candidate.status as MemberState} />
                </span>
                <SubmitButton
                  type="button"
                  size="sm"
                  variant="outline"
                  pending={pendingId === candidate.id}
                  disabled={pendingId !== null}
                  onClick={() => checkInCandidate(candidate)}
                  aria-label={copy.attendance.checkInFor(candidate.name)}
                >
                  {copy.attendance.checkIn}
                </SubmitButton>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground bg-card rounded-xl border px-4 py-6 text-center text-sm">
            {copy.attendance.searchEmpty}
          </p>
        )
      ) : null}

      {last && !scanOpen ? <CheckInResultCard outcome={last} today={today} /> : null}

      {dialog}
    </section>
  );
}
