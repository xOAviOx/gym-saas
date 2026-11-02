'use server';

import { revalidatePath } from 'next/cache';

import { PRIVILEGED_ROLES } from '@/lib/auth/roles';
import { authorize } from '@/lib/auth/session';
import { copy } from '@/lib/copy';
import { ActionError, parseInput, runAction, unwrap, type ActionResult } from '@/lib/errors';
import { fromPaise, toPaise } from '@/lib/money';
import { CashfreeError, cancelPaymentLink, verifyCredentials } from '@/lib/payments/cashfree';
import { createAdminClient } from '@/lib/supabase/admin';
import type { ServerSupabase } from '@/lib/supabase/server';

import {
  gatewayActionError,
  loadCashfreeCredentials,
  openCashfreeLink,
  reconcileCashfreeLink,
  reconcileInvoiceLinks,
  retireOpenCashfreeLinks,
  sealCashfreeSecret,
} from './gateway';
import {
  cancelLinkSchema,
  cashfreeCredentialsSchema,
  claimDecisionSchema,
  createLinkSchema,
  invoiceRefSchema,
  paymentSettingsSchema,
  recordPaymentSchema,
  rejectClaimSchema,
  reversePaymentSchema,
  voidInvoiceSchema,
} from './schema';

function revalidateInvoice(invoiceId: string, memberId: string) {
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath(`/members/${memberId}`);
  revalidatePath('/members');
  revalidatePath('/dues');
  revalidatePath('/today');
}

/** The invoice as the caller's session sees it; RLS keeps it inside their gym. */
async function loadInvoice(supabase: ServerSupabase, orgId: string, invoiceId: string) {
  const response = await supabase
    .from('invoices')
    .select(
      'id,org_id,invoice_number,status,balance_due,amount_paid,member_id,members!inner(full_name,phone,email,deleted_at)',
    )
    .eq('org_id', orgId)
    .eq('id', invoiceId)
    .maybeSingle();
  const invoice = unwrap(response);
  if (invoice.members.deleted_at) throw new ActionError(copy.invoices.memberDeleted, 'validation');
  return invoice;
}

/** Best effort: a desk payment already succeeded, so a Cashfree hiccup must not fail it. */
async function retireLinksQuietly(orgId: string, invoiceId: string): Promise<boolean> {
  try {
    return (await retireOpenCashfreeLinks(orgId, invoiceId)) > 0;
  } catch (error) {
    console.error('[cashfree] could not retire open links', invoiceId, error);
    return false;
  }
}

export async function recordPayment(
  input: unknown,
): Promise<ActionResult<{ paymentId: string; linkCancelled: boolean }>> {
  return runAction(async () => {
    const { supabase, ctx } = await authorize();
    const data = parseInput(recordPaymentSchema, input);
    const invoice = await loadInvoice(supabase, ctx.org.id, data.invoiceId);
    if (data.amount > toPaise(invoice.balance_due)) {
      throw new ActionError(copy.errors.db.amount_exceeds_balance!, 'validation', {
        amount: [copy.errors.db.amount_exceeds_balance!],
      });
    }
    const payment = unwrap(
      await supabase.rpc('record_payment', {
        p_org: ctx.org.id,
        p_invoice_id: data.invoiceId,
        p_request_id: data.requestId,
        p_amount: fromPaise(data.amount),
        p_method: data.method,
        ...(data.utr ? { p_utr: data.utr } : {}),
        ...(data.reference ? { p_reference: data.reference } : {}),
        p_paid_on: data.paidOn,
      }),
    );
    const linkCancelled = await retireLinksQuietly(ctx.org.id, data.invoiceId);
    revalidateInvoice(data.invoiceId, invoice.member_id);
    return { paymentId: payment.id, linkCancelled };
  });
}

export async function reversePayment(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const { supabase, ctx } = await authorize(PRIVILEGED_ROLES);
    const data = parseInput(reversePaymentSchema, input);
    const response = await supabase
      .from('payments')
      .select('id,member_id')
      .eq('org_id', ctx.org.id)
      .eq('invoice_id', data.invoiceId)
      .eq('id', data.paymentId)
      .maybeSingle();
    const payment = unwrap(response);
    unwrap(
      await supabase.rpc('reverse_payment', { p_payment_id: payment.id, p_reason: data.reason }),
    );
    revalidateInvoice(data.invoiceId, payment.member_id);
    return null;
  });
}

