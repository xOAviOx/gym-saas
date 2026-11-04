'use client';

import { useFormContext } from 'react-hook-form';

import {
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
import { copy } from '@/lib/copy';
import type { MemberDetailsInput } from '@/features/members/schema';

export const nativeSelectClass =
  'border-input bg-card focus-visible:ring-ring/30 h-11 w-full rounded-lg border px-3 text-base outline-none focus-visible:ring-3 md:text-sm';

export function MemberFields({ today }: { today: string }) {
  const form = useFormContext<MemberDetailsInput>();
  const t = copy.members;
  return (
    <div className="grid gap-5">
      <FormField
        control={form.control}
        name="fullName"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t.fullName}</FormLabel>
            <FormControl>
              <Input autoComplete="name" maxLength={100} {...field} />
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
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="consentMessaging"
        render={({ field }) => (
          <FormItem hasDescription className="bg-card rounded-xl border p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <FormLabel>{t.consentMessaging}</FormLabel>
                <FormDescription className="mt-1.5">{t.consentHelp}</FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  className="shrink-0"
                />
              </FormControl>
            </div>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="preferredLanguage"
        render={({ field }) => (
          <FormItem hasDescription>
            <FormLabel>{t.language}</FormLabel>
            <FormControl>
              <select className={nativeSelectClass} {...field} value={field.value ?? 'en'}>
                {Object.entries(copy.languages).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </FormControl>
            <FormDescription>{t.languageHelp}</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
      <details className="bg-card rounded-xl border p-4">
        <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">
          {t.moreDetails}
        </summary>
        <div className="mt-5 grid gap-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t.email}</FormLabel>
                <FormControl>
                  <Input type="email" autoComplete="email" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="altPhone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t.altPhone}</FormLabel>
                <FormControl>
                  <Input type="tel" inputMode="tel" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="gender"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.gender}</FormLabel>
                  <FormControl>
                    <select className={nativeSelectClass} {...field}>
                      {Object.entries(t.genders).map(([value, label]) => (
                        <option value={value} key={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="dob"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.dob}</FormLabel>
                  <FormControl>
                    <Input type="date" max={today} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="address"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t.address}</FormLabel>
                <FormControl>
                  <Textarea maxLength={500} autoComplete="street-address" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="joinedOn"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t.joinedOn}</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="source"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t.source}</FormLabel>
                <FormControl>
                  <select className={nativeSelectClass} {...field}>
                    {Object.entries(t.sources).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="emergencyContactName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t.emergencyContactName}</FormLabel>
                <FormControl>
                  <Input maxLength={100} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="emergencyContactPhone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t.emergencyContactPhone}</FormLabel>
                <FormControl>
                  <Input type="tel" inputMode="tel" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="tags"
            render={({ field }) => (
              <FormItem hasDescription>
                <FormLabel>{t.tags}</FormLabel>
                <FormControl>
                  <Input maxLength={320} {...field} />
                </FormControl>
                <FormDescription>{t.tagsHelp}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem hasDescription>
                <FormLabel>{t.notes}</FormLabel>
                <FormControl>
                  <Textarea rows={3} maxLength={5000} {...field} />
                </FormControl>
                <FormDescription>{t.notesHelp}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </details>
    </div>
  );
}
