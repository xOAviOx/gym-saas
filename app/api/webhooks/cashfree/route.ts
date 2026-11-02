import { createHash } from 'node:crypto';

import { NextResponse } from 'next/server';

import { loadCashfreeCredentials, reconcileCashfreeLink } from '@/features/billing/gateway';
import { summarizeCashfreeWebhook, verifyCashfreeWebhook } from '@/lib/payments/cashfree';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 64 * 1024;

function reply(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * Cashfree payment-link webhooks. The body is only used to find the gym and
 * check the signature with that gym's secret; the payment itself is always
 * re-read from the Cashfree API before anything is recorded. Deliveries are
 * at-least-once, and recording is idempotent per Cashfree payment id.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) {
    return reply(413, { error: 'payload_too_large' });
  }
  const signature = request.headers.get('x-webhook-signature');
  const timestamp = request.headers.get('x-webhook-timestamp');
  if (!signature || !timestamp) return reply(401, { error: 'missing_signature' });

  const event = summarizeCashfreeWebhook(rawBody, request.headers.get('content-type'));
  if (!event) return reply(400, { error: 'invalid_payload' });
  // Not a link event GymDesk created (for example a test ping): acknowledge and ignore.
  if (!event.linkId) return reply(200, { ok: true, ignored: true });

  const admin = createAdminClient();
  const { data: link, error } = await admin
    .from('collection_requests')
    .select('id,org_id,invoice_id,provider_link_id,status')
    .eq('provider', 'cashfree')
    .eq('provider_link_id', event.linkId)
    .maybeSingle();
  if (error) {
    console.error('[cashfree webhook] lookup failed', error.message);
    return reply(500, { error: 'lookup_failed' });
  }
  if (!link?.provider_link_id) return reply(200, { ok: true, ignored: true });

  const credentials = await loadCashfreeCredentials(admin, link.org_id);
  if (!credentials) return reply(200, { ok: true, ignored: true });
  if (!verifyCashfreeWebhook({ rawBody, timestamp, signature, secretKey: credentials.secretKey })) {
    return reply(401, { error: 'invalid_signature' });
  }

  const eventId = `${timestamp}:${createHash('sha256').update(rawBody).digest('hex').slice(0, 40)}`;
  const logged = await admin.from('gateway_events').upsert(
    {
      org_id: link.org_id,
      provider: 'cashfree',
      event_id: eventId,
      event_type: event.type,
      payload: { link_id: event.linkId, link_status: event.linkStatus, order_id: event.orderId },
    },
    { onConflict: 'provider,event_id', ignoreDuplicates: true },
  );
  if (logged.error) console.error('[cashfree webhook] could not log event', logged.error.message);

  try {
    const result = await reconcileCashfreeLink(credentials, {
      id: link.id,
      orgId: link.org_id,
      invoiceId: link.invoice_id,
      linkId: link.provider_link_id,
      status: link.status,
    });
    await admin
      .from('gateway_events')
      .update({ processed_at: new Date().toISOString(), error: null })
      .eq('provider', 'cashfree')
      .eq('event_id', eventId);
    return reply(200, { ok: true, recorded: result.recorded });
  } catch (reconcileError) {
    const message =
      reconcileError instanceof Error
        ? reconcileError.message
        : typeof reconcileError === 'object' && reconcileError && 'message' in reconcileError
          ? String((reconcileError as { message: unknown }).message)
          : 'unknown';
    console.error('[cashfree webhook] reconcile failed', link.id, message);
    await admin
      .from('gateway_events')
      .update({ error: message.slice(0, 500) })
      .eq('provider', 'cashfree')
      .eq('event_id', eventId);
    // A non-2xx makes Cashfree retry later.
    return reply(500, { error: 'reconcile_failed' });
  }
}
