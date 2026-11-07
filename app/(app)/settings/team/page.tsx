import type { Metadata } from 'next';
import Link from 'next/link';

import { TeamManager } from '@/components/settings/team-manager';
import { PageHeader } from '@/components/shared/page-header';
import { PRIVILEGED_ROLES } from '@/lib/auth/roles';
import { requireOrg } from '@/lib/auth/session';
import { copy } from '@/lib/copy';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: copy.team.title };

export default async function TeamPage() {
  const ctx = await requireOrg(PRIVILEGED_ROLES);
  const supabase = await createClient();
  const [team, pending] = await Promise.all([
    supabase
      .from('team_members')
      .select('id,user_id,role,is_active')
      .eq('org_id', ctx.org.id)
      .order('created_at'),
    supabase
      .from('invitations')
      .select('id,email,role,expires_at')
      .eq('org_id', ctx.org.id)
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false }),
  ]);
  if (team.error) throw team.error;
  if (pending.error) throw pending.error;
  const ids = (team.data ?? []).map((item) => item.user_id);
  const profiles = ids.length
    ? await supabase.from('profiles').select('id,full_name').in('id', ids)
    : { data: [], error: null };
  if (profiles.error) throw profiles.error;
  const names = new Map((profiles.data ?? []).map((item) => [item.id, item.full_name ?? '']));
  return (
    <>
      <Link
        href="/more"
        className="text-muted-foreground mb-4 inline-flex min-h-11 items-center text-sm"
      >
        {copy.nav.more}
      </Link>
      <PageHeader title={copy.team.title} description={copy.team.description} />
      <TeamManager
        currentUserId={ctx.user.id}
        members={(team.data ?? []).map((item) => ({
          id: item.id,
          userId: item.user_id,
          role: item.role,
          active: item.is_active,
          name: names.get(item.user_id) ?? '',
          email: item.user_id === ctx.user.id ? (ctx.user.email ?? '') : '',
        }))}
        invites={(pending.data ?? []).map((item) => ({
          id: item.id,
          email: item.email,
          role: item.role,
          expiresAt: item.expires_at,
        }))}
      />
    </>
  );
}
