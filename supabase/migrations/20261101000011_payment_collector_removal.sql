-- Removing a team member (or deleting their account) clears payments.collected_by
-- through ON DELETE SET NULL. The immutability trigger rejected that update, so a
-- staff member who had ever recorded a payment could not be removed or erased.
-- Clearing the collector is now the one change allowed; money fields stay frozen.
create or replace function public.payments_forbid_update() returns trigger
language plpgsql as $$
begin
  if old.collected_by is not null and new.collected_by is null
     and (to_jsonb(new) - 'collected_by' - 'updated_at') = (to_jsonb(old) - 'collected_by' - 'updated_at') then
    return new;
  end if;
  raise exception 'payments are immutable; record a reversal instead' using errcode = 'P0001';
end;
$$;
