import 'server-only';

import { z } from 'zod';

import { daysAgo, istDayRange, todayIST } from '@/lib/dates';
import { toPaise } from '@/lib/money';
import type { ServerSupabase } from '@/lib/supabase/server';

import type { MemberFilter } from './schema';
import type {
  DirectoryMember,
  DirectoryOverview,
  MemberInvoice,
  MemberPayment,
  Membership,
} from './types';
import { MEMBER_PAGE_SIZE } from './queries-constants';

const directorySchema = z.object({
  total: z.number().int().nonnegative(),
  counts: z.object({
    all: z.number().int().nonnegative(),
    active: z.number().int().nonnegative(),
    expiring: z.number().int().nonnegative(),
    expired: z.number().int().nonnegative(),
    dues: z.number().int().nonnegative(),
    frozen: z.number().int().nonnegative(),
    new: z.number().int().nonnegative(),
    upcoming: z.number().int().nonnegative(),
    deleted: z.number().int().nonnegative().optional(),
  }),
  balance_due: z.number(),
  rows: z.array(
    z.object({
      id: z.uuid(),
      member_code: z.string(),
      full_name: z.string(),
      phone: z.string(),
      status: z.enum(['new', 'upcoming', 'active', 'expiring', 'expired', 'frozen', 'cancelled']),
      plan_name: z.string().nullable(),
      start_date: z.string().nullable(),
      end_date: z.string().nullable(),
      balance_due: z.number(),
      deleted_at: z.string().nullable(),
    }),
  ),
});

export async function getMembers(
  supabase: ServerSupabase,
  orgId: string,
  search: string,
  filter: MemberFilter,
  page: number,
) {
  const { data, error } = await supabase.rpc('list_members', {
    p_org: orgId,
    p_search: search,
    p_filter: filter,
    p_page: page,
    p_page_size: MEMBER_PAGE_SIZE,
  });
  if (error) throw error;
  const parsed = directorySchema.parse(data);
  const members: DirectoryMember[] = parsed.rows.map((m) => ({
    id: m.id,
    memberCode: m.member_code,
    fullName: m.full_name,
    phone: m.phone,
    status: m.status,
    planName: m.plan_name,
    startDate: m.start_date,
    endDate: m.end_date,
    balanceDue: toPaise(m.balance_due),
    deletedAt: m.deleted_at,
  }));
  const overview: DirectoryOverview = {
    counts: parsed.counts,
    balanceDue: toPaise(parsed.balance_due),
  };
  return { members, total: parsed.total, overview };
}

export async function getMember(supabase: ServerSupabase, orgId: string, id: string) {
  const { data, error } = await supabase
    .from('members')
    .select('*')
    .eq('org_id', orgId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getMemberMemberships(
  supabase: ServerSupabase,
  orgId: string,
  memberId: string,
): Promise<Membership[]> {
  const { data, error } = await supabase
    .from('memberships')
    .select('*,plans!inner(name)')
    .eq('org_id', orgId)
    .eq('member_id', memberId)
    .order('start_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(({ plans, list_price, discount_amount, final_amount, ...m }) => ({
    ...m,
    planName: plans.name,
    listPrice: toPaise(list_price),
    discountAmount: toPaise(discount_amount),
    finalAmount: toPaise(final_amount),
  }));
}

export async function getMemberActivity(
  supabase: ServerSupabase,
  orgId: string,
  memberId: string,
  today: string = todayIST(),
) {
  const [invoices, payments, attendance] = await Promise.all([
    supabase
      .from('invoices')
      .select('id,invoice_number,due_date,balance_due')
      .eq('org_id', orgId)
      .eq('member_id', memberId)
      .neq('status', 'void')
      .gt('balance_due', 0)
      .order('due_date'),
    supabase
      .from('payments')
      .select(
        'id,paid_at,amount,method,utr,reference,razorpay_payment_id,is_reversal,invoices!inner(invoice_number)',
      )
      .eq('org_id', orgId)
      .eq('member_id', memberId)
      .order('paid_at', { ascending: false }),
    supabase
      .from('check_ins')
      .select('checked_in_at')
      .eq('org_id', orgId)
      .eq('member_id', memberId)
      .gte('checked_in_at', istDayRange(daysAgo(89, today)).start)
      .lt('checked_in_at', istDayRange(today).end)
      .order('checked_in_at', { ascending: false }),
  ]);
  for (const result of [invoices, payments, attendance]) if (result.error) throw result.error;
  const memberInvoices: MemberInvoice[] = (invoices.data ?? []).map((i) => ({
    id: i.id,
    number: i.invoice_number,
    dueDate: i.due_date,
    balanceDue: toPaise(i.balance_due),
  }));
  const memberPayments: MemberPayment[] = (payments.data ?? []).map((p) => ({
    id: p.id,
    paidAt: p.paid_at,
    amount: toPaise(p.amount),
    method: p.method,
    isReversal: p.is_reversal,
    reference: p.utr ?? p.razorpay_payment_id ?? p.reference,
    invoiceNumber: p.invoices.invoice_number,
  }));
  return {
    invoices: memberInvoices,
    payments: memberPayments,
    attendance: (attendance.data ?? []).map((a) => a.checked_in_at),
  };
}

export async function getMemberPhotoUrl(
  supabase: ServerSupabase,
  orgId: string,
  memberId: string,
  path: string | null,
) {
  if (!path?.startsWith(`${orgId}/members/${memberId}/`)) return null;
  const { data } = await supabase.storage.from('uploads').createSignedUrl(path, 900);
  return data?.signedUrl ?? null;
}
