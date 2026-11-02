import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

function FieldExample({
  withHelp = false,
  withError = false,
  customDescription = false,
}: {
  withHelp?: boolean;
  withError?: boolean;
  customDescription?: boolean;
}) {
  const form = useForm<{ name: string }>({
    defaultValues: { name: '' },
    errors: withError ? { name: { type: 'required', message: 'Name is required' } } : undefined,
  });

  return (
    <Form {...form}>
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem hasDescription={withHelp}>
            <FormLabel>Name</FormLabel>
            <FormControl {...(customDescription ? { 'aria-describedby': 'custom-help' } : {})}>
              <input {...field} />
            </FormControl>
            {withHelp ? <FormDescription>Use the member&apos;s full name.</FormDescription> : null}
            {customDescription ? <p id="custom-help">Additional context</p> : null}
            <FormMessage />
          </FormItem>
        )}
      />
    </Form>
  );
}

function descriptionReferences(markup: string) {
  return markup.match(/\baria-describedby="([^"]+)"/)?.[1].split(/\s+/) ?? [];
}

describe('form accessibility references', () => {
  it.each([
    { withHelp: false, withError: false },
    { withHelp: false, withError: true },
    { withHelp: true, withError: false },
    { withHelp: true, withError: true },
  ])('keeps help=$withHelp and error=$withError references valid', ({ withHelp, withError }) => {
    const markup = renderToStaticMarkup(<FieldExample withHelp={withHelp} withError={withError} />);
    const ids = Array.from(markup.matchAll(/\bid="([^"]+)"/g), (match) => match[1]);
    const references = descriptionReferences(markup);

    expect(references).toHaveLength(Number(withHelp) + Number(withError));
    for (const id of references) expect(ids).toContain(id);
    expect(markup).toContain(`aria-invalid="${withError}"`);
    expect(markup.includes('role="alert"')).toBe(withError);
  });

  it('preserves a caller-supplied description reference', () => {
    const markup = renderToStaticMarkup(<FieldExample customDescription />);
    expect(descriptionReferences(markup)).toEqual(['custom-help']);
    expect(markup).toContain('id="custom-help"');
  });
});
