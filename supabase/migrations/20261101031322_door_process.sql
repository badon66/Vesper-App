-- The door process (Keenan, 2026-10-31). A setter's visit follows a short
-- structure: open, find out, photos, book. This adds:
--   - settings.door_guide, the owner-edited Door guide shown on New lead,
--     readable by setters through settings_public like the lost reasons;
--   - the Find out answers as lead columns, null until answered and logged by
--     field name when they change (soffit_colour already exists and gained
--     its two new values in the migration before this one);
--   - lead_photos.slot, so each guided photo records its slot. One photo per
--     slot per lead; a new photo in a taken slot takes it, and the earlier one
--     stays as an extra, because only the owner removes photos.
-- Nothing here is required to save a lead. M3's booking uses some of it.
-- Additive only.

-- ---------------------------------------------------------------- door guide

alter table public.settings
  add column door_guide text not null default $guide$1. Open. Who you are, that you're with Vesper Lighting, and why you're on their street.
2. Find out. Work the questions below into the chat. It's a conversation, not a survey.
3. Photos. "Mind if I grab a few quick photos? Our lighting specialist will show you a mockup of your house with the lights on."
4. Book. A half-hour meeting with our lighting specialist, tonight or this week: a free mockup and a clear price, no obligation. If it's not the right time, set a follow-up day.$guide$
  check (length(door_guide) between 1 and 4000);

-- Same view, with the Door guide added at the end. It still returns a row
-- only to a caller with an active profile, and still holds no money.
create or replace view public.settings_public with (security_invoker = false) as
  select meeting_days, meeting_start, meeting_slot_minutes, meeting_slot_count,
         distance_warning_km, lost_reasons, door_guide
  from public.settings
  where id = 1
    and exists (select 1 from public.profiles me where me.id = auth.uid() and me.active);

-- ---------------------------------------------------------------- find out

create type public.christmas_lights_now as enum ('hires', 'diy', 'none');
create type public.roofline_areas as enum ('front', 'front_and_sides', 'full_wrap', 'not_sure');
create type public.install_timing as enum ('before_christmas', 'new_year', 'no_rush');

alter table public.leads
  add column owns_home boolean,
  add column wants_price boolean,
  add column christmas_lights_now public.christmas_lights_now,
  add column areas_wanted public.roofline_areas,
  add column install_timing public.install_timing;

-- ---------------------------------------------------------------- photo slots

create type public.photo_slot as enum ('front', 'left_corner', 'right_corner', 'soffit');

alter table public.lead_photos add column slot public.photo_slot;

create unique index lead_photos_one_per_slot
  on public.lead_photos (lead_id, slot)
  where slot is not null;

-- A photo added to a slot that already has one takes the slot; the earlier
-- photo keeps its file and row and becomes an extra. Runs as the definer
-- because people cannot update photo rows; the insert itself is still
-- checked by Row Level Security, and if it is refused this is undone too.
create or replace function public.lead_photos_take_slot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.slot is not null then
    update public.lead_photos
       set slot = null
     where lead_id = new.lead_id
       and slot = new.slot;
  end if;
  return new;
end;
$$;

create trigger lead_photos_take_slot
  before insert on public.lead_photos
  for each row execute function public.lead_photos_take_slot();

-- The timeline records which slot a photo went into.
create or replace function public.lead_photos_log_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.lead_events (lead_id, actor_id, type, payload)
  values (
    new.lead_id, auth.uid(), 'photo_added',
    jsonb_strip_nulls(jsonb_build_object('photo_id', new.id, 'slot', new.slot))
  );
  return null;
end;
$$;

revoke execute on function public.lead_photos_take_slot() from public, anon, authenticated;

-- ---------------------------------------------------------------- timeline

-- The Find out answers are logged by field name, like every other edit.
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
           'install_timing'
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
