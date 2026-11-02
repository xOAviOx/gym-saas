-- The secrets audit trigger appended bare string literals to a text[]; Postgres
-- resolves `text[] || 'literal'` as array concatenation and rejects the literal,
-- so every credential update failed. array_append keeps the element typed.
create or replace function public.organization_secrets_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_changed text[] := '{}';
begin
  if new.razorpay_key_id is distinct from old.razorpay_key_id then v_changed := array_append(v_changed, 'razorpay_key_id'); end if;
  if new.razorpay_key_secret_enc is distinct from old.razorpay_key_secret_enc then v_changed := array_append(v_changed, 'razorpay_key_secret'); end if;
  if new.razorpay_webhook_secret_enc is distinct from old.razorpay_webhook_secret_enc then v_changed := array_append(v_changed, 'razorpay_webhook_secret'); end if;
  if new.cashfree_app_id is distinct from old.cashfree_app_id then v_changed := array_append(v_changed, 'cashfree_app_id'); end if;
  if new.cashfree_secret_key_enc is distinct from old.cashfree_secret_key_enc then v_changed := array_append(v_changed, 'cashfree_secret_key'); end if;
  if new.cashfree_environment is distinct from old.cashfree_environment then v_changed := array_append(v_changed, 'cashfree_environment'); end if;
  if new.whatsapp_phone_number_id is distinct from old.whatsapp_phone_number_id then v_changed := array_append(v_changed, 'whatsapp_phone_number_id'); end if;
  if new.whatsapp_access_token_enc is distinct from old.whatsapp_access_token_enc then v_changed := array_append(v_changed, 'whatsapp_access_token'); end if;
  if cardinality(v_changed) = 0 then
    return null;
  end if;
  insert into audit_logs (org_id, actor_user_id, action, entity_type, entity_id, before, after)
  values (new.org_id, auth.uid(), 'organization.secrets_updated', 'organization_secrets', new.org_id, null,
          jsonb_build_object('changed', to_jsonb(v_changed), 'razorpay_key_id', new.razorpay_key_id,
                             'cashfree_app_id', new.cashfree_app_id, 'cashfree_environment', new.cashfree_environment));
  return null;
end;
$$;
