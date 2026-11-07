import { expect, test } from '@playwright/test';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

function localEnv(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  const line = readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .find((entry) => entry.startsWith(`${name}=`));
  return line?.slice(name.length + 1);
}

test('staff pages require a session', async ({ page }) => {
  await page.goto('/today');
  await expect(page).toHaveURL(/\/sign-in\?next=%2Ftoday/);
  await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
});

test('invalid member portal links reveal no member details', async ({ page }) => {
  await page.goto('/p/member/invalid');
  await expect(page.getByRole('heading', { name: 'Link unavailable' })).toBeVisible();
  await expect(page).toHaveURL(/\/p\/member\/invalid$/);
});

test('invitation landing preserves the invite after sign in', async ({ page }) => {
  await page.goto('/invite/invalid');
  await expect(page.getByRole('heading', { name: 'Join this gym' })).toBeVisible();
  await page.getByRole('link', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/sign-in\?next=%2Finvite%2Finvalid/);
});

test('the install manifest is available', async ({ request }) => {
  const response = await request.get('/manifest.webmanifest');
  expect(response.ok()).toBeTruthy();
  const manifest = await response.json();
  expect(manifest.start_url).toBe('/today');
  expect(manifest.display).toBe('standalone');
});

test('a private member link expires when revoked', async ({ page }) => {
  const api = localEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = localEnv('SUPABASE_SERVICE_ROLE_KEY');
  test.skip(
    !api || !key || !['127.0.0.1', 'localhost'].includes(new URL(api).hostname),
    'Needs local Supabase',
  );
  const admin = createClient(api!, key!, { auth: { persistSession: false } });
  const org = await admin
    .from('organizations')
    .insert({
      name: 'Portal smoke gym',
      invoice_prefix: 'PSG',
      upi_vpa: 'portal@okaxis',
      upi_payee_name: 'Portal Smoke',
    })
    .select('id')
    .single();
  expect(org.error).toBeNull();
  const orgId = org.data!.id;
  try {
    const member = await admin
      .from('members')
      .insert({ org_id: orgId, full_name: 'Portal Smoke Member', phone: '+919912345678' })
      .select('id')
      .single();
    expect(member.error).toBeNull();
    const token = randomBytes(32).toString('base64url');
    const hash = createHash('sha256').update(`gymdesk:portal:v1:${token}`).digest('hex');
    const access = await admin
      .from('portal_tokens')
      .insert({
        org_id: orgId,
        member_id: member.data!.id,
        token_hash: hash,
        expires_at: new Date(Date.now() + 86400_000).toISOString(),
      })
      .select('id')
      .single();
    expect(access.error).toBeNull();
    await page.goto(`/p/member/${token}`);
    await expect(page.getByRole('heading', { name: 'Hello, Portal Smoke Member' })).toBeVisible();
    const revoked = await admin
      .from('portal_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', access.data!.id);
    expect(revoked.error).toBeNull();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Link unavailable' })).toBeVisible();
  } finally {
    await admin.from('organizations').delete().eq('id', orgId);
  }
});

