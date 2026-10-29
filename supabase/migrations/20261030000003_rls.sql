-- =============================================================================
-- GymDesk · 0003 · row level security, grants, storage
--
-- Base policy (spec): org_id IN (SELECT org_id FROM team_members
--                                WHERE user_id = auth.uid() AND is_active)
-- expressed through my_org_ids() / my_org_ids_with_role(), both SECURITY DEFINER so
-- the policy on team_members itself never recurses, and evaluated once per query.
--
-- Write access through tables is deliberately narrow; money and status changes go
-- through the SQL functions in 0002 (SECURITY DEFINER, role-checked, audited).
-- Convention for later migrations: new internal functions must be revoked from
-- `authenticated` explicitly, because Supabase grants EXECUTE by default.
-- =============================================================================

alter table public.organizations        enable row level security;
alter table public.profiles             enable row level security;
alter table public.organization_secrets enable row level security;
alter table public.team_members         enable row level security;
alter table public.invitations          enable row level security;
alter table public.counters             enable row level security;
alter table public.members              enable row level security;
alter table public.plans                enable row level security;
alter table public.memberships          enable row level security;
alter table public.invoices             enable row level security;
alter table public.invoice_items        enable row level security;
alter table public.payments             enable row level security;
alter table public.collection_requests  enable row level security;
alter table public.payment_claims       enable row level security;
alter table public.check_ins            enable row level security;
alter table public.message_logs         enable row level security;
alter table public.expenses             enable row level security;
alter table public.portal_tokens        enable row level security;
alter table public.audit_logs           enable row level security;
alter table public.razorpay_events      enable row level security;
alter table public.rate_limits          enable row level security;

-- -----------------------------------------------------------------------------
-- organizations: every active member reads; owner/manager update.
-- Creation and deletion only via create_organization / schedule_organization_deletion.
-- -----------------------------------------------------------------------------
create policy "organizations: members read" on public.organizations
  for select to authenticated
  using (id in (select public.my_org_ids()));

create policy "organizations: owner/manager update" on public.organizations
  for update to authenticated
  using (id in (select public.my_org_ids_with_role('{owner,manager}')))
  with check (id in (select public.my_org_ids_with_role('{owner,manager}')));

-- -----------------------------------------------------------------------------
-- organization_secrets: ciphertext readable by members (staff create Razorpay links
-- under their own session); only owner/manager write.
-- -----------------------------------------------------------------------------
create policy "organization_secrets: members read" on public.organization_secrets
  for select to authenticated
  using (org_id in (select public.my_org_ids()));

create policy "organization_secrets: owner/manager insert" on public.organization_secrets
  for insert to authenticated
  with check (org_id in (select public.my_org_ids_with_role('{owner,manager}')));

create policy "organization_secrets: owner/manager update" on public.organization_secrets
  for update to authenticated
  using (org_id in (select public.my_org_ids_with_role('{owner,manager}')))
  with check (org_id in (select public.my_org_ids_with_role('{owner,manager}')));

-- -----------------------------------------------------------------------------
-- profiles: own row, plus teammates' names for the Team screen.
-- -----------------------------------------------------------------------------
create policy "profiles: self and teammates read" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.shares_org_with(id));

create policy "profiles: self insert" on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

create policy "profiles: self update" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- -----------------------------------------------------------------------------
-- team_members: read only; all changes via accept_invitation / change_team_role /
-- set_team_member_active / transfer_ownership.
-- -----------------------------------------------------------------------------
create policy "team_members: members read" on public.team_members
  for select to authenticated
  using (org_id in (select public.my_org_ids()));

-- -----------------------------------------------------------------------------
-- invitations: owner/manager manage; acceptance via accept_invitation.
-- -----------------------------------------------------------------------------
create policy "invitations: owner/manager read" on public.invitations
  for select to authenticated
  using (org_id in (select public.my_org_ids_with_role('{owner,manager}')));

create policy "invitations: owner/manager insert" on public.invitations
  for insert to authenticated
  with check (org_id in (select public.my_org_ids_with_role('{owner,manager}')) and role <> 'owner');

create policy "invitations: owner/manager update" on public.invitations
  for update to authenticated
  using (org_id in (select public.my_org_ids_with_role('{owner,manager}')))
  with check (org_id in (select public.my_org_ids_with_role('{owner,manager}')));

create policy "invitations: owner/manager delete" on public.invitations
  for delete to authenticated
  using (org_id in (select public.my_org_ids_with_role('{owner,manager}')));

-- counters: no policies. Only SQL functions touch them.

-- -----------------------------------------------------------------------------
-- members: all roles create and edit live members; soft delete / restore / purge
-- only via soft_delete_member / restore_member / purge_member_data (owner/manager).
-- -----------------------------------------------------------------------------
create policy "members: members read" on public.members
  for select to authenticated
  using (org_id in (select public.my_org_ids()));

create policy "members: members insert" on public.members
  for insert to authenticated
  with check (org_id in (select public.my_org_ids()) and deleted_at is null);

