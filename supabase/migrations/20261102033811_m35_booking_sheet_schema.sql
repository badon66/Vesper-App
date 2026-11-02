-- M3.5 (Keenan, 2026-11-02): the booking sheet and Schedule redesign.
-- Additive only, as approved: the Looked into it before answer on leads,
-- the three step notes in settings, and a table for evenings with their own
-- meeting times. The functions that read day schedules come in the next
-- migration.

-- ---------------------------------------------------------------- leads

-- Find out: have they looked into permanent lights before?
create type public.looked_into_before as enum ('got_quotes', 'thought_about_it', 'new_to_them');

alter table public.leads add column looked_into_before public.looked_into_before;

-- An edit to the new answer shows in the timeline like every other Find out
-- answer: the same trigger function with the field added to its list.
create or replace function public.leads_log_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed text[];
begin
  if tg_op = 'INSERT' then
    insert into public.lead_events (lead_id, actor_id, type, to_status)
    values (new.id, auth.uid(), 'created', new.status);
    return null;
  end if;

  if new.status is distinct from old.status then
    insert into public.lead_events (lead_id, actor_id, type, from_status, to_status, payload)
    values (
      new.id, auth.uid(), 'status_change', old.status, new.status,
      case
        when new.status = 'lost' then jsonb_build_object('reason', new.lost_reason)
        when new.status = 'follow_up' then jsonb_build_object('follow_up_on', new.follow_up_on)
      end
    );
  end if;

  select coalesce(array_agg(n.key order by n.key), array[]::text[])
    into changed
    from jsonb_each(to_jsonb(new)) as n
   where n.key = any (array[
           'first_name', 'last_name', 'phone', 'email', 'address_line', 'city',
           'postal_code', 'neighbourhood', 'lat', 'lng', 'place_id', 'house_type',
           'soffit_colour', 'soffit_note', 'est_feet', 'notes', 'source', 'assigned_to',
           'follow_up_on', 'owns_home', 'wants_price', 'christmas_lights_now', 'areas_wanted',
           'install_timing', 'track_colour_id', 'track_ral_code', 'looked_into_before'
         ])
     and n.value is distinct from (to_jsonb(old) -> n.key)
     -- A status change already records the date it sets or clears.
     and not (n.key = 'follow_up_on' and new.status is distinct from old.status);

  if cardinality(changed) > 0 then
    insert into public.lead_events (lead_id, actor_id, type, payload)
    values (new.id, auth.uid(), 'edited', jsonb_build_object('fields', to_jsonb(changed)));
  end if;

  return null;
end;
$$;

-- ---------------------------------------------------------------- settings

-- One note per step of the booking sheet, shown behind its "?". They replace
-- the single Door guide, which stays in the table, unused.
alter table public.settings
  add column step_note_at_door text not null default $note$Who you are, that you're with Vesper Lighting, and why you're on their street.

Then find out, as a conversation, not a survey:
- Is it their home?
- Do they put up Christmas lights now, and how?
- Have they looked into permanent lights before, or is it new to them?
- Which parts of the house, and when?
- Who else decides on the house, and can they be at the meeting?$note$
    check (length(step_note_at_door) between 1 and 2000),
  add column step_note_after_door text not null default $note$Before you go: "Mind if I grab a few quick photos? Our lighting specialist will show you a mockup of your house with the lights on."

On the sidewalk: pick the address, check the soffit colour, and take the photos. Hold the phone sideways and get the whole roofline in.$note$
    check (length(step_note_after_door) between 1 and 2000),
  add column step_note_book text not null default $note$A half-hour meeting with our lighting specialist, tonight or this week: a free mockup and a clear price, no obligation. Tell them the time is theirs.

If it's not the right time, let the time go and set a follow-up day.$note$
    check (length(step_note_book) between 1 and 2000);

-- Setters read the notes the way they read the lost reasons. Columns are
-- only ever appended to this view.
create or replace view public.settings_public with (security_invoker = false) as
  select meeting_days, meeting_start, meeting_slot_minutes, meeting_slot_count,
         distance_warning_km, lost_reasons, door_guide,
         booking_cutoff_minutes, hold_grace_minutes, booking_window_days,
         step_note_at_door, step_note_after_door, step_note_book
  from public.settings
  where id = 1
    and exists (select 1 from public.profiles me where me.id = auth.uid() and me.active);

-- ---------------------------------------------------------------- day_schedules

-- One evening's own meeting times, set by the owner from Schedule's pencil.
-- An evening without one uses the template in settings. Changing one, or
-- going back to the usual times, stamps the old row; rows are never erased.
-- Written only by set_day_schedule (next migration), under the evening lock.
create table public.day_schedules (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles (id),
  day date not null,
  meeting_start time not null,
  meeting_slot_minutes int not null check (meeting_slot_minutes between 15 and 180),
  meeting_slot_count int not null check (meeting_slot_count between 1 and 12),
  created_by uuid not null references public.profiles (id),
  removed_at timestamptz,
  removed_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create unique index day_schedules_one_per_evening
  on public.day_schedules (host_id, day) where removed_at is null;

alter table public.day_schedules enable row level security;

-- Everyone on the sales side may read them; nobody writes them directly.
create policy "sales side reads day schedules"
  on public.day_schedules for select to authenticated
  using (public.is_sales_side());
