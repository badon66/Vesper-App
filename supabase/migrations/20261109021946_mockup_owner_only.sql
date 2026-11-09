-- The customer's mockup is Keenan's (found by the soffit colour code review,
-- 2026-11-09). The setters' photo policy never looked at the slot, so a
-- setter could put a photo in the mockup slot of their own lead, and it
-- would take the place of Keenan's in meeting mode and on the customer's
-- quote link. Only the owner fills that slot now. A guard rather than a new
-- policy, so nothing existing is replaced; a call with no signed-in person
-- (the server's own key) is not affected. Additive only.
create or replace function public.lead_photos_mockup_owner_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.slot = 'mockup' and auth.uid() is not null and not public.is_owner() then
    raise exception 'Only the admin adds the mockup' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.lead_photos_mockup_owner_only() from public, anon, authenticated;

create trigger lead_photos_mockup_owner_only
  before insert on public.lead_photos
  for each row execute function public.lead_photos_mockup_owner_only();