create policy "members: members update live rows" on public.members
  for update to authenticated
  using (org_id in (select public.my_org_ids()) and deleted_at is null)
  with check (org_id in (select public.my_org_ids()) and deleted_at is null);

-- -----------------------------------------------------------------------------
-- plans: everyone reads (needed to sell); owner/manager manage (Settings).
-- Plans are deactivated, never deleted.
-- -----------------------------------------------------------------------------
create policy "plans: members read" on public.plans
  for select to authenticated
  using (org_id in (select public.my_org_ids()));

create policy "plans: owner/manager insert" on public.plans
  for insert to authenticated
  with check (org_id in (select public.my_org_ids_with_role('{owner,manager}')));

create policy "plans: owner/manager update" on public.plans
  for update to authenticated
  using (org_id in (select public.my_org_ids_with_role('{owner,manager}')))
  with check (org_id in (select public.my_org_ids_with_role('{owner,manager}')));

-- -----------------------------------------------------------------------------
-- memberships: created via create_membership; dates/notes editable by all roles;
-- cancellation only via cancel_membership (owner/manager).
-- -----------------------------------------------------------------------------
create policy "memberships: members read" on public.memberships
  for select to authenticated
  using (org_id in (select public.my_org_ids()));

create policy "memberships: members insert" on public.memberships
  for insert to authenticated
  with check (org_id in (select public.my_org_ids()) and status <> 'cancelled');

create policy "memberships: members update" on public.memberships
  for update to authenticated
  using (org_id in (select public.my_org_ids()) and status <> 'cancelled')
  with check (org_id in (select public.my_org_ids()) and status <> 'cancelled');

-- -----------------------------------------------------------------------------
-- invoices / invoice_items: read only. Created by create_membership, totals kept
-- by the payments trigger, voided by void_invoice. Never deleted.
-- -----------------------------------------------------------------------------
create policy "invoices: members read" on public.invoices
  for select to authenticated
  using (org_id in (select public.my_org_ids()));

create policy "invoice_items: members read" on public.invoice_items
  for select to authenticated
  using (org_id in (select public.my_org_ids()));

-- -----------------------------------------------------------------------------
-- payments: insert for all roles, no update or delete for anyone.
-- Reversals are inserts made only by reverse_payment (owner/manager).
-- -----------------------------------------------------------------------------
create policy "payments: members read" on public.payments
  for select to authenticated
  using (org_id in (select public.my_org_ids()));

create policy "payments: members insert" on public.payments
  for insert to authenticated
  with check (org_id in (select public.my_org_ids()) and is_reversal = false);

-- -----------------------------------------------------------------------------
-- collection_requests: all roles create UPI/Razorpay requests and update their status.
-- -----------------------------------------------------------------------------
create policy "collection_requests: members read" on public.collection_requests
  for select to authenticated
  using (org_id in (select public.my_org_ids()));

create policy "collection_requests: members insert" on public.collection_requests
  for insert to authenticated
  with check (org_id in (select public.my_org_ids()));

create policy "collection_requests: members update" on public.collection_requests
  for update to authenticated
  using (org_id in (select public.my_org_ids()))
  with check (org_id in (select public.my_org_ids()));

-- -----------------------------------------------------------------------------
-- payment_claims: read only. Inserted by submit_payment_claim (portal route,
-- service role); resolved by confirm_payment_claim / reject_payment_claim.
-- -----------------------------------------------------------------------------
create policy "payment_claims: members read" on public.payment_claims
  for select to authenticated
  using (org_id in (select public.my_org_ids()));

-- -----------------------------------------------------------------------------
-- check_ins: append only (check_in_member or direct insert).
-- -----------------------------------------------------------------------------
create policy "check_ins: members read" on public.check_ins
  for select to authenticated
  using (org_id in (select public.my_org_ids()));

create policy "check_ins: members insert" on public.check_ins
  for insert to authenticated
  with check (org_id in (select public.my_org_ids()));

-- -----------------------------------------------------------------------------
-- message_logs: prepared by cron or staff, marked sent by staff.
-- -----------------------------------------------------------------------------
create policy "message_logs: members read" on public.message_logs
  for select to authenticated
  using (org_id in (select public.my_org_ids()));

create policy "message_logs: members insert" on public.message_logs
  for insert to authenticated
  with check (org_id in (select public.my_org_ids()));

create policy "message_logs: members update" on public.message_logs
  for update to authenticated
  using (org_id in (select public.my_org_ids()))
  with check (org_id in (select public.my_org_ids()));

-- -----------------------------------------------------------------------------
-- expenses: owner/manager only, in every direction.
-- -----------------------------------------------------------------------------
create policy "expenses: owner/manager read" on public.expenses
  for select to authenticated
  using (org_id in (select public.my_org_ids_with_role('{owner,manager}')));

create policy "expenses: owner/manager insert" on public.expenses
  for insert to authenticated
  with check (org_id in (select public.my_org_ids_with_role('{owner,manager}')));

