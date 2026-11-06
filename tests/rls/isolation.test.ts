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
    if (staff) expect((await admin.auth.admin.deleteUser(staff.userId)).error).toBeNull();
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

describe('M2 payments, claims, gateway links and dues', () => {
  type PaymentArgs = Database['public']['Functions']['record_payment']['Args'];
  type LinkArgs = Database['public']['Functions']['save_gateway_link']['Args'];
  let staff: { client: Client; userId: string };
  let planId: string;
  let foreignPlanId: string;
  let nextPhone = 20000000;
  const today = todayIST();
  const inOneHour = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const utr = () => String(Math.floor(100000000000 + Math.random() * 899999999999));

  async function invoiced(name: string, tenant: Tenant = a, plan = planId) {
    const memberId = randomUUID();
    const created = await tenant.client.rpc('create_member', {
      p_org: tenant.orgId,
      p_member_id: memberId,
      p_data: { full_name: name, phone: `+9196${++nextPhone}`, consent_messaging: false },
      p_membership: { plan_id: plan, start_date: today },
    });
    expect(created.error).toBeNull();
    const invoice = await admin.from('invoices').select('*').eq('member_id', memberId).single();
    expect(invoice.error).toBeNull();
    return { memberId, invoice: invoice.data! };
  }
  function pay(invoiceId: string, amount: number, extra: Partial<PaymentArgs> = {}): PaymentArgs {
    return {
      p_org: a.orgId,
      p_invoice_id: invoiceId,
      p_request_id: randomUUID(),
      p_amount: amount,
      p_method: 'cash',
      ...extra,
    };
  }
  async function invoiceState(id: string) {
    const stored = await admin
      .from('invoices')
      .select('status,amount_paid,balance_due')
      .eq('id', id)
      .single();
    expect(stored.error).toBeNull();
    return stored.data;
  }
  function link(invoiceId: string, extra: Partial<LinkArgs> = {}): LinkArgs {
    return {
      p_org: a.orgId,
      p_invoice_id: invoiceId,
      p_request_id: randomUUID(),
      p_link_id: `gd_${run}_${randomUUID().slice(0, 8)}`,
      p_url: 'https://payments-test.cashfree.com/links/rls',
      p_amount: 1000,
      p_expires_at: inOneHour(),
      ...extra,
    };
  }

  beforeAll(async () => {
    staff = await signedInClient(`rls-m2-staff-${run}@example.test`, 'Passw0rd!rls');
    const team = await admin
      .from('team_members')
      .insert({ org_id: a.orgId, user_id: staff.userId, role: 'staff' });
    expect(team.error).toBeNull();
    const plans = await Promise.all(
      [a, b].map((tenant) =>
        tenant.client.rpc('save_plan', {
          p_org: tenant.orgId,
          p_data: {
            name: 'M2 Monthly',
            type: 'duration',
            duration_days: 30,
            price: 1000,
            is_active: true,
          },
        }),
      ),
    );
    for (const plan of plans) expect(plan.error).toBeNull();
    planId = plans[0]!.data!;
    foreignPlanId = plans[1]!.data!;
  });
  afterAll(async () => {
    if (staff) expect((await admin.auth.admin.deleteUser(staff.userId)).error).toBeNull();
  });

  it('records a counter payment once per request and keeps the invoice balance in step', async () => {
    const { invoice } = await invoiced('Billing Test Partial');
    expect(invoice.total_amount).toBe(1000);
    const payload = pay(invoice.id, 400);
    const first = await staff.client.rpc('record_payment', payload);
    expect(first.error).toBeNull();
    expect(first.data?.collected_by).not.toBeNull();
    const retry = await staff.client.rpc('record_payment', payload);
    expect(retry.error).toBeNull();
    expect(retry.data?.id).toBe(first.data?.id);
    expect(
      (await admin.from('payments').select('id').eq('invoice_id', invoice.id)).data,
    ).toHaveLength(1);
    expect(await invoiceState(invoice.id)).toEqual({
      status: 'partially_paid',
      amount_paid: 400,
      balance_due: 600,
    });
    const audit = await admin
      .from('audit_logs')
      .select('id')
      .eq('entity_id', first.data!.id)
      .eq('action', 'payment.recorded');
    expect(audit.data).toHaveLength(1);

    const rejected: [Partial<PaymentArgs>, string][] = [
      [{ p_request_id: payload.p_request_id, p_amount: 401 }, 'request_conflict'],
      [{ p_amount: 600.01 }, 'amount_exceeds_balance'],
      [{ p_utr: utr() }, 'invalid_input'],
      [{ p_method: 'cashfree' }, 'invalid_input'],
      [{ p_paid_on: addDays(today, 1) }, 'invalid_paid_on'],
      [{ p_paid_on: addDays(today, -91) }, 'invalid_paid_on'],
      [{ p_method: 'upi', p_utr: '12345' }, 'invalid_utr'],
    ];
    for (const [extra, message] of rejected) {
      const result = await staff.client.rpc('record_payment', pay(invoice.id, 10, extra));
      expect(result.error?.message, message).toBe(message);
    }

    const upiRef = utr();
    const upi = await staff.client.rpc(
      'record_payment',
      pay(invoice.id, 100, { p_method: 'upi', p_utr: upiRef, p_paid_on: addDays(today, -2) }),
    );
    expect(upi.error).toBeNull();
    const duplicate = await staff.client.rpc(
      'record_payment',
      pay(invoice.id, 100, { p_method: 'upi', p_utr: upiRef }),
    );
    expect(duplicate.error?.message).toBe('duplicate_utr');
    expect((await staff.client.rpc('record_payment', pay(invoice.id, 500))).error).toBeNull();
    expect(await invoiceState(invoice.id)).toEqual({
      status: 'paid',
      amount_paid: 1000,
      balance_due: 0,
    });
  });

  it('keeps payments, reversals and voids inside the gym and the right roles', async () => {
    const { invoice, memberId } = await invoiced('Billing Test Reverse');
    const foreign = await b.client.rpc('record_payment', {
      ...pay(invoice.id, 100),
      p_org: b.orgId,
    });
    expect(foreign.error?.message).toBe('invoice_not_found');
    expect((await b.client.rpc('record_payment', pay(invoice.id, 100))).error?.code).toBe('42501');
    const direct = await a.client.from('payments').insert({
      org_id: a.orgId,
      invoice_id: invoice.id,
      member_id: memberId,
      amount: 1,
      method: 'cash',
    });
    expect(direct.error?.code).toBe('42501');

    const paid = await staff.client.rpc('record_payment', pay(invoice.id, 1000));
    expect(paid.error).toBeNull();
    const reverse = { p_payment_id: paid.data!.id, p_reason: 'Wrong member' };
    expect((await staff.client.rpc('reverse_payment', reverse)).error?.code).toBe('42501');
    expect((await b.client.rpc('reverse_payment', reverse)).error?.code).toBe('42501');
    const voiding = { p_invoice_id: invoice.id, p_reason: 'Duplicate invoice' };
    expect((await a.client.rpc('void_invoice', voiding)).error?.message).toBe(
      'invoice_has_payments',
    );
    expect(
      (await a.client.rpc('reverse_payment', { ...reverse, p_reason: ' ' })).error?.message,
    ).toBe('reason_required');
    const reversed = await a.client.rpc('reverse_payment', reverse);
    expect(reversed.error).toBeNull();
    expect(reversed.data?.amount).toBe(-1000);
    expect((await a.client.rpc('reverse_payment', reverse)).error?.message).toBe(
      'already_reversed',
    );
    expect(
      (await a.client.rpc('reverse_payment', { ...reverse, p_payment_id: reversed.data!.id })).error
        ?.message,
    ).toBe('cannot_reverse_reversal');
    expect(await invoiceState(invoice.id)).toEqual({
      status: 'unpaid',
      amount_paid: 0,
      balance_due: 1000,
    });

    expect((await staff.client.rpc('void_invoice', voiding)).error?.code).toBe('42501');
    expect((await b.client.rpc('void_invoice', voiding)).error?.code).toBe('42501');
    const voided = await a.client.rpc('void_invoice', voiding);
    expect(voided.error).toBeNull();
    expect(voided.data?.status).toBe('void');
    expect(voided.data?.balance_due).toBe(0);
    expect((await admin.from('invoices').select('id').eq('id', invoice.id)).data).toHaveLength(1);
    expect((await staff.client.rpc('record_payment', pay(invoice.id, 1))).error?.message).toBe(
      'invoice_void',
    );
  });

  it('confirms and rejects member UPI claims once, inside the gym only', async () => {
    const { invoice } = await invoiced('Billing Test Claims');
    const firstUtr = utr();
    const claimArgs = { p_invoice_id: invoice.id, p_amount: 300, p_utr: firstUtr };
    expect((await a.client.rpc('submit_payment_claim', claimArgs)).error).not.toBeNull();
    const claim = await admin.rpc('submit_payment_claim', { ...claimArgs, p_note: 'Paid by GPay' });
    expect(claim.error).toBeNull();
    expect((await admin.rpc('submit_payment_claim', claimArgs)).error?.message).toBe(
      'duplicate_utr',
    );
    expect(
      (await b.client.from('payment_claims').select('id').eq('id', claim.data!.id)).data,
    ).toEqual([]);
    expect(
      (await b.client.rpc('confirm_payment_claim', { p_claim_id: claim.data!.id })).error?.code,
    ).toBe('42501');

    const confirmed = await staff.client.rpc('confirm_payment_claim', {
      p_claim_id: claim.data!.id,
    });
    expect(confirmed.error).toBeNull();
    expect(confirmed.data?.status).toBe('confirmed');
    const payment = await admin
      .from('payments')
      .select('amount,method,utr')
      .eq('id', confirmed.data!.payment_id!)
      .single();
    expect(payment.data).toEqual({ amount: 300, method: 'upi', utr: firstUtr });
    expect(
      (await staff.client.rpc('confirm_payment_claim', { p_claim_id: claim.data!.id })).error
        ?.message,
    ).toBe('claim_not_pending');

    const second = await admin.rpc('submit_payment_claim', {
      p_invoice_id: invoice.id,
      p_amount: 200,
      p_utr: utr(),
    });
    expect(second.error).toBeNull();
    const reject = { p_claim_id: second.data!.id, p_reason: 'No such credit in the bank' };
    expect((await b.client.rpc('reject_payment_claim', reject)).error?.code).toBe('42501');
    expect(
      (await staff.client.rpc('reject_payment_claim', { ...reject, p_reason: ' ' })).error?.message,
    ).toBe('reason_required');
    const rejected = await staff.client.rpc('reject_payment_claim', reject);
    expect(rejected.error).toBeNull();
    expect(rejected.data?.status).toBe('rejected');
    expect(await invoiceState(invoice.id)).toEqual({
      status: 'partially_paid',
      amount_paid: 300,
      balance_due: 700,
    });

    const counterUtr = utr();
    const third = await admin.rpc('submit_payment_claim', {
      p_invoice_id: invoice.id,
      p_amount: 200,
      p_utr: counterUtr,
    });
    expect(third.error).toBeNull();
    const counter = await staff.client.rpc(
      'record_payment',
      pay(invoice.id, 200, { p_method: 'upi', p_utr: counterUtr }),
    );
    expect(counter.error).toBeNull();
    const matched = await admin
      .from('payment_claims')
      .select('status,payment_id')
      .eq('id', third.data!.id)
      .single();
    expect(matched.data).toEqual({ status: 'confirmed', payment_id: counter.data!.id });
    expect(
      (
        await admin.rpc('submit_payment_claim', {
          p_invoice_id: invoice.id,
          p_amount: 1,
          p_utr: utr(),
        })
      ).error?.message,
    ).toBe('claim_limit_reached');
  });

  it('saves one live Cashfree link per invoice and takes gateway money only from the server', async () => {
    const { invoice, memberId } = await invoiced('Billing Test Gateway');
    const saveArgs = link(invoice.id);
    for (const extra of [
      { p_url: 'http://payments-test.cashfree.com/links/rls' },
      { p_link_id: 'bad link id' },
      { p_expires_at: new Date(Date.now() - 1000).toISOString() },
    ]) {
      const result = await staff.client.rpc('save_gateway_link', { ...saveArgs, ...extra });
      expect(result.error?.message).toBe('invalid_input');
    }
    expect(
      (await staff.client.rpc('save_gateway_link', { ...saveArgs, p_amount: 1000.01 })).error
        ?.message,
    ).toBe('invalid_amount');
    expect((await b.client.rpc('save_gateway_link', saveArgs)).error?.code).toBe('42501');
    expect(
      (await b.client.rpc('save_gateway_link', { ...saveArgs, p_org: b.orgId })).error?.message,
    ).toBe('invoice_not_found');
    const saved = await staff.client.rpc('save_gateway_link', saveArgs);
    expect(saved.error).toBeNull();
    const retry = await staff.client.rpc('save_gateway_link', saveArgs);
    expect(retry.data?.id).toBe(saved.data?.id);
    expect(
      (await staff.client.rpc('save_gateway_link', { ...saveArgs, p_link_id: 'other_link' })).error
        ?.message,
    ).toBe('request_conflict');
    expect((await staff.client.rpc('save_gateway_link', link(invoice.id))).error?.message).toBe(
      'gateway_link_open',
    );
    const forgedUpdate = await a.client
      .from('collection_requests')
      .update({ status: 'paid' })
      .eq('id', saved.data!.id)
      .select('id');
    expect(forgedUpdate.data ?? []).toEqual([]);
    const forgedInsert = await a.client.from('collection_requests').insert({
      org_id: a.orgId,
      invoice_id: invoice.id,
      member_id: memberId,
      provider: 'upi_direct',
      amount: 1,
      upi_uri: 'upi://pay?pa=rlsa@okaxis',
      expires_at: inOneHour(),
    });
    expect(forgedInsert.error?.code).toBe('42501');

    const gateway = {
      p_org: a.orgId,
      p_collection_request_id: saved.data!.id,
      p_gateway_payment_id: `cf_${run}_1`,
      p_amount: 1000,
      p_paid_at: new Date().toISOString(),
      p_reference: 'Cashfree payment link',
    };
    expect((await a.client.rpc('record_gateway_payment', gateway)).error).not.toBeNull();
    expect((await staff.client.rpc('record_gateway_payment', gateway)).error).not.toBeNull();
    expect(
      (
        await admin.rpc('record_gateway_payment', {
          ...gateway,
          p_org: b.orgId,
          p_gateway_payment_id: `cf_${run}_x`,
        })
      ).error?.message,
    ).toBe('collection_request_not_found');
    const recorded = await admin.rpc('record_gateway_payment', gateway);
    expect(recorded.error).toBeNull();
    expect(recorded.data?.method).toBe('cashfree');
    expect((await admin.rpc('record_gateway_payment', gateway)).data?.id).toBe(recorded.data?.id);
    expect(
      (await admin.from('payments').select('id').eq('invoice_id', invoice.id)).data,
    ).toHaveLength(1);
    const request = await admin
      .from('collection_requests')
      .select('status,confirmed_payment_id')
      .eq('id', saved.data!.id)
      .single();
    expect(request.data).toEqual({ status: 'paid', confirmed_payment_id: recorded.data!.id });
    expect((await invoiceState(invoice.id))?.status).toBe('paid');

    const close = { p_org: a.orgId, p_request_id: saved.data!.id, p_status: 'cancelled' as const };
    expect((await b.client.rpc('close_gateway_link', close)).error?.code).toBe('42501');
    expect(
      (await b.client.rpc('close_gateway_link', { ...close, p_org: b.orgId })).error?.message,
    ).toBe('collection_request_not_found');
    expect(
      (await staff.client.rpc('close_gateway_link', { ...close, p_status: 'paid' })).error?.message,
    ).toBe('invalid_input');
    const closed = await staff.client.rpc('close_gateway_link', close);
    expect(closed.error).toBeNull();
    expect(closed.data?.status).toBe('paid');
    expect((await a.client.from('gateway_events').select('id')).data ?? []).toEqual([]);
  });

  it('lets a cancelled or lapsed link be replaced', async () => {
    const { invoice } = await invoiced('Billing Test Replace');
    const first = await staff.client.rpc('save_gateway_link', link(invoice.id));
    expect(first.error).toBeNull();
    const cancelled = await staff.client.rpc('close_gateway_link', {
      p_org: a.orgId,
      p_request_id: first.data!.id,
      p_status: 'cancelled',
    });
    expect(cancelled.data?.status).toBe('cancelled');
    const second = await staff.client.rpc('save_gateway_link', link(invoice.id));
    expect(second.error).toBeNull();
    const lapse = await admin
      .from('collection_requests')
      .update({ expires_at: new Date(Date.now() - 1000).toISOString() })
      .eq('id', second.data!.id);
    expect(lapse.error).toBeNull();
    const third = await staff.client.rpc('save_gateway_link', link(invoice.id));
    expect(third.error).toBeNull();
    const lapsed = await admin
      .from('collection_requests')
      .select('status')
      .eq('id', second.data!.id)
      .single();
    expect(lapsed.data?.status).toBe('expired');
    const closed = await staff.client.rpc('close_gateway_link', {
      p_org: a.orgId,
      p_request_id: third.data!.id,
      p_status: 'expired',
    });
    expect(closed.data?.status).toBe('expired');
  });

  it('limits payment settings and Cashfree credentials to owners and managers', async () => {
    const settings = {
      p_org: a.orgId,
      p_upi_vpa: 'rlsa@okaxis',
      p_upi_payee_name: 'RLS a',
      p_default_mode: 'upi_direct' as const,
    };
    expect((await staff.client.rpc('update_payment_settings', settings)).error?.code).toBe('42501');
    expect((await b.client.rpc('update_payment_settings', settings)).error?.code).toBe('42501');
    expect(
      (await a.client.rpc('update_payment_settings', { ...settings, p_upi_vpa: '' })).error
        ?.message,
    ).toBe('invalid_input');
    expect(
      (await a.client.rpc('update_payment_settings', { ...settings, p_default_mode: 'cashfree' }))
        .error?.message,
    ).toBe('cashfree_not_configured');

    const credentials = {
      p_org: a.orgId,
      p_app_id: 'TEST1234RLS',
      p_secret_enc: 'v1.rls-ciphertext',
      p_environment: 'sandbox',
    };
    expect((await staff.client.rpc('save_cashfree_credentials', credentials)).error?.code).toBe(
      '42501',
    );
    expect((await b.client.rpc('save_cashfree_credentials', credentials)).error?.code).toBe(
      '42501',
    );
    expect(
      (await a.client.rpc('save_cashfree_credentials', { ...credentials, p_secret_enc: 'plain' }))
        .error?.message,
    ).toBe('invalid_input');
    expect((await a.client.rpc('save_cashfree_credentials', credentials)).error).toBeNull();
    expect((await staff.client.from('organization_secrets').select('org_id')).data ?? []).toEqual(
      [],
    );
    expect(
      (await b.client.from('organization_secrets').select('org_id').eq('org_id', a.orgId)).data ??
        [],
    ).toEqual([]);
    const forged = await a.client
      .from('organization_secrets')
      .update({ cashfree_app_id: 'FORGED1234' })
      .eq('org_id', a.orgId)
      .select('org_id');
    expect(forged.data ?? []).toEqual([]);
    const secrets = await admin
      .from('organization_secrets')
      .select('cashfree_app_id,cashfree_environment')
      .eq('org_id', a.orgId)
      .single();
    expect(secrets.data).toEqual({
      cashfree_app_id: 'TEST1234RLS',
      cashfree_environment: 'sandbox',
    });
    const audit = await admin
      .from('audit_logs')
      .select('after')
      .eq('org_id', a.orgId)
      .eq('action', 'organization.secrets_updated');
    expect(JSON.stringify(audit.data)).not.toContain('rls-ciphertext');
    expect(audit.data?.length).toBeGreaterThan(0);

    expect(
      (await a.client.rpc('update_payment_settings', { ...settings, p_default_mode: 'cashfree' }))
        .error,
    ).toBeNull();
    const { invoice } = await invoiced('Billing Test Settings');
    const open = await staff.client.rpc('save_gateway_link', link(invoice.id));
    expect(open.error).toBeNull();
    expect(
      (await staff.client.rpc('remove_cashfree_credentials', { p_org: a.orgId })).error?.code,
    ).toBe('42501');
    expect(
      (await a.client.rpc('remove_cashfree_credentials', { p_org: a.orgId })).error?.message,
    ).toBe('gateway_links_pending');
    expect(
      (
        await staff.client.rpc('close_gateway_link', {
          p_org: a.orgId,
          p_request_id: open.data!.id,
          p_status: 'cancelled',
        })
      ).error,
    ).toBeNull();
    expect(
      (await a.client.rpc('remove_cashfree_credentials', { p_org: a.orgId })).error,
    ).toBeNull();
    const org = await admin
      .from('organizations')
      .select('default_collection_mode')
      .eq('id', a.orgId)
      .single();
    expect(org.data?.default_collection_mode).toBe('upi_direct');
    const cleared = await admin
      .from('organization_secrets')
      .select('cashfree_app_id,cashfree_secret_key_enc')
      .eq('org_id', a.orgId)
      .single();
    expect(cleared.data).toEqual({ cashfree_app_id: null, cashfree_secret_key_enc: null });
  });

  it('lets a collector leave the team while their payments stay unchanged', async () => {
    const leaver = await signedInClient(`rls-m2-leaver-${run}@example.test`, 'Passw0rd!rls');
    const team = await admin
      .from('team_members')
      .insert({ org_id: a.orgId, user_id: leaver.userId, role: 'staff' })
      .select('id')
      .single();
    expect(team.error).toBeNull();
    const { invoice } = await invoiced('Billing Test Leaver');
    const paid = await leaver.client.rpc('record_payment', pay(invoice.id, 250));
    expect(paid.error).toBeNull();
    expect(paid.data?.collected_by).toBe(team.data!.id);
    const tamper = await admin.from('payments').update({ amount: 1 }).eq('id', paid.data!.id);
    expect(tamper.error?.message).toContain('immutable');

    expect((await admin.auth.admin.deleteUser(leaver.userId)).error).toBeNull();
    const kept = await admin
      .from('payments')
      .select('amount,collected_by')
      .eq('id', paid.data!.id)
      .single();
    expect(kept.data).toEqual({ amount: 250, collected_by: null });
    expect((await invoiceState(invoice.id))?.balance_due).toBe(750);
  });
  it('lists dues for the signed-in gym only, claims first and deleted members hidden', async () => {
    const fresh = await invoiced('Dues Test Fresh');
    const claimed = await invoiced('Dues Test Claimed');
    expect(
      (
        await admin.rpc('submit_payment_claim', {
          p_invoice_id: claimed.invoice.id,
          p_amount: 100,
          p_utr: utr(),
        })
      ).error,
    ).toBeNull();
    const gone = await invoiced('Dues Test Deleted');
    expect(
      (await a.client.rpc('soft_delete_member', { p_member_id: gone.memberId })).error,
    ).toBeNull();
    await invoiced('Dues Test Foreign', b, foreignPlanId);

    const schema = z.object({
      total: z.number(),
      summary: z.object({ outstanding: z.number(), all: z.number(), claims_count: z.number() }),
      rows: z.array(z.object({ id: z.string(), pending_claims: z.number() })),
    });
    const result = await staff.client.rpc('list_dues', { p_org: a.orgId, p_search: 'Dues Test' });
    expect(result.error).toBeNull();
    const parsed = schema.parse(result.data);
    expect(parsed.total).toBe(2);
    expect(parsed.rows.map((row) => row.id)).toEqual([claimed.invoice.id, fresh.invoice.id]);
    expect(parsed.summary).toEqual({ outstanding: 2000, all: 2, claims_count: 1 });

    const claims = await staff.client.rpc('list_dues', {
      p_org: a.orgId,
      p_search: 'Dues Test',
      p_filter: 'claims',
    });
    expect(schema.parse(claims.data).rows.map((row) => row.id)).toEqual([claimed.invoice.id]);
    const byNumber = await staff.client.rpc('list_dues', {
      p_org: a.orgId,
      p_search: fresh.invoice.invoice_number,
    });
    expect(schema.parse(byNumber.data).rows.map((row) => row.id)).toEqual([fresh.invoice.id]);
    expect((await a.client.rpc('list_dues', { p_org: b.orgId })).error?.code).toBe('42501');
    expect(
      (await staff.client.rpc('list_dues', { p_org: a.orgId, p_filter: 'everything' })).error
        ?.message,
    ).toBe('invalid_input');
  });

  it('does not expose billing functions to anonymous users', async () => {
    const anon = createClient<Database>(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false },
    });
    const invoiceId = randomUUID();
    expect((await anon.rpc('list_dues', { p_org: a.orgId })).error).not.toBeNull();
    expect((await anon.rpc('record_payment', pay(invoiceId, 1))).error).not.toBeNull();
    expect((await anon.rpc('save_gateway_link', link(invoiceId))).error).not.toBeNull();
    expect(
      (
        await anon.rpc('submit_payment_claim', {
          p_invoice_id: invoiceId,
          p_amount: 1,
          p_utr: utr(),
        })
      ).error,
    ).not.toBeNull();
    expect((await anon.from('collection_requests').select('id')).error).not.toBeNull();
  });
});

