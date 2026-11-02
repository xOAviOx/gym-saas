import 'server-only';

import { z } from 'zod';

import { toPaise } from '@/lib/money';
import type { ServerSupabase } from '@/lib/supabase/server';

import { DUES_PAGE_SIZE, type DuesFilter } from './schema';
import type { DuesRow, DuesSummary, GatewayLink, InvoiceDetail } from './types';

const duesSchema = z.object({
  total: z.number().int().nonnegative(),
  summary: z.object({
    outstanding: z.number(),
    overdue: z.number(),
    all: z.number().int().nonnegative(),
    overdue_count: z.number().int().nonnegative(),
    today_count: z.number().int().nonnegative(),
    upcoming_count: z.number().int().nonnegative(),
    claims_count: z.number().int().nonnegative(),
  }),
  rows: z.array(
    z.object({
      id: z.uuid(),
      invoice_number: z.string(),
      issue_date: z.string(),
      due_date: z.string(),
      total_amount: z.number(),
      amount_paid: z.number(),
      balance_due: z.number(),
      status: z.enum(['unpaid', 'partially_paid', 'paid', 'void']),
      member_id: z.uuid(),
      member_code: z.string(),
      full_name: z.string(),
      phone: z.string(),
      pending_claims: z.number().int().nonnegative(),
      open_link: z.boolean(),
    }),
  ),
});

export async function getDues(
  supabase: ServerSupabase,
  orgId: string,
  search: string,
  filter: DuesFilter,
  page: number,
): Promise<{ rows: DuesRow[]; total: number; summary: DuesSummary }> {
  const { data, error } = await supabase.rpc('list_dues', {
    p_org: orgId,
    p_search: search,
    p_filter: filter,
    p_page: page,
    p_page_size: DUES_PAGE_SIZE,
  });
  if (error) throw error;
  const parsed = duesSchema.parse(data);
  return {
    total: parsed.total,
    summary: {
      outstanding: toPaise(parsed.summary.outstanding),
      overdue: toPaise(parsed.summary.overdue),
      counts: {
        all: parsed.summary.all,
        overdue: parsed.summary.overdue_count,
        today: parsed.summary.today_count,
        upcoming: parsed.summary.upcoming_count,
        claims: parsed.summary.claims_count,
      },
    },
    rows: parsed.rows.map((r) => ({
      id: r.id,
      invoiceNumber: r.invoice_number,
      issueDate: r.issue_date,
      dueDate: r.due_date,
      total: toPaise(r.total_amount),
      paid: toPaise(r.amount_paid),
      balance: toPaise(r.balance_due),
      status: r.status,
      memberId: r.member_id,
      memberCode: r.member_code,
      fullName: r.full_name,
      phone: r.phone,
      pendingClaims: r.pending_claims,
      openLink: r.open_link,
    })),
  };
}

export function toGatewayLink(
  row: {
    id: string;
    amount: number;
    short_url: string | null;
    status: GatewayLink['status'];
    expires_at: string;
    created_at: string;
  },
  now: number = Date.now(),
): GatewayLink {
  return {
    id: row.id,
    amount: toPaise(row.amount),
    url: row.short_url,
    status: row.status,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    isOpen: row.status === 'pending' && Date.parse(row.expires_at) > now,
  };
}

