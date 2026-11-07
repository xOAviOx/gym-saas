import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';

import { hashPortalToken } from './token';

export async function loadMemberPortal(token: string) {
  const hash = hashPortalToken(token);
  if (!hash) return null;
  const admin = createAdminClient();
  const { data: access, error: accessError } = await admin
    .from('portal_tokens')
    .select('member_id,org_id,expires_at,revoked_at')
    .eq('token_hash', hash)
    .maybeSingle();
  if (accessError) throw accessError;
  if (!access || access.revoked_at || new Date(access.expires_at).getTime() <= Date.now())
    return null;

  const [{ data: member, error: memberError }, memberships, invoices, attendance] =
    await Promise.all([
      admin
        .from('members')
        .select('id,full_name,member_code,deleted_at,organizations!inner(name,phone)')
        .eq('id', access.member_id)
        .eq('org_id', access.org_id)
        .maybeSingle(),
      admin
        .from('memberships')
        .select('id,start_date,end_date,status,sessions_total,sessions_used,plans!inner(name)')
        .eq('org_id', access.org_id)
        .eq('member_id', access.member_id)
        .order('start_date', { ascending: false })
        .limit(12),
      admin
        .from('invoices')
        .select('id,invoice_number,issue_date,due_date,total_amount,balance_due,status')
        .eq('org_id', access.org_id)
        .eq('member_id', access.member_id)
        .order('issue_date', { ascending: false })
        .limit(12),
      admin
        .from('check_ins')
        .select('id,checked_in_at')
        .eq('org_id', access.org_id)
        .eq('member_id', access.member_id)
        .order('checked_in_at', { ascending: false })
        .limit(10),
    ]);
  if (memberError) throw memberError;
  if (memberships.error) throw memberships.error;
  if (invoices.error) throw invoices.error;
  if (attendance.error) throw attendance.error;
  if (!member || member.deleted_at) return null;
  return {
    member,
    memberships: memberships.data ?? [],
    invoices: invoices.data ?? [],
    attendance: attendance.data ?? [],
  };
}
