-- Book now, finish later (Keenan, 2026-11-10).
--
-- What:
--   - leads.name_to_come and leads.address_to_come: two flags, false by
--     default. A booking made with no name saves first_name as
--     'Name to come' and name_to_come true; one made with no address saves
--     address_line as 'Address to come' and address_to_come true (the map
--     position stays empty). Every screen then reads naturally, and the
--     to-finish lists read the flags;
--   - leads_to_come_tidy: a flag stays on only while its field still holds
--     its placeholder, so it clears itself the moment the name or the
--     address is changed to anything else, and it can never be turned on
--     beside a real name or address;
--   - read grants for both flags: signed-in people read leads column by
--     column since contact privacy (2026-11-04). Writing is already granted
--     on the table, under the row policies, so only the lead's setter and
--     Keenan set them, as for every other field on a lead;
--   - booking_problems, the same signature: a No on owns the home is now
--     the only answer that rules a booking out. No answer yet and Not
--     collected both pass. The phone, wants a price, everyone who decides,
--     the soffit colour, the photos and the map position are all finished
--     later. book_meeting is unchanged and still refuses with
--     not_ready whenever booking_problems lists anything. One input check
--     stays: a skip reason of Other with no note, while the three guided
--     photos aren't all there, is listed as photos_skip_note, because the
--     meetings table can't store Other without its note and would otherwise
--     refuse the booking with a bare constraint error. The app sends no
--     skip reason at all when the photos are simply to finish later.
--
-- Why: a setter at the door books the time first and finishes the rest
-- afterwards. Only a time and a name or an address are needed to book, and
-- a No on owns the home still rules it out.
--
-- Not changed: meetings.everyone_deciding_present stays true on every
-- booking (book_meeting writes true, and its check needs true; changing
-- that check isn't additive). The timeline doesn't list the two flags: they
-- follow the name and the address, whose own changes are already listed.
--
-- Additive only: two new columns with defaults, two grants, one new
-- trigger and its function, and one function body re-created with the same
-- signature.

-- ---------------------------------------------------------------- the flags

alter table public.leads
  add column name_to_come boolean not null default false,
  add column address_to_come boolean not null default false;

comment on column public.leads.name_to_come is
  'Booked with no name (2026-11-10): first_name holds ''Name to come'' until the setter or Keenan fills it in. Cleared by leads_to_come_tidy.';
comment on column public.leads.address_to_come is
  'Booked with no address (2026-11-10): address_line holds ''Address to come'' until the setter or Keenan fills it in. Cleared by leads_to_come_tidy.';

-- Leads are read column by column since contact privacy (2026-11-04), so
-- each new column needs its own read grant.
grant select (name_to_come, address_to_come) on public.leads to authenticated;

-- A flag means its field still holds the placeholder. When the field holds
-- anything else, the flag is off. Runs after the other before triggers on
-- leads (triggers run in name order), so it sees the final name and
-- address.
create or replace function public.leads_to_come_tidy()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.name_to_come and btrim(new.first_name) is distinct from 'Name to come' then
    new.name_to_come := false;
  end if;
  if new.address_to_come and btrim(new.address_line) is distinct from 'Address to come' then
    new.address_to_come := false;
  end if;
  return new;
end;
$$;

revoke execute on function public.leads_to_come_tidy() from public, anon, authenticated;

create trigger leads_to_come_tidy
  before insert or update of first_name, address_line, name_to_come, address_to_come on public.leads
  for each row execute function public.leads_to_come_tidy();

-- ---------------------------------------------------------------- booking

-- What rules a booking out, as short codes. Same signature as before, so
-- book_meeting calls it unchanged; p_everyone_deciding_present is kept for
-- that signature and no longer rules anything out.
create or replace function public.booking_problems(
  p_lead_id uuid,
  p_everyone_deciding_present boolean,
  p_photos_skipped text,
  p_photos_skip_note text
)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  l public.leads;
  missing text[] := array[]::text[];
  guided int;
begin
  select * into l from public.leads where id = p_lead_id;
  if not found then
    return array['no_lead'];
  end if;
  -- A No on owns the home rules it out. No answer yet, or Not collected,
  -- is finished later.
  if l.owns_home is false then
    missing := array_append(missing, 'owns_home');
  end if;
  -- Not a readiness rule: Other needs its note before the meetings table
  -- can store it. With all three guided photos the reason isn't stored.
  if p_photos_skipped = 'other' and coalesce(btrim(p_photos_skip_note), '') = '' then
    select count(distinct slot) into guided
      from public.lead_photos
     where lead_id = p_lead_id and slot in ('front', 'left_corner', 'right_corner');
    if guided < 3 then
      missing := array_append(missing, 'photos_skip_note');
    end if;
  end if;
  return missing;
end;
$$;

revoke execute on function public.booking_problems(uuid, boolean, text, text) from public, anon, authenticated;
