-- The Auth server inserts a new user first and writes the custom app_metadata
-- in a following update, so the insert trigger never sees the role. The
-- profile is now created by the same function from either the insert (the
-- owner, decided by email) or the first update that sets app_metadata. The
-- function does nothing when a profile already exists.
-- Applied through the Supabase connector as "m1_profile_on_app_metadata".

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  wanted text := coalesce(new.raw_app_meta_data, '{}'::jsonb)->>'role';
  assigned public.user_role;
begin
  if exists (select 1 from public.profiles where id = new.id) then
    return new;
  end if;

  if lower(new.email) = 'info@vesperlighting.ca' then
    assigned := 'owner';
  elsif wanted in ('sales', 'crew') then
    assigned := wanted::public.user_role;
  else
    -- No role yet, or a role we do not hand out: no profile, no access.
    return new;
  end if;

  insert into public.profiles (id, email, full_name, phone, role)
  values (
    new.id,
    new.email,
    coalesce(nullif(trim(meta->>'full_name'), ''), split_part(new.email, '@', 1)),
    nullif(trim(meta->>'phone'), ''),
    assigned
  );
  return new;
end;
$$;

create trigger on_auth_user_app_metadata_set
  after update of raw_app_meta_data on auth.users
  for each row
  when (old.raw_app_meta_data is distinct from new.raw_app_meta_data)
  execute function public.handle_new_user();