create policy "expenses: owner/manager update" on public.expenses
  for update to authenticated
  using (org_id in (select public.my_org_ids_with_role('{owner,manager}')))
  with check (org_id in (select public.my_org_ids_with_role('{owner,manager}')));

create policy "expenses: owner/manager delete" on public.expenses
  for delete to authenticated
  using (org_id in (select public.my_org_ids_with_role('{owner,manager}')));

-- -----------------------------------------------------------------------------
-- portal_tokens: all roles issue and revoke member links (hashes only).
-- -----------------------------------------------------------------------------
create policy "portal_tokens: members read" on public.portal_tokens
  for select to authenticated
  using (org_id in (select public.my_org_ids()));

create policy "portal_tokens: members insert" on public.portal_tokens
  for insert to authenticated
  with check (org_id in (select public.my_org_ids()));

create policy "portal_tokens: members update" on public.portal_tokens
  for update to authenticated
  using (org_id in (select public.my_org_ids()))
  with check (org_id in (select public.my_org_ids()));

-- -----------------------------------------------------------------------------
-- audit_logs: owner reads; written only by write_audit_log and triggers.
-- -----------------------------------------------------------------------------
create policy "audit_logs: owner read" on public.audit_logs
  for select to authenticated
  using (org_id in (select public.my_org_ids_with_role('{owner}')));

-- razorpay_events, rate_limits: no policies. Service role only.

-- -----------------------------------------------------------------------------
-- Grants. anon has no access to anything: the public portal and the kiosk go
-- through server routes that validate the token or PIN and then use the service role.
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon;
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from anon;

-- PostgreSQL also grants EXECUTE to PUBLIC on every new function, which would let anon
-- (and authenticated, for the internal functions revoked below) in through the back door.
-- The built-in PUBLIC grant is global, so only the global form of ALTER DEFAULT PRIVILEGES
-- removes it for functions created later; the explicit Supabase grants to authenticated and
-- service_role are unaffected. Extensions must be created before this point.
revoke execute on all functions in schema public from public;
alter default privileges for role postgres revoke execute on functions from public;

-- Internal and service-only functions are not callable by signed-in users.
revoke execute on function public.next_counter_value(uuid, text) from authenticated;
revoke execute on function public.allocate_invoice_number(uuid, date) from authenticated;
revoke execute on function public.recompute_invoice(uuid) from authenticated;
revoke execute on function public.refresh_member_status(uuid) from authenticated;
revoke execute on function public.submit_payment_claim(uuid, numeric, text, text) from authenticated;
revoke execute on function public.check_rate_limit(text, integer, integer) from authenticated;
revoke execute on function public.daily_maintenance() from authenticated;

-- -----------------------------------------------------------------------------
-- Storage: one private bucket, images only, 5 MB. Object path is
--   {org_id}/members/{member_id}/{uuid}.jpg   (all roles)
--   {org_id}/logo/{uuid}.png                  (owner/manager)
--   {org_id}/expenses/{expense_id}/{uuid}.jpg (owner/manager)
-- Files are served through short-lived signed URLs created on the server.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('uploads', 'uploads', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "uploads: org members read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'uploads'
    and public.safe_uuid((storage.foldername(name))[1]) in (select public.my_org_ids())
  );

create policy "uploads: org members insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'uploads'
    and (
      ((storage.foldername(name))[2] = 'members'
        and public.safe_uuid((storage.foldername(name))[1]) in (select public.my_org_ids()))
      or ((storage.foldername(name))[2] in ('logo', 'expenses')
        and public.safe_uuid((storage.foldername(name))[1]) in (select public.my_org_ids_with_role('{owner,manager}')))
    )
  );

create policy "uploads: org members update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'uploads'
    and (
      ((storage.foldername(name))[2] = 'members'
        and public.safe_uuid((storage.foldername(name))[1]) in (select public.my_org_ids()))
      or ((storage.foldername(name))[2] in ('logo', 'expenses')
        and public.safe_uuid((storage.foldername(name))[1]) in (select public.my_org_ids_with_role('{owner,manager}')))
    )
  )
  with check (
    bucket_id = 'uploads'
    and (
      ((storage.foldername(name))[2] = 'members'
        and public.safe_uuid((storage.foldername(name))[1]) in (select public.my_org_ids()))
      or ((storage.foldername(name))[2] in ('logo', 'expenses')
        and public.safe_uuid((storage.foldername(name))[1]) in (select public.my_org_ids_with_role('{owner,manager}')))
    )
  );

create policy "uploads: org members delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'uploads'
    and (
      ((storage.foldername(name))[2] = 'members'
        and public.safe_uuid((storage.foldername(name))[1]) in (select public.my_org_ids()))
      or ((storage.foldername(name))[2] in ('logo', 'expenses')
        and public.safe_uuid((storage.foldername(name))[1]) in (select public.my_org_ids_with_role('{owner,manager}')))
    )
  );
