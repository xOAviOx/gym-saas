import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const orgId = process.argv[2];
const api = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!/^[0-9a-f-]{36}$/i.test(orgId ?? '') || !api || !key) {
  throw new Error('Run: pnpm seed:demo <local-gym-uuid> (with .env.local configured).');
}
const host = new URL(api).hostname;
if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
  throw new Error('Demo seed only runs against local Supabase.');
}

const db = createClient(api, key, { auth: { persistSession: false, autoRefreshToken: false } });
async function value(promise) {
  const result = await promise;
  if (result.error) throw result.error;
  return result.data;
}
const org = await value(db.from('organizations').select('id').eq('id', orgId).maybeSingle());
if (!org) throw new Error('Gym not found.');

const plans = [
  {
    name: 'Demo Monthly',
    type: 'duration',
    duration_days: 30,
    price: 1800,
    description: 'Local demo seed',
  },
  {
    name: 'Demo 12 Visits',
    type: 'sessions',
    duration_days: 60,
    session_count: 12,
    price: 2400,
    description: 'Local demo seed',
  },
];
const planIds = [];
for (const plan of plans) {
  const existing = await value(
    db.from('plans').select('id').eq('org_id', orgId).eq('name', plan.name).maybeSingle(),
  );
  planIds.push(
    existing?.id ??
      (await value(db.rpc('save_plan', { p_org: orgId, p_plan_id: null, p_data: plan }))),
  );
}

const names = [
  'Asha Sharma',
  'Rohan Mehta',
  'Priya Nair',
  'Arjun Patel',
  'Neha Gupta',
  'Kabir Singh',
  'Isha Rao',
  'Dev Malhotra',
  'Ananya Das',
  'Vikram Joshi',
  'Sana Khan',
  'Aditya Verma',
];
const today = new Date().toISOString().slice(0, 10);
let created = 0;
for (const [index, name] of names.entries()) {
  const phone = `+9199900${String(index + 10000).padStart(5, '0')}`;
  const existing = await value(
    db.from('members').select('id').eq('org_id', orgId).eq('phone', phone).maybeSingle(),
  );
  if (existing) continue;
  const memberId = randomUUID();
  await value(
    db.rpc('create_member', {
      p_org: orgId,
      p_member_id: memberId,
      p_data: {
        full_name: name,
        phone,
        source: 'walk_in',
        joined_on: today,
        consent_messaging: false,
        notes: 'Local demo seed',
      },
      p_membership:
        index < 9 ? { plan_id: planIds[index % 2], start_date: today, discount_amount: 0 } : null,
    }),
  );
  created++;
}
console.log(`Demo seed ready: ${created} members added, 12 total examples, 2 plans.`);
