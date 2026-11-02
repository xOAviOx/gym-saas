-- M1 callers now use the atomic, validated, audited RPCs exclusively.
-- Do not leave an alternate REST path that can skip validation or audit logs.
drop policy "members: members insert" on public.members;
drop policy "members: members update live rows" on public.members;
drop policy "plans: owner/manager insert" on public.plans;
drop policy "plans: owner/manager update" on public.plans;