describe('M3 attendance, kiosk devices and member QR codes', () => {
  type Outcome = { result: string; pin_error?: string; overridden?: boolean };
  const PIN = '4826';
  let staff: { client: Client; userId: string };
  let planId: string;
  let nextPhone = 30000000;
  const today = todayIST();
  const tokenHash = () => randomUUID().replace(/-/g, '').repeat(2);

  /** A member with a live membership, or none at all (which counts as expired). */
  async function member(name: string, active: boolean) {
    const id = randomUUID();
    const created = await a.client.rpc('create_member', {
      p_org: a.orgId,
      p_member_id: id,
      p_data: { full_name: name, phone: `+9195${++nextPhone}`, consent_messaging: false },
      ...(active ? { p_membership: { plan_id: planId, start_date: today } } : {}),
    });
    expect(created.error).toBeNull();
    return id;
  }
  async function checkIn(
    client: Client,
    memberId: string,
    extra: { p_override?: boolean; p_pin?: string } = {},
  ) {
    const result = await client.rpc('check_in_member', { p_member_id: memberId, ...extra });
    expect(result.error).toBeNull();
    return result.data as Outcome;
  }
  async function checkInCount(memberId: string) {
    const rows = await admin.from('check_ins').select('id').eq('member_id', memberId);
    expect(rows.error).toBeNull();
    return rows.data!.length;
  }

  beforeAll(async () => {
    staff = await signedInClient(`rls-m3-staff-${run}@example.test`, 'Passw0rd!rls');
    const team = await admin
      .from('team_members')
      .insert({ org_id: a.orgId, user_id: staff.userId, role: 'staff' });
    expect(team.error).toBeNull();
    const plan = await a.client.rpc('save_plan', {
      p_org: a.orgId,
      p_data: {
        name: 'M3 Monthly',
        type: 'duration',
        duration_days: 30,
        price: 1000,
        is_active: true,
      },
    });
    expect(plan.error).toBeNull();
    planId = plan.data!;
    expect((await a.client.rpc('set_kiosk_pin', { p_org: a.orgId, p_pin: PIN })).error).toBeNull();
    const settings = await a.client.rpc('save_attendance_settings', {
      p_org: a.orgId,
      p_block_expired: true,
    });
    expect(settings.error).toBeNull();
  });
  afterAll(async () => {
    if (staff) expect((await admin.auth.admin.deleteUser(staff.userId)).error).toBeNull();
  });

  it('keeps the PIN hash out of reach and closes direct check-in writes', async () => {
    const column = await a.client.from('organizations').select('kiosk_pin_hash' as 'id');
    expect(column.error).not.toBeNull();
    for (const client of [a.client, staff.client]) {
      const hidden = await client.from('organization_kiosk').select('*');
      expect(hidden.data ?? []).toEqual([]);
    }
    const stored = await admin.from('organization_kiosk').select('pin_hash').eq('org_id', a.orgId);
    expect(stored.data?.[0]?.pin_hash).toMatch(/^\$2[aby]\$/);
    const id = await member('M3 Direct', true);
    for (const client of [a.client, staff.client]) {
      const direct = await client
        .from('check_ins')
        .insert({ org_id: a.orgId, member_id: id, method: 'manual' });
      expect(direct.error?.code).toBe('42501');
    }
    expect(await checkInCount(id)).toBe(0);
  });

  it('checks in once per five minutes and refuses another gym', async () => {
    const id = await member('M3 Active', true);
    expect((await checkIn(staff.client, id)).result).toBe('checked_in');
    expect((await checkIn(staff.client, id)).result).toBe('duplicate');
    expect(await checkInCount(id)).toBe(1);
    const cross = await a.client.rpc('check_in_member', { p_member_id: b.memberId });
    expect(cross.error?.message).toBe('member_not_found');
    const crossStaff = await staff.client.rpc('check_in_member', { p_member_id: b.memberId });
    expect(crossStaff.error?.message).toBe('member_not_found');
    expect(await checkInCount(b.memberId)).toBe(0);
  });

  it('lets owners override a block, but staff only with the right kiosk PIN', async () => {
    const forOwner = await member('M3 Expired Owner', false);
    expect(await checkIn(a.client, forOwner)).toMatchObject({ result: 'blocked' });
    expect(await checkIn(a.client, forOwner, { p_override: true })).toMatchObject({
      result: 'checked_in',
      overridden: true,
    });

    const forStaff = await member('M3 Expired Staff', false);
    const plain = await checkIn(staff.client, forStaff);
    expect(plain.result).toBe('blocked');
    expect(plain.pin_error).toBeUndefined();
    expect(await checkIn(staff.client, forStaff, { p_override: true })).toMatchObject({
      result: 'blocked',
      pin_error: 'pin_required',
    });
    expect(
      await checkIn(staff.client, forStaff, { p_override: true, p_pin: '0000' }),
    ).toMatchObject({ result: 'blocked', pin_error: 'invalid' });
    expect(await checkInCount(forStaff)).toBe(0);
    expect(await checkIn(staff.client, forStaff, { p_override: true, p_pin: PIN })).toMatchObject({
      result: 'checked_in',
      overridden: true,
    });
    const audit = await admin
      .from('audit_logs')
      .select('id')
      .eq('org_id', a.orgId)
      .eq('action', 'check_in.override');
    expect(audit.data?.length).toBeGreaterThanOrEqual(2);
  });

  it('locks the PIN after five wrong tries, even for the right PIN', async () => {
    const id = await member('M3 Lockout', false);
    const tries: string[] = [];
    for (let i = 0; i < 5; i++) {
      tries.push((await checkIn(staff.client, id, { p_override: true, p_pin: '1111' })).pin_error!);
    }
    expect(tries).toEqual(['invalid', 'invalid', 'invalid', 'invalid', 'locked']);
    expect(await checkIn(staff.client, id, { p_override: true, p_pin: PIN })).toMatchObject({
      result: 'blocked',
      pin_error: 'locked',
    });
    const status = await a.client.rpc('kiosk_pin_status', { p_org: a.orgId });
    expect(status.error).toBeNull();
    expect((status.data as { locked_until: string | null }).locked_until).not.toBeNull();
    // Saving the PIN again is how an owner clears a lockout.
    expect((await a.client.rpc('set_kiosk_pin', { p_org: a.orgId, p_pin: PIN })).error).toBeNull();
    expect(await checkIn(staff.client, id, { p_override: true, p_pin: PIN })).toMatchObject({
      result: 'checked_in',
    });
  });

  it('limits attendance settings and kiosk pairing to owners and managers', async () => {
    for (const call of [
      staff.client.rpc('set_kiosk_pin', { p_org: a.orgId, p_pin: '9999' }),
      staff.client.rpc('save_attendance_settings', { p_org: a.orgId, p_block_expired: false }),
      staff.client.rpc('kiosk_pin_status', { p_org: a.orgId }),
      staff.client.rpc('create_kiosk_device', {
        p_org: a.orgId,
        p_label: 'Staff tablet',
        p_token_hash: tokenHash(),
      }),
      a.client.rpc('set_kiosk_pin', { p_org: b.orgId, p_pin: '9999' }),
      a.client.rpc('save_attendance_settings', { p_org: b.orgId, p_block_expired: false }),
    ]) {
      expect((await call).error?.code).toBe('42501');
    }
    const noPin = await b.client.rpc('create_kiosk_device', {
      p_org: b.orgId,
      p_label: 'Front desk',
      p_token_hash: tokenHash(),
    });
    expect(noPin.error?.message).toBe('kiosk_pin_required');
    const settings = await admin
      .from('organizations')
      .select('settings')
      .eq('id', a.orgId)
      .single();
    expect(
      (settings.data?.settings as { block_expired_checkin?: boolean }).block_expired_checkin,
    ).toBe(true);
  });

  it('runs paired kiosks through service-role functions only', async () => {
    const paired = await a.client.rpc('create_kiosk_device', {
      p_org: a.orgId,
      p_label: 'Front desk',
      p_token_hash: tokenHash(),
    });
    expect(paired.error).toBeNull();
    const deviceId = paired.data!.id;

    expect(
      (await a.client.from('kiosk_devices').select('id').eq('id', deviceId)).data,
    ).toHaveLength(1);
    expect((await staff.client.from('kiosk_devices').select('id')).data).toEqual([]);
    expect((await b.client.from('kiosk_devices').select('id').eq('id', deviceId)).data).toEqual([]);
    const direct = await a.client
      .from('kiosk_devices')
      .insert({ org_id: a.orgId, label: 'Forged', token_hash: tokenHash() });
    expect(direct.error?.code).toBe('42501');

    const active = await member('M3 Kiosk', true);
    for (const client of [a.client, staff.client]) {
      const call = await client.rpc('kiosk_check_in', {
        p_device_id: deviceId,
        p_member_id: active,
      });
      expect(call.error).not.toBeNull();
      expect(
        (await client.rpc('kiosk_exit', { p_device_id: deviceId, p_pin: PIN })).error,
      ).not.toBeNull();
    }
    const ok = await admin.rpc('kiosk_check_in', { p_device_id: deviceId, p_member_id: active });
    expect(ok.error).toBeNull();
    expect((ok.data as Outcome).result).toBe('checked_in');
    const row = await admin
      .from('check_ins')
      .select('kiosk_device_id,method')
      .eq('member_id', active);
    expect(row.data).toEqual([{ kiosk_device_id: deviceId, method: 'qr' }]);
    const foreign = await admin.rpc('kiosk_check_in', {
      p_device_id: deviceId,
      p_member_id: b.memberId,
    });
    expect(foreign.error?.message).toBe('member_not_found');

    const expired = await member('M3 Kiosk Expired', false);
    const kioskBlocked = await admin.rpc('kiosk_check_in', {
      p_device_id: deviceId,
      p_member_id: expired,
    });
    expect((kioskBlocked.data as Outcome).result).toBe('blocked');
    const kioskLetIn = await admin.rpc('kiosk_check_in', {
      p_device_id: deviceId,
      p_member_id: expired,
      p_pin: PIN,
    });
    expect(kioskLetIn.data as Outcome).toMatchObject({ result: 'checked_in', overridden: true });

    const wrong = await admin.rpc('kiosk_exit', { p_device_id: deviceId, p_pin: '0000' });
    expect(wrong.data).toBe('invalid');
    const exit = await admin.rpc('kiosk_exit', { p_device_id: deviceId, p_pin: PIN });
    expect(exit.data).toBe('ok');
    const after = await admin.rpc('kiosk_check_in', { p_device_id: deviceId, p_member_id: active });
    expect(after.error?.message).toBe('kiosk_not_paired');
  });

  it('turns off every kiosk when the PIN is removed', async () => {
    const devices = await Promise.all(
      ['One', 'Two'].map((label) =>
        a.client.rpc('create_kiosk_device', {
          p_org: a.orgId,
          p_label: label,
          p_token_hash: tokenHash(),
        }),
      ),
    );
    for (const device of devices) expect(device.error).toBeNull();
    const revoked = await a.client.rpc('revoke_kiosk_device', {
      p_device_id: devices[0]!.data!.id,
    });
    expect(revoked.error).toBeNull();
    const crossRevoke = await b.client.rpc('revoke_kiosk_device', {
      p_device_id: devices[1]!.data!.id,
    });
    expect(crossRevoke.error?.message).toBe('kiosk_device_not_found');

    expect(
      (await a.client.rpc('set_kiosk_pin', { p_org: a.orgId, p_pin: null as unknown as string }))
        .error,
    ).toBeNull();
    const live = await admin
      .from('kiosk_devices')
      .select('id')
      .eq('org_id', a.orgId)
      .is('revoked_at', null);
    expect(live.data).toEqual([]);
    const status = await a.client.rpc('kiosk_pin_status', { p_org: a.orgId });
    expect((status.data as { pin_set: boolean }).pin_set).toBe(false);
    expect((await a.client.rpc('set_kiosk_pin', { p_org: a.orgId, p_pin: PIN })).error).toBeNull();
  });

  it('issues a new member QR version inside the gym only', async () => {
    const id = await member('M3 QR', true);
    const reset = await staff.client.rpc('reset_member_qr', { p_member_id: id });
    expect(reset.error).toBeNull();
    expect(reset.data).toBe(2);
    const stored = await admin.from('members').select('qr_version').eq('id', id).single();
    expect(stored.data?.qr_version).toBe(2);
    const cross = await a.client.rpc('reset_member_qr', { p_member_id: b.memberId });
    expect(cross.error?.message).toBe('member_not_found');
    const foreign = await admin.from('members').select('qr_version').eq('id', b.memberId).single();
    expect(foreign.data?.qr_version).toBe(1);
  });

  it('does not expose attendance functions to anonymous users', async () => {
    const anon = createClient<Database>(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false },
    });
    const memberId = randomUUID();
    const calls = [
      anon.rpc('check_in_member', { p_member_id: memberId }),
      anon.rpc('kiosk_check_in', { p_device_id: randomUUID(), p_member_id: memberId }),
      anon.rpc('kiosk_exit', { p_device_id: randomUUID(), p_pin: PIN }),
      anon.rpc('kiosk_pin_status', { p_org: a.orgId }),
      anon.rpc('reset_member_qr', { p_member_id: memberId }),
    ];
    for (const call of calls) expect((await call).error).not.toBeNull();
    expect((await anon.from('kiosk_devices').select('id')).error).not.toBeNull();
    expect((await anon.from('check_ins').select('id')).error).not.toBeNull();
  });
});

