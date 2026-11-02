'use client';

import { useFormContext, useWatch } from 'react-hook-form';

import { nativeSelectClass } from '@/components/members/member-fields';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import type { Plan } from '@/features/plans/types';
import { copy } from '@/lib/copy';
import { addDays, formatDate } from '@/lib/dates';
import { formatMoney, parseMoneyInput } from '@/lib/money';

export function PlanFields({
  plans,
  optional = false,
  gstEnabled,
}: {
  plans: Plan[];
  optional?: boolean;
  gstEnabled: boolean;
}) {
  const form = useFormContext<{ planId: string; startDate: string; discount: string }>();
  const [planId, startDate, discount] = useWatch({
    control: form.control,
    name: ['planId', 'startDate', 'discount'],
  });
  const plan = plans.find((p) => p.id === planId);
  const discountPaise = parseMoneyInput(discount ?? '') ?? 0;
  return (
    <div className="grid gap-5">
      <FormField
        control={form.control}
        name="planId"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{copy.memberships.choosePlan}</FormLabel>
            <FormControl>
              <select className={nativeSelectClass} {...field}>
                <option value="">
                  {optional ? copy.memberships.noPlan : copy.memberships.choosePlan}
                </option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {formatMoney(p.price)}
                  </option>
                ))}
              </select>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      {!plan && optional ? (
        <p className="text-muted-foreground text-sm">{copy.memberships.noPlanHelp}</p>
      ) : null}
      {plan ? (
        <>
          <p className="text-muted-foreground text-sm">
            {copy.plans.validity(plan.durationDays)}
            {plan.sessionCount ? ` · ${copy.plans.sessions(plan.sessionCount)}` : ''}
          </p>
          <FormField
            control={form.control}
            name="startDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{copy.memberships.startDate}</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="discount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{copy.memberships.discount}</FormLabel>
                <FormControl>
                  <Input inputMode="decimal" className="tabular" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <dl className="bg-card grid gap-3 rounded-xl border p-4 text-sm">
            {startDate &&
            /^\d{4}-\d{2}-\d{2}$/.test(startDate) &&
            !Number.isNaN(Date.parse(startDate)) ? (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">{copy.memberships.endDate}</dt>
                <dd>{formatDate(addDays(startDate, plan.durationDays - 1))}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{copy.memberships.listPrice}</dt>
              <dd className="tabular">{formatMoney(plan.price)}</dd>
            </div>
            <div className="flex justify-between gap-3 border-t pt-3">
              <dt className="font-semibold">{copy.memberships.total}</dt>
              <dd className="tabular text-xl font-semibold">
                {formatMoney(Math.max(0, plan.price - discountPaise))}
              </dd>
            </div>
            {gstEnabled ? (
              <div className="text-muted-foreground text-xs">{copy.memberships.gstIncluded}</div>
            ) : null}
          </dl>
          <p className="text-muted-foreground text-sm">{copy.memberships.paymentLater}</p>
        </>
      ) : null}
    </div>
  );
}
