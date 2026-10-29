/**
 * Proves tenant isolation end to end against a running local Supabase:
 * a signed-in user of gym A cannot read or write gym B, and anonymous
 * requests cannot touch protected tables at all.
 *
 * Run with: pnpm test:rls (needs `pnpm db:start` first).
 * Keys come from the environment or, locally, from .env.local.
 */
import { readFileSync } from 'node:fs';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Database } from '@/lib/supabase/database.types';

/** Reads a KEY=value file without expanding anything; a missing file is fine. */
function loadEnvFile(path: string): Record<string, string> {
  try {
    return Object.fromEntries(
      readFileSync(path, 'utf8')
        .split(/\r?\n/)
        .filter((line) => line && !line.startsWith('#') && line.includes('='))
        .map((line) => [
          line.slice(0, line.indexOf('=')).trim(),
          line.slice(line.indexOf('=') + 1).trim(),
        ]),
    );
  } catch {
    return {};
  }
}

const fileEnv = loadEnvFile('.env.local');

function required(name: string): string {
  const value = process.env[name] ?? fileEnv[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Run \`pnpm db:start\` and create .env.local (see docs/local-setup.md).`,
    );
  }
  return value;
}

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  fileEnv.NEXT_PUBLIC_SUPABASE_URL ??
  'http://127.0.0.1:54321';
const ANON_KEY = required('NEXT_PUBLIC_SUPABASE_ANON_KEY');
const SERVICE_ROLE_KEY = required('SUPABASE_SERVICE_ROLE_KEY');

type Client = SupabaseClient<Database>;

const run = Date.now().toString(36);
const admin: Client = createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Tenant = {
  client: Client;
  userId: string;
  orgId: string;
  memberId: string;
};

async function signedInClient(
  email: string,
  password: string,
): Promise<{ client: Client; userId: string }> {
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: email.split('@')[0] },
  });
  if (createError || !created.user) {
    throw createError ?? new Error('user not created');
  }
  const client = createClient<Database>(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw error;
  }
  return { client, userId: created.user.id };
}

async function makeTenant(label: string): Promise<Tenant> {
  const { client, userId } = await signedInClient(
    `rls-${label}-${run}@example.test`,
    'Passw0rd!rls',
  );
  const { data: org, error } = await client.rpc('create_organization', {
    p_name: `RLS ${label} ${run}`,
    p_city: 'Nagpur',
    p_phone: '+919876543210',
    p_upi_vpa: `rls${label}@okaxis`,
    p_upi_payee_name: `RLS ${label}`,
    p_gst_enabled: false,
    p_gstin: '',
    p_invoice_prefix: 'RLS',
  });
  if (error || !org) {
    throw error ?? new Error('org not created');
  }
  const { data: member, error: memberError } = await client
    .from('members')
    .insert({
      org_id: org.id,
      full_name: `Member ${label}`,
      phone: `+9198${Math.floor(10000000 + Math.random() * 89999999)}`,
      consent_messaging: true,
    })
    .select('id')
    .single();
  if (memberError || !member) {
    throw memberError ?? new Error('member not created');
  }
  return { client, userId, orgId: org.id, memberId: member.id };
}

let a: Tenant;
let b: Tenant;

beforeAll(async () => {
  a = await makeTenant('a');
  b = await makeTenant('b');
});

afterAll(async () => {
  for (const tenant of [a, b]) {
    if (!tenant) continue;
    await admin.from('organizations').delete().eq('id', tenant.orgId);
    await admin.auth.admin.deleteUser(tenant.userId);
  }
});

describe('RLS isolation between gyms', () => {
  it('each owner sees only their own organization', async () => {
    const { data } = await a.client.from('organizations').select('id');
    expect(data?.map((row) => row.id)).toEqual([a.orgId]);
  });

  it('gym A cannot read gym B members, even by id', async () => {
    const { data: all } = await a.client.from('members').select('id, org_id');
    expect(all?.every((row) => row.org_id === a.orgId)).toBe(true);

    const { data: byId } = await a.client.from('members').select('id').eq('id', b.memberId);
    expect(byId).toEqual([]);
  });

  it('gym A cannot insert a member into gym B', async () => {
    const { error } = await a.client.from('members').insert({
      org_id: b.orgId,
      full_name: 'Intruder',
      phone: '+919812345678',
    });
    expect(error).not.toBeNull();
    expect(error?.code).toBe('42501');
  });

  it('gym A cannot update gym B settings (including the UPI ID)', async () => {
    const { data } = await a.client
      .from('organizations')
      .update({ upi_vpa: 'attacker@okaxis', upi_payee_name: 'Attacker' })
      .eq('id', b.orgId)
      .select('id');
    expect(data).toEqual([]);

    const { data: check } = await admin
      .from('organizations')
      .select('upi_vpa')
      .eq('id', b.orgId)
      .single();
    expect(check?.upi_vpa).toBe('rlsb@okaxis');
  });

  it('gym A cannot create a membership for a gym B member through the RPC', async () => {
    const { data: plan } = await admin
      .from('plans')
      .insert({ org_id: b.orgId, name: 'Monthly', duration_days: 30, price: 1500 })
      .select('id')
      .single();
    const { error } = await a.client.rpc('create_membership', {
      p_member_id: b.memberId,
      p_plan_id: plan!.id,
      p_start_date: '2026-01-01',
    });
    expect(error).not.toBeNull();
  });

  it('gym A cannot read gym B dashboard numbers', async () => {
    const { error } = await a.client.rpc('dashboard_stats', { p_org: b.orgId });
    expect(error).not.toBeNull();
    const { data, error: ownError } = await a.client.rpc('dashboard_stats', { p_org: a.orgId });
    expect(ownError).toBeNull();
    expect((data as { total_members: number }).total_members).toBe(1);
  });

  it('gym A cannot see gym B team members or audit logs', async () => {
    const { data: team } = await a.client.from('team_members').select('org_id');
    expect(team?.every((row) => row.org_id === a.orgId)).toBe(true);

    const { data: audit } = await a.client.from('audit_logs').select('org_id');
    expect(audit?.every((row) => row.org_id === a.orgId)).toBe(true);
  });

  it('staff cannot write rows that only functions may write', async () => {
    const { error: invoiceError } = await a.client.from('invoices').insert({
      org_id: a.orgId,
      member_id: a.memberId,
      invoice_number: 'RLS/25-26/0001',
      fiscal_year: '25-26',
      issue_date: '2026-01-01',
      due_date: '2026-01-01',
      subtotal: 100,
      taxable_value: 100,
      total_amount: 100,
      balance_due: 100,
    });
    expect(invoiceError?.code).toBe('42501');

    const { error: auditError } = await a.client.from('audit_logs').insert({
      org_id: a.orgId,
      action: 'forged',
      entity_type: 'member',
    });
    expect(auditError?.code).toBe('42501');
  });
});

describe('anonymous access', () => {
  const anon: Client = createClient<Database>(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  it('cannot read any protected table', async () => {
    for (const table of [
      'organizations',
      'members',
      'invoices',
      'payments',
      'payment_claims',
    ] as const) {
      const { data, error } = await anon.from(table).select('id');
      expect(error, table).not.toBeNull();
      expect(data).toBeNull();
    }
  });

  it('cannot call tenant functions', async () => {
    const { error } = await anon.rpc('dashboard_stats', { p_org: a.orgId });
    expect(error).not.toBeNull();
  });
});
