-- M3: the booking functions (Keenan, 2026-11-01). No double booking is a
-- hard rule. Every hold, booking, move, cancel, outcome, payout and time
-- block goes through these SECURITY DEFINER functions, which check the
-- caller themselves; no policy lets anyone write slot_holds, meetings,
-- earnings or time_blocks directly. Holds, bookings, moves, cancels and
-- blocks take the same transaction lock, one per host and Calgary evening,
-- so two people can never take the same time. Errors carry a stable code in
-- their hint for the app to turn into plain words. Additive only.

-- ---------------------------------------------------------------- helpers

-- The owner, or the service role standing in for the owner (the test suite).
create or replace function public.acts_as_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_owner() or coalesce(auth.jwt() ->> 'role', '') = 'service_role';
$$;

-- The host whose evenings the app books: settings.meeting_host_id, or the owner.
create or replace function public.default_meeting_host()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select meeting_host_id from public.settings where id = 1),
    (select id from public.profiles where role = 'owner' and active limit 1)
  );
$$;

-- The host to use: the default, or another active profile that hosts.
create or replace function public.resolve_meeting_host(p_host uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  default_host uuid := public.default_meeting_host();
  h uuid := coalesce(p_host, default_host);
begin
  if h is null then
    raise exception 'No one is set up to run meetings yet' using errcode = 'P0001', hint = 'no_host';
  end if;
  if h is distinct from default_host
     and not exists (select 1 from public.profiles p where p.id = h and p.active and p.hosts_meetings) then
    raise exception 'That person does not run meetings' using errcode = 'P0001', hint = 'not_a_host';
  end if;
  return h;
end;
$$;

create or replace function public.hold_grace()
returns interval
language sql
stable
security definer
set search_path = ''
as $$
  select make_interval(mins => hold_grace_minutes) from public.settings where id = 1;
$$;

create or replace function public.calgary_tomorrow()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/Edmonton')::date + 1;
$$;

-- The evening lock: one per host and Calgary date.
create or replace function public.lock_evening(p_host uuid, p_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(
    hashtextextended('vesper-evening:' || p_host::text || ':' || ((p_at at time zone 'America/Edmonton')::date)::text, 0)
  );
end;
$$;

-- Two evenings for a move, always in the same order so two moves can never
-- wait on each other.
create or replace function public.lock_evenings(p_host uuid, p_a timestamptz, p_b timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  day_a date := (p_a at time zone 'America/Edmonton')::date;
  day_b date := (p_b at time zone 'America/Edmonton')::date;
begin
  if day_a = day_b then
    perform public.lock_evening(p_host, p_a);
  elsif day_a < day_b then
    perform public.lock_evening(p_host, p_a);
    perform public.lock_evening(p_host, p_b);
  else
    perform public.lock_evening(p_host, p_b);
    perform public.lock_evening(p_host, p_a);
  end if;
end;
$$;

-- The template's start times for one Calgary date, daylight saving
-- included: a local time on that date, read in America/Edmonton.
create or replace function public.slot_starts_on(p_day date)
returns setof timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select (p_day + s.meeting_start + make_interval(mins => s.meeting_slot_minutes * k)) at time zone 'America/Edmonton'
  from public.settings s
  cross join lateral generate_series(0, s.meeting_slot_count - 1) as k
  where s.id = 1
    and extract(dow from p_day)::int = any (s.meeting_days)
  order by 1;
$$;

create or replace function public.is_template_slot(p_starts_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.slot_starts_on((p_starts_at at time zone 'America/Edmonton')::date) t
    where t = p_starts_at
  );
$$;

-- Why a time cannot be taken at p_now, or null when it can: closed once it
-- is inside the cutoff (setters: booking_cutoff_minutes before it starts;
-- the owner: once it starts), too_far past the booking window.
create or replace function public.slot_time_problem(p_starts_at timestamptz, p_now timestamptz, p_owner boolean)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_starts_at <= p_now + make_interval(mins => case when p_owner then 0 else s.booking_cutoff_minutes end) then 'closed'
    when (p_starts_at at time zone 'America/Edmonton')::date
         > (p_now at time zone 'America/Edmonton')::date + s.booking_window_days then 'too_far'
    else null
  end
  from public.settings s
  where s.id = 1;
$$;

-- Lapsed holds on one time let go, so the time can be claimed again.
create or replace function public.release_lapsed_holds(p_host uuid, p_starts_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.slot_holds
     set released_at = now(), release_reason = 'lapsed'
   where host_id = p_host
     and starts_at = p_starts_at
     and released_at is null
     and renewed_at <= now() - public.hold_grace();
end;
$$;

-- Raises unless the time can be taken by p_me: on the template, inside the
-- window and before the cutoff, not blocked, not booked, and not held by
-- anyone else. Called under the evening lock.
create or replace function public.check_slot_free(p_host uuid, p_starts_at timestamptz, p_owner boolean, p_me uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  problem text;
  slot_end timestamptz;
  holder text;
begin
  if not public.is_template_slot(p_starts_at) then
    raise exception 'That is not one of the meeting times' using errcode = 'P0001', hint = 'not_a_slot';
  end if;
  problem := public.slot_time_problem(p_starts_at, now(), p_owner);
  if problem = 'closed' then
    raise exception 'Booking for that time has closed' using errcode = 'P0001', hint = 'slot_closed';
  elsif problem = 'too_far' then
    raise exception 'That time is past the booking window' using errcode = 'P0001', hint = 'too_far';
  end if;
  select p_starts_at + make_interval(mins => meeting_slot_minutes) into slot_end from public.settings where id = 1;
  if exists (
    select 1 from public.time_blocks b
    where b.host_id = p_host and b.removed_at is null
      and b.starts_at < slot_end and b.ends_at > p_starts_at
  ) then
    raise exception 'That time is blocked' using errcode = 'P0001', hint = 'slot_blocked';
  end if;
  if exists (
    select 1 from public.meetings m
    where m.host_id = p_host
      and m.status in ('booked', 'confirmed', 'qualified', 'not_qualified')
      and m.starts_at < slot_end and m.ends_at > p_starts_at
  ) then
    raise exception 'That time was just taken' using errcode = 'P0001', hint = 'slot_taken';
  end if;
  select p.full_name into holder
    from public.slot_holds h
    join public.profiles p on p.id = h.holder_id
   where h.host_id = p_host and h.starts_at = p_starts_at
     and h.released_at is null
     and h.renewed_at > now() - public.hold_grace()
     and h.holder_id is distinct from p_me;
  if holder is not null then
    raise exception '% is booking this time', holder using errcode = 'P0001', hint = 'slot_held';
  end if;
end;
$$;

-- What a lead still needs before it can be booked, as short codes.
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
  if l.phone is null then missing := array_append(missing, 'phone'); end if;
  if l.owns_home is not true then missing := array_append(missing, 'owns_home'); end if;
  if l.wants_price is not true then missing := array_append(missing, 'wants_price'); end if;
  if l.soffit_colour is null then missing := array_append(missing, 'soffit_colour'); end if;
  if l.lat is null or l.lng is null then missing := array_append(missing, 'map_position'); end if;
  select count(distinct slot) into guided
    from public.lead_photos
   where lead_id = p_lead_id and slot in ('front', 'left_corner', 'right_corner');
  if guided < 3 then
    if p_photos_skipped is null or p_photos_skipped not in ('homeowner_said_no', 'other') then
      missing := array_append(missing, 'photos');
    elsif p_photos_skipped = 'other' and coalesce(btrim(p_photos_skip_note), '') = '' then
      missing := array_append(missing, 'photos_skip_note');
    end if;
  end if;
  if p_everyone_deciding_present is not true then
    missing := array_append(missing, 'everyone_deciding_present');
  end if;
  return missing;
end;
$$;

-- ---------------------------------------------------------------- the lead guard

-- The lead guard, whole, with three additions for M3:
--   - a setter's lead moves into Meeting booked only while it has a booked
--     meeting still to come, which only book_meeting can create, and back
--     to Follow up only once it has no live meeting, which only
--     cancel_meeting leaves behind;
--   - the map position source follows the position: empty with it, picked
--     when a position arrives without one, and accuracy kept only for a
--     device position.
create or replace function public.leads_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  is_admin boolean := public.is_owner();
  setter_statuses public.lead_status[] := array['new', 'follow_up', 'lost']::public.lead_status[];
begin
  if tg_op = 'INSERT' then
    if me is not null then
      new.created_by := me;
      if not is_admin then
        new.assigned_to := me;
        if not (new.status = any (setter_statuses)) then
          raise exception 'Setters can only add a lead as New, Follow up or Lost'
            using errcode = '42501';
        end if;
      end if;
    end if;
    new.assigned_to := coalesce(new.assigned_to, new.created_by);
  else
    if me is not null and not is_admin then
      if new.created_by is distinct from old.created_by
         or new.assigned_to is distinct from old.assigned_to then
        raise exception 'Only the admin can reassign a lead' using errcode = '42501';
      end if;
      if new.status is distinct from old.status
         and not (old.status = any (setter_statuses) and new.status = any (setter_statuses))
         and not (
           new.status = 'meeting_booked'
           and old.status in ('new', 'follow_up')
           and exists (
             select 1 from public.meetings m
             where m.lead_id = new.id and m.status = 'booked' and m.starts_at > now()
           )
         )
         and not (
           old.status = 'meeting_booked'
           and new.status = 'follow_up'
           and not exists (
             select 1 from public.meetings m
             where m.lead_id = new.id and m.status in ('booked', 'confirmed')
           )
         ) then
        raise exception 'Setters can only move a lead between New, Follow up and Lost'
          using errcode = '42501';
      end if;
    end if;
    new.created_at := old.created_at;
  end if;

  if new.knock_session_id is not null
     and (tg_op = 'INSERT' or new.knock_session_id is distinct from old.knock_session_id)
     and not exists (
       select 1 from public.knock_sessions s
       where s.id = new.knock_session_id and s.user_id = new.created_by
     ) then
    raise exception 'A lead can only link to a knock session of the person who added it'
      using errcode = '42501';
  end if;

  -- The track colour is the owner's call. A colour retired from the list
  -- stays on leads that have it but cannot be newly chosen.
  if me is not null and not is_admin
     and (
       (tg_op = 'INSERT' and (new.track_colour_id is not null or new.track_ral_code is not null))
       or (tg_op = 'UPDATE' and (new.track_colour_id is distinct from old.track_colour_id
                                 or new.track_ral_code is distinct from old.track_ral_code))
     ) then
    raise exception 'Only the admin sets the track colour' using errcode = '42501';
  end if;
  if new.track_colour_id is not null
     and (tg_op = 'INSERT' or new.track_colour_id is distinct from old.track_colour_id)
     and not exists (
       select 1 from public.track_colours c where c.id = new.track_colour_id and c.active
     ) then
    raise exception 'That track colour has been retired' using errcode = '22023';
  end if;

  -- The map position's source follows the position.
  if new.lat is null or new.lng is null then
    new.position_source := null;
    new.position_accuracy_m := null;
  elsif new.position_source is null then
    new.position_source := 'picked';
  end if;
  if new.position_source is distinct from 'device' then
    new.position_accuracy_m := null;
  end if;

  if new.status <> 'follow_up' then
    new.follow_up_on := null;
  elsif me is not null
     and (tg_op = 'INSERT' or new.follow_up_on is distinct from old.follow_up_on)
     and new.follow_up_on < (now() at time zone 'America/Edmonton')::date then
    raise exception 'A follow-up date cannot be before today' using errcode = '22023';
  end if;

  if tg_op = 'INSERT' or new.status is distinct from old.status then
    if new.status = 'lost' then
      new.lost_at := now();
    else
      new.lost_at := null;
      new.lost_reason := null;
    end if;
    if new.status in ('sold', 'installed') then
      new.sold_at := coalesce(new.sold_at, now());
    else
      new.sold_at := null;
    end if;
    if new.status = 'installed' then
      new.installed_at := coalesce(new.installed_at, now());
    else
      new.installed_at := null;
    end if;
  end if;

  return new;
end;
$$;

-- The position rules, now that the guard keeps the source in step.
alter table public.leads
  add constraint leads_position_source_matches check ((lat is null) = (position_source is null)),
  add constraint leads_device_position_accuracy
    check (position_source is distinct from 'device' or position_accuracy_m is not null),
  add constraint leads_device_position_in_calgary
    check (position_source is distinct from 'device'
           or (lat between 50.5 and 51.6 and lng between -114.95 and -113.2));

-- ---------------------------------------------------------------- earnings guard

create or replace function public.earnings_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'paid' then
    raise exception 'A paid earning never changes' using errcode = '42501';
  end if;
  if new.profile_id <> old.profile_id or new.lead_id <> old.lead_id or new.type <> old.type
     or new.rate <> old.rate or new.amount <> old.amount
     or new.base_amount is distinct from old.base_amount
     or new.quote_id is distinct from old.quote_id then
    raise exception 'An earning''s amount, rate, type, setter and lead never change' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger earnings_guard
  before update on public.earnings
  for each row execute function public.earnings_guard();

-- ---------------------------------------------------------------- holds

-- Tapping an open time holds it. The caller's other hold lets go (one hold
-- per person). Holding a time already held by the caller keeps it alive.
create or replace function public.hold_slot(
  p_starts_at timestamptz,
  p_lead_id uuid default null,
  p_meeting_id uuid default null,
  p_host uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  h uuid;
  hold_id uuid;
begin
  if me is null or not public.is_sales_side() then
    raise exception 'Not for your role' using errcode = '42501', hint = 'not_allowed';
  end if;
  h := public.resolve_meeting_host(p_host);
  perform public.lock_evening(h, p_starts_at);
  perform public.release_lapsed_holds(h, p_starts_at);

  update public.slot_holds
     set renewed_at = now(),
         lead_id = coalesce(p_lead_id, lead_id),
         meeting_id = coalesce(p_meeting_id, meeting_id)
   where host_id = h and starts_at = p_starts_at and holder_id = me and released_at is null
  returning id into hold_id;
  if hold_id is not null then
    return jsonb_build_object('hold_id', hold_id, 'starts_at', p_starts_at);
  end if;

  perform public.check_slot_free(h, p_starts_at, public.is_owner(), me);

  update public.slot_holds
     set released_at = now(),
         release_reason = case when renewed_at <= now() - public.hold_grace() then 'lapsed' else 'switched' end
   where holder_id = me and released_at is null;

  insert into public.slot_holds (host_id, starts_at, holder_id, lead_id, meeting_id)
  values (h, p_starts_at, me, p_lead_id, p_meeting_id)
  returning id into hold_id;
  return jsonb_build_object('hold_id', hold_id, 'starts_at', p_starts_at);
exception
  when unique_violation then
    raise exception 'Someone else is booking this time' using errcode = 'P0001', hint = 'slot_held';
end;
$$;

-- The holder's screen checks in. A live hold is kept alive; a lapsed one
-- is taken back only if the time is still free.
create or replace function public.renew_hold()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  hold public.slot_holds;
  kept uuid;
begin
  if me is null or not public.is_sales_side() then
    raise exception 'Not for your role' using errcode = '42501', hint = 'not_allowed';
  end if;
  select * into hold from public.slot_holds where holder_id = me and released_at is null;
  if not found then
    return jsonb_build_object('status', 'none');
  end if;

  update public.slot_holds set renewed_at = now()
   where id = hold.id and released_at is null and renewed_at > now() - public.hold_grace()
  returning id into kept;
  if kept is not null then
    return jsonb_build_object('status', 'held', 'starts_at', hold.starts_at);
  end if;

  perform public.lock_evening(hold.host_id, hold.starts_at);
  select * into hold from public.slot_holds where id = hold.id;
  if hold.released_at is not null then
    return jsonb_build_object('status', 'lost', 'starts_at', hold.starts_at);
  end if;
  begin
    perform public.check_slot_free(hold.host_id, hold.starts_at, public.is_owner(), me);
  exception when others then
    update public.slot_holds set released_at = now(), release_reason = 'lapsed' where id = hold.id;
    return jsonb_build_object('status', 'lost', 'starts_at', hold.starts_at, 'message', sqlerrm);
  end;
  update public.slot_holds set renewed_at = now() where id = hold.id;
  return jsonb_build_object('status', 'held', 'starts_at', hold.starts_at, 'retaken', true);
end;
$$;

-- Backing out lets the hold go at once.
create or replace function public.release_hold()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  update public.slot_holds
     set released_at = now(), release_reason = 'released'
   where holder_id = auth.uid() and released_at is null;
end;
$$;

-- ---------------------------------------------------------------- booking

-- The only way to book. Takes the caller's own hold or a free time, never a
-- time someone else holds, and checks Before you book again here.
create or replace function public.book_meeting(
  p_lead_id uuid,
  p_starts_at timestamptz,
  p_everyone_deciding_present boolean,
  p_photos_skipped text default null,
  p_photos_skip_note text default null,
  p_host uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  owner boolean := public.is_owner();
  h uuid;
  l public.leads;
  problems text[];
  guided int;
  slot_minutes int;
  new_id uuid;
  which text;
begin
  if me is null or not public.is_sales_side() then
    raise exception 'Not for your role' using errcode = '42501', hint = 'not_allowed';
  end if;
  h := public.resolve_meeting_host(p_host);
  perform public.lock_evening(h, p_starts_at);

  select * into l from public.leads where id = p_lead_id for update;
  if not found then
    raise exception 'That lead was not found' using errcode = 'P0001', hint = 'no_lead';
  end if;
  if not owner and l.created_by <> me and l.assigned_to is distinct from me then
    raise exception 'You can only book your own leads' using errcode = '42501', hint = 'not_your_lead';
  end if;
  if l.status not in ('new', 'follow_up') then
    raise exception 'Only a New or Follow up lead can be booked' using errcode = 'P0001', hint = 'wrong_status';
  end if;
  if exists (select 1 from public.meetings m where m.lead_id = l.id and m.status in ('booked', 'confirmed')) then
    raise exception 'This lead already has a meeting booked' using errcode = 'P0001', hint = 'already_booked';
  end if;
  problems := public.booking_problems(l.id, p_everyone_deciding_present, p_photos_skipped, p_photos_skip_note);
  if cardinality(problems) > 0 then
    raise exception 'Not ready to book: %', array_to_string(problems, ', ')
      using errcode = 'P0001', hint = 'not_ready', detail = array_to_string(problems, ',');
  end if;

  perform public.release_lapsed_holds(h, p_starts_at);
  perform public.check_slot_free(h, p_starts_at, owner, me);

  select count(distinct slot) into guided
    from public.lead_photos where lead_id = l.id and slot in ('front', 'left_corner', 'right_corner');
  select meeting_slot_minutes into slot_minutes from public.settings where id = 1;

  insert into public.meetings (
    lead_id, host_id, setter_id, booked_by, starts_at, ends_at,
    everyone_deciding_present, photos_skipped, photos_skip_note
  ) values (
    l.id, h, coalesce(l.assigned_to, l.created_by), me, p_starts_at,
    p_starts_at + make_interval(mins => slot_minutes), true,
    case when guided < 3 then p_photos_skipped end,
    case when guided < 3 then nullif(btrim(p_photos_skip_note), '') end
  )
  returning id into new_id;

  update public.meetings set rebooked_as = new_id
   where id = (
     select m.id from public.meetings m
     where m.lead_id = l.id and m.status in ('no_show', 'cancelled') and m.rebooked_as is null
     order by m.starts_at desc limit 1
   );

  update public.slot_holds set released_at = now(), release_reason = 'booked'
   where holder_id = me and released_at is null;

  update public.leads set status = 'meeting_booked' where id = l.id;

  insert into public.lead_events (lead_id, actor_id, type, payload)
  values (l.id, me, 'meeting_booked', jsonb_build_object('meeting_id', new_id, 'starts_at', p_starts_at));

  return new_id;
exception
  when unique_violation then
    get stacked diagnostics which = constraint_name;
    if which = 'meetings_one_live_per_lead' then
      raise exception 'This lead already has a meeting booked' using errcode = 'P0001', hint = 'already_booked';
    end if;
    raise exception 'That time was just taken' using errcode = 'P0001', hint = 'slot_taken';
end;
$$;

-- Moving a booking: the new time is held first, like booking. The old
-- meeting is marked moved and points to the new one.
create or replace function public.move_meeting(p_meeting_id uuid, p_new_starts_at timestamptz)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  owner boolean := public.is_owner();
  m public.meetings;
  l public.leads;
  slot_minutes int;
  new_id uuid;
begin
  if me is null or not public.is_sales_side() then
    raise exception 'Not for your role' using errcode = '42501', hint = 'not_allowed';
  end if;
  select * into m from public.meetings where id = p_meeting_id;
  if not found then
    raise exception 'That booking was not found' using errcode = 'P0001', hint = 'no_meeting';
  end if;
  perform public.lock_evenings(m.host_id, m.starts_at, p_new_starts_at);
  select * into m from public.meetings where id = p_meeting_id for update;
  if m.status not in ('booked', 'confirmed') then
    raise exception 'This booking has already changed' using errcode = 'P0001', hint = 'not_live';
  end if;
  select * into l from public.leads where id = m.lead_id for update;
  if not owner and l.created_by <> me and l.assigned_to is distinct from me then
    raise exception 'You can only move your own bookings' using errcode = '42501', hint = 'not_your_lead';
  end if;
  if m.starts_at <= now() then
    raise exception 'This meeting has started' using errcode = 'P0001', hint = 'started';
  end if;
  if p_new_starts_at = m.starts_at then
    raise exception 'That is the same time' using errcode = 'P0001', hint = 'same_time';
  end if;

  perform public.release_lapsed_holds(m.host_id, p_new_starts_at);
  perform public.check_slot_free(m.host_id, p_new_starts_at, owner, me);
  select meeting_slot_minutes into slot_minutes from public.settings where id = 1;

  update public.meetings set status = 'moved', outcome_at = now(), outcome_by = me where id = m.id;
  insert into public.meetings (
    lead_id, host_id, setter_id, booked_by, starts_at, ends_at,
    everyone_deciding_present, photos_skipped, photos_skip_note
  ) values (
    m.lead_id, m.host_id, m.setter_id, me, p_new_starts_at,
    p_new_starts_at + make_interval(mins => slot_minutes), true,
    m.photos_skipped, m.photos_skip_note
  )
  returning id into new_id;
  update public.meetings set rebooked_as = new_id where id = m.id;

  update public.slot_holds set released_at = now(), release_reason = 'moved'
   where holder_id = me and released_at is null;

  insert into public.lead_events (lead_id, actor_id, type, payload)
  values (m.lead_id, me, 'meeting_moved', jsonb_build_object(
    'meeting_id', new_id, 'from_meeting_id', m.id,
    'from_starts_at', m.starts_at, 'starts_at', p_new_starts_at));
  return new_id;
exception
  when unique_violation then
    raise exception 'That time was just taken' using errcode = 'P0001', hint = 'slot_taken';
end;
$$;

-- Cancelling a booking before it starts. The lead goes to Follow up for the
-- next day, the same as the Cancelled outcome.
create or replace function public.cancel_meeting(p_meeting_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  owner boolean := public.is_owner();
  m public.meetings;
  l public.leads;
begin
  if me is null or not public.is_sales_side() then
    raise exception 'Not for your role' using errcode = '42501', hint = 'not_allowed';
  end if;
  select * into m from public.meetings where id = p_meeting_id;
  if not found then
    raise exception 'That booking was not found' using errcode = 'P0001', hint = 'no_meeting';
  end if;
  perform public.lock_evening(m.host_id, m.starts_at);
  select * into m from public.meetings where id = p_meeting_id for update;
  if m.status not in ('booked', 'confirmed') then
    raise exception 'This booking has already changed' using errcode = 'P0001', hint = 'not_live';
  end if;
  select * into l from public.leads where id = m.lead_id for update;
  if not owner and l.created_by <> me and l.assigned_to is distinct from me then
    raise exception 'You can only cancel your own bookings' using errcode = '42501', hint = 'not_your_lead';
  end if;
  if m.starts_at <= now() then
    raise exception 'This meeting has started; Keenan marks the outcome now' using errcode = 'P0001', hint = 'started';
  end if;

  update public.meetings
     set status = 'cancelled', outcome_note = nullif(btrim(p_note), ''), outcome_at = now(), outcome_by = me
   where id = m.id;
  update public.leads set status = 'follow_up', follow_up_on = public.calgary_tomorrow()
   where id = l.id and status = 'meeting_booked';
  insert into public.lead_events (lead_id, actor_id, type, payload)
  values (m.lead_id, me, 'meeting_cancelled', jsonb_build_object('meeting_id', m.id, 'starts_at', m.starts_at));
end;
$$;

-- ---------------------------------------------------------------- outcomes and pay

-- The owner marks a meeting. Qualified creates the booking fee for the
-- lead's setter (never a second one per lead, never for the owner); a
-- correction voids or restores it, until it is paid.
create or replace function public.set_meeting_outcome(
  p_meeting_id uuid,
  p_outcome public.meeting_status,
  p_reason text default null,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  m public.meetings;
  l public.leads;
  fee public.earnings;
  has_fee boolean;
  setter_role public.user_role;
  latest uuid;
  pay numeric(10,2);
begin
  if not public.acts_as_owner() then
    raise exception 'Only Keenan marks outcomes' using errcode = '42501', hint = 'not_allowed';
  end if;
  if p_outcome not in ('qualified', 'not_qualified', 'no_show', 'cancelled') then
    raise exception 'That is not an outcome' using errcode = 'P0001', hint = 'bad_outcome';
  end if;
  select * into m from public.meetings where id = p_meeting_id;
  if not found then
    raise exception 'That booking was not found' using errcode = 'P0001', hint = 'no_meeting';
  end if;
  perform public.lock_evening(m.host_id, m.starts_at);
  select * into m from public.meetings where id = p_meeting_id for update;
  if m.status = 'moved' then
    raise exception 'This booking was moved; mark the new time instead' using errcode = 'P0001', hint = 'moved';
  end if;
  if p_outcome <> 'cancelled' and m.starts_at > now() then
    raise exception 'Outcomes open when the meeting starts' using errcode = 'P0001', hint = 'not_started';
  end if;
  if p_outcome = 'not_qualified' and coalesce(btrim(p_reason), '') = '' then
    raise exception 'Pick a reason' using errcode = 'P0001', hint = 'reason_needed';
  end if;

  select * into fee from public.earnings where lead_id = m.lead_id and type = 'booking';
  has_fee := found;
  if has_fee and fee.status = 'paid' and fee.meeting_id = m.id then
    raise exception 'This booking fee has been paid, so the outcome can no longer change'
      using errcode = 'P0001', hint = 'already_paid';
  end if;

  update public.meetings
     set status = p_outcome,
         outcome_reason = case when p_outcome = 'not_qualified' then btrim(p_reason) end,
         outcome_note = nullif(btrim(p_note), ''),
         outcome_at = now(),
         outcome_by = actor
   where id = m.id;

  -- The lead follows only from its latest meeting, and never back past Met.
  select x.id into latest from public.meetings x
   where x.lead_id = m.lead_id and x.status <> 'moved'
   order by x.starts_at desc, x.created_at desc limit 1;
  select * into l from public.leads where id = m.lead_id for update;
  if latest = m.id and l.status in ('meeting_booked', 'met', 'follow_up') then
    if p_outcome in ('qualified', 'not_qualified') then
      update public.leads set status = 'met' where id = l.id and status <> 'met';
    else
      update public.leads set status = 'follow_up', follow_up_on = public.calgary_tomorrow()
       where id = l.id and status <> 'follow_up';
    end if;
  end if;

  select role into setter_role from public.profiles where id = m.setter_id;
  if p_outcome = 'qualified' then
    if setter_role = 'sales' then
      if not has_fee then
        select booking_pay into pay from public.settings where id = 1;
        insert into public.earnings (profile_id, lead_id, meeting_id, type, rate, amount, payable_at)
        values (m.setter_id, m.lead_id, m.id, 'booking', pay, pay, now());
      elsif fee.status = 'void' then
        update public.earnings set status = 'pending', note = null, meeting_id = m.id where id = fee.id;
      end if;
    end if;
  elsif has_fee and fee.status = 'pending' and fee.meeting_id = m.id then
    update public.earnings
       set status = 'void', note = 'Outcome changed to ' || replace(p_outcome::text, '_', ' ')
     where id = fee.id;
  end if;

  insert into public.lead_events (lead_id, actor_id, type, payload)
  values (m.lead_id, actor, 'meeting_outcome', jsonb_strip_nulls(jsonb_build_object(
    'meeting_id', m.id, 'outcome', p_outcome,
    'reason', case when p_outcome = 'not_qualified' then btrim(p_reason) end)));
exception
  when unique_violation then
    raise exception 'Another booking now holds that time' using errcode = 'P0001', hint = 'slot_taken';
end;
$$;

-- The owner marks owed earnings paid in one batch. Returns how many.
create or replace function public.mark_earnings_paid(p_ids uuid[])
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  if not public.acts_as_owner() then
    raise exception 'Only Keenan marks pay' using errcode = '42501', hint = 'not_allowed';
  end if;
  update public.earnings
     set status = 'paid', paid_at = now(), paid_by = auth.uid()
   where id = any (p_ids) and status = 'pending' and payable_at is not null;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ---------------------------------------------------------------- time blocks

create or replace function public.add_time_block(
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_reason text default null,
  p_host uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  h uuid;
  holder text;
  new_id uuid;
begin
  if not public.acts_as_owner() then
    raise exception 'Only Keenan blocks times' using errcode = '42501', hint = 'not_allowed';
  end if;
  if p_ends_at <= p_starts_at then
    raise exception 'A block must end after it starts' using errcode = 'P0001', hint = 'bad_block';
  end if;
  h := public.resolve_meeting_host(p_host);
  perform public.lock_evenings(h, p_starts_at, p_ends_at);
  if exists (
    select 1 from public.meetings m
    where m.host_id = h and m.status in ('booked', 'confirmed', 'qualified', 'not_qualified')
      and m.starts_at < p_ends_at and m.ends_at > p_starts_at
  ) then
    raise exception 'A meeting is booked in that time; move or cancel it first' using errcode = 'P0001', hint = 'slot_taken';
  end if;
  select p.full_name into holder
    from public.slot_holds x join public.profiles p on p.id = x.holder_id
   where x.host_id = h and x.released_at is null and x.renewed_at > now() - public.hold_grace()
     and x.starts_at >= p_starts_at and x.starts_at < p_ends_at
   limit 1;
  if holder is not null then
    raise exception '% is booking a time in that block', holder using errcode = 'P0001', hint = 'slot_held';
  end if;
  insert into public.time_blocks (host_id, starts_at, ends_at, reason, created_by)
  values (h, p_starts_at, p_ends_at, nullif(btrim(p_reason), ''), coalesce(auth.uid(), h))
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.remove_time_block(p_block_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.acts_as_owner() then
    raise exception 'Only Keenan removes blocks' using errcode = '42501', hint = 'not_allowed';
  end if;
  update public.time_blocks
     set removed_at = now(), removed_by = coalesce(auth.uid(), host_id)
   where id = p_block_id and removed_at is null;
end;
$$;

-- ---------------------------------------------------------------- the board

-- Every time in the booking window with its state, for the time picker on
-- every phone. Read only; screens poll it. A booked time shows its
-- neighbourhood and setter, a held one its holder. p_as_sales shows the
-- owner what a setter sees (View as and the setter cutoff); p_viewer names
-- whose holds and bookings count as "mine", for the owner only.
create or replace function public.schedule_board(
  p_host uuid default null,
  p_as_sales boolean default false,
  p_viewer uuid default null
)
returns table (
  day date,
  starts_at timestamptz,
  ends_at timestamptz,
  state text,
  holder_id uuid,
  holder_name text,
  held_by_viewer boolean,
  meeting_id uuid,
  lead_id uuid,
  neighbourhood text,
  setter_id uuid,
  setter_name text,
  setter_is_viewer boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me uuid := auth.uid();
  owner boolean := public.is_owner();
  h uuid;
  viewer uuid;
  owner_view boolean;
  s public.settings;
  today date := (now() at time zone 'America/Edmonton')::date;
  grace interval;
begin
  if me is null or not public.is_sales_side() then
    return;
  end if;
  h := public.resolve_meeting_host(p_host);
  viewer := case when owner and p_viewer is not null then p_viewer else me end;
  owner_view := owner and not coalesce(p_as_sales, false);
  select * into s from public.settings where id = 1;
  grace := make_interval(mins => s.hold_grace_minutes);
  return query
  with slots as (
    select d.d as slot_day, t as slot_start, t + make_interval(mins => s.meeting_slot_minutes) as slot_end
    from (select today + i as d from generate_series(0, s.booking_window_days) as i) d
    cross join lateral public.slot_starts_on(d.d) as t
  )
  select
    sl.slot_day,
    sl.slot_start,
    sl.slot_end,
    case
      when mt.id is not null then 'booked'
      when exists (
        select 1 from public.time_blocks b
        where b.host_id = h and b.removed_at is null
          and b.starts_at < sl.slot_end and b.ends_at > sl.slot_start
      ) then 'blocked'
      when public.slot_time_problem(sl.slot_start, now(), owner_view) is not null then 'closed'
      when hd.id is not null then 'held'
      else 'open'
    end,
    hd.holder_id,
    hp.full_name,
    coalesce(hd.holder_id = viewer, false),
    mt.id,
    mt.lead_id,
    ld.neighbourhood,
    mt.setter_id,
    sp.full_name,
    coalesce(mt.setter_id = viewer, false)
  from slots sl
  left join lateral (
    select m.id, m.lead_id, m.setter_id from public.meetings m
    where m.host_id = h
      and m.status in ('booked', 'confirmed', 'qualified', 'not_qualified')
      and m.starts_at < sl.slot_end and m.ends_at > sl.slot_start
    order by m.starts_at
    limit 1
  ) mt on true
  left join public.leads ld on ld.id = mt.lead_id
  left join public.profiles sp on sp.id = mt.setter_id
  left join lateral (
    select x.id, x.holder_id from public.slot_holds x
    where x.host_id = h and x.starts_at = sl.slot_start
      and x.released_at is null and x.renewed_at > now() - grace
    limit 1
  ) hd on true
  left join public.profiles hp on hp.id = hd.holder_id
  order by sl.slot_start;
end;
$$;

-- ---------------------------------------------------------------- privileges

-- Internal helpers: only the functions above use them.
revoke execute on function public.acts_as_owner() from public, anon, authenticated;
revoke execute on function public.default_meeting_host() from public, anon, authenticated;
revoke execute on function public.resolve_meeting_host(uuid) from public, anon, authenticated;
revoke execute on function public.hold_grace() from public, anon, authenticated;
revoke execute on function public.calgary_tomorrow() from public, anon, authenticated;
revoke execute on function public.lock_evening(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.lock_evenings(uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function public.is_template_slot(timestamptz) from public, anon, authenticated;
revoke execute on function public.release_lapsed_holds(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.check_slot_free(uuid, timestamptz, boolean, uuid) from public, anon, authenticated;
revoke execute on function public.booking_problems(uuid, boolean, text, text) from public, anon, authenticated;
revoke execute on function public.earnings_guard() from public, anon, authenticated;

-- Read-only template checks, callable by signed-in people (the tests use them).
revoke execute on function public.slot_starts_on(date) from public, anon;
revoke execute on function public.slot_time_problem(timestamptz, timestamptz, boolean) from public, anon;
grant execute on function public.slot_starts_on(date) to authenticated;
grant execute on function public.slot_time_problem(timestamptz, timestamptz, boolean) to authenticated;

-- The booking functions: each checks who is calling.
revoke execute on function public.hold_slot(timestamptz, uuid, uuid, uuid) from public, anon;
revoke execute on function public.renew_hold() from public, anon;
revoke execute on function public.release_hold() from public, anon;
revoke execute on function public.book_meeting(uuid, timestamptz, boolean, text, text, uuid) from public, anon;
revoke execute on function public.move_meeting(uuid, timestamptz) from public, anon;
revoke execute on function public.cancel_meeting(uuid, text) from public, anon;
revoke execute on function public.set_meeting_outcome(uuid, public.meeting_status, text, text) from public, anon;
revoke execute on function public.mark_earnings_paid(uuid[]) from public, anon;
revoke execute on function public.add_time_block(timestamptz, timestamptz, text, uuid) from public, anon;
revoke execute on function public.remove_time_block(uuid) from public, anon;
revoke execute on function public.schedule_board(uuid, boolean, uuid) from public, anon;
grant execute on function public.hold_slot(timestamptz, uuid, uuid, uuid) to authenticated;
grant execute on function public.renew_hold() to authenticated;
grant execute on function public.release_hold() to authenticated;
grant execute on function public.book_meeting(uuid, timestamptz, boolean, text, text, uuid) to authenticated;
grant execute on function public.move_meeting(uuid, timestamptz) to authenticated;
grant execute on function public.cancel_meeting(uuid, text) to authenticated;
grant execute on function public.set_meeting_outcome(uuid, public.meeting_status, text, text) to authenticated;
grant execute on function public.mark_earnings_paid(uuid[]) to authenticated;
grant execute on function public.add_time_block(timestamptz, timestamptz, text, uuid) to authenticated;
grant execute on function public.remove_time_block(uuid) to authenticated;
grant execute on function public.schedule_board(uuid, boolean, uuid) to authenticated;
