'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { getPlans } from '@/features/plans/queries';
import { authorize } from '@/lib/auth/session';
import { todayIST } from '@/lib/dates';
import { parseInput, runAction, unwrap, type ActionResult } from '@/lib/errors';
import { normalizePhone } from '@/lib/phone';
import type { ServerSupabase } from '@/lib/supabase/server';

import {
  buildImportPreview,
  importInputSchema,
  type ImportInput,
  type ImportPreviewRow,
} from './import';

async function prepare(supabase: ServerSupabase, orgId: string, input: ImportInput) {
  const phones = [
    ...new Set(
      input.rows.map((row) => normalizePhone(row.values.phone)).filter((p): p is string => !!p),
    ),
  ];
  const existing = new Set<string>();
  for (let offset = 0; offset < phones.length; offset += 100) {
    const { data, error } = await supabase
      .from('members')
      .select('phone')
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .in('phone', phones.slice(offset, offset + 100));
    if (error) throw error;
    for (const row of data ?? []) existing.add(row.phone);
  }
  return buildImportPreview(input, await getPlans(supabase, orgId, true), existing, todayIST());
}

export async function previewMemberImport(
  input: unknown,
): Promise<ActionResult<{ rows: ImportPreviewRow[]; ready: number; skipped: number }>> {
  return runAction(async () => {
    const { supabase, ctx } = await authorize();
    const data = parseInput(importInputSchema, input);
    const preview = await prepare(supabase, ctx.org.id, data);
    return {
      rows: preview.rows,
      ready: preview.ready.length,
      skipped: preview.rows.length - preview.ready.length,
    };
  });
}

export async function confirmMemberImport(
  input: unknown,
): Promise<ActionResult<{ imported: number; skipped: number }>> {
  return runAction(async () => {
    const { supabase, ctx } = await authorize();
    const data = parseInput(importInputSchema, input);
    // Re-read plans and duplicate phones; a preview is not authorization to write.
    const preview = await prepare(supabase, ctx.org.id, data);
    if (preview.ready.length === 0) return { imported: 0, skipped: data.rows.length };
    const result = unwrap(
      await supabase.rpc('import_members', { p_org: ctx.org.id, p_rows: preview.ready }),
    );
    const counts = z
      .object({ imported: z.number().int(), skipped: z.number().int() })
      .parse(result);
    revalidatePath('/members');
    revalidatePath('/today');
    return {
      imported: counts.imported,
      skipped: counts.skipped + data.rows.length - preview.ready.length,
    };
  });
}
