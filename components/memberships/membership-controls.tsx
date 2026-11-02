'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { applyActionResult } from '@/components/shared/apply-action-result';
import { ConfirmAction } from '@/components/shared/confirm-action';
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
import { Input } from '@/components/ui/input';
import type { Membership } from '@/features/members/types';
import { enrollMember, freezeMembership, unfreezeMembership } from '@/features/memberships/actions';
import {
  enrollmentSchema,
  freezeSchema,
  type EnrollmentInput,
} from '@/features/memberships/schema';
import type { Plan } from '@/features/plans/types';
import { copy } from '@/lib/copy';
import { membershipState } from '@/lib/membership';

import { PlanFields } from './plan-fields';

export function EnrollmentDialog({
  memberId,
  plans,
  startDate,
  requestId,
  gstEnabled,
  hasMembership,
  preferredPlanId,
  initialOpen = false,
}: {
  memberId: string;
  plans: Plan[];
  startDate: string;
  requestId: string;
  gstEnabled: boolean;
  hasMembership: boolean;
  preferredPlanId?: string;
  initialOpen?: boolean;
}) {
  const [open, setOpen] = useState(initialOpen);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const form = useForm<EnrollmentInput>({
    resolver: zodResolver(enrollmentSchema, undefined, { raw: true }),
    defaultValues: {
      memberId,
      requestId,
      planId: plans.find((plan) => plan.id === preferredPlanId)?.id ?? plans[0]?.id ?? '',
      startDate,
      discount: '0',
    },
  });
  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next && initialOpen) router.replace(`/members/${memberId}`, { scroll: false });
  }
  async function submit(input: EnrollmentInput) {
    setPending(true);
    try {
      if (applyActionResult(await enrollMember(input), form.setError)) {
        toast.success(copy.memberships.saved);
        changeOpen(false);
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
      onOpenChange={changeOpen}
      title={hasMembership ? copy.memberships.renewTitle : copy.members.addMembership}
      description={hasMembership ? copy.memberships.renewBody : copy.memberships.enrollBody}
      trigger={
        <Button>{hasMembership ? copy.memberships.renew : copy.members.addMembership}</Button>
      }
    >
      {plans.length ? (
        <Form {...form}>
          <form method="post" onSubmit={form.handleSubmit(submit)} noValidate>
            <fieldset disabled={pending}>
              <PlanFields plans={plans} gstEnabled={gstEnabled} />
            </fieldset>
            <SubmitButton
              pending={pending}
              pendingLabel={copy.common.saving}
              className="mt-6 w-full"
            >
              {copy.memberships.save}
            </SubmitButton>
          </form>
        </Form>
      ) : (
        <p className="text-muted-foreground text-sm">{copy.plans.noActiveBody}</p>
      )}
    </FormDialog>
  );
}

export function FreezeControls({
  memberId,
  membership,
  today,
}: {
  memberId: string;
  membership: Membership;
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const from = membership.start_date > today ? membership.start_date : today;
  const form = useForm<z.input<typeof freezeSchema>>({
    resolver: zodResolver(freezeSchema),
    defaultValues: { memberId, membershipId: membership.id, from, to: from },
  });
  async function freeze(input: z.input<typeof freezeSchema>) {
    setPending(true);
    try {
      if (applyActionResult(await freezeMembership(input), form.setError)) {
        toast.success(copy.memberships.freezeSaved);
        setOpen(false);
        router.refresh();
      }
    } catch {
      toast.error(copy.errors.network);
    }
    setPending(false);
  }
  if (membership.frozen_from) {
    return (
      <ConfirmAction
        label={
          membership.frozen_from > today ? copy.memberships.cancelFreeze : copy.memberships.unfreeze
        }
        description={copy.memberships.unfreezeBody}
        success={copy.memberships.unfrozen}
        action={() => unfreezeMembership({ memberId, membershipId: membership.id })}
      />
    );
  }
  if (!['active', 'expiring', 'upcoming'].includes(membershipState(membership, today))) return null;
  return (
    <FormDialog
      open={open}
      onOpenChange={setOpen}
      title={copy.memberships.freezeTitle}
      description={copy.memberships.freezeBody}
      trigger={<Button variant="outline">{copy.memberships.freeze}</Button>}
    >
      <Form {...form}>
        <form method="post" onSubmit={form.handleSubmit(freeze)} noValidate className="grid gap-5">
          <fieldset disabled={pending} className="grid gap-5">
            <FormField
              control={form.control}
              name="from"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{copy.memberships.freezeFrom}</FormLabel>
                  <FormControl>
                    <Input type="date" min={from} max={membership.end_date} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="to"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{copy.memberships.freezeTo}</FormLabel>
                  <FormControl>
                    <Input type="date" min={from} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </fieldset>
          <SubmitButton pending={pending} pendingLabel={copy.common.saving} className="w-full">
            {copy.memberships.freeze}
          </SubmitButton>
        </form>
      </Form>
    </FormDialog>
  );
}
