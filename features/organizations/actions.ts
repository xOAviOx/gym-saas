'use server';

import { revalidatePath } from 'next/cache';

import { authorize, authorizeUser } from '@/lib/auth/session';
import { PRIVILEGED_ROLES } from '@/lib/auth/roles';
import { parseInput, runAction, unwrap, type ActionResult } from '@/lib/errors';

import { createOrganizationSchema } from './schema';
import { gymSettingsSchema } from './settings';

export async function createOrganization(input: unknown): Promise<ActionResult<{ orgId: string }>> {
  return runAction(async () => {
    const data = parseInput(createOrganizationSchema, input);
    const { supabase } = await authorizeUser();

    // create_organization also makes the caller the owner, seeds counters and
    // secrets, sets the active org, and writes the audit entry.
    const org = unwrap(
      await supabase.rpc('create_organization', {
        p_name: data.name,
        p_city: data.city,
        p_phone: data.phone,
        p_upi_vpa: data.upiVpa,
        p_upi_payee_name: data.upiPayeeName,
        p_gst_enabled: data.gstEnabled,
        p_gstin: data.gstEnabled ? (data.gstin ?? '') : '',
        p_invoice_prefix: data.invoicePrefix,
      }),
    );

    revalidatePath('/', 'layout');
    return { orgId: org.id };
  });
}

export async function saveGymSettings(input: unknown): Promise<ActionResult<null>> {
  return runAction(async () => {
    const data = parseInput(gymSettingsSchema, input);
    const { supabase, ctx } = await authorize(PRIVILEGED_ROLES);
    unwrap(
      await supabase
        .from('organizations')
        .update({
          name: data.name,
          city: data.city || null,
          state: data.state || null,
          address_line: data.addressLine || null,
          phone: data.phone,
          email: data.email || null,
          invoice_prefix: data.invoicePrefix,
          gst_enabled: data.gstEnabled,
          gstin: data.gstEnabled ? data.gstin : null,
          gst_rate: data.gstRate,
        })
        .eq('id', ctx.org.id),
    );
    revalidatePath('/', 'layout');
    return null;
  });
}
