import { notFound } from 'next/navigation';
import { z } from 'zod';

import { memberQrFor } from '@/features/attendance/member-qr';
import { requireOrg } from '@/lib/auth/session';
import { qrPngDataUrl } from '@/lib/qr';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ memberId: string }> },
) {
  const { memberId } = await params;
  if (!z.uuid().safeParse(memberId).success) notFound();
  const ctx = await requireOrg();
  const { data: member, error } = await (
    await createClient()
  )
    .from('members')
    .select('member_code,qr_version,deleted_at')
    .eq('org_id', ctx.org.id)
    .eq('id', memberId)
    .maybeSingle();
  if (error) throw error;
  if (!member || member.deleted_at) notFound();
  const { token } = memberQrFor(memberId, member.qr_version);
  const dataUrl = await qrPngDataUrl(token);
  const bytes = new Uint8Array(Buffer.from(dataUrl.split(',')[1]!, 'base64'));
  return new Response(bytes, {
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename="${member.member_code}-check-in-qr.png"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
