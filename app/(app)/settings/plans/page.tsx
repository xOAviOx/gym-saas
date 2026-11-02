import type { Metadata } from 'next';
import Link from 'next/link';

import { PlanEditor } from '@/components/plans/plan-editor';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { getPlans } from '@/features/plans/queries';
import { PRIVILEGED_ROLES } from '@/lib/auth/roles';
import { requireOrg } from '@/lib/auth/session';
import { copy } from '@/lib/copy';
import { formatMoney } from '@/lib/money';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: copy.plans.title };
export default async function PlansPage() {
  const ctx = await requireOrg(PRIVILEGED_ROLES);
  const plans = await getPlans(await createClient(), ctx.org.id);
  return (
    <>
      <Link href="/more" className="text-primary mb-4 inline-flex min-h-11 items-center text-sm">
        {copy.nav.more}
      </Link>
      <PageHeader
        title={copy.plans.title}
        description={copy.plans.description}
        action={<PlanEditor />}
      />
      {plans.length ? (
        <ul className="grid gap-3">
          {plans.map((plan) => (
            <li
              key={plan.id}
              className="bg-card flex items-center justify-between gap-4 rounded-xl border p-5"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-base font-semibold">{plan.name}</h2>
                  <span className="text-muted-foreground bg-muted rounded-full px-2 py-1 text-xs">
                    {plan.isActive ? copy.plans.available : copy.plans.archived}
                  </span>
                </div>
                <p className="text-muted-foreground mt-1 text-sm">
                  {copy.plans.validity(plan.durationDays)}
                  {plan.sessionCount ? ` · ${copy.plans.sessions(plan.sessionCount)}` : ''}
                </p>
                <p className="tabular mt-3 text-xl font-semibold">{formatMoney(plan.price)}</p>
                {plan.description ? (
                  <p className="text-muted-foreground mt-2 text-sm">{plan.description}</p>
                ) : null}
              </div>
              <PlanEditor
                key={`${plan.id}:${plan.price}:${plan.isActive}:${plan.name}`}
                plan={plan}
              />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={copy.plans.empty} body={copy.plans.emptyBody} />
      )}
    </>
  );
}
