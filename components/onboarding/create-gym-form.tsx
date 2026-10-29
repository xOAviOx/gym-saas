'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
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
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { createOrganization } from '@/features/organizations/actions';
import {
  createOrganizationSchema,
  suggestInvoicePrefix,
  type CreateOrganizationInput,
  type CreateOrganizationValues,
} from '@/features/organizations/schema';
import { copy } from '@/lib/copy';
import { fiscalYearLabel, todayIST } from '@/lib/dates';

const t = copy.onboarding.gym;

export function CreateGymForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const form = useForm<CreateOrganizationInput, unknown, CreateOrganizationValues>({
    resolver: zodResolver(createOrganizationSchema),
    defaultValues: {
      name: '',
      city: '',
      phone: '',
      upiVpa: '',
      upiPayeeName: '',
      gstEnabled: false,
      gstin: '',
      invoicePrefix: '',
    },
  });

  const name = useWatch({ control: form.control, name: 'name' });
  const gstEnabled = useWatch({ control: form.control, name: 'gstEnabled' });
  const invoicePrefix = useWatch({ control: form.control, name: 'invoicePrefix' });
  const { dirtyFields } = form.formState;

  // Suggest the payee name and invoice prefix from the gym name until the person edits them.
  useEffect(() => {
    if (!dirtyFields.invoicePrefix) {
      form.setValue('invoicePrefix', name.trim() ? suggestInvoicePrefix(name) : '');
    }
    if (!dirtyFields.upiPayeeName) {
      form.setValue('upiPayeeName', name.trim());
    }
  }, [name, dirtyFields.invoicePrefix, dirtyFields.upiPayeeName, form]);

  async function onSubmit(values: CreateOrganizationValues) {
    setPending(true);
    const result = await createOrganization({
      ...values,
      gstin: values.gstEnabled ? values.gstin : undefined,
    });
    if (applyActionResult(result, form.setError)) {
      toast.success(t.created);
      router.push('/onboarding');
      return;
    }
    setPending(false);
  }

  const exampleInvoice = `${invoicePrefix || 'ABC'}/${fiscalYearLabel(todayIST())}/0001`;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-6" noValidate>
        <section className="grid gap-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t.name}</FormLabel>
                <FormControl>
                  <Input placeholder={t.namePlaceholder} autoComplete="organization" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="city"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.city}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t.cityPlaceholder}
                      autoComplete="address-level2"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.phone}</FormLabel>
                  <FormControl>
                    <Input
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder={t.phonePlaceholder}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>{t.phoneHelp}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </section>

        <section className="bg-card grid gap-4 rounded-xl border p-4">
          <h2 className="text-base">{t.upiSection}</h2>
          <FormField
            control={form.control}
            name="upiVpa"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t.upiVpa}</FormLabel>
                <FormControl>
                  <Input
                    placeholder={t.upiVpaPlaceholder}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    {...field}
                  />
                </FormControl>
                <FormDescription>{t.upiVpaHelp}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="upiPayeeName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t.upiPayeeName}</FormLabel>
                <FormControl>
                  <Input placeholder={t.upiPayeeNamePlaceholder} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </section>

        <section className="bg-card grid gap-4 rounded-xl border p-4">
          <h2 className="text-base">{t.gstSection}</h2>
          <FormField
            control={form.control}
            name="gstEnabled"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-start justify-between gap-4">
                  <div className="grid gap-1">
                    <FormLabel>{t.gstEnabled}</FormLabel>
                    <FormDescription>{t.gstHelp}</FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </div>
              </FormItem>
            )}
          />
          {gstEnabled ? (
            <FormField
              control={form.control}
              name="gstin"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.gstin}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t.gstinPlaceholder}
                      autoCapitalize="characters"
                      className="uppercase"
                      maxLength={15}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : null}
        </section>

        <FormField
          control={form.control}
          name="invoicePrefix"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t.invoicePrefix}</FormLabel>
              <FormControl>
                <Input
                  className="max-w-40 uppercase"
                  autoCapitalize="characters"
                  maxLength={4}
                  {...field}
                />
              </FormControl>
              <FormDescription>{t.invoicePrefixHelp(exampleInvoice)}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

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
