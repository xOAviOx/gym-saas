import 'server-only';

import type { ServerSupabase } from '@/lib/supabase/server';
import type { AdminSupabase } from '@/lib/supabase/admin';
import type { Json } from '@/lib/supabase/database.types';

export type AuditEntry = {
  orgId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: Json | null;
  after?: Json | null;
};

/**
 * Appends an audit row through the SQL function so the actor is always taken
 * from the session, never from the caller.
 */
export async function writeAudit(
  supabase: ServerSupabase | AdminSupabase,
  entry: AuditEntry,
): Promise<void> {
  const { error } = await supabase.rpc('write_audit_log', {
    p_org: entry.orgId,
    p_action: entry.action,
    p_entity_type: entry.entityType,
    ...(entry.entityId ? { p_entity_id: entry.entityId } : {}),
    ...(entry.before !== undefined && entry.before !== null ? { p_before: entry.before } : {}),
    ...(entry.after !== undefined && entry.after !== null ? { p_after: entry.after } : {}),
  });
  if (error) {
    // Auditing must never block the business write that already succeeded.
    console.error('[audit] failed to write audit log', entry.action, error.message);
  }
}
