'use server';

import { revalidatePath } from 'next/cache';

import { authorizeUser } from '@/lib/auth/session';
import { parseInput, runAction, unwrap, type ActionResult } from '@/lib/errors';

import { createOrganizationSchema } from './schema';

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
