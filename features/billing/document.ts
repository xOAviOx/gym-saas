import 'server-only';

import { copy } from '@/lib/copy';
import { toPaise } from '@/lib/money';
import type { InvoiceDocument } from '@/lib/pdf/invoice-pdf';
import { formatPhone } from '@/lib/phone';
import type { AdminSupabase } from '@/lib/supabase/admin';
import type { ServerSupabase } from '@/lib/supabase/server';
import { buildUpiUri, upiNote } from '@/lib/upi';

/**
 * Everything printed on an invoice PDF. With a staff session RLS scopes the
 * reads; with the service role (public pay page) the caller has already
 * verified the signed token for this invoice.
 */
export async function loadInvoiceDocument(
  db: ServerSupabase | AdminSupabase,
  orgId: string,
  invoiceId: string,
  { includeMemberPhone }: { includeMemberPhone: boolean },
): Promise<InvoiceDocument | null> {
  const [org, invoice, payments] = await Promise.all([
    db
      .from('organizations')
      .select('name,address_line,city,state,pincode,phone,email,gstin,upi_vpa,upi_payee_name')
      .eq('id', orgId)
      .maybeSingle(),
    db
      .from('invoices')
      .select(
        '*,members!inner(full_name,member_code,phone,deleted_at),invoice_items(description,sac_hsn,amount,created_at)',
      )
      .eq('org_id', orgId)
      .eq('id', invoiceId)
      .maybeSingle(),
    db
      .from('payments')
      .select('amount,method,utr,reference,paid_at,is_reversal,gateway_payment_id,created_at')
      .eq('org_id', orgId)
      .eq('invoice_id', invoiceId)
      .order('paid_at', { ascending: true })
      .order('created_at', { ascending: true }),
  ]);
  for (const result of [org, invoice, payments]) if (result.error) throw result.error;
  if (!org.data || !invoice.data) return null;
  const o = org.data;
  const i = invoice.data;
  const balance = toPaise(i.balance_due);
  const cityLine = [o.city, o.state, o.pincode].filter(Boolean).join(', ');
  return {
    org: {
      name: o.name,
      addressLines: [o.address_line, cityLine].filter((line): line is string => !!line),
      phone: o.phone ? formatPhone(o.phone) : null,
      email: o.email,
      gstin: o.gstin,
      state: o.state,
    },
    invoice: {
      number: i.invoice_number,
      issueDate: i.issue_date,
      dueDate: i.due_date,
      status: i.status,
      voidReason: i.void_reason,
      subtotal: toPaise(i.subtotal),
      discount: toPaise(i.discount_amount),
      taxable: toPaise(i.taxable_value),
      cgst: toPaise(i.cgst_amount),
      sgst: toPaise(i.sgst_amount),
      total: toPaise(i.total_amount),
      gstRate: i.gst_rate,
      amountPaid: toPaise(i.amount_paid),
      balanceDue: balance,
    },
    member: {
      name: i.members.full_name,
      code: i.members.member_code,
      phone: includeMemberPhone ? formatPhone(i.members.phone) : null,
    },
    items: [...i.invoice_items]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((item) => ({
        description: item.description,
        sac: item.sac_hsn,
        amount: toPaise(item.amount),
      })),
    payments: (payments.data ?? []).map((p) => ({
      paidAt: p.paid_at,
      method: copy.members.paymentMethod[p.method],
      reference: p.utr ?? p.gateway_payment_id ?? p.reference,
      amount: toPaise(p.amount),
      isReversal: p.is_reversal,
    })),
    upiUri:
      o.upi_vpa && o.upi_payee_name && balance > 0 && i.status !== 'void'
        ? buildUpiUri({
            vpa: o.upi_vpa,
            payeeName: o.upi_payee_name,
            amount: balance,
            note: upiNote(i.invoice_number, i.members.member_code),
          })
        : null,
  };
}
