import { loadInvoiceDocument } from '@/features/billing/document';
import { resolvePayToken } from '@/features/billing/public';
import { buildInvoicePdf } from '@/lib/pdf/invoice-pdf';
import { pdfFileName } from '@/lib/pdf/file-name';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/** The member's own receipt, authorised by the signed pay token. No phone number is printed. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invoiceId = resolvePayToken(token);
  if (!invoiceId) return new Response(null, { status: 404 });
  const admin = createAdminClient();
  const { data: invoice, error } = await admin
    .from('invoices')
    .select('org_id,members!inner(deleted_at)')
    .eq('id', invoiceId)
    .maybeSingle();
  if (error) throw error;
  if (!invoice || invoice.members.deleted_at) return new Response(null, { status: 404 });
  const doc = await loadInvoiceDocument(admin, invoice.org_id, invoiceId, {
    includeMemberPhone: false,
  });
  if (!doc) return new Response(null, { status: 404 });
  const bytes = await buildInvoicePdf(doc);
  return new Response(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${pdfFileName(doc.invoice.number)}"`,
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex',
    },
  });
}