export async function voidInvoice(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const { supabase, ctx } = await authorize(PRIVILEGED_ROLES);
    const data = parseInput(voidInvoiceSchema, input);
    const response = await supabase
      .from('invoices')
      .select('id,member_id,amount_paid')
      .eq('org_id', ctx.org.id)
      .eq('id', data.invoiceId)
      .maybeSingle();
    const invoice = unwrap(response);
    if (invoice.amount_paid !== 0) {
      throw new ActionError(copy.invoices.voidHasPayments, 'validation');
    }
    // A link left open at Cashfree could still take money for a void invoice.
    await retireOpenCashfreeLinks(ctx.org.id, invoice.id);
    const { count, error } = await supabase
      .from('collection_requests')
      .select('id', { count: 'exact', head: true })
      .eq('invoice_id', invoice.id)
      .eq('provider', 'cashfree')
      .eq('status', 'pending');
    if (error) throw error;
    if (count) throw new ActionError(copy.gateway.unavailable, 'unknown');
    unwrap(await supabase.rpc('void_invoice', { p_invoice_id: invoice.id, p_reason: data.reason }));
    revalidateInvoice(invoice.id, invoice.member_id);
    return null;
  });
}

async function loadClaim(
  supabase: ServerSupabase,
  orgId: string,
  invoiceId: string,
  claimId: string,
) {
  const response = await supabase
    .from('payment_claims')
    .select('id,member_id')
    .eq('org_id', orgId)
    .eq('invoice_id', invoiceId)
    .eq('id', claimId)
    .maybeSingle();
  return unwrap(response);
}

export async function confirmClaim(
  input: unknown,
): Promise<ActionResult<{ linkCancelled: boolean }>> {
  return runAction(async () => {
    const { supabase, ctx } = await authorize();
    const data = parseInput(claimDecisionSchema, input);
    const claim = await loadClaim(supabase, ctx.org.id, data.invoiceId, data.claimId);
    unwrap(await supabase.rpc('confirm_payment_claim', { p_claim_id: claim.id }));
    const linkCancelled = await retireLinksQuietly(ctx.org.id, data.invoiceId);
    revalidateInvoice(data.invoiceId, claim.member_id);
    return { linkCancelled };
  });
}

export async function rejectClaim(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const { supabase, ctx } = await authorize();
    const data = parseInput(rejectClaimSchema, input);
    const claim = await loadClaim(supabase, ctx.org.id, data.invoiceId, data.claimId);
    unwrap(
      await supabase.rpc('reject_payment_claim', { p_claim_id: claim.id, p_reason: data.reason }),
    );
    revalidateInvoice(data.invoiceId, claim.member_id);
    return null;
  });
}

export async function createGatewayLink(input: unknown): Promise<ActionResult<{ url: string }>> {
  return runAction(async () => {
    const { supabase, ctx } = await authorize();
    const data = parseInput(createLinkSchema, input);
    const invoice = await loadInvoice(supabase, ctx.org.id, data.invoiceId);
    if (invoice.status === 'void' || invoice.balance_due <= 0) {
      throw new ActionError(copy.errors.db.invoice_not_payable!, 'validation');
    }
    const open = await supabase
      .from('collection_requests')
      .select('short_url')
      .eq('invoice_id', invoice.id)
      .eq('provider', 'cashfree')
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    if (open.error) throw open.error;
    if (open.data?.short_url) return { url: open.data.short_url };

    const credentials = await loadCashfreeCredentials(createAdminClient(), ctx.org.id);
    if (!credentials) throw new ActionError(copy.gateway.notConfigured, 'validation');
    try {
      const link = await openCashfreeLink(
        supabase,
        credentials,
        {
          id: invoice.id,
          orgId: ctx.org.id,
          orgName: ctx.org.name,
          number: invoice.invoice_number,
          balance: toPaise(invoice.balance_due),
          memberName: invoice.members.full_name,
          memberPhone: invoice.members.phone,
          memberEmail: invoice.members.email,
        },
        data.requestId,
      );
      revalidateInvoice(invoice.id, invoice.member_id);
      return { url: link.url };
    } catch (error) {
      throw gatewayActionError(error);
    }
  });
}

export async function checkGatewayLinks(
  input: unknown,
): Promise<ActionResult<{ recorded: number }>> {
  return runAction(async () => {
    const { supabase, ctx } = await authorize();
    const data = parseInput(invoiceRefSchema, input);
    const response = await supabase
      .from('invoices')
      .select('id,member_id')
      .eq('org_id', ctx.org.id)
      .eq('id', data.invoiceId)
      .maybeSingle();
    const invoice = unwrap(response);
    try {
      const { recorded } = await reconcileInvoiceLinks(ctx.org.id, invoice.id);
      revalidateInvoice(invoice.id, invoice.member_id);
      return { recorded };
    } catch (error) {
      throw gatewayActionError(error);
    }
  });
}

