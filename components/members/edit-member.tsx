'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { applyActionResult } from '@/components/shared/apply-action-result';
import { FormDialog } from '@/components/shared/form-dialog';
import { SubmitButton } from '@/components/shared/submit-button';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { updateMember } from '@/features/members/actions';
import { updateMemberSchema, type MemberDetailsInput } from '@/features/members/schema';
import { copy } from '@/lib/copy';

import { MemberFields } from './member-fields';

export function EditMember({
  memberId,
  values,
  today,
}: {
  memberId: string;
  values: MemberDetailsInput;
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const form = useForm<MemberDetailsInput & { memberId: string }>({
    resolver: zodResolver(updateMemberSchema, undefined, { raw: true }),
    defaultValues: { ...values, memberId },
  });
  async function onSubmit(input: MemberDetailsInput & { memberId: string }) {
    setPending(true);
    try {
      if (applyActionResult(await updateMember(input), form.setError)) {
        toast.success(copy.members.updated);
        setOpen(false);
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
      onOpenChange={setOpen}
      title={copy.members.edit}
      description={copy.members.editHelp}
      trigger={<Button variant="outline">{copy.common.edit}</Button>}
    >
      <Form {...form}>
        <form method="post" onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <fieldset disabled={pending}>
            <MemberFields today={today} />
          </fieldset>
          <SubmitButton pending={pending} pendingLabel={copy.common.saving} className="mt-6 w-full">
            {copy.members.update}
          </SubmitButton>
        </form>
      </Form>
    </FormDialog>
  );
}
