'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { recordPayment } from '@/features/billing/actions';
import {
  recordPaymentSchema,
  type RecordPaymentInput,
  type StaffPaymentMethod,
} from '@/features/billing/schema';
import { copy } from '@/lib/copy';
import { formatMoney, toMoneyInput, type Paise } from '@/lib/money';

const METHODS = Object.entries(copy.payments.methods) as [StaffPaymentMethod, string][];

export function RecordPaymentDialog({
  invoiceId,
  requestId,
  balance,
  today,
  earliest,
}: {
  invoiceId: string;
  requestId: string;
  balance: Paise;
  today: string;
  earliest: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const form = useForm<RecordPaymentInput>({
    resolver: zodResolver(recordPaymentSchema, undefined, { raw: true }),
    defaultValues: {
      invoiceId,
      requestId,
      amount: toMoneyInput(balance),
      method: 'cash',
      utr: '',
      reference: '',
      paidOn: today,
    },
  });
  const method = useWatch({ control: form.control, name: 'method' });

  async function submit(input: RecordPaymentInput) {
    setPending(true);
    try {
      const result = await recordPayment(input);
      if (applyActionResult(result, form.setError)) {
        toast.success(copy.payments.recorded);
        if (result.data.linkCancelled) toast.info(copy.payments.linkCancelled);
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
      onOpenChange={(next) => {
        if (!pending) setOpen(next);
      }}
      title={copy.payments.recordTitle}
      description={copy.payments.recordBody}
      trigger={<Button className="w-full sm:w-auto">{copy.payments.record}</Button>}
    >
      <Form {...form}>
        <form method="post" onSubmit={form.handleSubmit(submit)} noValidate className="grid gap-5">
          <fieldset disabled={pending} className="grid gap-5">
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem hasDescription>
                  <FormLabel>{copy.payments.amount}</FormLabel>
                  <FormControl>
                    <Input inputMode="decimal" autoComplete="off" className="tabular" {...field} />
                  </FormControl>
                  <FormDescription>
                    {copy.payments.balanceHint(formatMoney(balance))}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="method"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{copy.payments.method}</FormLabel>
                  <FormControl>
                    <RadioGroup
                      value={field.value}
                      onValueChange={(value) => {
                        field.onChange(value);
                        if (value !== 'upi') form.setValue('utr', '');
                      }}
                      className="grid grid-cols-2 gap-2"
                    >
                      {METHODS.map(([value, label]) => (
                        <label
                          key={value}
                          className="has-[[data-state=checked]]:border-foreground has-[[data-state=checked]]:bg-muted/60 flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 text-sm transition-colors"
                        >
                          <RadioGroupItem value={value} />
                          {label}
                        </label>
                      ))}
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {method === 'upi' ? (
              <FormField
                control={form.control}
                name="utr"
                render={({ field }) => (
                  <FormItem hasDescription>
                    <FormLabel>{copy.payments.utr}</FormLabel>
                    <FormControl>
                      <Input
                        inputMode="numeric"
                        autoComplete="off"
                        maxLength={20}
                        className="tabular"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>{copy.payments.utrHelp}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}
            <FormField
              control={form.control}
              name="reference"
              render={({ field }) => (
                <FormItem hasDescription>
                  <FormLabel>{copy.payments.reference}</FormLabel>
                  <FormControl>
                    <Input autoComplete="off" maxLength={100} {...field} />
                  </FormControl>
                  <FormDescription>{copy.payments.referenceHelp}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="paidOn"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{copy.payments.paidOn}</FormLabel>
                  <FormControl>
                    <Input type="date" min={earliest} max={today} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </fieldset>
          <SubmitButton pending={pending} pendingLabel={copy.common.saving} className="w-full">
            {copy.payments.record}
          </SubmitButton>
        </form>
      </Form>
    </FormDialog>
  );
}
