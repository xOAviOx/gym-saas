import 'server-only';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

import { env } from '@/lib/env';

import type { Database } from './database.types';

/**
 * Service-role client. Bypasses RLS, so it is only used where no user session
 * exists: the Razorpay webhook, the daily cron, public portal routes (after the
 * token is validated), invitation acceptance and the kiosk PIN check.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}

export type AdminSupabase = ReturnType<typeof createAdminClient>;
