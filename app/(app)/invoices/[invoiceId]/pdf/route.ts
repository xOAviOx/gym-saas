import { z } from 'zod';

import { loadInvoiceDocument } from '@/features/billing/document';
import { getSessionContext } from '@/lib/auth/session';
import { buildInvoicePdf } from '@/lib/pdf/invoice-pdf';
import { pdfFileName } from '@/lib/pdf/file-name';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ invoiceId: string }> },
) {
  const { invoiceId } = await params;
  if (!z.uuid().safeParse(invoiceId).success) return new Response(null, { status: 404 });
  const ctx = await getSessionContext();
  if (!ctx?.org) return new Response(null, { status: 401 });
  const doc = await loadInvoiceDocument(await createClient(), ctx.org.id, invoiceId, {
    includeMemberPhone: true,
  });
  if (!doc) return new Response(null, { status: 404 });
  const bytes = await buildInvoicePdf(doc);
  return new Response(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${pdfFileName(doc.invoice.number)}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
