'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { copy } from '@/lib/copy';
import type { ActionResult } from '@/lib/errors';

import { applyActionResult } from './apply-action-result';
import { FormDialog } from './form-dialog';
import { SubmitButton } from './submit-button';

export function ConfirmAction({
  label,
  description,
  success,
  action,
  redirectTo,
  destructive = false,
}: {
  label: string;
  description: string;
  success: string;
  action: () => Promise<ActionResult<unknown>>;
  redirectTo?: string;
  destructive?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  async function confirm() {
    setPending(true);
    try {
      if (applyActionResult(await action())) {
        toast.success(success);
        setOpen(false);
        if (redirectTo) router.push(redirectTo);
        else router.refresh();
      }
    } catch {
      toast.error(copy.errors.network);
    }
    setPending(false);
  }
  return (
    <FormDialog
      open={open}
      onOpenChange={(value) => {
        if (!pending) setOpen(value);
      }}
      title={label}
      description={description}
      trigger={
        <Button type="button" variant="outline" className={destructive ? 'text-destructive' : ''}>
          {label}
        </Button>
      }
    >
      <div className="mt-2 flex gap-3">
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => setOpen(false)}
          className="flex-1"
        >
          {copy.common.cancel}
        </Button>
        <SubmitButton
          type="button"
          pending={pending}
          pendingLabel={copy.common.saving}
          variant={destructive ? 'destructive' : 'default'}
          onClick={confirm}
          className="flex-1"
        >
          {label}
        </SubmitButton>
      </div>
    </FormDialog>
  );
}
