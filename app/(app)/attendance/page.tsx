import { formatInTimeZone } from 'date-fns-tz';
import type { Metadata } from 'next';
import Link from 'next/link';

import { AttendanceList } from '@/components/attendance/attendance-list';
import { HourlyChart, WeekChart } from '@/components/attendance/attendance-charts';
import { CheckInDesk } from '@/components/attendance/check-in-desk';
import { PairKioskDialog } from '@/components/attendance/pair-kiosk-dialog';
import { ChevronLeftIcon, ChevronRightIcon, ScanLineIcon, SettingsIcon } from '@/components/icons';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { StatTile } from '@/components/shared/stat-tile';
import { Button } from '@/components/ui/button';
import { getAttendanceDay, getAttendanceWeek, getKioskSetup } from '@/features/attendance/queries';
import { attendanceDateSchema } from '@/features/attendance/schema';
import { isPrivileged } from '@/lib/auth/roles';
import { requireOrg } from '@/lib/auth/session';
import { copy } from '@/lib/copy';
import { addDays, describeDate, formatDate, IST, todayIST } from '@/lib/dates';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: copy.attendance.title };

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string | string[] }>;
}) {
  const ctx = await requireOrg();
  const today = todayIST();
  const raw = (await searchParams).date;
  const parsed = attendanceDateSchema.safeParse(typeof raw === 'string' ? raw : '');
  // Future days have nothing to show; clamp them to today.
  const date = parsed.success && parsed.data <= today ? parsed.data : today;
  const isToday = date === today;
  const privileged = isPrivileged(ctx.role);

  const supabase = await createClient();
  const [day, week, kiosk] = await Promise.all([
    getAttendanceDay(supabase, ctx.org.id, date),
    getAttendanceWeek(supabase, ctx.org.id, date),
    privileged ? getKioskSetup(supabase, ctx.org.id) : Promise.resolve(null),
  ]);
  const currentHour = isToday ? Number(formatInTimeZone(new Date(), IST, 'H')) : null;

  return (
    <>
      <PageHeader
        title={copy.attendance.title}
        description={copy.attendance.subtitle(
          isToday ? formatDate(date) : describeDate(date, today),
        )}
        action={
          privileged ? (
            <div className="flex gap-2">
              <PairKioskDialog pinSet={kiosk?.pinSet ?? false} />
              <Button asChild variant="ghost" size="icon">
                <Link href="/settings/attendance" aria-label={copy.attendance.settings}>
                  <SettingsIcon />
                </Link>
              </Button>
            </div>
          ) : null
        }
      />

      <nav aria-label={copy.attendance.pickDate} className="mb-6 flex items-center gap-2">
        <Button asChild variant="outline" size="icon-sm">
          <Link
            href={`/attendance?date=${addDays(date, -1)}`}
            aria-label={copy.attendance.previousDay}
          >
            <ChevronLeftIcon />
          </Link>
        </Button>
        <span className="tabular min-w-28 text-center text-sm font-medium">{formatDate(date)}</span>
        {isToday ? (
          <Button variant="outline" size="icon-sm" disabled aria-label={copy.attendance.nextDay}>
            <ChevronRightIcon />
          </Button>
        ) : (
          <Button asChild variant="outline" size="icon-sm">
            <Link
              href={`/attendance?date=${addDays(date, 1)}`}
              aria-label={copy.attendance.nextDay}
            >
              <ChevronRightIcon />
            </Link>
          </Button>
        )}
        {!isToday ? (
          <Button asChild variant="ghost" size="sm">
            <Link href="/attendance">{copy.attendance.goToToday}</Link>
          </Button>
        ) : null}
      </nav>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {isToday ? (
          <div className="bg-card animate-enter rounded-xl border p-5 [--index:1] sm:p-6">
            <CheckInDesk canOverride={privileged} today={today} />
          </div>
        ) : null}

        <div className={isToday ? 'grid content-start gap-4' : 'grid gap-4 lg:col-span-2'}>
          <div className="animate-enter grid grid-cols-2 gap-3 [--index:1] sm:grid-cols-4">
            <StatTile label={copy.attendance.stats.total} value={day.total} />
            <StatTile label={copy.attendance.stats.unique} value={day.uniqueMembers} />
            <StatTile
              label={copy.attendance.stats.flagged}
              value={day.flagged}
              tone={day.flagged ? 'warning' : 'default'}
            />
            <StatTile label={copy.attendance.stats.qr} value={day.byQr} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <HourlyChart hourly={day.hourly} currentHour={currentHour} />
            <WeekChart days={week} selected={date} />
          </div>
        </div>
      </div>

      <section aria-labelledby="checkins-title" className="animate-enter mt-10 [--index:4]">
        <h2 id="checkins-title" className="mb-3 text-base font-semibold">
          {copy.attendance.listTitle}
        </h2>
        {day.rows.length ? (
          <AttendanceList rows={day.rows} />
        ) : (
          <EmptyState
            icon={ScanLineIcon}
            title={isToday ? copy.attendance.emptyTitle : copy.attendance.emptyDayTitle}
            body={isToday ? copy.attendance.emptyBody : undefined}
          />
        )}
      </section>
    </>
  );
}
