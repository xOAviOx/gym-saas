import 'server-only';

import { env } from '@/lib/env';
import { toPaise, type Paise } from '@/lib/money';
import { verifyPayToken } from '@/lib/payments/pay-token';
import { qrDataUrl } from '@/lib/qr';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildUpiUri, upiNote } from '@/lib/upi';

import { cashfreeEnvironment } from './gateway';
import type { ClaimStatus, InvoiceStatus } from './types';

/** The invoice id a valid, unexpired pay token stands for. */
export function resolvePayToken(token: string): string | null {
  return verifyPayToken(token, env.PORTAL_TOKEN_SECRET)?.invoiceId ?? null;
}

export type PayPage = {
  token: string;
  orgId: string;
  invoiceId: string;
  gym: { name: string; phone: string | null };
  member: { firstName: string; code: string };
  invoice: {
    number: string;
    dueDate: string;
    total: Paise;
    paid: Paise;
    balance: Paise;
    status: InvoiceStatus;
  };
  upi: { uri: string; qr: string; payee: string; vpa: string } | null;
  online: { available: boolean; preferred: boolean; sandbox: boolean };
  claims: {
    id: string;
    utrLast4: string;
    amount: Paise;
    status: ClaimStatus;
    reason: string | null;
    claimedAt: string;
  }[];
};

/**
 * Loads only what the payer needs: first name and member code, never the
 * phone number or other members' data. Runs with the service role because the
 * visitor has no session; the signed token is the authorisation.
 */
export async function loadPayPage(token: string): Promise<PayPage | null> {
  const invoiceId = resolvePayToken(token);
  if (!invoiceId) return null;
  const admin = createAdminClient();
  const { data: invoice, error } = await admin
    .from('invoices')
    .select(
      'id,org_id,invoice_number,due_date,total_amount,amount_paid,balance_due,status,members!inner(full_name,member_code,deleted_at),organizations!inner(name,phone,upi_vpa,upi_payee_name,default_collection_mode)',
    )
    .eq('id', invoiceId)
    .maybeSingle();
  if (error) throw error;
  if (!invoice || invoice.members.deleted_at) return null;

  const [claims, environment] = await Promise.all([
    admin
      .from('payment_claims')
      .select('id,utr,amount,status,reject_reason,claimed_at')
      .eq('invoice_id', invoice.id)
      .order('claimed_at', { ascending: false })
      .limit(5),
    cashfreeEnvironment(admin, invoice.org_id),
  ]);
  if (claims.error) throw claims.error;

  const org = invoice.organizations;
  const balance = toPaise(invoice.balance_due);
  const payable = invoice.status !== 'void' && balance > 0;
  let upi: PayPage['upi'] = null;
  if (payable && org.upi_vpa && org.upi_payee_name) {
    const uri = buildUpiUri({
      vpa: org.upi_vpa,
      payeeName: org.upi_payee_name,
      amount: balance,
      note: upiNote(invoice.invoice_number, invoice.members.member_code),
    });
    upi = { uri, qr: await qrDataUrl(uri), payee: org.upi_payee_name, vpa: org.upi_vpa };
  }

  return {
    token,
    orgId: invoice.org_id,
    invoiceId: invoice.id,
    gym: { name: org.name, phone: org.phone },
    member: {
      firstName: invoice.members.full_name.trim().split(/\s+/)[0] ?? '',
      code: invoice.members.member_code,
    },
    invoice: {
      number: invoice.invoice_number,
      dueDate: invoice.due_date,
      total: toPaise(invoice.total_amount),
      paid: toPaise(invoice.amount_paid),
      balance,
      status: invoice.status,
    },
    upi,
    online: {
      available: payable && environment !== null,
      preferred: org.default_collection_mode === 'cashfree' || !upi,
      sandbox: environment === 'sandbox',
    },
    claims: (claims.data ?? []).map((c) => ({
      id: c.id,
      utrLast4: c.utr.slice(-4),
      amount: toPaise(c.amount),
      status: c.status,
      reason: c.reject_reason,
      claimedAt: c.claimed_at,
    })),
  };
}
