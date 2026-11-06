import { notFound } from 'next/navigation';

import { PRIVILEGED_ROLES } from '@/lib/auth/roles';
import { requireOrg } from '@/lib/auth/session';
import { copy } from '@/lib/copy';
import { formatDate, formatDateTime } from '@/lib/dates';
import { toPaise, toRupeeString } from '@/lib/money';
import { createClient } from '@/lib/supabase/server';

function cell(value: string | number | null | undefined) {
  const text = String(value ?? '');
  const safe = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

function csv(headers: readonly string[], rows: (string | number | null | undefined)[][]) {
  return '\uFEFF' + [headers, ...rows].map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';
}

export async function GET(_request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!['members', 'invoices', 'payments'].includes(kind)) notFound();
  const ctx = await requireOrg(PRIVILEGED_ROLES);
  const supabase = await createClient();
  const rows: (string | number | null | undefined)[][] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    if (kind === 'members') {
      const { data, error } = await supabase
        .from('members')
        .select('member_code,full_name,phone,email,joined_on,status')
        .eq('org_id', ctx.org.id)
        .is('deleted_at', null)
        .order('member_code')
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      rows.push(
        ...(data ?? []).map((m) => [
          m.member_code,
          m.full_name,
          m.phone,
          m.email,
          formatDate(m.joined_on),
          m.status,
        ]),
      );
      if ((data?.length ?? 0) < pageSize) break;
    } else if (kind === 'invoices') {
      const { data, error } = await supabase
        .from('invoices')
        .select(
          'invoice_number,issue_date,due_date,total_amount,amount_paid,balance_due,status,members!inner(member_code,full_name)',
        )
        .eq('org_id', ctx.org.id)
        .order('issue_date', { ascending: false })
        .order('id')
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      rows.push(
        ...(data ?? []).map((i) => [
          i.invoice_number,
          i.members.member_code,
          i.members.full_name,
          formatDate(i.issue_date),
          formatDate(i.due_date),
          toRupeeString(toPaise(i.total_amount)),
          toRupeeString(toPaise(i.amount_paid)),
          toRupeeString(toPaise(i.balance_due)),
          i.status,
        ]),
      );
      if ((data?.length ?? 0) < pageSize) break;
    } else {
      const { data, error } = await supabase
        .from('payments')
        .select(
          'paid_at,amount,method,utr,reference,is_reversal,invoices!inner(invoice_number),members!inner(member_code,full_name)',
        )
        .eq('org_id', ctx.org.id)
        .order('paid_at', { ascending: false })
        .order('id')
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      rows.push(
        ...(data ?? []).map((p) => [
          formatDateTime(p.paid_at),
          p.invoices.invoice_number,
          p.members.member_code,
          p.members.full_name,
          p.method,
          toRupeeString(toPaise(p.amount)),
          p.utr ?? p.reference,
          p.is_reversal ? copy.exports.yes : copy.exports.no,
        ]),
      );
      if ((data?.length ?? 0) < pageSize) break;
    }
  }
  const headers =
    kind === 'members'
      ? copy.exports.memberHeaders
      : kind === 'invoices'
        ? copy.exports.invoiceHeaders
        : copy.exports.paymentHeaders;
  return new Response(csv(headers, rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="gymdesk-${kind}.csv"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