describe('M4 messages, templates and WhatsApp settings', () => {
  type PrepareArgs = Database['public']['Functions']['prepare_message']['Args'];
  type MessagingSettings = {
    reminder_days_before: number[];
    expired_reminder_days_after: number[];
    dues_reminder_days_after: number[];
    default_language: 'en' | 'hi';
    messaging_provider: 'manual' | 'whatsapp_api';
    message_kinds: Record<string, boolean>;
  };
  let staff: { client: Client; userId: string };
  let planId: string;
  let shortPlanId: string;
  let nextPhone = 40000000;
  const today = todayIST();
  const baseSettings: MessagingSettings = {
    reminder_days_before: [7, 3, 0],
    expired_reminder_days_after: [1],
    dues_reminder_days_after: [3, 7],
    default_language: 'en',
    messaging_provider: 'manual',
    message_kinds: {},
  };

  async function member(
    name: string,
    options: { consent?: boolean; plan?: string; dob?: string; language?: 'en' | 'hi' } = {},
  ) {
    const id = randomUUID();
    const created = await a.client.rpc('create_member', {
      p_org: a.orgId,
      p_member_id: id,
      p_data: {
        full_name: name,
        phone: `+9194${++nextPhone}`,
        consent_messaging: options.consent ?? true,
        ...(options.dob ? { dob: options.dob } : {}),
        ...(options.language ? { preferred_language: options.language } : {}),
      },
      ...(options.plan ? { p_membership: { plan_id: options.plan, start_date: today } } : {}),
    });
    expect(created.error).toBeNull();
    return id;
  }
  function welcome(memberId: string, extra: Partial<PrepareArgs> = {}): PrepareArgs {
    return {
      p_org: a.orgId,
      p_member_id: memberId,
      p_kind: 'welcome',
      p_language: 'en',
      p_body: 'Welcome to the gym!',
      ...extra,
    };
  }
  async function prepared(memberId: string) {
    const result = await staff.client.rpc('prepare_message', welcome(memberId));
    expect(result.error).toBeNull();
    return result.data!;
  }
  async function stored(id: string) {
    const row = await admin.from('message_logs').select('*').eq('id', id).single();
    expect(row.error).toBeNull();
    return row.data!;
  }
  async function saveSettings(client: Client, changes: Partial<MessagingSettings> = {}) {
    return client.rpc('save_messaging_settings', {
      p_org: a.orgId,
      p_settings: { ...baseSettings, ...changes },
    });
  }

  beforeAll(async () => {
    staff = await signedInClient(`rls-m4-staff-${run}@example.test`, 'Passw0rd!rls');
    const team = await admin
      .from('team_members')
      .insert({ org_id: a.orgId, user_id: staff.userId, role: 'staff' });
    expect(team.error).toBeNull();
    const plans = await Promise.all(
      [30, 8].map((days) =>
        a.client.rpc('save_plan', {
          p_org: a.orgId,
          p_data: {
            name: `M4 ${days} days`,
            type: 'duration',
            duration_days: days,
            price: 1000,
            is_active: true,
          },
        }),
      ),
    );
    for (const plan of plans) expect(plan.error).toBeNull();
    planId = plans[0]!.data!;
    shortPlanId = plans[1]!.data!;
  });
  afterAll(async () => {
    if (staff) expect((await admin.auth.admin.deleteUser(staff.userId)).error).toBeNull();
  });

  it('prepares one welcome and one receipt per payment, for consenting members of the gym only', async () => {
    const id = await member('M4 Welcome', { plan: planId });
    const first = await prepared(id);
    expect(first).toMatchObject({ status: 'prepared', channel: 'whatsapp_manual' });
    expect((await prepared(id)).id).toBe(first.id);

    const silent = await member('M4 No Consent', { consent: false });
    const refused = await staff.client.rpc('prepare_message', welcome(silent));
    expect(refused.error?.message).toBe('messaging_consent_missing');

    const crossMember = await a.client.rpc('prepare_message', welcome(b.memberId));
    expect(crossMember.error?.message).toBe('member_not_found');
    const crossOrg = await a.client.rpc('prepare_message', welcome(b.memberId, { p_org: b.orgId }));
    expect(crossOrg.error?.code).toBe('42501');
    const reminder = await staff.client.rpc(
      'prepare_message',
      welcome(id, { p_kind: 'membership_expiring', p_reminder_date: today }),
    );
    expect(reminder.error?.code).toBe('42501');

    const invoice = await admin.from('invoices').select('id').eq('member_id', id).single();
    expect(invoice.error).toBeNull();
    const payment = await staff.client.rpc('record_payment', {
      p_org: a.orgId,
      p_invoice_id: invoice.data!.id,
      p_request_id: randomUUID(),
      p_amount: 400,
      p_method: 'cash',
    });
    expect(payment.error).toBeNull();
    const receipt = welcome(id, {
      p_kind: 'payment_receipt',
      p_payment_id: payment.data!.id,
      p_invoice_id: invoice.data!.id,
      p_body: 'Received ₹400.',
    });
    const r1 = await staff.client.rpc('prepare_message', receipt);
    expect(r1.error).toBeNull();
    const r2 = await staff.client.rpc('prepare_message', receipt);
    expect(r2.data?.id).toBe(r1.data?.id);
    const other = await member('M4 Other');
    const wrongPayment = await staff.client.rpc('prepare_message', {
      ...receipt,
      p_member_id: other,
      p_invoice_id: null as unknown as string,
    });
    expect(wrongPayment.error?.message).toBe('payment_not_found');

    const direct = await staff.client.from('message_logs').insert({
      org_id: a.orgId,
      member_id: id,
      channel: 'whatsapp_manual',
      template_key: 'birthday',
      body: 'Forged',
      reminder_date: today,
    });
    expect(direct.error?.code).toBe('42501');
    const update = await a.client
      .from('message_logs')
      .update({ status: 'sent' })
      .eq('id', first.id)
      .select('id');
    expect(update.data ?? []).toEqual([]);
    expect((await stored(first.id)).status).toBe('prepared');
    const foreign = await b.client.from('message_logs').select('id').eq('org_id', a.orgId);
    expect(foreign.data ?? []).toEqual([]);
  });

  it('marks, skips and claims WhatsApp API sends exactly once', async () => {
    const sentId = (await prepared(await member('M4 Mark'))).id;
    const marked = await staff.client.rpc('mark_message_sent', { p_message_id: sentId });
    expect(marked.error).toBeNull();
    expect(marked.data).toMatchObject({ status: 'sent', channel: 'whatsapp_manual' });
    expect(marked.data?.sent_by).not.toBeNull();
    const late = await staff.client.rpc('skip_message', { p_message_id: sentId });
    expect(late.error?.message).toBe('message_not_pending');

    const skipId = (await prepared(await member('M4 Skip'))).id;
    expect((await staff.client.rpc('skip_message', { p_message_id: skipId })).data?.status).toBe(
      'skipped',
    );
    expect((await staff.client.rpc('skip_message', { p_message_id: skipId })).error).toBeNull();
    const foreign = await b.client.rpc('mark_message_sent', { p_message_id: skipId });
    expect(foreign.error?.message).toBe('message_not_found');

    const apiId = (await prepared(await member('M4 Api'))).id;
    for (const client of [a.client, staff.client]) {
      expect((await client.rpc('begin_api_send', { p_message_id: apiId })).error).not.toBeNull();
      const forged = await client.rpc('record_message_result', {
        p_message_id: apiId,
        p_provider_message_id: 'wamid.forged',
        p_error: '',
      });
      expect(forged.error).not.toBeNull();
    }
    expect((await admin.rpc('begin_api_send', { p_message_id: apiId })).data).toBe(true);
    expect((await admin.rpc('begin_api_send', { p_message_id: apiId })).data).toBe(false);
    const busy = await staff.client.rpc('mark_message_sent', { p_message_id: apiId });
    expect(busy.error?.message).toBe('message_sending');
    const failed = await admin.rpc('record_message_result', {
      p_message_id: apiId,
      p_provider_message_id: '',
      p_error: 'template_missing',
    });
    expect(failed.data).toMatchObject({ status: 'failed', error: 'template_missing' });
    expect((await admin.rpc('begin_api_send', { p_message_id: apiId })).data).toBe(true);
    const sent = await admin.rpc('record_message_result', {
      p_message_id: apiId,
      p_provider_message_id: 'wamid.test',
      p_error: '',
      p_sent_by: staff.userId,
    });
    expect(sent.data).toMatchObject({
      status: 'sent',
      channel: 'whatsapp_api',
      provider_message_id: 'wamid.test',
      error: null,
      sent_by: null,
    });
    expect((await admin.rpc('begin_api_send', { p_message_id: apiId })).data).toBe(false);
  });

  it('limits messaging settings, templates and WhatsApp credentials to owners and managers', async () => {
    expect((await saveSettings(staff.client)).error?.code).toBe('42501');
    expect((await saveSettings(a.client, { reminder_days_before: [31] })).error?.message).toBe(
      'invalid_input',
    );
    const unknownKey = await a.client.rpc('save_messaging_settings', {
      p_org: a.orgId,
      p_settings: { ...baseSettings, block_expired_checkin: false },
    });
    expect(unknownKey.error?.message).toBe('invalid_input');
    const noApi = await saveSettings(a.client, { messaging_provider: 'whatsapp_api' });
    expect(noApi.error?.message).toBe('whatsapp_not_configured');
    expect((await saveSettings(a.client, { message_kinds: { welcome: false } })).error).toBeNull();
    const disabled = await staff.client.rpc('prepare_message', welcome(await member('M4 Off')));
    expect(disabled.error?.message).toBe('message_kind_disabled');
    expect((await saveSettings(a.client)).error).toBeNull();

    const template = {
      p_org: a.orgId,
      p_kind: 'birthday',
      p_language: 'hi',
      p_body: 'जन्मदिन मुबारक {name}!',
    };
    expect((await staff.client.rpc('save_message_template', template)).error?.code).toBe('42501');
    expect((await a.client.rpc('save_message_template', template)).error).toBeNull();
    const tooLong = await a.client.rpc('save_message_template', {
      ...template,
      p_body: 'x'.repeat(1001),
    });
    expect(tooLong.error?.message).toBe('invalid_input');
    expect(
      (await staff.client.from('message_templates').select('body').eq('org_id', a.orgId)).data,
    ).toEqual([{ body: template.p_body }]);
    expect(
      (await b.client.from('message_templates').select('id').eq('org_id', a.orgId)).data ?? [],
    ).toEqual([]);
    expect(
      (await a.client.rpc('save_message_template', { ...template, p_body: '' })).error,
    ).toBeNull();
    expect((await admin.from('message_templates').select('id').eq('org_id', a.orgId)).data).toEqual(
      [],
    );

    const credentials = {
      p_org: a.orgId,
      p_phone_number_id: '123456789012345',
      p_token_enc: 'v1.aaaa.bbbb.cccc',
      p_display_phone: '+91 98765 43210',
    };
    expect((await staff.client.rpc('save_whatsapp_credentials', credentials)).error?.code).toBe(
      '42501',
    );
    const plain = await a.client.rpc('save_whatsapp_credentials', {
      ...credentials,
      p_token_enc: 'EAAplaintext',
    });
    expect(plain.error?.message).toBe('invalid_input');
    expect((await a.client.rpc('save_whatsapp_credentials', credentials)).error).toBeNull();
    const hidden = await staff.client
      .from('organization_secrets')
      .select('whatsapp_access_token_enc')
      .eq('org_id', a.orgId);
    expect(hidden.data ?? []).toEqual([]);
    expect((await saveSettings(a.client, { messaging_provider: 'whatsapp_api' })).error).toBeNull();
    const apiMessage = await prepared(await member('M4 Channel'));
    expect(apiMessage.channel).toBe('whatsapp_api');

    expect(
      (await staff.client.rpc('remove_whatsapp_credentials', { p_org: a.orgId })).error?.code,
    ).toBe('42501');
    expect(
      (await a.client.rpc('remove_whatsapp_credentials', { p_org: a.orgId })).error,
    ).toBeNull();
    expect((await stored(apiMessage.id)).channel).toBe('whatsapp_manual');
    const org = await admin.from('organizations').select('settings').eq('id', a.orgId).single();
    expect((org.data?.settings as { messaging_provider?: string }).messaging_provider).toBe(
      'manual',
    );
  });

  it('lists daily reminder and birthday candidates once per day, for consenting members only', async () => {
    expect((await saveSettings(a.client, { reminder_days_before: [7] })).error).toBeNull();
    const ending = await member('M4 Ending', { plan: shortPlanId, language: 'hi' });
    const silent = await member('M4 Ending Silent', { plan: shortPlanId, consent: false });
    const birthday = await member('M4 Birthday', { plan: planId, dob: `1992-${today.slice(5)}` });

    for (const client of [a.client, staff.client]) {
      expect(
        (await client.rpc('daily_message_candidates', { p_org: a.orgId })).error,
      ).not.toBeNull();
      expect((await client.rpc('expire_stale_messages')).error).not.toBeNull();
    }
    const listed = await admin.rpc('daily_message_candidates', { p_org: a.orgId });
    expect(listed.error).toBeNull();
    const rows = listed.data ?? [];
    const endingRow = rows.find((row) => row.member_id === ending);
    expect(endingRow).toMatchObject({ kind: 'membership_expiring', lang: 'hi', org_id: a.orgId });
    expect(endingRow?.facts).toMatchObject({ days: 7, end_date: addDays(today, 7) });
    expect(rows.find((row) => row.member_id === silent)).toBeUndefined();
    expect(rows.find((row) => row.member_id === birthday)?.kind).toBe('birthday');
    expect(rows.every((row) => row.org_id === a.orgId)).toBe(true);

    const reminder = await admin.rpc('prepare_message', {
      p_org: a.orgId,
      p_member_id: ending,
      p_kind: 'membership_expiring',
      p_language: 'hi',
      p_body: 'आपकी मेंबरशिप खत्म हो रही है।',
      p_reminder_date: today,
    });
    expect(reminder.error).toBeNull();
    const again = await admin.rpc('daily_message_candidates', { p_org: a.orgId });
    expect(again.data?.find((row) => row.member_id === ending)).toBeUndefined();

    const stale = await admin
      .from('message_logs')
      .insert({
        org_id: a.orgId,
        member_id: birthday,
        channel: 'whatsapp_manual',
        template_key: 'welcome',
        body: 'Old welcome',
        created_at: new Date(Date.now() - 4 * 86_400_000).toISOString(),
      })
      .select('id')
      .single();
    expect(stale.error).toBeNull();
    expect((await admin.rpc('expire_stale_messages')).error).toBeNull();
    expect(await stored(stale.data!.id)).toMatchObject({ status: 'skipped', error: 'expired' });
    expect((await saveSettings(a.client)).error).toBeNull();
  });

  it('does not expose messaging functions or templates to anonymous users', async () => {
    const anon = createClient<Database>(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false },
    });
    const messageId = randomUUID();
    const calls = [
      anon.rpc('prepare_message', welcome(a.memberId)),
      anon.rpc('mark_message_sent', { p_message_id: messageId }),
      anon.rpc('skip_message', { p_message_id: messageId }),
      anon.rpc('begin_api_send', { p_message_id: messageId }),
      anon.rpc('daily_message_candidates', {}),
      anon.rpc('save_messaging_settings', { p_org: a.orgId, p_settings: baseSettings }),
      anon.rpc('remove_whatsapp_credentials', { p_org: a.orgId }),
    ];
    for (const call of calls) expect((await call).error).not.toBeNull();
    expect((await anon.from('message_templates').select('id')).error).not.toBeNull();
    expect((await anon.from('message_logs').select('id')).error).not.toBeNull();
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

describe('M5 expenses and reports', () => {
  let staff: { client: Client; userId: string };
  beforeAll(async () => {
    staff = await signedInClient(`rls-m5-${run}@example.test`, 'Passw0rd!rls');
    const { error } = await admin.from('team_members').insert({
      org_id: a.orgId,
      user_id: staff.userId,
      role: 'staff',
    });
    expect(error).toBeNull();
  });
  afterAll(async () => {
    if (staff) expect((await admin.auth.admin.deleteUser(staff.userId)).error).toBeNull();
  });
  it('restricts writes, records expense audits, and includes expenses in net reporting', async () => {
    const today = todayIST();
    const args = {
      p_org: a.orgId,
      p_id: null as unknown as string,
      p_category: 'rent' as const,
      p_amount: 250,
      p_date: today,
      p_vendor: 'M5 Vendor',
      p_notes: 'Test cost',
    };
    const direct = await a.client.from('expenses').insert({
      org_id: a.orgId,
      category: 'rent',
      amount: 1,
      expense_date: today,
    });
    expect(direct.error).not.toBeNull();
    expect((await staff.client.rpc('save_expense', args)).error?.code).toBe('42501');
    expect((await a.client.rpc('save_expense', { ...args, p_org: b.orgId })).error?.code).toBe(
      '42501',
    );
    const created = await a.client.rpc('save_expense', args);
    expect(created.error).toBeNull();
    const id = created.data!;
    expect((await staff.client.from('expenses').select('id').eq('id', id)).data).toEqual([]);
    expect((await a.client.from('expenses').select('id').eq('id', id)).data).toHaveLength(1);
    const report = await a.client.rpc('report_overview', {
      p_org: a.orgId,
      p_start: today,
      p_end: today,
    });
    expect(report.error).toBeNull();
    const body = report.data as { revenue: number; expenses: number; net: number };
    expect(body.expenses).toBeGreaterThanOrEqual(250);
    expect(body.net).toBeCloseTo(body.revenue - body.expenses);
    expect(
      (await staff.client.rpc('report_overview', { p_org: a.orgId, p_start: today, p_end: today }))
        .error?.code,
    ).toBe('42501');
    expect(
      (await a.client.rpc('report_overview', { p_org: b.orgId, p_start: today, p_end: today }))
        .error?.code,
    ).toBe('42501');
    const updated = await a.client.rpc('save_expense', { ...args, p_id: id, p_amount: 300 });
    expect(updated.error).toBeNull();
    expect((await a.client.rpc('delete_expense', { p_org: a.orgId, p_id: id })).error).toBeNull();
    const audit = await admin
      .from('audit_logs')
      .select('action')
      .eq('entity_id', id)
      .order('created_at');
    expect(audit.data?.map((row) => row.action)).toEqual([
      'expense.created',
      'expense.updated',
      'expense.deleted',
    ]);
  });
});
