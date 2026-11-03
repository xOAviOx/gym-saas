import 'server-only';

import { formatInTimeZone } from 'date-fns-tz';

import { addDays, IST, istDayRange, type DateOnly } from '@/lib/dates';
import type { ServerSupabase } from '@/lib/supabase/server';

import { hourlyCounts } from './outcome';
import type { AttendanceDay, AttendanceRow, KioskDeviceRow } from './types';

const DAY_LIMIT = 1000;

export async function getAttendanceDay(
  supabase: ServerSupabase,
  orgId: string,
  date: DateOnly,
): Promise<AttendanceDay> {
  const { start, end } = istDayRange(date);
  const { data, error } = await supabase
    .from('check_ins')
    .select(
      'id,checked_in_at,method,flag,overridden,kiosk_device_id,members!inner(id,full_name,member_code,deleted_at)',
    )
    .eq('org_id', orgId)
    .gte('checked_in_at', start)
    .lt('checked_in_at', end)
    .order('checked_in_at', { ascending: false })
    .limit(DAY_LIMIT);
  if (error) throw error;

  const rows: AttendanceRow[] = (data ?? []).map((row) => ({
    id: row.id,
    checkedInAt: row.checked_in_at,
    method: row.method,
    flag: row.flag,
    overridden: row.overridden,
    viaKiosk: row.kiosk_device_id !== null,
    member: {
      id: row.members.id,
      name: row.members.full_name,
      code: row.members.member_code,
      deleted: row.members.deleted_at !== null,
    },
  }));

  return {
    date,
    rows,
    total: rows.length,
    uniqueMembers: new Set(rows.map((r) => r.member.id)).size,
    flagged: rows.filter((r) => r.flag === 'expired' || r.flag === 'dues_pending').length,
    byQr: rows.filter((r) => r.method === 'qr').length,
    hourly: hourlyCounts(rows.map((r) => Number(formatInTimeZone(r.checkedInAt, IST, 'H')))),
  };
}

/** Daily totals for the seven days ending on `date`, oldest first. */
export async function getAttendanceWeek(
  supabase: ServerSupabase,
  orgId: string,
  date: DateOnly,
): Promise<{ date: DateOnly; count: number }[]> {
  const first = addDays(date, -6);
  const { data, error } = await supabase
    .from('check_ins')
    .select('checked_in_at')
    .eq('org_id', orgId)
    .gte('checked_in_at', istDayRange(first).start)
    .lt('checked_in_at', istDayRange(date).end)
    .limit(7 * DAY_LIMIT);
  if (error) throw error;
  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const day = formatInTimeZone(row.checked_in_at, IST, 'yyyy-MM-dd');
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return Array.from({ length: 7 }, (_, i) => {
    const day = addDays(first, i);
    return { date: day, count: counts.get(day) ?? 0 };
  });
}

export async function getKioskSetup(supabase: ServerSupabase, orgId: string) {
  const [devices, pin] = await Promise.all([
    supabase
      .from('kiosk_devices')
      .select('id,label,created_at,last_seen_at')
      .eq('org_id', orgId)
      .is('revoked_at', null)
      .order('created_at', { ascending: false }),
    supabase.rpc('kiosk_pin_status', { p_org: orgId }),
  ]);
  if (devices.error) throw devices.error;
  if (pin.error) throw pin.error;
  const status = (pin.data ?? {}) as { pin_set?: boolean; locked_until?: string | null };
  const rows: KioskDeviceRow[] = (devices.data ?? []).map((d) => ({
    id: d.id,
    label: d.label,
    createdAt: d.created_at,
    lastSeenAt: d.last_seen_at,
  }));
  return {
    devices: rows,
    pinSet: status.pin_set === true,
    lockedUntil: status.locked_until ?? null,
  };
}

/** Removes characters that would change the meaning of a PostgREST `or` filter or a LIKE pattern. */
export function sanitizeSearch(query: string): string {
  return query
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

export type CheckInCandidate = {
  id: string;
  name: string;
  code: string;
  phone: string;
  status: string;
};

export async function searchCheckInCandidates(
  supabase: ServerSupabase,
  orgId: string,
  query: string,
): Promise<CheckInCandidate[]> {
  const term = sanitizeSearch(query);
  if (term.length < 2) return [];
  const digits = term.replace(/\D/g, '');
  const filters = [`full_name.ilike.%${term}%`, `member_code.ilike.%${term}%`];
  if (digits.length >= 3) filters.push(`phone.like.%${digits}%`);
  const { data, error } = await supabase
    .from('members')
    .select('id,full_name,member_code,phone,status')
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .or(filters.join(','))
    .order('full_name')
    .limit(8);
  if (error) throw error;
  return (data ?? []).map((m) => ({
    id: m.id,
    name: m.full_name,
    code: m.member_code,
    phone: m.phone,
    status: m.status,
  }));
}
