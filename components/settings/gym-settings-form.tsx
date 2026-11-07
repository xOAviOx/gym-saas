'use client';

import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { saveGymSettings } from '@/features/organizations/actions';
import { copy } from '@/lib/copy';

type Values = {
  name: string;
  city: string;
  state: string;
  addressLine: string;
  phone: string;
  email: string;
  invoicePrefix: string;
  gstEnabled: boolean;
  gstin: string;
  gstRate: string;
};

export function GymSettingsForm({ initial }: { initial: Values }) {
  const [values, setValues] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  function field(key: keyof Values, label: string, required = false) {
    return (
      <div className="grid gap-2" key={key}>
        <Label htmlFor={`gym-${key}`}>{label}</Label>
        <Input
          id={`gym-${key}`}
          value={String(values[key])}
          required={required}
          onChange={(event) => setValues({ ...values, [key]: event.target.value })}
        />
      </div>
    );
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setPending(true);
    try {
      const result = await saveGymSettings(values);
      if (result.ok) toast.success(copy.gymSettings.saved);
      else setError(result.error);
    } catch {
      setError(copy.errors.network);
    }
    setPending(false);
  }
  return (
    <form onSubmit={submit} className="bg-card grid gap-5 rounded-xl border p-5 md:p-6">
      {field('name', copy.onboarding.gym.name, true)}
      <div className="grid gap-5 sm:grid-cols-2">
        {field('city', copy.onboarding.gym.city)}
        {field('state', copy.gymSettings.state)}
      </div>
      {field('addressLine', copy.gymSettings.address)}
      <div className="grid gap-5 sm:grid-cols-2">
        {field('phone', copy.onboarding.gym.phone, true)}
        {field('email', copy.members.email)}
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        {field('invoicePrefix', copy.onboarding.gym.invoicePrefix, true)}
        {field('gstRate', copy.gymSettings.gstRate, true)}
      </div>
      <div className="flex items-center gap-3">
        <Checkbox
          id="gym-gstEnabled"
          checked={values.gstEnabled}
          onCheckedChange={(checked) => setValues({ ...values, gstEnabled: checked === true })}
        />
        <Label htmlFor="gym-gstEnabled">{copy.onboarding.gym.gstSection}</Label>
      </div>
      {values.gstEnabled ? field('gstin', copy.gymSettings.gstin, true) : null}
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      <Button disabled={pending} className="justify-self-start">
        {pending ? copy.common.saving : copy.common.save}
      </Button>
    </form>
  );
}
