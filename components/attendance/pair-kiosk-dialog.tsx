'use client';

import Link from 'next/link';
import { useId, useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { TabletIcon } from '@/components/icons';
import { FormDialog } from '@/components/shared/form-dialog';
import { SubmitButton } from '@/components/shared/submit-button';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { pairKioskDevice } from '@/features/attendance/actions';
import { copy } from '@/lib/copy';

export function PairKioskDialog({ pinSet }: { pinSet: boolean }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState<string>(copy.kiosk.pairPlaceholder);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      // On success the action redirects to /kiosk, so only failures come back.
      const result = await pairKioskDevice({ label });
      if (!result.ok) {
        setError(result.fieldErrors?.label?.[0] ?? null);
        toast.error(result.error);
      }
    } catch (caught) {
      if (caught && typeof caught === 'object' && 'digest' in caught) throw caught;
      toast.error(copy.errors.network);
    }
    setPending(false);
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={(value) => !pending && setOpen(value)}
      title={copy.kiosk.pairTitle}
      description={copy.kiosk.pairBody}
      trigger={
        <Button variant="outline">
          <TabletIcon />
          {copy.attendance.openKiosk}
        </Button>
      }
    >
      {pinSet ? (
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-1.5">
            <label htmlFor={id} className="text-sm font-medium">
              {copy.kiosk.pairLabel}
            </label>
            <Input
              id={id}
              value={label}
              maxLength={40}
              onChange={(event) => setLabel(event.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${id}-error` : undefined}
            />
            {error ? (
              <p id={`${id}-error`} className="text-destructive text-xs">
                {error}
              </p>
            ) : null}
          </div>
          <SubmitButton pending={pending}>{copy.kiosk.pairSubmit}</SubmitButton>
        </form>
      ) : (
        <div className="grid gap-4">
          <p className="bg-muted rounded-lg px-4 py-3 text-sm">{copy.kiosk.pairNeedsPin}</p>
          <Button asChild variant="outline">
            <Link href="/settings/attendance">{copy.attendance.settings}</Link>
          </Button>
        </div>
      )}
    </FormDialog>
  );
}
