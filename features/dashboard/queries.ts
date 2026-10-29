import 'server-only';

import { toPaise, type Paise } from '@/lib/money';
import type { ServerSupabase } from '@/lib/supabase/server';

export type DashboardStats = {
  collectedToday: Paise;
  pendingDues: Paise;
  pendingDuesCount: number;
  expiringIn7Days: number;
  checkInsToday: number;
  activeMembers: number;
  totalMembers: number;
};

type RawStats = {
  collected_today?: number | string;
  pending_dues?: number | string;
  pending_dues_count?: number;
  expiring_7d?: number;
  checkins_today?: number;
  active_members?: number;
  total_members?: number;
};

export async function getDashboardStats(
  supabase: ServerSupabase,
  orgId: string,
): Promise<DashboardStats> {
  const { data, error } = await supabase.rpc('dashboard_stats', { p_org: orgId });
  if (error) {
    throw error;
  }
  const raw = (data ?? {}) as RawStats;
  return {
    collectedToday: toPaise(raw.collected_today ?? 0),
    pendingDues: toPaise(raw.pending_dues ?? 0),
    pendingDuesCount: Number(raw.pending_dues_count ?? 0),
    expiringIn7Days: Number(raw.expiring_7d ?? 0),
    checkInsToday: Number(raw.checkins_today ?? 0),
    activeMembers: Number(raw.active_members ?? 0),
    totalMembers: Number(raw.total_members ?? 0),
  };
}