export async function getInvoiceDetail(
  supabase: ServerSupabase,
  orgId: string,
  invoiceId: string,
): Promise<InvoiceDetail | null> {
  const [invoice, payments, claims, links] = await Promise.all([
    supabase
      .from('invoices')
      .select(
        '*,members!inner(id,full_name,member_code,phone,consent_messaging,deleted_at),invoice_items(id,description,sac_hsn,amount,created_at)',
      )
      .eq('org_id', orgId)
      .eq('id', invoiceId)
      .maybeSingle(),
    supabase
      .from('payments')
      .select(
        'id,amount,method,utr,reference,paid_at,is_reversal,reverses_payment_id,reversal_reason,gateway_payment_id,razorpay_payment_id,created_at',
      )
      .eq('org_id', orgId)
      .eq('invoice_id', invoiceId)
      .order('paid_at', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase
      .from('payment_claims')
      .select('id,amount,utr,note,claimed_at,status,reject_reason')
      .eq('org_id', orgId)
      .eq('invoice_id', invoiceId)
      .order('claimed_at', { ascending: false })
      .limit(20),
    supabase
      .from('collection_requests')
      .select('id,amount,short_url,status,expires_at,created_at')
      .eq('org_id', orgId)
      .eq('invoice_id', invoiceId)
      .eq('provider', 'cashfree')
      .order('created_at', { ascending: false })
      .limit(10),
  ]);
  for (const result of [invoice, payments, claims, links]) if (result.error) throw result.error;
  const row = invoice.data;
  if (!row) return null;
  const reversed = new Set(
    (payments.data ?? []).map((p) => p.reverses_payment_id).filter((id): id is string => !!id),
  );
  return {
    id: row.id,
    number: row.invoice_number,
    fiscalYear: row.fiscal_year,
    issueDate: row.issue_date,
    dueDate: row.due_date,
    status: row.status,
    subtotal: toPaise(row.subtotal),
    discount: toPaise(row.discount_amount),
    taxable: toPaise(row.taxable_value),
    gstRate: row.gst_rate,
    cgst: toPaise(row.cgst_amount),
    sgst: toPaise(row.sgst_amount),
    total: toPaise(row.total_amount),
    paid: toPaise(row.amount_paid),
    balance: toPaise(row.balance_due),
    voidReason: row.void_reason,
    voidedAt: row.voided_at,
    items: [...row.invoice_items]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((item) => ({
        id: item.id,
        description: item.description,
        sac: item.sac_hsn,
        amount: toPaise(item.amount),
      })),
    member: {
      id: row.members.id,
      fullName: row.members.full_name,
      memberCode: row.members.member_code,
      phone: row.members.phone,
      consentMessaging: row.members.consent_messaging,
      deleted: !!row.members.deleted_at,
    },
    payments: (payments.data ?? []).map((p) => ({
      id: p.id,
      amount: toPaise(p.amount),
      method: p.method,
      reference: p.utr ?? p.gateway_payment_id ?? p.razorpay_payment_id ?? p.reference,
      paidAt: p.paid_at,
      isReversal: p.is_reversal,
      reversesPaymentId: p.reverses_payment_id,
      reversalReason: p.reversal_reason,
      reversed: reversed.has(p.id),
    })),
    claims: (claims.data ?? []).map((c) => ({
      id: c.id,
      amount: toPaise(c.amount),
      utr: c.utr,
      note: c.note,
      claimedAt: c.claimed_at,
      status: c.status,
      rejectReason: c.reject_reason,
    })),
    links: (links.data ?? []).map((l) => toGatewayLink(l)),
  };
}

export async function getPaymentSettings(supabase: ServerSupabase, orgId: string) {
  const [org, secrets] = await Promise.all([
    supabase
      .from('organizations')
      .select('upi_vpa,upi_payee_name,default_collection_mode')
      .eq('id', orgId)
      .single(),
    supabase
      .from('organization_secrets')
      .select('cashfree_app_id,cashfree_environment,cashfree_verified_at')
      .eq('org_id', orgId)
      .maybeSingle(),
  ]);
  if (org.error) throw org.error;
  if (secrets.error) throw secrets.error;
  const s = secrets.data;
  return {
    upiVpa: org.data.upi_vpa ?? '',
    upiPayeeName: org.data.upi_payee_name ?? '',
    defaultMode: org.data.default_collection_mode,
    cashfree:
      s?.cashfree_app_id && s.cashfree_environment
        ? {
            appId: s.cashfree_app_id,
            environment: s.cashfree_environment as 'sandbox' | 'production',
            verifiedAt: s.cashfree_verified_at,
          }
        : null,
  };
}
