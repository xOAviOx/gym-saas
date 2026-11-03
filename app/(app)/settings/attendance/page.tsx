import type { Metadata } from 'next';
import Link from 'next/link';

import {
  BlockExpiredToggle,
  KioskDeviceList,
  KioskPinForm,
} from '@/components/attendance/attendance-settings';
import { PageHeader } from '@/components/shared/page-header';
import { getKioskSetup } from '@/features/attendance/queries';
import { PRIVILEGED_ROLES } from '@/lib/auth/roles';
import { requireOrg } from '@/lib/auth/session';
import { copy } from '@/lib/copy';
import { formatTime } from '@/lib/dates';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: copy.attendanceSettings.title };

export default async function AttendanceSettingsPage() {
  const ctx = await requireOrg(PRIVILEGED_ROLES);
  const kiosk = await getKioskSetup(await createClient(), ctx.org.id);
  const settings = (ctx.org.settings ?? {}) as { block_expired_checkin?: boolean };

  return (
    <>
      <Link
        href="/attendance"
        className="text-muted-foreground hover:text-foreground mb-4 inline-flex min-h-11 items-center text-sm transition-colors"
      >
        {copy.attendance.title}
      </Link>
      <PageHeader
        title={copy.attendanceSettings.title}
        description={copy.attendanceSettings.description}
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <section
          aria-labelledby="rules-title"
          className="bg-card animate-enter grid content-start gap-5 rounded-xl border p-5 [--index:1] md:p-6"
        >
          <h2 id="rules-title" className="text-base font-semibold">
            {copy.attendanceSettings.rulesTitle}
          </h2>
          <BlockExpiredToggle initial={settings.block_expired_checkin === true} />
        </section>

        <section
          aria-labelledby="pin-title"
          className="bg-card animate-enter grid content-start gap-5 rounded-xl border p-5 [--index:2] md:p-6"
        >
          <div>
            <h2 id="pin-title" className="text-base font-semibold">
              {copy.attendanceSettings.pinTitle}
            </h2>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              {copy.attendanceSettings.pinBody}
            </p>
          </div>
          <p
            className={
              kiosk.pinSet
                ? 'bg-success-soft text-success rounded-lg px-3 py-2 text-sm'
                : 'bg-warning-soft text-warning rounded-lg px-3 py-2 text-sm'
            }
          >
            {kiosk.pinSet ? copy.attendanceSettings.pinSet : copy.attendanceSettings.pinNotSet}
            {kiosk.lockedUntil
              ? ` ${copy.attendanceSettings.pinLocked(formatTime(kiosk.lockedUntil))}`
              : ''}
          </p>
          <KioskPinForm pinSet={kiosk.pinSet} />
        </section>

        <section
          aria-labelledby="devices-title"
          className="bg-card animate-enter grid content-start gap-5 rounded-xl border p-5 [--index:3] md:p-6 lg:col-span-2"
        >
          <h2 id="devices-title" className="text-base font-semibold">
            {copy.attendanceSettings.devicesTitle}
          </h2>
          <KioskDeviceList devices={kiosk.devices} />
        </section>
      </div>
    </>
  );
}