test('an owner can create a private member link from the profile', async ({ page }) => {
  const api = localEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = localEnv('SUPABASE_SERVICE_ROLE_KEY');
  test.skip(
    !api || !key || !['127.0.0.1', 'localhost'].includes(new URL(api).hostname),
    'Needs local Supabase',
  );
  const admin = createClient(api!, key!, { auth: { persistSession: false } });
  const email = `portal-owner-${randomBytes(6).toString('hex')}@example.test`;
  const password = 'PortalSmoke#2026';
  const user = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: 'Portal Owner' },
  });
  expect(user.error).toBeNull();
  let orgId: string | null = null;
  try {
    const org = await admin
      .from('organizations')
      .insert({
        name: 'Portal owner gym',
        invoice_prefix: 'POG',
        upi_vpa: 'portal@okaxis',
        upi_payee_name: 'Portal Owner',
      })
      .select('id')
      .single();
    expect(org.error).toBeNull();
    orgId = org.data!.id;
    expect(
      (
        await admin
          .from('team_members')
          .insert({ org_id: orgId, user_id: user.data.user!.id, role: 'owner' })
      ).error,
    ).toBeNull();
    const member = await admin
      .from('members')
      .insert({ org_id: orgId, full_name: 'Portal Action Member', phone: '+919987654321' })
      .select('id')
      .single();
    expect(member.error).toBeNull();
    await page.goto('/sign-in');
    await page.getByRole('textbox', { name: 'Email' }).fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/today$/);
    await page.goto(`/members/${member.data!.id}`);
    const downloadReady = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Export member data' }).click();
    const download = await downloadReady;
    expect(download.suggestedFilename()).toMatch(/^M-\d+-data\.json$/);
    const exported = JSON.parse(readFileSync((await download.path())!, 'utf8'));
    expect(exported.member.full_name).toBe('Portal Action Member');
    await page.getByRole('button', { name: 'Create link' }).click();
    const linkText = page.getByText(/http:\/\/localhost:3000\/p\/member\//);
    await expect(linkText).toBeVisible();
    const url = await linkText.innerText();
    await page.goto(url);
    await expect(page.getByRole('heading', { name: 'Hello, Portal Action Member' })).toBeVisible();
  } finally {
    if (orgId) await admin.from('organizations').delete().eq('id', orgId);
    if (user.data.user) await admin.auth.admin.deleteUser(user.data.user.id);
  }
});

test('an invited teammate can join with the matching email', async ({ page }) => {
  const api = localEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = localEnv('SUPABASE_SERVICE_ROLE_KEY');
  test.skip(
    !api || !key || !['127.0.0.1', 'localhost'].includes(new URL(api).hostname),
    'Needs local Supabase',
  );
  const admin = createClient(api!, key!, { auth: { persistSession: false } });
  const suffix = randomBytes(6).toString('hex');
  const password = 'TeamSmoke#2026';
  const ownerEmail = `team-owner-${suffix}@example.test`;
  const guestEmail = `team-guest-${suffix}@example.test`;
  const owner = await admin.auth.admin.createUser({
    email: ownerEmail,
    password,
    email_confirm: true,
  });
  const guest = await admin.auth.admin.createUser({
    email: guestEmail,
    password,
    email_confirm: true,
  });
  expect(owner.error).toBeNull();
  expect(guest.error).toBeNull();
  let orgId: string | null = null;
  try {
    const org = await admin
      .from('organizations')
      .insert({
        name: 'Team smoke gym',
        invoice_prefix: 'TSG',
        upi_vpa: 'team@okaxis',
        upi_payee_name: 'Team Smoke',
      })
      .select('id')
      .single();
    expect(org.error).toBeNull();
    orgId = org.data!.id;
    expect(
      (
        await admin
          .from('team_members')
          .insert({ org_id: orgId, user_id: owner.data.user!.id, role: 'owner' })
      ).error,
    ).toBeNull();

    await page.goto('/sign-in');
    await page.getByRole('textbox', { name: 'Email' }).fill(ownerEmail);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/today$/);
    await page.goto('/settings/team');
    await page.getByRole('textbox', { name: 'Email' }).fill(guestEmail);
    await page.getByRole('button', { name: 'Create invite link' }).click();
    const linkText = page.getByText(/http:\/\/localhost:3000\/invite\//);
    await expect(linkText).toBeVisible();
    const inviteUrl = await linkText.innerText();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await page.goto(`/sign-in?next=${encodeURIComponent(new URL(inviteUrl).pathname)}`);
    await page.getByRole('textbox', { name: 'Email' }).fill(guestEmail);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/invite\/[A-Za-z0-9_-]{43}$/);
    await page.getByRole('button', { name: 'Accept invitation' }).click();
    await expect(page).toHaveURL(/\/today$/);
    const membership = await admin
      .from('team_members')
      .select('role,is_active')
      .eq('org_id', orgId)
      .eq('user_id', guest.data.user!.id)
      .single();
    expect(membership.data).toMatchObject({ role: 'staff', is_active: true });
  } finally {
    if (orgId) await admin.from('organizations').delete().eq('id', orgId);
    if (owner.data.user) await admin.auth.admin.deleteUser(owner.data.user.id);
    if (guest.data.user) await admin.auth.admin.deleteUser(guest.data.user.id);
  }
});
