'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { nativeSelectClass } from '@/components/members/member-fields';
import { applyActionResult } from '@/components/shared/apply-action-result';
import { FormDialog } from '@/components/shared/form-dialog';
import { SubmitButton } from '@/components/shared/submit-button';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { savePlan } from '@/features/plans/actions';
import { planSchema, type PlanInput } from '@/features/plans/schema';
import type { Plan } from '@/features/plans/types';
import { copy } from '@/lib/copy';
import { toRupeeString } from '@/lib/money';

export function PlanEditor({ plan }: { plan?: Plan }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const form = useForm<PlanInput>({
    resolver: zodResolver(planSchema, undefined, { raw: true }),
    defaultValues: {
      ...(plan ? { planId: plan.id } : {}),
      name: plan?.name ?? '',
      type: plan?.type ?? 'duration',
      durationDays: plan?.durationDays ?? 30,
      sessionCount: plan?.sessionCount ?? null,
      price: plan ? toRupeeString(plan.price) : '',
      description: plan?.description ?? '',
      isActive: plan?.isActive ?? true,
    },
  });
  const type = useWatch({ control: form.control, name: 'type' });
  async function onSubmit(values: PlanInput) {
    setPending(true);
    try {
      if (applyActionResult(await savePlan(values), form.setError)) {
        toast.success(copy.plans.saved);
        setOpen(false);
        if (!plan) form.reset();
        router.refresh();
      }
    } catch {
      toast.error(copy.errors.network);
    }
    setPending(false);
  }
  return (
    <FormDialog
      title={plan ? copy.plans.edit : copy.plans.add}
      description={copy.plans.description}
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button
          variant={plan ? 'outline' : 'default'}
          aria-label={plan ? `${copy.plans.edit}: ${plan.name}` : undefined}
        >
          {plan ? copy.common.edit : copy.plans.add}
        </Button>
      }
    >
      <Form {...form}>
        <form
          method="post"
          className="grid gap-5"
          onSubmit={form.handleSubmit(onSubmit)}
          noValidate
        >
          <fieldset disabled={pending} className="grid gap-5">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{copy.plans.name}</FormLabel>
                  <FormControl>
                    <Input maxLength={60} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{copy.plans.type}</FormLabel>
                  <FormControl>
                    <select className={nativeSelectClass} {...field}>
                      {Object.entries(copy.plans.types).map(([v, label]) => (
                        <option key={v} value={v}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="durationDays"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{copy.plans.durationDays}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={3660}
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{copy.plans.price}</FormLabel>
                    <FormControl>
                      <Input inputMode="decimal" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            {type === 'sessions' ? (
              <FormField
                control={form.control}
                name="sessionCount"
                render={({ field }) => (
                  <FormItem hasDescription>
                    <FormLabel>{copy.plans.sessionCount}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={1000}
                        {...field}
                        value={field.value ?? ''}
                        onChange={(e) =>
                          field.onChange(e.target.value === '' ? null : Number(e.target.value))
                        }
                      />
                    </FormControl>
                    <FormDescription>{copy.plans.sessionHelp}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{copy.plans.descriptionLabel}</FormLabel>
                  <FormControl>
                    <Textarea maxLength={500} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between gap-4">
                  <FormLabel>{copy.plans.active}</FormLabel>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </fieldset>
          <SubmitButton pending={pending} pendingLabel={copy.common.saving} className="w-full">
            {copy.plans.save}
          </SubmitButton>
        </form>
      </Form>
    </FormDialog>
  );
}
