'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { PlanFields } from '@/components/memberships/plan-fields';
import { applyActionResult } from '@/components/shared/apply-action-result';
import { SubmitButton } from '@/components/shared/submit-button';
import { WorkflowSteps } from '@/components/shared/workflow-steps';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { createMember } from '@/features/members/actions';
import {
  createMemberSchema,
  emptyMemberValues,
  type CreateMemberInput,
} from '@/features/members/schema';
import type { Plan } from '@/features/plans/types';
import { copy } from '@/lib/copy';

import { MemberFields } from './member-fields';

export function CreateMemberForm({
  today,
  plans,
  gstEnabled,
  requestId,
}: {
  today: string;
  plans: Plan[];
  gstEnabled: boolean;
  requestId: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [pending, setPending] = useState(false);
  const form = useForm<CreateMemberInput>({
    resolver: zodResolver(createMemberSchema, undefined, { raw: true }),
    defaultValues: {
      ...emptyMemberValues(today),
      requestId,
      planId: plans[0]?.id ?? '',
      startDate: today,
      discount: '0',
    },
  });
  async function onSubmit(values: CreateMemberInput) {
    if (step === 1) {
      setStep(2);
      return;
    }
    setPending(true);
    try {
      const result = await createMember(values);
      if (applyActionResult(result, form.setError)) {
        toast.success(copy.members.created);
        router.push(`/members/${result.data.id}`);
        return;
      }
    } catch {
      toast.error(copy.errors.network);
    }
    setPending(false);
  }
  async function nextStep() {
    const valid = await form.trigger([
      'fullName',
      'phone',
      'altPhone',
      'email',
      'gender',
      'dob',
      'address',
      'joinedOn',
      'source',
      'emergencyContactName',
      'emergencyContactPhone',
      'notes',
      'tags',
      'consentMessaging',
    ]);
    if (valid) {
      setStep(2);
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }
  return (
    <Form {...form}>
      <form
        method="post"
        onSubmit={form.handleSubmit(onSubmit, () => {
          if (form.formState.errors.fullName || form.formState.errors.phone) setStep(1);
        })}
        noValidate
        className="mx-auto max-w-xl"
      >
        <div className="mb-6">
          <WorkflowSteps
            label={copy.members.createProgress}
            steps={copy.members.createSteps}
            current={step - 1}
          />
        </div>
        <fieldset disabled={pending}>
          <div hidden={step !== 1}>
            <MemberFields today={today} />
          </div>
          <div hidden={step !== 2}>
            <PlanFields plans={plans} optional gstEnabled={gstEnabled} />
          </div>
        </fieldset>
        <div className="bg-background/95 sticky bottom-16 -mx-4 mt-6 flex gap-3 px-4 py-3 backdrop-blur md:bottom-0">
          {step === 1 ? (
            <Button type="button" className="w-full" onClick={nextStep}>
              {copy.members.nextStep}
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" disabled={pending} onClick={() => setStep(1)}>
                {copy.common.back}
              </Button>
              <SubmitButton className="flex-1" pending={pending} pendingLabel={copy.common.saving}>
                {copy.members.create}
              </SubmitButton>
            </>
          )}
        </div>
      </form>
    </Form>
  );
}
