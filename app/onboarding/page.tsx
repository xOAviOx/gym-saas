import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { CreateGymForm } from '@/components/onboarding/create-gym-form';
import { FirstMemberStep } from '@/components/onboarding/first-member-step';
import { PlansForm } from '@/components/onboarding/plans-form';
import { Steps } from '@/components/onboarding/steps';
import { countPlans } from '@/features/plans/queries';
import { getSessionContext } from '@/lib/auth/session';
import { copy } from '@/lib/copy';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: copy.onboarding.title };

type SearchParams = Promise<{ step?: string }>;

/**
 * Picks the step from what already exists: no gym → create it; no plans → add
 * them; otherwise the final step, unless the person is done and should be in the app.
 */
export default async function OnboardingPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await getSessionContext();
  if (!ctx) {
    redirect('/sign-in');
  }

  if (!ctx.org) {
    return (
      <>
        <Steps current={1} labels={copy.onboarding.steps} />
        <h1 className="text-2xl">{copy.onboarding.gym.title}</h1>
        <p className="text-muted-foreground mt-1 mb-6 text-sm">{copy.onboarding.gym.subtitle}</p>
        <CreateGymForm />
      </>
    );
  }

  const supabase = await createClient();
  const plans = await countPlans(supabase, ctx.org.id);

  if (plans === 0) {
    return (
      <>
        <Steps current={2} labels={copy.onboarding.steps} />
        <h1 className="text-2xl">{copy.onboarding.plans.title}</h1>
        <p className="text-muted-foreground mt-1 mb-6 text-sm">{copy.onboarding.plans.subtitle}</p>
        <PlansForm />
      </>
    );
  }

  const params = await searchParams;
  if (params.step !== '3') {
    redirect('/today');
  }

  return (
    <>
      <Steps current={3} labels={copy.onboarding.steps} />
      <h1 className="text-2xl">{copy.onboarding.firstMember.title}</h1>
      <p className="text-muted-foreground mt-1 mb-6 text-sm">
        {copy.onboarding.firstMember.subtitle}
      </p>
      <FirstMemberStep />
    </>
  );
}
