-- Round 22 (Keenan, 2026-11-15): Supabase's security advice. Additive: new
-- objects, views replaced with the same columns, and three helpers changed
-- to run as the caller. The policy speed-ups and merges are in the next
-- migration, r22_advisor_policies.
--
-- 1. The five views that show people only what they may see (lead_contacts,
--    lead_notes, profile_names, profiles_public, settings_public) ran as
--    their owner: the advisor's five "security definer view" errors. Each
--    view now runs as the person reading it (security_invoker) and reads
--    through a function in a private schema that the API doesn't serve,
--    with the very same rule. lead_contacts and lead_notes also leave out
--    deleted leads for anyone but Keenan, as every other list already does.
-- 2. Three helpers that only the database's own functions call
--    (current_user_role, slot_starts_on(date), slot_time_problem) now run as
--    the caller instead of as their owner. Inside the booking functions,
--    which run as their owner, they work exactly as before; called directly
--    by a signed-in person they see only what that person may see.

-- ---------------------------------------------------------------- 1. views

-- A new schema is closed to everyone until granted; only signed-in people
-- (and the server) may use it, and the API doesn't serve it.
create schema if not exists private;
grant usage on schema private to authenticated, service_role;

create or replace function private.lead_contacts_visible()
returns table (lead_id uuid, phone text, email text, created_by uuid, assigned_to uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, l.phone, l.email, l.created_by, l.assigned_to
  from public.leads l
  where (
      public.is_owner()
      or (public.is_sales_side() and (l.created_by = (select auth.uid()) or l.assigned_to = (select auth.uid())))
    )
    and (l.deleted_at is null or public.is_owner());
$$;

create or replace function private.lead_notes_visible()
returns table (lead_id uuid, notes text, answer_notes jsonb, created_by uuid, assigned_to uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, l.notes, l.answer_notes, l.created_by, l.assigned_to
  from public.leads l
  where (
      public.is_owner()
      or (public.is_sales_side() and (l.created_by = (select auth.uid()) or l.assigned_to = (select auth.uid())))
    )
    and (l.deleted_at is null or public.is_owner());
$$;

create or replace function private.profile_names_visible()
returns table (id uuid, full_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.full_name
  from public.profiles p
  where exists (select 1 from public.profiles me where me.id = (select auth.uid()) and me.active);
$$;

create or replace function private.profiles_public_visible()
returns table (id uuid, full_name text, role public.user_role)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.full_name, p.role
  from public.profiles p
  where p.active
    and exists (select 1 from public.profiles me where me.id = (select auth.uid()) and me.active);
$$;

create or replace function private.settings_public_visible()
returns table (
  meeting_days integer[],
  meeting_start time,
  meeting_slot_minutes integer,
  meeting_slot_count integer,
  distance_warning_km numeric,
  lost_reasons text[],
  door_guide text,
  booking_cutoff_minutes integer,
  hold_grace_minutes integer,
  booking_window_days integer,
  step_note_at_door text,
  step_note_after_door text,
  step_note_book text,
  hold_minutes integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.meeting_days, s.meeting_start, s.meeting_slot_minutes, s.meeting_slot_count,
    s.distance_warning_km, s.lost_reasons, s.door_guide, s.booking_cutoff_minutes,
    s.hold_grace_minutes, s.booking_window_days, s.step_note_at_door,
    s.step_note_after_door, s.step_note_book, s.hold_minutes
  from public.settings s
  where s.id = 1
    and exists (select 1 from public.profiles me where me.id = (select auth.uid()) and me.active);
$$;

grant execute on function private.lead_contacts_visible() to authenticated, service_role;
grant execute on function private.lead_notes_visible() to authenticated, service_role;
grant execute on function private.profile_names_visible() to authenticated, service_role;
grant execute on function private.profiles_public_visible() to authenticated, service_role;
grant execute on function private.settings_public_visible() to authenticated, service_role;

create or replace view public.lead_contacts with (security_invoker = true, security_barrier = true) as
  select lead_id, phone, email, created_by, assigned_to from private.lead_contacts_visible();

create or replace view public.lead_notes with (security_invoker = true, security_barrier = true) as
  select lead_id, notes, answer_notes, created_by, assigned_to from private.lead_notes_visible();

create or replace view public.profile_names with (security_invoker = true) as
  select id, full_name from private.profile_names_visible();

create or replace view public.profiles_public with (security_invoker = true) as
  select id, full_name, role from private.profiles_public_visible();

-- A function's columns can't carry numeric(5,1), so the view casts it back.
create or replace view public.settings_public with (security_invoker = true) as
  select meeting_days, meeting_start, meeting_slot_minutes, meeting_slot_count,
    distance_warning_km::numeric(5,1) as distance_warning_km, lost_reasons, door_guide, booking_cutoff_minutes,
    hold_grace_minutes, booking_window_days, step_note_at_door,
    step_note_after_door, step_note_book, hold_minutes
  from private.settings_public_visible();

-- ---------------------------------------------------------------- 2. helpers only the database calls

alter function public.current_user_role() security invoker;
alter function public.slot_starts_on(date) security invoker;
alter function public.slot_time_problem(timestamptz, timestamptz, boolean) security invoker;
