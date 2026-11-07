-- Invitations and member portal links are written only through role-checked,
-- audited functions. Their token hashes are never included in audit rows.
drop policy if exists "invitations: owner/manager insert" on public.invitations;
drop policy if exists "invitations: owner/manager update" on public.invitations;
drop policy if exists "invitations: owner/manager delete" on public.invitations;
drop policy if exists "portal_tokens: members insert" on public.portal_tokens;
drop policy if exists "portal_tokens: members update" on public.portal_tokens;

create or replace function public.issue_invitation(
  p_org uuid, p_email text, p_role public.team_role, p_token_hash text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_email text := lower(btrim(coalesce(p_email, '')));
begin
  perform assert_org_role(p_org, array['owner','manager']::public.team_role[]);
  if p_role not in ('manager','staff') or v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
     or p_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_input';
  end if;
  insert into invitations (org_id, email, role, token_hash, expires_at, invited_by)
  values (p_org, v_email, p_role, p_token_hash, now() + interval '7 days', current_team_member_id(p_org))
  returning id into v_id;
  perform write_audit_log(p_org, 'team.invitation_created', 'invitation', v_id, null,
    jsonb_build_object('email', v_email, 'role', p_role));
  return v_id;
end;
$$;

create or replace function public.issue_portal_token(
  p_org uuid, p_member_id uuid, p_token_hash text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform assert_org_role(p_org, array['owner','manager','staff']::public.team_role[]);
  if p_token_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid_input'; end if;
  perform 1 from members where id = p_member_id and org_id = p_org and deleted_at is null;
  if not found then raise exception 'member_not_found'; end if;
  insert into portal_tokens (org_id, member_id, token_hash, expires_at)
  values (p_org, p_member_id, p_token_hash, now() + interval '30 days')
  returning id into v_id;
  perform write_audit_log(p_org, 'member.portal_link_created', 'member', p_member_id, null, null);
  return v_id;
end;
$$;

create or replace function public.revoke_member_portal_tokens(
  p_org uuid, p_member_id uuid
) returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  perform assert_org_role(p_org, array['owner','manager','staff']::public.team_role[]);
  perform 1 from members where id = p_member_id and org_id = p_org;
  if not found then raise exception 'member_not_found'; end if;
  update portal_tokens set revoked_at = now()
    where org_id = p_org and member_id = p_member_id and revoked_at is null;
  get diagnostics v_count = row_count;
  if v_count > 0 then
    perform write_audit_log(p_org, 'member.portal_links_revoked', 'member', p_member_id, null,
      jsonb_build_object('count', v_count));
  end if;
  return v_count;
end;
$$;

revoke all on function public.issue_invitation(uuid,text,public.team_role,text) from public, anon;
revoke all on function public.issue_portal_token(uuid,uuid,text) from public, anon;
revoke all on function public.revoke_member_portal_tokens(uuid,uuid) from public, anon;
grant execute on function public.issue_invitation(uuid,text,public.team_role,text) to authenticated;
grant execute on function public.issue_portal_token(uuid,uuid,text) to authenticated;
grant execute on function public.revoke_member_portal_tokens(uuid,uuid) to authenticated;

-- The permanent erasure path must never purge a live member, including via RPC.
create or replace function public.purge_member_data(p_member_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_m members; v_anon_phone text;
begin
  select * into v_m from members where id = p_member_id for update;
  if not found then raise exception 'member_not_found'; end if;
  perform assert_org_role(v_m.org_id, array['owner']::public.team_role[]);
  if v_m.deleted_at is null then raise exception 'member_must_be_deleted'; end if;
  v_anon_phone := '+000' || lpad(right(abs(hashtext(v_m.id::text))::text, 10), 10, '0');
  update members set full_name = 'Deleted member', phone = v_anon_phone,
    alt_phone = null, email = null, gender = null, dob = null, photo_url = null,
    address = null, emergency_contact_name = null, emergency_contact_phone = null,
    notes = null, tags = '{}', consent_messaging = false, referred_by_member_id = null
    where id = p_member_id;
  delete from check_ins where member_id = p_member_id;
  delete from message_logs where member_id = p_member_id;
  delete from portal_tokens where member_id = p_member_id;
  delete from payment_claims where member_id = p_member_id and status = 'pending';
  update memberships set notes = null where member_id = p_member_id;
  update invoices set notes = null where member_id = p_member_id;
  perform write_audit_log(v_m.org_id, 'member.purged', 'member', v_m.id,
    jsonb_build_object('member_code', v_m.member_code), null);
  return v_m.id;
end;
$$;
