'use server';

import { randomUUID } from 'node:crypto';

import { revalidatePath } from 'next/cache';

import { copy } from '@/lib/copy';
import { ActionError, parseInput, runAction, type ActionResult } from '@/lib/errors';
import { fromPaise, toPaise } from '@/lib/money';
import { allowRequest, clientFingerprint } from '@/lib/rate-limit';
import { createAdminClient, type AdminSupabase } from '@/lib/supabase/admin';

import {
  gatewayActionError,
  loadCashfreeCredentials,
  openCashfreeLink,
  reconcileInvoiceLinks,
} from './gateway';
import { resolvePayToken } from './public';
import { payClaimSchema, payTokenInputSchema } from './schema';

const limited = () => new ActionError(copy.errors.rateLimited, 'rate_limited');

async function payableInvoice(admin: AdminSupabase, token: string) {
  const invoiceId = resolvePayToken(token);
  if (!invoiceId) throw new ActionError(copy.pay.expiredBody, 'not_found');
  const { data, error } = await admin
    .from('invoices')
    .select(
      'id,org_id,invoice_number,status,balance_due,members!inner(full_name,phone,email,deleted_at),organizations!inner(name)',
    )
    .eq('id', invoiceId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.members.deleted_at) throw new ActionError(copy.pay.expiredBody, 'not_found');
  return data;
}

async function openLinkUrl(admin: AdminSupabase, invoiceId: string): Promise<string | null> {
  const { data, error } = await admin
    .from('collection_requests')
    .select('short_url')
    .eq('invoice_id', invoiceId)
    .eq('provider', 'cashfree')
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (error) throw error;
  return data?.short_url ?? null;
}

export async function submitPayClaim(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const data = parseInput(payClaimSchema, input);
    const admin = createAdminClient();
    if (!(await allowRequest(admin, `pay-claim:${await clientFingerprint()}`, 10, 3600))) {
      throw limited();
    }
    const invoice = await payableInvoice(admin, data.token);
    if (data.amount > toPaise(invoice.balance_due)) {
      throw new ActionError(copy.errors.db.invalid_amount!, 'validation', {
        amount: [copy.errors.db.invalid_amount!],
      });
    }
    const { error } = await admin.rpc('submit_payment_claim', {
      p_invoice_id: invoice.id,
      p_amount: fromPaise(data.amount),
      p_utr: data.utr,
      ...(data.note ? { p_note: data.note } : {}),
    });
    if (error) throw error;
    revalidatePath('/dues');
    revalidatePath(`/invoices/${invoice.id}`);
    return null;
  });
}

export async function startOnlinePayment(input: unknown): Promise<ActionResult<{ url: string }>> {
  return runAction(async () => {
    const { token } = parseInput(payTokenInputSchema, input);
    const admin = createAdminClient();
    if (!(await allowRequest(admin, `pay-online:${await clientFingerprint()}`, 10, 3600))) {
      throw limited();
    }
    const invoice = await payableInvoice(admin, token);
    if (invoice.status === 'void' || invoice.balance_due <= 0) {
      throw new ActionError(copy.errors.db.invoice_not_payable!, 'validation');
    }
    const existing = await openLinkUrl(admin, invoice.id);
    if (existing) return { url: existing };
    const credentials = await loadCashfreeCredentials(admin, invoice.org_id);
    if (!credentials) throw new ActionError(copy.pay.onlineUnavailable, 'validation');
    try {
      const link = await openCashfreeLink(
        admin,
        credentials,
        {
          id: invoice.id,
          orgId: invoice.org_id,
          orgName: invoice.organizations.name,
          number: invoice.invoice_number,
          balance: toPaise(invoice.balance_due),
          memberName: invoice.members.full_name,
          memberPhone: invoice.members.phone,
          memberEmail: invoice.members.email,
        },
        randomUUID(),
      );
      revalidatePath(`/invoices/${invoice.id}`);
      return { url: link.url };
    } catch (error) {
      // Two taps at once: the other request's link won, so hand that one out.
      const raced = await openLinkUrl(admin, invoice.id);
      if (raced) return { url: raced };
      throw gatewayActionError(error);
    }
  });
}

export async function checkOnlinePayment(
  input: unknown,
): Promise<ActionResult<{ paid: boolean; recorded: number }>> {
  return runAction(async () => {
    const { token } = parseInput(payTokenInputSchema, input);
    const admin = createAdminClient();
    if (!(await allowRequest(admin, `pay-check:${await clientFingerprint()}`, 30, 600))) {
      throw limited();
    }
    const invoice = await payableInvoice(admin, token);
    let recorded = 0;
    try {
      ({ recorded } = await reconcileInvoiceLinks(invoice.org_id, invoice.id));
    } catch (error) {
      throw gatewayActionError(error);
    }
    const { data, error } = await admin
      .from('invoices')
      .select('status')
      .eq('id', invoice.id)
      .single();
    if (error) throw error;
    if (recorded) {
      revalidatePath('/dues');
      revalidatePath(`/invoices/${invoice.id}`);
    }
    return { paid: data.status === 'paid', recorded };
  });
}
