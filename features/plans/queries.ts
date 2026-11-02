import 'server-only';

import type { ServerSupabase } from '@/lib/supabase/server';
import { toPaise } from '@/lib/money';

import type { Plan } from './types';

export async function countPlans(supabase: ServerSupabase, orgId: string): Promise<number> {
  const { count, error } = await supabase
    .from('plans')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId);
  if (error) {
    throw error;
  }
  return count ?? 0;
}

export async function getPlans(
  supabase: ServerSupabase,
  orgId: string,
  activeOnly = false,
): Promise<Plan[]> {
  let query = supabase
    .from('plans')
    .select('*')
    .eq('org_id', orgId)
    .order('sort_order')
    .order('created_at')
    .order('id');
  if (activeOnly) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type,
    durationDays: p.duration_days,
    sessionCount: p.session_count,
    price: toPaise(p.price),
    description: p.description ?? '',
    isActive: p.is_active,
  }));
}
