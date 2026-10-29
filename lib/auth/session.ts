import 'server-only';

import type { User } from '@supabase/supabase-js';
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';

import { ActionError } from '@/lib/errors';
import { copy } from '@/lib/copy';
import { createClient, type ServerSupabase } from '@/lib/supabase/server';
import type { Tables } from '@/lib/supabase/types';

import { type Role } from './roles';

export type ActiveOrg = Tables<'organizations'>;

export type OrgSummary = {
  id: string;
  name: string;
  role: Role;
};

export type SessionContext = {
  user: User;
  profile: Pick<Tables<'profiles'>, 'id' | 'full_name' | 'avatar_url' | 'active_org_id'> | null;
  /** Active organization, or null when the user has not created or joined a gym yet. */
  org: ActiveOrg | null;
  role: Role | null;
  teamMemberId: string | null;
  /** Every gym the user belongs to, for switching. */
  orgs: OrgSummary[];
};

export type OrgContext = SessionContext & {
  org: ActiveOrg;
  role: Role;
  teamMemberId: string;
};

/** The signed-in auth user for this request, or null. Cached per request. */
export const getUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return null;
  }
  return data.user;
});

/**
 * Resolves the active gym from profiles.active_org_id, verified against the
 * caller's active team memberships. Never trusts an org id from the client.
 */
export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  const user = await getUser();
  if (!user) {
    return null;
  }
  const supabase = await createClient();

  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, avatar_url, active_org_id')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('team_members')
      .select('id, org_id, role, organizations!inner(*)')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: true }),
  ]);

  const rows = memberships ?? [];
  const orgs: OrgSummary[] = rows.map((row) => ({
    id: row.org_id,
    name: row.organizations.name,
    role: row.role,
  }));

  if (rows.length === 0) {
    return { user, profile: profile ?? null, org: null, role: null, teamMemberId: null, orgs };
  }

  const current = rows.find((row) => row.org_id === profile?.active_org_id) ?? rows[0]!;

  if (profile && profile.active_org_id !== current.org_id) {
    // Heal a stale pointer (e.g. after being removed from a gym).
    await supabase.from('profiles').update({ active_org_id: current.org_id }).eq('id', user.id);
  }

  return {
    user,
    profile: profile ?? null,
    org: current.organizations,
    role: current.role,
    teamMemberId: current.id,
    orgs,
  };
});

/** For pages: redirects to sign-in when there is no user. */
export async function requireUser(): Promise<User> {
  const user = await getUser();
  if (!user) {
    redirect('/sign-in');
  }
  return user;
}

/**
 * For pages: requires a signed-in user with an active gym. Sends new users to
 * onboarding. When `roles` is given, other roles get a 404 so protected
 * screens are not discoverable.
 */
export async function requireOrg(roles?: readonly Role[]): Promise<OrgContext> {
  const ctx = await getSessionContext();
  if (!ctx) {
    redirect('/sign-in');
  }
  if (!ctx.org || !ctx.role || !ctx.teamMemberId) {
    redirect('/onboarding');
  }
  if (roles && !roles.includes(ctx.role)) {
    notFound();
  }
  return ctx as OrgContext;
}

export type AuthorizedAction = {
  supabase: ServerSupabase;
  ctx: OrgContext;
};

/**
 * For server actions: authenticates, resolves the active gym and checks the
 * role. Throws ActionError so runAction() can return a typed failure.
 */
export async function authorize(roles?: readonly Role[]): Promise<AuthorizedAction> {
  const ctx = await getSessionContext();
  if (!ctx) {
    throw new ActionError(copy.errors.unauthenticated, 'unauthenticated');
  }
  if (!ctx.org || !ctx.role || !ctx.teamMemberId) {
    throw new ActionError(copy.errors.noOrganization, 'forbidden');
  }
  if (roles && !roles.includes(ctx.role)) {
    throw new ActionError(copy.errors.forbidden, 'forbidden');
  }
  const supabase = await createClient();
  return { supabase, ctx: ctx as OrgContext };
}

/** For server actions that only need a signed-in user (e.g. creating the first gym). */
export async function authorizeUser(): Promise<{ supabase: ServerSupabase; user: User }> {
  const user = await getUser();
  if (!user) {
    throw new ActionError(copy.errors.unauthenticated, 'unauthenticated');
  }
  const supabase = await createClient();
  return { supabase, user };
}
