import 'server-only';

import type { ServerSupabase } from '@/lib/supabase/server';

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
