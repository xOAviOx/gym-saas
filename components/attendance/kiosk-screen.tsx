'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  BackspaceIcon,
  CheckCircle2Icon,
  ClockIcon,
  FullscreenIcon,
  KeyboardIcon,
  LockIcon,
  ScanLineIcon,
  TriangleAlertIcon,
} from '@/components/icons';
import { Button } from '@/components/ui/button';
import { kioskCheckIn, kioskExit } from '@/features/attendance/kiosk-actions';
import type { KioskOutcome } from '@/features/attendance/types';
import { copy } from '@/lib/copy';
import { daysBetween, formatDate, formatTime, todayIST } from '@/lib/dates';
import type { ActionResult } from '@/lib/errors';
import { cn } from '@/lib/utils';

import { MemberAvatar } from './check-in-result';
import { PinPadDialog } from './pin-pad';
import { QrScanner } from './qr-scanner';

type Mode = 'scan' | 'keypad';
type Request = { code?: string; lookup?: string };
type Shown =
  { kind: 'outcome'; outcome: KioskOutcome; request: Request } | { kind: 'error'; message: string };

const RESET_MS = 4500;
const BLOCKED_RESET_MS = 12000;
const KEYPAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'M', '0'] as const;

function useClock() {
  const [now, setNow] = useState<Date | null>(null);
  // Starts empty and fills in after mount so the server and client render match.
  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 15000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);
  return now;
}

function detailLine(outcome: KioskOutcome): string | null {
  const { member } = outcome;
  if (outcome.result === 'duplicate' && outcome.checkedInAt) {
    return copy.kiosk.duplicateBody(formatTime(outcome.checkedInAt));
  }
  if (member.sessionsLeft !== null) return copy.attendance.sessionsLeft(member.sessionsLeft);
  if (member.endDate) {
    const left = daysBetween(todayIST(), member.endDate);
    if (left === 0) return copy.kiosk.endsToday;
    if (left > 0) return copy.kiosk.daysLeft(left);
  }
  return null;
}

