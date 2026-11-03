'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { CheckCircle2Icon } from '@/components/icons';
import { applyActionResult } from '@/components/shared/apply-action-result';
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
import {
  checkOnlinePayment,
  startOnlinePayment,
  submitPayClaim,
} from '@/features/billing/public-actions';
import { payClaimSchema, type PayClaimInput } from '@/features/billing/schema';
import { copy } from '@/lib/copy';
import { formatMoney, toMoneyInput, type Paise } from '@/lib/money';

export function PayOnlineButton({ token, amount }: { token: string; amount: Paise }) {
  const [pending, setPending] = useState(false);
  async function start() {
    setPending(true);
    try {
      const result = await startOnlinePayment({ token });
      if (applyActionResult(result) && result.data.url.startsWith('https://')) {
        // Full navigation: the checkout lives on Cashfree's domain.
        window.location.assign(result.data.url);
        return;
      }
    } catch {
      toast.error(copy.errors.network);
    }
    setPending(false);
  }
  return (
    <SubmitButton
      type="button"
      pending={pending}
      pendingLabel={copy.pay.redirecting}
      onClick={start}
      className="w-full"
    >
      {copy.pay.payOnlineButton(formatMoney(amount))}
    </SubmitButton>
  );
}

export function CheckoutStatus({ token }: { token: string }) {
  const router = useRouter();
  const [state, setState] = useState<'checking' | 'paid' | 'pending'>('checking');
  const started = useRef(false);
  const check = useCallback(async () => {
    try {
      const result = await checkOnlinePayment({ token });
      if (!result.ok) {
        toast.error(result.error);
        setState('pending');
        return;
      }
      setState(result.data.paid ? 'paid' : 'pending');
      if (result.data.paid || result.data.recorded) router.refresh();
    } catch {
      toast.error(copy.errors.network);
      setState('pending');
    }
  }, [token, router]);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void check();
  }, [check]);

  if (state === 'paid') {
    return (
      <p
        role="status"
        className="bg-success-soft text-success flex items-center gap-2 rounded-xl border p-4 text-sm font-medium"
      >
        <CheckCircle2Icon className="size-5 shrink-0" aria-hidden="true" />
        {copy.pay.onlinePaid}
      </p>
    );
  }
  return (
    <div role="status" aria-live="polite" className="bg-card grid gap-3 rounded-xl border p-4">
      <p className="text-sm">{state === 'checking' ? copy.pay.checking : copy.pay.onlinePending}</p>
      {state === 'pending' ? (
        <div>
          <Button
            variant="outline"
            onClick={() => {
              setState('checking');
              void check();
            }}
          >
            {copy.pay.checkAgain}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function PayClaimForm({ token, balance }: { token: string; balance: Paise }) {
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const defaults: PayClaimInput = { token, utr: '', amount: toMoneyInput(balance), note: '' };
  const form = useForm<PayClaimInput>({
    resolver: zodResolver(payClaimSchema, undefined, { raw: true }),
    defaultValues: defaults,
  });
  async function submit(input: PayClaimInput) {
    setPending(true);
    try {
      if (applyActionResult(await submitPayClaim(input), form.setError)) {
        toast.success(copy.pay.submitted);
        form.reset(defaults);
        router.refresh();
      }
    } catch {
      toast.error(copy.errors.network);
    }
    setPending(false);
  }
  return (
    <Form {...form}>
      <form method="post" onSubmit={form.handleSubmit(submit)} noValidate className="grid gap-4">
        <fieldset disabled={pending} className="grid gap-4">
          <FormField
            control={form.control}
            name="utr"
            render={({ field }) => (
              <FormItem hasDescription>
                <FormLabel>{copy.pay.utr}</FormLabel>
                <FormControl>
                  <Input
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={20}
                    className="tabular"
                    {...field}
                  />
                </FormControl>
                <FormDescription>{copy.pay.utrHelp}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem hasDescription>
                <FormLabel>{copy.pay.amount}</FormLabel>
                <FormControl>
                  <Input inputMode="decimal" autoComplete="off" className="tabular" {...field} />
                </FormControl>
                <FormDescription>{copy.pay.balanceHint(formatMoney(balance))}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="note"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {copy.pay.note}{' '}
                  <span className="text-muted-foreground font-normal">
                    ({copy.common.optional})
                  </span>
                </FormLabel>
                <FormControl>
                  <Input autoComplete="off" maxLength={200} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </fieldset>
        <SubmitButton pending={pending} pendingLabel={copy.pay.submitting} className="w-full">
          {copy.pay.submit}
        </SubmitButton>
      </form>
    </Form>
  );
}