export async function cancelGatewayLink(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const { supabase, ctx } = await authorize();
    const data = parseInput(cancelLinkSchema, input);
    const response = await supabase
      .from('collection_requests')
      .select('id,org_id,invoice_id,member_id,provider_link_id,status')
      .eq('org_id', ctx.org.id)
      .eq('invoice_id', data.invoiceId)
      .eq('id', data.collectionRequestId)
      .eq('provider', 'cashfree')
      .maybeSingle();
    const request = unwrap(response);
    if (request.status === 'pending' && request.provider_link_id) {
      const credentials = await loadCashfreeCredentials(createAdminClient(), ctx.org.id);
      if (credentials) {
        try {
          await cancelPaymentLink(credentials, request.provider_link_id);
        } catch (error) {
          if (error instanceof CashfreeError && !error.isUnavailable) {
            // Usually means the member has just paid; record it instead of hiding it.
            await reconcileCashfreeLink(credentials, {
              id: request.id,
              orgId: request.org_id,
              invoiceId: request.invoice_id,
              linkId: request.provider_link_id,
              status: request.status,
            }).catch((reconcileError: unknown) => console.error('[cashfree]', reconcileError));
            revalidateInvoice(request.invoice_id, request.member_id);
          }
          throw gatewayActionError(error);
        }
      }
      unwrap(
        await supabase.rpc('close_gateway_link', {
          p_org: ctx.org.id,
          p_request_id: request.id,
          p_status: 'cancelled',
        }),
      );
    }
    revalidateInvoice(request.invoice_id, request.member_id);
    return null;
  });
}

function revalidateSettings() {
  revalidatePath('/settings/payments');
  revalidatePath('/more');
}

export async function savePaymentSettings(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const { supabase, ctx } = await authorize(PRIVILEGED_ROLES);
    const data = parseInput(paymentSettingsSchema, input);
    unwrap(
      await supabase.rpc('update_payment_settings', {
        p_org: ctx.org.id,
        p_upi_vpa: data.upiVpa,
        p_upi_payee_name: data.upiPayeeName,
        p_default_mode: data.defaultMode,
      }),
    );
    revalidateSettings();
    return null;
  });
}

export async function saveCashfreeCredentials(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const { supabase, ctx } = await authorize(PRIVILEGED_ROLES);
    const data = parseInput(cashfreeCredentialsSchema, input);
    const admin = createAdminClient();
    const current = await admin
      .from('organization_secrets')
      .select('cashfree_app_id,cashfree_environment')
      .eq('org_id', ctx.org.id)
      .maybeSingle();
    if (current.error) throw current.error;
    const switchingAccount =
      !!current.data?.cashfree_app_id &&
      (current.data.cashfree_app_id !== data.appId ||
        current.data.cashfree_environment !== data.environment);
    if (switchingAccount) {
      // Open links belong to the old account and could no longer be checked.
      const { count, error } = await supabase
        .from('collection_requests')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', ctx.org.id)
        .eq('provider', 'cashfree')
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString());
      if (error) throw error;
      if (count) throw new ActionError(copy.errors.db.gateway_links_pending!, 'conflict');
    }
    let valid: boolean;
    try {
      valid = await verifyCredentials(data);
    } catch (error) {
      throw gatewayActionError(error);
    }
    if (!valid) {
      throw new ActionError(copy.paymentSettings.invalidCredentials, 'validation', {
        secretKey: [copy.paymentSettings.invalidCredentials],
      });
    }
    unwrap(
      await supabase.rpc('save_cashfree_credentials', {
        p_org: ctx.org.id,
        p_app_id: data.appId,
        p_secret_enc: sealCashfreeSecret(ctx.org.id, data.secretKey),
        p_environment: data.environment,
      }),
    );
    revalidateSettings();
    return null;
  });
}

export async function removeCashfreeCredentials(): Promise<ActionResult<null>> {
  return runAction(async () => {
    const { supabase, ctx } = await authorize(PRIVILEGED_ROLES);
    const { error } = await supabase.rpc('remove_cashfree_credentials', { p_org: ctx.org.id });
    if (error) throw error;
    revalidateSettings();
    return null;
  });
}
