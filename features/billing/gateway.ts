import 'server-only';

import { copy } from '@/lib/copy';
import { parseSecretKey, openSecret, sealSecret } from '@/lib/crypto/secret-box';
import { env } from '@/lib/env';
import { ActionError } from '@/lib/errors';
import { fromPaise, toPaise, type Paise } from '@/lib/money';
import {
  CashfreeError,
  cancelPaymentLink,
  createPaymentLink,
  getLinkOrders,
  getOrderPayments,
  getPaymentLink,
  type CashfreeCredentials,
  type CashfreeEnvironment,
} from '@/lib/payments/cashfree';
import { createAdminClient, type AdminSupabase } from '@/lib/supabase/admin';
import type { ServerSupabase } from '@/lib/supabase/server';

import { payLinkFor } from './pay-link';

export const GATEWAY_LINK_TTL_DAYS = 7;

function encryptionKey(): Buffer {
  return parseSecretKey(env.SECRETS_ENCRYPTION_KEY);
}

function secretContext(orgId: string): string {
  return `cashfree:${orgId}`;
}

export function sealCashfreeSecret(orgId: string, secretKey: string): string {
  return sealSecret(secretKey, encryptionKey(), secretContext(orgId));
}

/**
 * Decrypts the gym's Cashfree keys on the server. Staff cannot read the
 * secrets table, so this always uses the service role after the caller's gym
 * and role have been checked.
 */
export async function loadCashfreeCredentials(
  admin: AdminSupabase,
  orgId: string,
): Promise<CashfreeCredentials | null> {
  const { data, error } = await admin
    .from('organization_secrets')
    .select('cashfree_app_id,cashfree_secret_key_enc,cashfree_environment')
    .eq('org_id', orgId)
    .maybeSingle();
  if (error) throw error;
  if (!data?.cashfree_app_id || !data.cashfree_secret_key_enc || !data.cashfree_environment) {
    return null;
  }
  return {
    appId: data.cashfree_app_id,
    secretKey: openSecret(data.cashfree_secret_key_enc, encryptionKey(), secretContext(orgId)),
    environment: data.cashfree_environment as CashfreeEnvironment,
  };
}

export async function cashfreeEnvironment(
  admin: AdminSupabase,
  orgId: string,
): Promise<CashfreeEnvironment | null> {
  const { data, error } = await admin
    .from('organization_secrets')
    .select('cashfree_environment')
    .eq('org_id', orgId)
    .maybeSingle();
  if (error) throw error;
  return (data?.cashfree_environment as CashfreeEnvironment | null | undefined) ?? null;
}

/** Deterministic per request, so a retried request reuses the same Cashfree link. */
export function cashfreeLinkId(requestId: string): string {
  return `gd_${requestId.replace(/-/g, '')}`;
}

/** Friendly message for a failed Cashfree call; the raw reason goes to the server log. */
export function gatewayActionError(error: unknown): ActionError | unknown {
  if (!(error instanceof CashfreeError)) return error;
  console.error('[cashfree]', error.status, error.type, error.code, error.message);
  if (error.isUnavailable) return new ActionError(copy.gateway.unavailable, 'unknown');
  if (error.isAuthError) return new ActionError(copy.paymentSettings.invalidCredentials, 'unknown');
  return new ActionError(copy.gateway.rejected, 'unknown');
}

export type LinkInvoice = {
  id: string;
  orgId: string;
  orgName: string;
  number: string;
  balance: Paise;
  memberName: string;
  memberPhone: string;
  memberEmail: string | null;
};

/**
 * Creates the link at Cashfree, then records it. `db` is the staff session
 * when a team member asks (so the audit names them) or the service role for
 * the member's own pay page.
 */
export async function openCashfreeLink(
  db: ServerSupabase | AdminSupabase,
  credentials: CashfreeCredentials,
  invoice: LinkInvoice,
  requestId: string,
): Promise<{ id: string; url: string; expiresAt: string }> {
  const expiresAt = new Date(Date.now() + GATEWAY_LINK_TTL_DAYS * 86_400_000);
  const linkId = cashfreeLinkId(requestId);
  const returnUrl = `${payLinkFor(invoice.id).url}?checkout=1`;
  const link = await createPaymentLink(
    credentials,
    {
      linkId,
      amount: invoice.balance,
      purpose: `Invoice ${invoice.number} - ${invoice.orgName}`,
      customer: {
        name: invoice.memberName,
        phone: invoice.memberPhone,
        email: invoice.memberEmail,
      },
      expiresAt,
      notifyUrl: `${env.NEXT_PUBLIC_APP_URL}/api/webhooks/cashfree`,
      returnUrl,
    },
    requestId,
  );
  const { data, error } = await db.rpc('save_gateway_link', {
    p_org: invoice.orgId,
    p_invoice_id: invoice.id,
    p_request_id: requestId,
    p_link_id: link.linkId,
    p_url: link.url,
    p_amount: fromPaise(invoice.balance),
    p_expires_at: link.expiresAt ?? expiresAt.toISOString(),
  });
  if (error || !data) {
    // Do not leave a live link at Cashfree that GymDesk does not know about.
    await cancelPaymentLink(credentials, link.linkId).catch((cancelError: unknown) =>
      console.error('[cashfree] could not cancel unsaved link', link.linkId, cancelError),
    );
    throw error ?? new Error('save_gateway_link returned no row');
  }
  return { id: data.id, url: link.url, expiresAt: data.expires_at };
}

