'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { applyActionResult } from '@/components/shared/apply-action-result';
import { SubmitButton } from '@/components/shared/submit-button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { saveMemberNotes } from '@/features/members/actions';
import { notesSchema } from '@/features/members/schema';
import { copy } from '@/lib/copy';

export function MemberNotes({
  memberId,
  notes,
  readOnly = false,
}: {
  memberId: string;
  notes: string;
  readOnly?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const form = useForm<{ memberId: string; notes: string }>({
    resolver: zodResolver(notesSchema, undefined, { raw: true }),
    defaultValues: { memberId, notes },
  });
  async function submit(values: { memberId: string; notes: string }) {
    setPending(true);
    try {
      if (applyActionResult(await saveMemberNotes(values), form.setError)) {
        toast.success(copy.members.notesSaved);
        router.refresh();
      }
    } catch {
      toast.error(copy.errors.network);
    }
    setPending(false);
  }
  return (
    <Form {...form}>
      <form method="post" className="grid gap-4" onSubmit={form.handleSubmit(submit)} noValidate>
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem hasDescription>
              <FormLabel>{copy.members.notes}</FormLabel>
              <FormControl>
                <Textarea
                  rows={6}
                  maxLength={5000}
                  readOnly={readOnly}
                  disabled={pending}
                  {...field}
                />
              </FormControl>
              <FormDescription>{copy.members.notesHelp}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        {!readOnly ? (
          <SubmitButton
            pending={pending}
            pendingLabel={copy.common.saving}
            className="w-full sm:w-auto sm:justify-self-start"
          >
            {copy.members.saveNotes}
          </SubmitButton>
        ) : null}
      </form>
    </Form>
  );
}
