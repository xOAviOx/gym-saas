'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { applyActionResult } from '@/components/shared/apply-action-result';
import { ConfirmAction } from '@/components/shared/confirm-action';
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
import {
  removeKioskPin,
  revokeKioskDevice,
  saveAttendanceSettings,
  setKioskPin,
} from '@/features/attendance/actions';
import { kioskPinSchema, type KioskPinInput } from '@/features/attendance/schema';
import type { KioskDeviceRow } from '@/features/attendance/types';
import { copy } from '@/lib/copy';
import { formatDate, formatDateTime } from '@/lib/dates';

export function BlockExpiredToggle({ initial }: { initial: boolean }) {
  const id = useId();
  const router = useRouter();
  const [checked, setChecked] = useState(initial);
  const [pending, setPending] = useState(false);

  async function change(value: boolean) {
    setChecked(value);
    setPending(true);
    try {
      if (applyActionResult(await saveAttendanceSettings({ blockExpired: value }))) {
        toast.success(copy.attendanceSettings.saved);
        router.refresh();
      } else {
        setChecked(!value);
      }
    } catch {
      setChecked(!value);
      toast.error(copy.errors.network);
    }
    setPending(false);
  }

  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <label htmlFor={id} className="text-sm font-medium">
          {copy.attendanceSettings.blockExpired}
        </label>
        <p id={`${id}-help`} className="text-muted-foreground mt-1 text-sm leading-relaxed">
          {copy.attendanceSettings.blockExpiredHelp}
        </p>
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={pending}
        onCheckedChange={change}
        aria-describedby={`${id}-help`}
      />
    </div>
  );
}

export function KioskPinForm({ pinSet }: { pinSet: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const form = useForm<KioskPinInput>({
    resolver: zodResolver(kioskPinSchema),
    defaultValues: { pin: '', confirm: '' },
  });

  async function submit(input: KioskPinInput) {
    setPending(true);
    try {
      if (applyActionResult(await setKioskPin(input), form.setError)) {
        toast.success(copy.attendanceSettings.pinSaved);
        form.reset();
        router.refresh();
      }
    } catch {
      toast.error(copy.errors.network);
    }
    setPending(false);
  }

  const pinInput = (name: 'pin' | 'confirm', label: string, description?: string) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem hasDescription={Boolean(description)}>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              {...field}
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={6}
              onChange={(event) => field.onChange(event.target.value.replace(/\D/g, ''))}
              className="font-mono tracking-[0.3em]"
            />
          </FormControl>
          {description ? <FormDescription>{description}</FormDescription> : null}
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <Form {...form}>
      <form method="post" onSubmit={form.handleSubmit(submit)} noValidate className="grid gap-4">
        <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2">
          {pinInput('pin', copy.attendanceSettings.pinLabel, copy.attendanceSettings.pinHelp)}
          {pinInput('confirm', copy.attendanceSettings.pinConfirm)}
        </fieldset>
        <div className="flex flex-wrap gap-3">
          <SubmitButton pending={pending} pendingLabel={copy.common.saving}>
            {pinSet ? copy.attendanceSettings.pinChange : copy.attendanceSettings.pinSave}
          </SubmitButton>
          {pinSet ? (
            <ConfirmAction
              label={copy.attendanceSettings.pinRemove}
              description={copy.attendanceSettings.pinRemoveBody}
              success={copy.attendanceSettings.pinRemoved}
              action={removeKioskPin}
              destructive
            />
          ) : null}
        </div>
      </form>
    </Form>
  );
}

export function KioskDeviceList({ devices }: { devices: KioskDeviceRow[] }) {
  if (!devices.length) {
    return <p className="text-muted-foreground text-sm">{copy.attendanceSettings.devicesEmpty}</p>;
  }
  return (
    <ul className="divide-border divide-y rounded-xl border">
      {devices.map((device) => (
        <li key={device.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{device.label}</p>
            <p className="text-muted-foreground text-xs">
              {copy.attendanceSettings.devicePaired(formatDate(new Date(device.createdAt)))}
              {device.lastSeenAt
                ? ` · ${copy.attendanceSettings.deviceSeen(formatDateTime(device.lastSeenAt))}`
                : ''}
            </p>
          </div>
          <ConfirmAction
            label={copy.attendanceSettings.deviceRevoke}
            description={`${copy.attendanceSettings.deviceRevokeTitle(device.label)} ${copy.attendanceSettings.deviceRevokeBody}`}
            success={copy.attendanceSettings.deviceRevoked}
            action={() => revokeKioskDevice({ deviceId: device.id })}
            destructive
          />
        </li>
      ))}
    </ul>
  );
}
