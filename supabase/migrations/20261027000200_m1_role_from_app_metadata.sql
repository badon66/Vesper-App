-- Hardening: the role a new account gets comes from app_metadata, which only
-- the service role can write, instead of user_metadata, which a signed-in
-- user can change about themselves. An account created with no role or an
-- unknown role gets no profile row and therefore no access. The two public
-- views also return nothing to a caller without an active profile.
-- Applied through the Supabase connector as "m1_role_from_app_metadata".

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
  if lower(new.email) = 'info@vesperlighting.ca' then
    assigned := 'owner';
  elsif wanted in ('sales', 'crew') then
    assigned := wanted::public.user_role;
  else
    -- No role, or a role we do not hand out: no profile, no access.
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

create or replace view public.settings_public with (security_invoker = false) as
  select meeting_days, meeting_start, meeting_slot_minutes, meeting_slot_count, distance_warning_km
  from public.settings
  where id = 1
    and exists (select 1 from public.profiles me where me.id = auth.uid() and me.active);

create or replace view public.profiles_public with (security_invoker = false) as
  select id, full_name, role
  from public.profiles
  where active
    and exists (select 1 from public.profiles me where me.id = auth.uid() and me.active);
