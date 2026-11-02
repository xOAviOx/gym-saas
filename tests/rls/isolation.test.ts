/**
 * Proves tenant isolation end to end against a running local Supabase:
 * a signed-in user of gym A cannot read or write gym B, and anonymous
 * requests cannot touch protected tables at all.
 *
 * Run with: pnpm test:rls (needs `pnpm db:start` first).
 * Keys come from the environment or, locally, from .env.local.
 */
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import type { Database } from '@/lib/supabase/database.types';
import { addDays, todayIST } from '@/lib/dates';

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

describe('M1 atomic writes and role boundaries', () => {
  let staff: { client: Client; userId: string };
  let planId: string;
  let nextPhone = 10000000;
  const today = todayIST();
  function data(name = 'M1 Test') {
    return { full_name: name, phone: `+9197${++nextPhone}`, consent_messaging: false };
  }
  async function member(name = 'M1 Test', discount = 0) {
    const id = randomUUID();
    const payload = {
      p_org: a.orgId,
      p_member_id: id,
      p_data: data(name),
      p_membership: { plan_id: planId, start_date: today, discount_amount: discount },
    };
    const result = await a.client.rpc('create_member', payload);
    expect(result.error).toBeNull();
    const ms = await admin.from('memberships').select('*').eq('member_id', id).single();
    expect(ms.error).toBeNull();
    return { id, payload, membership: ms.data! };
  }
  beforeAll(async () => {
    staff = await signedInClient(`rls-staff-${run}@example.test`, 'Passw0rd!rls');
    const team = await admin
      .from('team_members')
      .insert({ org_id: a.orgId, user_id: staff.userId, role: 'staff' });
    expect(team.error).toBeNull();
    const plan = await a.client.rpc('save_plan', {
      p_org: a.orgId,
      p_data: {
        name: 'M1 Monthly',
        type: 'duration',
        duration_days: 30,
        price: 1500,
        is_active: true,
      },
    });
    expect(plan.error).toBeNull();
    planId = plan.data!;
  });
  afterAll(async () => {
    if (staff) await admin.auth.admin.deleteUser(staff.userId);
  });

  it('staff can read plans but cannot change them or access another gym through RPCs', async () => {
    const read = await staff.client.from('plans').select('id').eq('id', planId);
    expect(read.data).toHaveLength(1);
    const write = await staff.client.rpc('save_plan', {
      p_org: a.orgId,
      p_plan_id: planId,
      p_data: { price: 1 },
    });
    expect(write.error?.code).toBe('42501');
    const cross = await a.client.rpc('list_members', { p_org: b.orgId });
    expect(cross.error?.code).toBe('42501');
    expect(cross.data).toBeNull();
    const view = await a.client.from('member_directory').select('id').eq('org_id', b.orgId);
    expect(view.error).toBeNull();
    expect(view.data).toEqual([]);
  });
  it('creates member, consent timestamp, membership, invoice and audit together, idempotently', async () => {
    const id = randomUUID();
    const payload = {
      p_org: a.orgId,
      p_member_id: id,
      p_data: { ...data(), consent_messaging: true },
      p_membership: { plan_id: planId, start_date: today, discount_amount: 100.5 },
    };
    const result = await staff.client.rpc('create_member', payload);
    expect(result.error).toBeNull();
    expect(result.data).toBe(id);
    expect((await staff.client.rpc('create_member', payload)).error).toBeNull();
    const stored = await admin.from('members').select('*').eq('id', id).single();
    expect(stored.data?.member_code).toMatch(/^M-\d{4,}$/);
    expect(stored.data?.consent_recorded_at).not.toBeNull();
    const ms = await admin.from('memberships').select('*').eq('member_id', id);
    expect(ms.data).toHaveLength(1);
    expect(ms.data?.[0]?.end_date).toBe(addDays(today, 29));
    const invoice = await admin.from('invoices').select('*').eq('member_id', id);
    expect(invoice.data).toHaveLength(1);
    expect(invoice.data?.[0]?.total_amount).toBe(1399.5);
    expect(invoice.data?.[0]?.balance_due).toBe(1399.5);
    const audit = await admin
      .from('audit_logs')
      .select('id')
      .eq('entity_id', id)
      .eq('action', 'member.created');
    expect(audit.data).toHaveLength(1);
  });
  it('rolls back the member when membership creation fails', async () => {
    const id = randomUUID();
    const result = await a.client.rpc('create_member', {
      p_org: a.orgId,
      p_member_id: id,
      p_data: data(),
      p_membership: { plan_id: randomUUID(), start_date: today },
    });
    expect(result.error?.message).toBe('plan_not_found');
    const stored = await admin.from('members').select('id').eq('id', id);
    expect(stored.data).toEqual([]);
    expect((await admin.from('audit_logs').select('id').eq('entity_id', id)).data).toEqual([]);
  });
  it('rejects forged member fields, cross-tenant updates, and direct membership writes', async () => {
    const forged = await staff.client.rpc('create_member', {
      p_org: a.orgId,
      p_member_id: randomUUID(),
      p_data: { ...data(), org_id: b.orgId },
    });
    expect(forged.error?.message).toBe('invalid_input');
    const cross = await a.client.rpc('update_member', {
      p_org: a.orgId,
      p_member_id: b.memberId,
      p_data: { full_name: 'Forged' },
    });
    expect(cross.error?.message).toBe('member_not_found');
    const direct = await staff.client.from('memberships').insert({
      org_id: a.orgId,
      member_id: a.memberId,
      plan_id: planId,
      start_date: today,
      end_date: addDays(today, 29),
      list_price: 1500,
      final_amount: 1500,
    });
    expect(direct.error?.code).toBe('42501');
    const base = await admin.from('members').select('*').eq('id', a.memberId).single();
    expect(base.error).toBeNull();
    const helper = await staff.client.rpc('member_data_record', { p_data: {}, p_base: base.data! });
    expect(helper.error).not.toBeNull();
    const insert = await staff.client.from('members').insert({ org_id: a.orgId, ...data() });
    expect(insert.error?.code).toBe('42501');
    const update = await staff.client
      .from('members')
      .update({ full_name: 'Unaudited' })
      .eq('id', a.memberId)
      .select('id');
    expect(update.data).toEqual([]);
    const plan = await a.client
      .from('plans')
      .insert({ org_id: a.orgId, name: 'Unaudited', duration_days: 30, price: 1 });
    expect(plan.error?.code).toBe('42501');
  });
  it('handles simultaneous duplicate phones without leaving an extra invoice or member', async () => {
    const details = data();
    const results = await Promise.all(
      [randomUUID(), randomUUID()].map((id) =>
        a.client.rpc('create_member', {
          p_org: a.orgId,
          p_member_id: id,
          p_data: details,
          p_membership: { plan_id: planId, start_date: today },
        }),
      ),
    );
    expect(results.filter((r) => !r.error)).toHaveLength(1);
    expect(results.find((r) => r.error)?.error?.code).toBe('23505');
    const members = await admin
      .from('members')
      .select('id')
      .eq('org_id', a.orgId)
      .eq('phone', details.phone);
    expect(members.data).toHaveLength(1);
    expect(
      (await admin.from('invoices').select('id').eq('member_id', members.data![0]!.id)).data,
    ).toHaveLength(1);
  });
  it('enrolls a renewal once per request and retains historical prices when a plan changes', async () => {
    const created = await member();
    const requestId = randomUUID();
    const payload = {
      p_org: a.orgId,
      p_member_id: created.id,
      p_plan_id: planId,
      p_start_date: addDays(today, 30),
      p_discount_amount: 0,
      p_request_id: requestId,
    };
    const result = await staff.client.rpc('enroll_member', payload);
    expect(result.error).toBeNull();
    expect((await staff.client.rpc('enroll_member', payload)).error).toBeNull();
    expect(
      (await admin.from('memberships').select('id').eq('member_id', created.id)).data,
    ).toHaveLength(2);
    expect(
      (await admin.from('invoices').select('id').eq('member_id', created.id)).data,
    ).toHaveLength(2);
    const changed = await staff.client.rpc('enroll_member', { ...payload, p_discount_amount: 1 });
    expect(changed.error?.message).toBe('request_conflict');
    const another = await a.client.rpc('save_plan', {
      p_org: a.orgId,
      p_data: { name: 'Historical', type: 'duration', duration_days: 30, price: 100 },
    });
    expect(another.error).toBeNull();
    const history = await a.client.rpc('enroll_member', {
      ...payload,
      p_plan_id: another.data!,
      p_request_id: randomUUID(),
    });
    expect(history.error).toBeNull();
    const ms = z.object({ membership: z.object({ id: z.string() }) }).parse(history.data);
    expect(
      (
        await a.client.rpc('save_plan', {
          p_org: a.orgId,
          p_plan_id: another.data!,
          p_data: { price: 200 },
        })
      ).error,
    ).toBeNull();
    const stored = await admin
      .from('memberships')
      .select('list_price,final_amount')
      .eq('id', ms.membership.id)
      .single();
    expect(stored.data).toEqual({ list_price: 100, final_amount: 100 });
  });
  it('freezes and resumes with only actually frozen days added, not the whole scheduled window', async () => {
    const created = await member();
    const id = created.membership.id;
    expect(
      (
        await staff.client.rpc('freeze_membership', {
          p_membership_id: id,
          p_from: today,
          p_to: addDays(today, 4),
        })
      ).error,
    ).toBeNull();
    const resumed = await staff.client.rpc('unfreeze_membership', { p_membership_id: id });
    expect(resumed.error).toBeNull();
    expect(resumed.data?.end_date).toBe(addDays(today, 29));
    const scheduled = await admin
      .from('memberships')
      .update({ frozen_from: addDays(today, -2), frozen_to: addDays(today, 2) })
      .eq('id', id);
    expect(scheduled.error).toBeNull();
    const resumedAgain = await staff.client.rpc('unfreeze_membership', { p_membership_id: id });
    expect(resumedAgain.error).toBeNull();
    expect(resumedAgain.data?.freeze_days_used).toBe(2);
    expect(resumedAgain.data?.end_date).toBe(addDays(today, 31));
  });
  it('enforces soft-delete roles, phone conflicts and the 30-day restore window', async () => {
    const created = await member();
    expect(
      (await staff.client.rpc('soft_delete_member', { p_member_id: created.id })).error?.code,
    ).toBe('42501');
    expect(
      (await a.client.rpc('soft_delete_member', { p_member_id: created.id })).error,
    ).toBeNull();
    expect(
      (
        await staff.client.rpc('update_member', {
          p_org: a.orgId,
          p_member_id: created.id,
          p_data: { notes: 'No' },
        })
      ).error?.message,
    ).toBe('member_not_found');
    const replacementId = randomUUID();
    expect(
      (
        await a.client.rpc('create_member', {
          p_org: a.orgId,
          p_member_id: replacementId,
          p_data: created.payload.p_data,
        })
      ).error,
    ).toBeNull();
    expect((await a.client.rpc('restore_member', { p_member_id: created.id })).error?.message).toBe(
      'phone_in_use',
    );
    expect(
      (await a.client.rpc('soft_delete_member', { p_member_id: replacementId })).error,
    ).toBeNull();
    expect((await a.client.rpc('restore_member', { p_member_id: created.id })).error).toBeNull();
    expect(
      (await a.client.rpc('soft_delete_member', { p_member_id: created.id })).error,
    ).toBeNull();
    expect(
      (
        await admin
          .from('members')
          .update({ deleted_at: `${addDays(today, -31)}T00:00:00Z` })
          .eq('id', created.id)
      ).error,
    ).toBeNull();
    expect((await a.client.rpc('restore_member', { p_member_id: created.id })).error?.message).toBe(
      'restore_window_expired',
    );
    expect(
      (await staff.client.rpc('list_members', { p_org: a.orgId, p_filter: 'deleted' })).error?.code,
    ).toBe('42501');
  });
  it('lists computed status, literal search and stable server-side pagination', async () => {
    const active = await member('Directory Test Active', 1500);
    const upcomingId = randomUUID();
    expect(
      (
        await a.client.rpc('create_member', {
          p_org: a.orgId,
          p_member_id: upcomingId,
          p_data: data('Directory Test Upcoming'),
          p_membership: { plan_id: planId, start_date: addDays(today, 10), discount_amount: 1500 },
        })
      ).error,
    ).toBeNull();
    const expiredId = randomUUID();
    expect(
      (
        await a.client.rpc('create_member', {
          p_org: a.orgId,
          p_member_id: expiredId,
          p_data: data('Directory Test Expired'),
          p_membership: { plan_id: planId, start_date: addDays(today, -60), discount_amount: 1500 },
        })
      ).error,
    ).toBeNull();
    const schema = z.object({
      total: z.number(),
      rows: z.array(z.object({ id: z.string(), status: z.string() })),
    });
    const first = await a.client.rpc('list_members', {
      p_org: a.orgId,
      p_search: 'Directory Test',
      p_page_size: 2,
    });
    expect(first.error).toBeNull();
    const parsed = schema.parse(first.data);
    expect(parsed.total).toBe(3);
    expect(parsed.rows.map((r) => r.status)).toEqual(['expired', 'active']);
    const second = await a.client.rpc('list_members', {
      p_org: a.orgId,
      p_search: 'Directory Test',
      p_page_size: 2,
      p_page: 2,
    });
    expect(schema.parse(second.data).rows.map((r) => r.status)).toEqual(['upcoming']);
    const byPhone = await a.client.rpc('list_members', {
      p_org: a.orgId,
      p_search: active.payload.p_data.phone.replace('+91', ''),
    });
    expect(schema.parse(byPhone.data).rows.map((r) => r.id)).toEqual([active.id]);
    const literal = await a.client.rpc('list_members', {
      p_org: a.orgId,
      p_search: '%),id.not.is.null',
    });
    expect(literal.error).toBeNull();
    expect(schema.parse(literal.data).total).toBe(0);
  });
  it('imports atomically, skips duplicate phones, and can safely retry an import', async () => {
    const one = {
      id: randomUUID(),
      data: data('Import One'),
      membership: { plan_id: planId, start_date: today },
    };
    const two = { id: randomUUID(), data: data('Import Two') };
    const rows = [one, two, { id: randomUUID(), data: one.data }];
    const result = await staff.client.rpc('import_members', { p_org: a.orgId, p_rows: rows });
    expect(result.error).toBeNull();
    expect(result.data).toEqual({ imported: 2, skipped: 1 });
    expect(
      (await staff.client.rpc('import_members', { p_org: a.orgId, p_rows: rows })).data,
    ).toEqual({ imported: 0, skipped: 3 });
    const rollbackId = randomUUID();
    const failed = await staff.client.rpc('import_members', {
      p_org: a.orgId,
      p_rows: [
        { id: rollbackId, data: data('Rollback One') },
        {
          id: randomUUID(),
          data: data('Rollback Two'),
          membership: { plan_id: randomUUID(), start_date: today },
        },
      ],
    });
    expect(failed.error).not.toBeNull();
    expect((await admin.from('members').select('id').eq('id', rollbackId)).data).toEqual([]);
  });
  it('computes search-scoped overview counts before pagination and excludes deleted dues', async () => {
    await member('Overview Test Active');
    const expiring = await a.client.rpc('create_member', {
      p_org: a.orgId,
      p_member_id: randomUUID(),
      p_data: data('Overview Test Expiring'),
      p_membership: {
        plan_id: planId,
        start_date: addDays(today, -23),
        discount_amount: 100.5,
      },
    });
    expect(expiring.error).toBeNull();
    for (const [name, start] of [
      ['Expired', addDays(today, -60)],
      ['Upcoming', addDays(today, 10)],
    ]) {
      const created = await a.client.rpc('create_member', {
        p_org: a.orgId,
        p_member_id: randomUUID(),
        p_data: data(`Overview Test ${name}`),
        p_membership: { plan_id: planId, start_date: start, discount_amount: 1500 },
      });
      expect(created.error).toBeNull();
    }
    const frozen = await member('Overview Test Frozen');
    expect(
      (
        await a.client.rpc('freeze_membership', {
          p_membership_id: frozen.membership.id,
          p_from: today,
          p_to: addDays(today, 3),
        })
      ).error,
    ).toBeNull();
    expect(
      (
        await a.client.rpc('create_member', {
          p_org: a.orgId,
          p_member_id: randomUUID(),
          p_data: data('Overview Test New'),
        })
      ).error,
    ).toBeNull();
    const deleted = await member('Overview Test Deleted');
    expect(
      (await a.client.rpc('soft_delete_member', { p_member_id: deleted.id })).error,
    ).toBeNull();
    const oldDeleted = await member('Overview Test Old Deleted');
    expect(
      (
        await admin
          .from('members')
          .update({ deleted_at: `${addDays(today, -31)}T00:00:00Z` })
          .eq('id', oldDeleted.id)
      ).error,
    ).toBeNull();
    expect(
      (
        await b.client.rpc('create_member', {
          p_org: b.orgId,
          p_member_id: randomUUID(),
          p_data: data('Overview Test Foreign'),
        })
      ).error,
    ).toBeNull();
    const result = await a.client.rpc('list_members', {
      p_org: a.orgId,
      p_search: 'Overview Test',
      p_page_size: 2,
    });
    expect(result.error).toBeNull();
    const parsed = z
      .object({
        total: z.number(),
        balance_due: z.number(),
        counts: z.record(z.string(), z.number()),
        rows: z.array(z.object({ id: z.string() })),
      })
      .parse(result.data);
    expect(parsed.total).toBe(6);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.balance_due).toBe(4399.5);
    expect(parsed.counts).toEqual({
      all: 6,
      active: 1,
      expiring: 1,
      expired: 1,
      dues: 3,
      frozen: 1,
      new: 1,
      upcoming: 1,
      deleted: 1,
    });
  });
  it('keeps overview search scope across filters and withholds deleted counts from staff', async () => {
    const schema = z.object({
      total: z.number(),
      balance_due: z.number(),
      counts: z.record(z.string(), z.number()),
      rows: z.array(z.object({ status: z.string() })),
    });
    for (const filter of ['dues', 'new', 'upcoming']) {
      const result = await staff.client.rpc('list_members', {
        p_org: a.orgId,
        p_search: 'Overview Test',
        p_filter: filter,
      });
      expect(result.error).toBeNull();
      const parsed = schema.parse(result.data);
      expect(parsed.counts.all).toBe(6);
      expect(parsed.counts).not.toHaveProperty('deleted');
      expect(parsed.total).toBe(filter === 'dues' ? 3 : 1);
      expect(parsed.balance_due).toBe(4399.5);
      if (filter !== 'dues') expect(parsed.rows[0]?.status).toBe(filter);
    }
    const missing = await staff.client.rpc('list_members', {
      p_org: a.orgId,
      p_search: 'No matching overview member',
    });
    expect(missing.error).toBeNull();
    expect(schema.parse(missing.data)).toEqual({
      total: 0,
      balance_due: 0,
      rows: [],
      counts: {
        all: 0,
        active: 0,
        expiring: 0,
        expired: 0,
        dues: 0,
        frozen: 0,
        new: 0,
        upcoming: 0,
      },
    });
  });
  it('does not expose the directory or new write functions to anonymous users', async () => {
    const anon = createClient<Database>(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false },
    });
    expect((await anon.from('member_directory').select('id')).error).not.toBeNull();
    expect((await anon.rpc('list_members', { p_org: a.orgId })).error).not.toBeNull();
    expect(
      (
        await anon.rpc('create_member', {
          p_org: a.orgId,
          p_member_id: randomUUID(),
          p_data: data(),
        })
      ).error,
    ).not.toBeNull();
  });
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
  const { data: memberId, error: memberError } = await client.rpc('create_member', {
    p_org: org.id,
    p_member_id: randomUUID(),
    p_data: {
      full_name: `Member ${label}`,
      phone: `+9198${Math.floor(10000000 + Math.random() * 89999999)}`,
      consent_messaging: true,
    },
  });
  if (memberError || !memberId) {
    throw memberError ?? new Error('member not created');
  }
  return { client, userId, orgId: org.id, memberId };
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
    const { error: orgError } = await admin.from('organizations').delete().eq('id', tenant.orgId);
    expect(orgError).toBeNull();
    const { error: userError } = await admin.auth.admin.deleteUser(tenant.userId);
    expect(userError).toBeNull();
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
    const { count, error: countError } = await admin
      .from('members')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', a.orgId)
      .is('deleted_at', null);
    expect(countError).toBeNull();
    expect((data as { total_members: number }).total_members).toBe(count);
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
