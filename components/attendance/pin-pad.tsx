'use client';

import { useState } from 'react';

import { BackspaceIcon } from '@/components/icons';
import { SubmitButton } from '@/components/shared/submit-button';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { copy } from '@/lib/copy';
import { cn } from '@/lib/utils';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

/** Big on-screen keypad for a 4-6 digit PIN; tablets in kiosk mode often have no keyboard. */
export function PinPadDialog({
  open,
  title,
  description,
  error,
  pending,
  onSubmit,
  onOpenChange,
}: {
  open: boolean;
  title: string;
  description: string;
  error: string | null;
  pending: boolean;
  onSubmit: (pin: string) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [pin, setPin] = useState('');
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    setPin('');
  }

  const press = (digit: string) => setPin((p) => (p.length < 6 ? p + digit : p));
  const valid = /^[0-9]{4,6}$/.test(pin);

  return (
    <Dialog open={open} onOpenChange={(value) => !pending && onOpenChange(value)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (!valid) return;
            onSubmit(pin);
            setPin('');
          }}
        >
          <label className="sr-only" htmlFor="kiosk-pin">
            {copy.kiosk.pinLabel}
          </label>
          <input
            id="kiosk-pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={6}
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'kiosk-pin-error' : undefined}
            className="bg-muted focus-visible:ring-ring/20 h-14 w-full rounded-md text-center font-mono text-2xl tracking-[0.6em] outline-none focus-visible:ring-3"
          />
          {error ? (
            <p
              id="kiosk-pin-error"
              role="alert"
              className="text-destructive -mt-2 text-center text-sm"
            >
              {error}
            </p>
          ) : null}
          <div className="grid grid-cols-3 gap-2">
            {KEYS.map((key) => (
              <Button
                key={key}
                type="button"
                variant="outline"
                className="h-14 font-mono text-xl"
                onClick={() => press(key)}
              >
                {key}
              </Button>
            ))}
            <span />
            <Button
              type="button"
              variant="outline"
              className="h-14 font-mono text-xl"
              onClick={() => press('0')}
            >
              0
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-14"
              onClick={() => setPin((p) => p.slice(0, -1))}
              aria-label={copy.kiosk.deleteDigit}
            >
              <BackspaceIcon className="size-6" />
            </Button>
          </div>
          <SubmitButton pending={pending} disabled={!valid} className={cn('h-12')}>
            {copy.kiosk.confirm}
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
