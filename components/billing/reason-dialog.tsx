'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { applyActionResult } from '@/components/shared/apply-action-result';
import { FormDialog } from '@/components/shared/form-dialog';
import { SubmitButton } from '@/components/shared/submit-button';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { reasonInputSchema, type ReasonInput } from '@/features/billing/schema';
import { copy } from '@/lib/copy';
import type { ActionResult } from '@/lib/errors';

/** Confirmation that needs a written reason, kept in the audit trail. */
export function ReasonDialog({
  trigger,
  title,
  description,
  reasonLabel,
  submitLabel,
  success,
  destructive = false,
  onSubmit,
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  reasonLabel: string;
  submitLabel: string;
  success: string;
  destructive?: boolean;
  onSubmit: (reason: string) => Promise<ActionResult<unknown>>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const form = useForm<ReasonInput>({
    resolver: zodResolver(reasonInputSchema),
    defaultValues: { reason: '' },
  });
  async function submit({ reason }: ReasonInput) {
    setPending(true);
    try {
      if (applyActionResult(await onSubmit(reason), form.setError)) {
        toast.success(success);
        setOpen(false);
        form.reset();
        router.refresh();
      }
    } catch {
      toast.error(copy.errors.network);
    }
    setPending(false);
  }
  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) setOpen(next);
      }}
      title={title}
      description={description}
      trigger={trigger}
    >
      <Form {...form}>
        <form method="post" onSubmit={form.handleSubmit(submit)} noValidate className="grid gap-5">
          <FormField
            control={form.control}
            name="reason"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{reasonLabel}</FormLabel>
                <FormControl>
                  <Textarea maxLength={200} disabled={pending} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setOpen(false)}
              className="flex-1"
            >
              {copy.common.cancel}
            </Button>
            <SubmitButton
              pending={pending}
              pendingLabel={copy.common.saving}
              variant={destructive ? 'destructive' : 'default'}
              className="flex-1"
            >
              {submitLabel}
            </SubmitButton>
          </div>
        </form>
      </Form>
    </FormDialog>
  );
}