export function KioskScreen({ gymName }: { gymName: string }) {
  const router = useRouter();
  const now = useClock();
  const [mode, setMode] = useState<Mode>('scan');
  const [lookup, setLookup] = useState('');
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState<Shown | null>(null);
  const [pinFor, setPinFor] = useState<'exit' | 'override' | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinPending, setPinPending] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const clear = useCallback(() => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    setShown(null);
    setLookup('');
    setPinFor((current) => (current === 'override' ? null : current));
  }, []);

  const show = useCallback(
    (next: Shown) => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
      setShown(next);
      const blocked = next.kind === 'outcome' && next.outcome.result === 'blocked';
      resetTimer.current = setTimeout(clear, blocked ? BLOCKED_RESET_MS : RESET_MS);
    },
    [clear],
  );

  useEffect(() => () => clearTimeout(resetTimer.current), []);

  /** True when the kiosk was turned off from settings; the page then shows the unpaired screen. */
  const handleTurnedOff = useCallback(
    (result: ActionResult<unknown>) => {
      if (!result.ok && result.code === 'unauthenticated') {
        router.refresh();
        return true;
      }
      return false;
    },
    [router],
  );

  const submit = useCallback(
    async (request: Request, pin?: string) => {
      setBusy(true);
      try {
        const result = await kioskCheckIn({ ...request, ...(pin ? { pin } : {}) });
        if (handleTurnedOff(result)) return result;
        if (result.ok) {
          show({ kind: 'outcome', outcome: result.data, request });
        } else {
          show({ kind: 'error', message: result.error });
        }
        return result;
      } catch {
        show({ kind: 'error', message: copy.errors.network });
        return null;
      } finally {
        setBusy(false);
      }
    },
    [handleTurnedOff, show],
  );

  const onScan = useCallback(
    (code: string) => {
      if (busy || shown || pinFor) return;
      void submit({ code });
    },
    [busy, shown, pinFor, submit],
  );

  async function onPin(pin: string) {
    setPinPending(true);
    setPinError(null);
    if (pinFor === 'exit') {
      try {
        const result = await kioskExit({ pin });
        if (result.ok) {
          router.replace('/sign-in');
          return;
        }
        setPinError(result.fieldErrors?.pin?.[0] ?? result.error);
      } catch {
        setPinError(copy.errors.network);
      }
    } else if (shown?.kind === 'outcome') {
      const result = await submit(shown.request, pin);
      if (result?.ok && result.data.result === 'blocked' && result.data.pinError) {
        setPinError(copy.attendance.pinErrors[result.data.pinError]);
      } else {
        setPinFor(null);
      }
    }
    setPinPending(false);
  }

  function fullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  }

  const outcome = shown?.kind === 'outcome' ? shown.outcome : null;
  const blocked = outcome?.result === 'blocked';
  const warn =
    outcome &&
    !blocked &&
    (outcome.member.flag === 'dues_pending' || outcome.member.flag === 'expiring');

  return (
    <div className="relative flex min-h-dvh flex-col">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(60rem_40rem_at_20%_0%,rgba(149,100,0,0.05),transparent_70%)]"
      />
      <header className="relative flex items-center justify-between gap-4 px-6 pt-6 sm:px-10 sm:pt-8">
        <div className="min-w-0">
          <p className="text-muted-foreground text-[11px] font-medium tracking-[0.05em] uppercase">
            {copy.kiosk.welcome}
          </p>
          <p className="truncate font-serif text-3xl leading-[1.1] tracking-[-0.02em] sm:text-4xl">
            {gymName}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <p className="tabular mr-2 hidden text-right sm:block" suppressHydrationWarning>
            <span className="block font-mono text-2xl">{now ? formatTime(now) : ''}</span>
            <span className="text-muted-foreground block text-xs">
              {now ? formatDate(now) : ''}
            </span>
          </p>
          <Button
            variant="ghost"
            size="icon"
            onClick={fullscreen}
            aria-label={copy.kiosk.fullscreen}
          >
            <FullscreenIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setPinError(null);
              setPinFor('exit');
            }}
            aria-label={copy.kiosk.exit}
          >
            <LockIcon />
          </Button>
        </div>
      </header>

      <main className="relative mx-auto grid w-full max-w-5xl flex-1 items-center gap-10 px-6 py-8 sm:px-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="animate-enter grid gap-4">
          <h1 className="font-serif text-4xl leading-[1.1] tracking-[-0.03em] text-balance sm:text-5xl">
            {mode === 'scan' ? copy.kiosk.scanPrompt : copy.kiosk.typePrompt}
          </h1>
          <Button
            variant="outline"
            size="lg"
            className="justify-self-start"
            onClick={() => {
              setMode((m) => (m === 'scan' ? 'keypad' : 'scan'));
              setLookup('');
            }}
          >
            {mode === 'scan' ? <KeyboardIcon /> : <ScanLineIcon />}
            {mode === 'scan' ? copy.kiosk.useKeypad : copy.kiosk.useCamera}
          </Button>
        </div>

        <div className="animate-enter [--index:1]">
          {mode === 'scan' ? (
            <QrScanner
              facing="user"
              onScan={onScan}
              paused={busy || shown !== null || pinFor !== null}
              className="mx-auto max-w-md"
            />
          ) : (
            <form
              className="bg-card mx-auto grid max-w-md gap-4 rounded-xl border p-5 sm:p-6"
              onSubmit={(event) => {
                event.preventDefault();
                if (lookup.length >= 3 && !busy) void submit({ lookup });
              }}
            >
              <label htmlFor="kiosk-lookup" className="sr-only">
                {copy.kiosk.lookupLabel}
              </label>
              <input
                id="kiosk-lookup"
                inputMode="numeric"
                autoComplete="off"
                value={lookup}
                maxLength={14}
                onChange={(event) =>
                  setLookup(event.target.value.toUpperCase().replace(/[^0-9M-]/g, ''))
                }
                className="bg-muted focus-visible:ring-ring/20 h-16 w-full rounded-md text-center font-mono text-3xl tracking-[0.15em] outline-none focus-visible:ring-3"
              />
              <div className="grid grid-cols-3 gap-2">
                {KEYPAD.map((key) => (
                  <Button
                    key={key}
                    type="button"
                    variant="outline"
                    className="h-16 font-mono text-2xl"
                    disabled={key === 'M' && lookup.length > 0}
                    onClick={() =>
                      setLookup((v) => (v.length < 14 ? v + (key === 'M' ? 'M-' : key) : v))
                    }
                  >
                    {key}
                  </Button>
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  className="h-16"
                  onClick={() =>
                    setLookup((v) => (v.endsWith('M-') ? v.slice(0, -2) : v.slice(0, -1)))
                  }
                  aria-label={copy.kiosk.deleteDigit}
                >
                  <BackspaceIcon className="size-7" />
                </Button>
              </div>
              <Button
                type="submit"
                size="lg"
                className="h-14 text-lg"
                disabled={lookup.length < 3 || busy}
              >
                {copy.kiosk.submit}
              </Button>
            </form>
          )}
        </div>
      </main>

      {shown ? (
        <div
          role="status"
          aria-live="assertive"
          className="bg-background/95 fixed inset-0 z-40 grid place-items-center p-6 backdrop-blur-sm"
          onClick={() => !blocked && clear()}
        >
          <div className="animate-enter grid max-w-xl justify-items-center gap-6 text-center">
            {outcome ? (
              <>
                <div className="relative">
                  <MemberAvatar
                    name={outcome.member.firstName}
                    photoUrl={outcome.member.photoUrl}
                    size={112}
                    className="text-3xl"
                  />
                  <span
                    className={cn(
                      'absolute -right-1 -bottom-1 grid size-10 place-items-center rounded-full border-4 border-[#FBFBFA]',
                      blocked
                        ? 'bg-danger-soft text-danger'
                        : outcome.result === 'duplicate'
                          ? 'bg-muted text-muted-foreground'
                          : warn
                            ? 'bg-warning-soft text-warning'
                            : 'bg-success-soft text-success',
                    )}
                  >
                    {blocked ? (
                      <TriangleAlertIcon className="size-5" />
                    ) : outcome.result === 'duplicate' ? (
                      <ClockIcon className="size-5" />
                    ) : (
                      <CheckCircle2Icon className="size-5" />
                    )}
                  </span>
                </div>
                <h2 className="font-serif text-5xl leading-[1.05] tracking-[-0.03em] sm:text-6xl">
                  {blocked
                    ? copy.kiosk.blockedTitle
                    : outcome.result === 'duplicate'
                      ? copy.kiosk.duplicate(outcome.member.firstName)
                      : copy.kiosk.checkedIn(outcome.member.firstName)}
                </h2>
                {blocked ? (
                  <p className="text-muted-foreground text-lg">{copy.kiosk.blockedBody}</p>
                ) : detailLine(outcome) ? (
                  <p className="text-muted-foreground tabular text-lg">{detailLine(outcome)}</p>
                ) : null}
                {!blocked && outcome.member.flag === 'dues_pending' ? (
                  <p className="bg-warning-soft text-warning rounded-full px-4 py-1.5 text-sm">
                    {copy.kiosk.duesNote}
                  </p>
                ) : null}
                {!blocked && outcome.member.flag === 'expiring' ? (
                  <p className="bg-warning-soft text-warning rounded-full px-4 py-1.5 text-sm">
                    {copy.kiosk.expiringNote}
                  </p>
                ) : null}
                {blocked ? (
                  <div className="flex flex-wrap justify-center gap-3">
                    <Button variant="outline" size="lg" onClick={clear}>
                      {copy.common.done}
                    </Button>
                    <Button
                      size="lg"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (resetTimer.current) clearTimeout(resetTimer.current);
                        setPinError(null);
                        setPinFor('override');
                      }}
                    >
                      {copy.kiosk.staffLetIn}
                    </Button>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <span className="bg-danger-soft text-danger grid size-16 place-items-center rounded-full">
                  <TriangleAlertIcon className="size-7" />
                </span>
                <p className="font-serif text-4xl leading-[1.1] tracking-[-0.02em]">
                  {shown.kind === 'error' ? shown.message : ''}
                </p>
              </>
            )}
          </div>
        </div>
      ) : null}

      <PinPadDialog
        open={pinFor !== null}
        title={pinFor === 'exit' ? copy.kiosk.exitTitle : copy.attendance.results.pinTitle}
        description={pinFor === 'exit' ? copy.kiosk.exitBody : copy.attendance.results.pinBody}
        error={pinError}
        pending={pinPending}
        onSubmit={onPin}
        onOpenChange={(open) => {
          if (!open) {
            setPinFor(null);
            if (shown) show(shown);
          }
        }}
      />
    </div>
  );
}
