'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { ConfirmAction } from '@/components/shared/confirm-action';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { deleteExpense, saveExpense } from '@/features/expenses/actions';
import { EXPENSE_CATEGORIES, type ExpenseInput } from '@/features/expenses/schema';
import { copy } from '@/lib/copy';
import { formatDate } from '@/lib/dates';
import { formatMoney, toMoneyInput } from '@/lib/money';

type ExpenseRow = {
  id: string;
  category: (typeof EXPENSE_CATEGORIES)[number];
  amount: number;
  expenseDate: string;
  vendor: string;
  notes: string;
};

export function ExpenseManager({ rows, today }: { rows: ExpenseRow[]; today: string }) {
  const router = useRouter();
  const empty = (): ExpenseInput => ({
    id: null,
    category: 'other',
    amount: '',
    expenseDate: today,
    vendor: '',
    notes: '',
  });
  const [form, setForm] = useState<ExpenseInput>(empty);
  const [pending, setPending] = useState(false);
  function edit(row: ExpenseRow) {
    setForm({
      id: row.id,
      category: row.category,
      amount: toMoneyInput(row.amount),
      expenseDate: row.expenseDate,
      vendor: row.vendor,
      notes: row.notes,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    try {
      const result = await saveExpense(form);
      if (result.ok) {
        toast.success(copy.expenses.saved);
        setForm(empty());
        router.refresh();
      } else toast.error(result.error);
    } catch {
      toast.error(copy.errors.network);
    }
    setPending(false);
  }
  return (
    <>
      <form
        onSubmit={(event) => void submit(event)}
        className="bg-card mb-6 grid gap-4 rounded-xl border p-5 sm:grid-cols-2"
      >
        <h2 className="text-lg font-semibold sm:col-span-2">
          {form.id ? copy.expenses.edit : copy.expenses.add}
        </h2>
        <label className="grid gap-1 text-sm">
          <span>{copy.expenses.category}</span>
          <select
            value={form.category}
            onChange={(event) =>
              setForm({ ...form, category: event.target.value as ExpenseInput['category'] })
            }
            className="border-input bg-background h-11 rounded-md border px-3"
          >
            {EXPENSE_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {copy.expenses.categories[category]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span>{copy.expenses.amount}</span>
          <Input
            required
            inputMode="decimal"
            value={form.amount}
            onChange={(event) => setForm({ ...form, amount: event.target.value })}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span>{copy.expenses.date}</span>
          <Input
            required
            type="date"
            value={form.expenseDate}
            onChange={(event) => setForm({ ...form, expenseDate: event.target.value })}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span>{copy.expenses.vendor}</span>
          <Input
            maxLength={120}
            value={form.vendor}
            onChange={(event) => setForm({ ...form, vendor: event.target.value })}
          />
        </label>
        <label className="grid gap-1 text-sm sm:col-span-2">
          <span>{copy.expenses.notes}</span>
          <Textarea
            maxLength={500}
            value={form.notes}
            onChange={(event) => setForm({ ...form, notes: event.target.value })}
          />
        </label>
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" disabled={pending}>
            {pending ? copy.common.saving : copy.common.save}
          </Button>
          {form.id ? (
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setForm(empty())}
            >
              {copy.common.cancel}
            </Button>
          ) : null}
        </div>
      </form>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{copy.expenses.empty}</p>
      ) : (
        <ul className="divide-border bg-card divide-y rounded-xl border">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium">
                  {copy.expenses.categories[row.category]} · {formatMoney(row.amount)}
                </p>
                <p className="text-muted-foreground text-sm">
                  {formatDate(row.expenseDate)}
                  {row.vendor ? ` · ${row.vendor}` : ''}
                </p>
                {row.notes ? (
                  <p className="text-muted-foreground mt-1 text-sm">{row.notes}</p>
                ) : null}
              </div>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => edit(row)}>
                  {copy.common.edit}
                </Button>
                <ConfirmAction
                  label={copy.common.delete}
                  description={copy.expenses.deleteHelp}
                  success={copy.expenses.deleted}
                  action={() => deleteExpense({ id: row.id })}
                  destructive
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
