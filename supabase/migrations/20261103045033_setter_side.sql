-- The setter side (Keenan, 2026-11-03): the first sign-in welcome, and
-- notices for setters.
--
-- What:
--   - profiles.welcome_done_at: when the setter finished or skipped the
--     welcome; null shows it on Home;
--   - finish_welcome(): stamps the caller's own row, nothing else;
--   - reset_welcome(profile_id): Keenan clears it for a setter, from People;
--   - push_targets_for_member(profile_id): hands Keenan's server a member's
--     sealed push addresses, for the notice a setter gets when Keenan marks,
--     moves or cancels their booking. Owner only; nothing readable leaves;
--   - push_devices_for_member(profile_id): a member's devices by label and
--     date, for View as. Owner only; never the addresses.
-- Why: setters see a short welcome once and hear about Keenan's decisions
-- on their bookings, sent from Keenan's own action with no secret key.
-- Additive: one column and four functions; nothing is replaced or removed.

alter table public.profiles add column welcome_done_at timestamptz;
comment on column public.profiles.welcome_done_at is
  'When this setter finished or skipped the first sign-in welcome. Null shows it on Home; Keenan can reset it from People.';

create or replace function public.finish_welcome()
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  stamped timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  update public.profiles
     set welcome_done_at = coalesce(welcome_done_at, now())
   where id = auth.uid()
  returning welcome_done_at into stamped;
  return stamped;
end;
$$;

create or replace function public.reset_welcome(p_profile_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.acts_as_owner() then
    raise exception 'Only Keenan can reset the welcome.' using errcode = '42501';
  end if;
  update public.profiles
     set welcome_done_at = null
   where id = p_profile_id
     and role = 'sales';
  return found;
end;
$$;

-- Empty for anyone but the owner (or the test suite's service role).
create or replace function public.push_targets_for_member(p_profile_id uuid)
returns table (id uuid, sealed text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.sealed
    from public.push_subscriptions p
   where p.profile_id = p_profile_id
     and p.removed_at is null
     and public.acts_as_owner();
$$;

create or replace function public.push_devices_for_member(p_profile_id uuid)
returns table (id uuid, label text, created_at timestamptz, last_sent_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.label, p.created_at, p.last_sent_at
    from public.push_subscriptions p
   where p.profile_id = p_profile_id
     and p.removed_at is null
     and public.acts_as_owner()
   order by p.created_at;
$$;

revoke execute on function public.finish_welcome() from public, anon;
revoke execute on function public.reset_welcome(uuid) from public, anon;
revoke execute on function public.push_targets_for_member(uuid) from public, anon;
revoke execute on function public.push_devices_for_member(uuid) from public, anon;
grant execute on function public.finish_welcome() to authenticated, service_role;
grant execute on function public.reset_welcome(uuid) to authenticated, service_role;
grant execute on function public.push_targets_for_member(uuid) to authenticated, service_role;
grant execute on function public.push_devices_for_member(uuid) to authenticated, service_role;