export type LinkRequest = {
  id: string;
  orgId: string;
  invoiceId: string;
  linkId: string;
  status: string;
};

/**
 * Reads the link, its orders and their payments back from Cashfree and
 * records every successful payment. Safe to repeat: each Cashfree payment id
 * is recorded at most once. Returns how many new payments were recorded.
 */
export async function reconcileCashfreeLink(
  credentials: CashfreeCredentials,
  request: LinkRequest,
): Promise<{ recorded: number; linkStatus: string }> {
  const admin = createAdminClient();
  const link = await getPaymentLink(credentials, request.linkId);
  let recorded = 0;

  if (link.amountPaid > 0 || link.status === 'PAID' || link.status === 'PARTIALLY_PAID') {
    const existing = await admin
      .from('payments')
      .select('gateway_payment_id')
      .eq('org_id', request.orgId)
      .eq('invoice_id', request.invoiceId)
      .eq('method', 'cashfree')
      .eq('is_reversal', false);
    if (existing.error) throw existing.error;
    const known = new Set((existing.data ?? []).map((p) => p.gateway_payment_id));

    for (const order of await getLinkOrders(credentials, request.linkId)) {
      if (order.status !== 'PAID') continue;
      for (const payment of await getOrderPayments(credentials, order.orderId)) {
        if (payment.status !== 'SUCCESS' || payment.currency !== 'INR') continue;
        const amount = toPaise(payment.amount);
        if (amount <= 0) continue;
        const reference = [payment.group, payment.bankReference]
          .filter(Boolean)
          .join(' · ')
          .slice(0, 100);
        const { error } = await admin.rpc('record_gateway_payment', {
          p_org: request.orgId,
          p_collection_request_id: request.id,
          p_gateway_payment_id: payment.cfPaymentId,
          p_amount: fromPaise(amount),
          p_paid_at: payment.paidAt ?? new Date().toISOString(),
          p_reference: reference || payment.cfPaymentId,
        });
        if (error) throw error;
        if (!known.has(payment.cfPaymentId)) {
          known.add(payment.cfPaymentId);
          recorded += 1;
        }
      }
    }
  }

  if (request.status === 'pending' && (link.status === 'EXPIRED' || link.status === 'CANCELLED')) {
    const { error } = await admin.rpc('close_gateway_link', {
      p_org: request.orgId,
      p_request_id: request.id,
      p_status: link.status === 'EXPIRED' ? 'expired' : 'cancelled',
    });
    if (error) throw error;
  }
  return { recorded, linkStatus: link.status };
}

/**
 * Links that may still carry an unrecorded payment: open ones, plus recently
 * lapsed ones whose final webhook could have been missed.
 */
export async function reconcileInvoiceLinks(
  orgId: string,
  invoiceId: string,
): Promise<{ recorded: number; checked: number }> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data, error } = await admin
    .from('collection_requests')
    .select('id,org_id,invoice_id,provider_link_id,status')
    .eq('org_id', orgId)
    .eq('invoice_id', invoiceId)
    .eq('provider', 'cashfree')
    .in('status', ['pending', 'expired'])
    .is('confirmed_payment_id', null)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(5);
  if (error) throw error;
  if (!data?.length) return { recorded: 0, checked: 0 };
  const credentials = await loadCashfreeCredentials(admin, orgId);
  if (!credentials) return { recorded: 0, checked: 0 };
  let recorded = 0;
  for (const row of data) {
    if (!row.provider_link_id) continue;
    const result = await reconcileCashfreeLink(credentials, {
      id: row.id,
      orgId: row.org_id,
      invoiceId: row.invoice_id,
      linkId: row.provider_link_id,
      status: row.status,
    });
    recorded += result.recorded;
  }
  return { recorded, checked: data.length };
}

/**
 * After the balance changes at the desk, an open link would ask for the old
 * amount. Cancel it at Cashfree first; if Cashfree refuses (for example because
 * it was just paid), record whatever was paid and keep the link as it is.
 */
export async function retireOpenCashfreeLinks(orgId: string, invoiceId: string): Promise<number> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('collection_requests')
    .select('id,org_id,invoice_id,provider_link_id,status')
    .eq('org_id', orgId)
    .eq('invoice_id', invoiceId)
    .eq('provider', 'cashfree')
    .eq('status', 'pending');
  if (error) throw error;
  if (!data?.length) return 0;
  const credentials = await loadCashfreeCredentials(admin, orgId);
  let retired = 0;
  for (const row of data) {
    if (credentials && row.provider_link_id) {
      try {
        await cancelPaymentLink(credentials, row.provider_link_id);
      } catch (cancelError) {
        console.error('[cashfree] cancel failed', row.provider_link_id, cancelError);
        try {
          await reconcileCashfreeLink(credentials, {
            id: row.id,
            orgId: row.org_id,
            invoiceId: row.invoice_id,
            linkId: row.provider_link_id,
            status: row.status,
          });
        } catch (reconcileError) {
          console.error('[cashfree] reconcile after failed cancel', reconcileError);
        }
        continue;
      }
    }
    const closed = await admin.rpc('close_gateway_link', {
      p_org: orgId,
      p_request_id: row.id,
      p_status: 'cancelled',
    });
    if (closed.error) throw closed.error;
    retired += 1;
  }
  return retired;
}
