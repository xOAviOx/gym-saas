'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { applyActionResult } from '@/components/shared/apply-action-result';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { saveOnboardingPlans } from '@/features/plans/actions';
import {
  DEFAULT_PLANS,
  DURATION_PRESETS,
  savePlansSchema,
  type SavePlansInput,
} from '@/features/plans/schema';
import { copy } from '@/lib/copy';

const t = copy.onboarding.plans;

export function PlansForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  // raw: the server action re-parses the typed strings, so send them as typed.
  const form = useForm<SavePlansInput>({
    resolver: zodResolver(savePlansSchema, undefined, { raw: true }),
    defaultValues: { plans: DEFAULT_PLANS },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'plans' });

  async function onSubmit(values: SavePlansInput) {
    setPending(true);
    const result = await saveOnboardingPlans(values);
    if (applyActionResult(result, form.setError)) {
      toast.success(t.saved);
      router.push('/onboarding?step=3');
      return;
    }
    setPending(false);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
        <ul className="grid gap-3">
          {fields.map((row, index) => (
            <li key={row.id} className="bg-card grid gap-3 rounded-xl border p-4">
              <div className="flex items-end gap-3">
                <FormField
                  control={form.control}
                  name={`plans.${index}.name`}
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormLabel>{t.planName}</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t.removePlan}
                  disabled={fields.length === 1}
                  onClick={() => remove(index)}
                >
                  <Trash2Icon />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name={`plans.${index}.durationDays`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t.duration}</FormLabel>
                      <Select
                        value={String(field.value)}
                        onValueChange={(value) => field.onChange(Number(value))}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {DURATION_PRESETS.map((preset) => (
                            <SelectItem key={preset.days} value={String(preset.days)}>
                              {t.months(preset.months)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`plans.${index}.price`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t.price}</FormLabel>
                      <FormControl>
                        <Input inputMode="decimal" className="tabular" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </li>
          ))}
        </ul>

        <Button
          type="button"
          variant="outline"
          className="justify-start"
          onClick={() => append({ name: '', durationDays: 30, price: '' })}
        >
          <PlusIcon />
          {t.addPlan}
        </Button>

        <div className="bg-background/95 pb-safe sticky bottom-0 -mx-4 px-4 pt-3 backdrop-blur md:static md:mx-0 md:bg-transparent md:px-0 md:pt-0">
          <SubmitButton
            size="lg"
            className="w-full md:w-auto"
            pending={pending}
            pendingLabel={t.submitting}
          >
            {t.submit}
          </SubmitButton>
        </div>
      </form>
    </Form>
  );
}
