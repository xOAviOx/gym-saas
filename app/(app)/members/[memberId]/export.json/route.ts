import { z } from 'zod';

import { OWNER_ONLY } from '@/lib/auth/roles';
import { requireOrg } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ memberId: string }> },
) {
  const ctx = await requireOrg(OWNER_ONLY);
  const { memberId } = await params;
  if (!z.uuid().safeParse(memberId).success) return new Response(null, { status: 404 });
  const db = await createClient();
  const { data: member, error } = await db
    .from('members')
    .select('*')
    .eq('org_id', ctx.org.id)
    .eq('id', memberId)
    .maybeSingle();
  if (error) throw error;
  if (!member) return new Response(null, { status: 404 });

  async function pages<T>(
    fetch: (
      from: number,
      to: number,
    ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  ) {
    const all: T[] = [];
    for (let from = 0; ; from += 500) {
      const result = await fetch(from, from + 499);
      if (result.error) throw result.error;
      const batch = result.data ?? [];
      all.push(...batch);
      if (batch.length < 500) return all;
    }
  }
  const [memberships, invoices, payments, attendance, messages] = await Promise.all([
    pages((from, to) =>
      db
        .from('memberships')
        .select('*')
        .eq('org_id', ctx.org.id)
        .eq('member_id', memberId)
        .order('created_at')
        .range(from, to),
    ),
    pages((from, to) =>
      db
        .from('invoices')
        .select('*')
        .eq('org_id', ctx.org.id)
        .eq('member_id', memberId)
        .order('created_at')
        .range(from, to),
    ),
    pages((from, to) =>
      db
        .from('payments')
        .select('*')
        .eq('org_id', ctx.org.id)
        .eq('member_id', memberId)
        .order('created_at')
        .range(from, to),
    ),
    pages((from, to) =>
      db
        .from('check_ins')
        .select('*')
        .eq('org_id', ctx.org.id)
        .eq('member_id', memberId)
        .order('checked_in_at')
        .range(from, to),
    ),
    pages((from, to) =>
      db
        .from('message_logs')
        .select('template_key,channel,status,created_at,sent_at')
        .eq('org_id', ctx.org.id)
        .eq('member_id', memberId)
        .order('created_at')
        .range(from, to),
    ),
  ]);
  const body = JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      gym: ctx.org.name,
      member,
      memberships,
      invoices,
      payments,
      attendance,
      messages,
    },
    null,
    2,
  );
  return new Response(body, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${member.member_code}-data.json"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
