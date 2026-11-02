-- M3.5 (Keenan, 2026-11-02): open times, holds and booking read the
-- evening's own schedule when it has one, otherwise the template in settings.
-- A day change never moves or cancels a meeting: one that no longer lines up
-- keeps its time and shows there on the board, and no time that overlaps it
-- can be held or booked. A hold on a time that disappears lets go at once.
-- Existing functions are replaced with the same signatures; only the parts
-- that read the template change. The double-booking lock is unchanged.

-- ---------------------------------------------------------------- the template

-- The times a template gives on one Calgary date, daylight saving included.
create or replace function public.template_times(p_day date, p_start time, p_minutes int, p_count int)
returns setof timestamptz
language sql
stable
set search_path = ''
as $$
  select (p_day + p_start + make_interval(mins => p_minutes * k)) at time zone 'America/Edmonton'
  from generate_series(0, p_count - 1) as k
  order by 1;
$$;

-- One evening's template for a host: its own schedule, or the settings
-- template on the usual meeting days. No row means no meetings that evening.
create or replace function public.slot_template_on(p_day date, p_host uuid)
returns table (meeting_start time, slot_minutes int, slot_count int, own_schedule boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select d.meeting_start, d.meeting_slot_minutes, d.meeting_slot_count, true
    from public.day_schedules d
   where d.host_id = p_host and d.day = p_day and d.removed_at is null
  union all
  select s.meeting_start, s.meeting_slot_minutes, s.meeting_slot_count, false
    from public.settings s
   where s.id = 1
     and extract(dow from p_day)::int = any (s.meeting_days)
     and not exists (
       select 1 from public.day_schedules d
        where d.host_id = p_host and d.day = p_day and d.removed_at is null
     )
  limit 1;
$$;

create or replace function public.slot_starts_on(p_day date, p_host uuid)
returns setof timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select t
  from public.slot_template_on(p_day, p_host) tp
  cross join lateral public.template_times(p_day, tp.meeting_start, tp.slot_minutes, tp.slot_count) as t
  order by 1;
$$;

-- An evening's meeting length; the settings length when it has no meetings.
create or replace function public.slot_minutes_on(p_day date, p_host uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select tp.slot_minutes from public.slot_template_on(p_day, p_host) tp),
    (select s.meeting_slot_minutes from public.settings s where s.id = 1)
  );
$$;

create or replace function public.is_template_slot(p_starts_at timestamptz, p_host uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.slot_starts_on((p_starts_at at time zone 'America/Edmonton')::date, p_host) t
    where t = p_starts_at
  );
$$;

-- The one-argument versions answer for the default host, so nothing that
-- still calls them can disagree with the board.
create or replace function public.slot_starts_on(p_day date)
returns setof timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select public.slot_starts_on(p_day, public.default_meeting_host());
$$;

create or replace function public.is_template_slot(p_starts_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_template_slot(p_starts_at, public.default_meeting_host());
$$;

-- ---------------------------------------------------------------- the slot check, booking and moving

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
  if not public.is_template_slot(p_starts_at, p_host) then
    raise exception 'That is not one of the meeting times' using errcode = 'P0001', hint = 'not_a_slot';
  end if;
  problem := public.slot_time_problem(p_starts_at, now(), p_owner);
  if problem = 'closed' then
    raise exception 'Booking for that time has closed' using errcode = 'P0001', hint = 'slot_closed';
  elsif problem = 'too_far' then
    raise exception 'That time is past the booking window' using errcode = 'P0001', hint = 'too_far';
  end if;
  slot_end := p_starts_at + make_interval(mins => public.slot_minutes_on((p_starts_at at time zone 'America/Edmonton')::date, p_host));
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
  slot_minutes := public.slot_minutes_on((p_starts_at at time zone 'America/Edmonton')::date, h);

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
  slot_minutes := public.slot_minutes_on((p_new_starts_at at time zone 'America/Edmonton')::date, m.host_id);

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
    return jsonb_build_object('status', 'lost', 'starts_at', hold.starts_at, 'reason', hold.release_reason);
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

-- ---------------------------------------------------------------- the board

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
  with template as (
    -- Each evening's times: its own schedule, or the template in settings.
    select d.d as slot_day, t as slot_start,
           t + make_interval(mins => public.slot_minutes_on(d.d, h)) as slot_end
    from (select today + i as d from generate_series(0, s.booking_window_days) as i) d
    cross join lateral public.slot_starts_on(d.d, h) as t
  ),
  live as (
    select m.starts_at, m.ends_at
    from public.meetings m
    where m.host_id = h
      and m.status in ('booked', 'confirmed', 'qualified', 'not_qualified')
      and m.starts_at >= (today::timestamp at time zone 'America/Edmonton')
      and m.starts_at < ((today + s.booking_window_days + 1)::timestamp at time zone 'America/Edmonton')
  ),
  slots as (
    -- Times that overlap a meeting starting at another time are left off,
    -- so nobody is booked into two meetings at once (M3.5).
    select tp.slot_day, tp.slot_start, tp.slot_end
    from template tp
    where not exists (
      select 1 from live lv
      where lv.starts_at <> tp.slot_start
        and lv.starts_at < tp.slot_end and lv.ends_at > tp.slot_start
    )
    union
    -- A meeting that no longer lines up with its evening's times shows at
    -- its own time.
    select (lv.starts_at at time zone 'America/Edmonton')::date, lv.starts_at, lv.ends_at
    from live lv
    where not exists (select 1 from template tp where tp.slot_start = lv.starts_at)
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

-- ---------------------------------------------------------------- day schedules

-- What a day change would do, read only, for the pop-up's warning before
-- saving: the evening's new times, booked meetings that would no longer line
-- up (they keep their times), holds that would let go, and for "All days" the
-- evenings that keep their own times. Scope: day, all or usual.
create or replace function public.day_schedule_preview(
  p_day date,
  p_start time,
  p_minutes int,
  p_count int,
  p_scope text,
  p_host uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  h uuid;
  s public.settings;
  today date := (now() at time zone 'America/Edmonton')::date;
  result jsonb;
begin
  if not public.acts_as_owner() then
    raise exception 'Only the owner changes meeting times' using errcode = '42501', hint = 'not_allowed';
  end if;
  if p_scope not in ('day', 'all', 'usual') then
    raise exception 'Unknown change' using errcode = 'P0001', hint = 'bad_scope';
  end if;
  h := public.resolve_meeting_host(p_host);
  select * into s from public.settings where id = 1;

  with days as (
    select today + i as d from generate_series(0, s.booking_window_days) as i
  ),
  own as (
    select x.day from public.day_schedules x where x.host_id = h and x.removed_at is null
  ),
  affected as (
    select dd.d from days dd
    where dd.d = p_day or (p_scope = 'all' and dd.d not in (select o.day from own o))
  ),
  would as (
    select a.d, t
    from affected a
    cross join lateral (
      select tt from public.template_times(a.d, p_start, p_minutes, p_count) tt
       where p_scope = 'day'
      union all
      select tt from public.template_times(a.d, p_start, p_minutes, p_count) tt
       where p_scope = 'all' and extract(dow from a.d)::int = any (s.meeting_days)
      union all
      select tt from public.template_times(a.d, s.meeting_start, s.meeting_slot_minutes, s.meeting_slot_count) tt
       where p_scope = 'usual' and extract(dow from a.d)::int = any (s.meeting_days)
    ) w(t)
  ),
  misaligned as (
    select m.id, m.starts_at, l.first_name, l.last_name, l.neighbourhood, p.full_name as setter_name
    from public.meetings m
    join public.leads l on l.id = m.lead_id
    left join public.profiles p on p.id = m.setter_id
    where m.host_id = h
      and m.status in ('booked', 'confirmed')
      and m.starts_at > now()
      and (m.starts_at at time zone 'America/Edmonton')::date in (select a.d from affected a)
      and not exists (
        select 1 from would w
        where w.d = (m.starts_at at time zone 'America/Edmonton')::date and w.t = m.starts_at
      )
  ),
  letting_go as (
    select x.starts_at, p.full_name as holder_name
    from public.slot_holds x
    join public.profiles p on p.id = x.holder_id
    where x.host_id = h
      and x.released_at is null
      and x.renewed_at > now() - public.hold_grace()
      and (x.starts_at at time zone 'America/Edmonton')::date in (select a.d from affected a)
      and not exists (
        select 1 from would w
        where w.d = (x.starts_at at time zone 'America/Edmonton')::date and w.t = x.starts_at
      )
  )
  select jsonb_build_object(
    'times', coalesce((select jsonb_agg(w.t order by w.t) from would w where w.d = p_day), '[]'::jsonb),
    'misaligned', coalesce((select jsonb_agg(jsonb_build_object(
        'meeting_id', ma.id, 'starts_at', ma.starts_at, 'first_name', ma.first_name,
        'last_name', ma.last_name, 'neighbourhood', ma.neighbourhood, 'setter_name', ma.setter_name
      ) order by ma.starts_at) from misaligned ma), '[]'::jsonb),
    'holds', coalesce((select jsonb_agg(jsonb_build_object(
        'starts_at', lg.starts_at, 'holder_name', lg.holder_name
      ) order by lg.starts_at) from letting_go lg), '[]'::jsonb),
    'own_days_kept', case when p_scope = 'all' then coalesce((
        select jsonb_agg(o.day order by o.day) from own o
        where o.day <> p_day and o.day in (select dd.d from days dd)
      ), '[]'::jsonb) else '[]'::jsonb end
  ) into result;
  return result;
end;
$$;

-- The owner's day change, from Schedule's pencil.
--   day:   this evening gets its own start, length and number of meetings;
--   all:   the template in settings changes, and this evening gives up its own;
--   usual: this evening goes back to the template.
-- Takes the evening lock (every evening in the window for "all", in date
-- order, like every other multi-evening lock), never touches a meeting, and
-- lets go of holds on times that are no longer one of their evening's times.
create or replace function public.set_day_schedule(
  p_day date,
  p_start time,
  p_minutes int,
  p_count int,
  p_scope text,
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
  s public.settings;
  today date := (now() at time zone 'America/Edmonton')::date;
  d date;
  released int;
begin
  if not public.acts_as_owner() then
    raise exception 'Only the owner changes meeting times' using errcode = '42501', hint = 'not_allowed';
  end if;
  if p_scope not in ('day', 'all', 'usual') then
    raise exception 'Unknown change' using errcode = 'P0001', hint = 'bad_scope';
  end if;
  select * into s from public.settings where id = 1;
  if p_day < today or p_day > today + s.booking_window_days then
    raise exception 'Pick an evening inside the booking window' using errcode = 'P0001', hint = 'outside_window';
  end if;
  if p_scope <> 'usual' then
    if p_start is null or p_minutes is null or p_count is null
       or p_minutes not between 15 and 180 or p_count not between 1 and 12 then
      raise exception 'Meetings are 15 to 180 minutes, 1 to 12 an evening' using errcode = 'P0001', hint = 'bad_template';
    end if;
    if extract(epoch from p_start) / 60 + p_minutes * (p_count - 1) >= 24 * 60 then
      raise exception 'The last meeting has to start before midnight' using errcode = 'P0001', hint = 'bad_template';
    end if;
  end if;
  h := public.resolve_meeting_host(p_host);

  if p_scope = 'all' then
    for d in select today + i from generate_series(0, s.booking_window_days) as i loop
      perform public.lock_evening(h, (d + time '12:00') at time zone 'America/Edmonton');
    end loop;
    update public.settings
       set meeting_start = p_start, meeting_slot_minutes = p_minutes, meeting_slot_count = p_count
     where id = 1;
  else
    perform public.lock_evening(h, (p_day + time '12:00') at time zone 'America/Edmonton');
  end if;

  update public.day_schedules
     set removed_at = now(), removed_by = me
   where host_id = h and day = p_day and removed_at is null;
  if p_scope = 'day' then
    insert into public.day_schedules (host_id, day, meeting_start, meeting_slot_minutes, meeting_slot_count, created_by)
    values (h, p_day, p_start, p_minutes, p_count, coalesce(me, h));
  end if;

  update public.slot_holds x
     set released_at = now(), release_reason = 'schedule_changed'
   where x.host_id = h
     and x.released_at is null
     and (p_scope = 'all' or (x.starts_at at time zone 'America/Edmonton')::date = p_day)
     and not public.is_template_slot(x.starts_at, h);
  get diagnostics released = row_count;

  return jsonb_build_object('released_holds', released);
end;
$$;

-- ---------------------------------------------------------------- privileges

-- Internal helpers: only the functions above use them.
revoke execute on function public.template_times(date, time, int, int) from public, anon, authenticated;
revoke execute on function public.slot_template_on(date, uuid) from public, anon, authenticated;
revoke execute on function public.slot_starts_on(date, uuid) from public, anon, authenticated;
revoke execute on function public.slot_minutes_on(date, uuid) from public, anon, authenticated;
revoke execute on function public.is_template_slot(timestamptz, uuid) from public, anon, authenticated;

-- The owner's day change and its preview; each checks the caller itself.
revoke execute on function public.day_schedule_preview(date, time, int, int, text, uuid) from public, anon;
revoke execute on function public.set_day_schedule(date, time, int, int, text, uuid) from public, anon;
grant execute on function public.day_schedule_preview(date, time, int, int, text, uuid) to authenticated;
grant execute on function public.set_day_schedule(date, time, int, int, text, uuid) to authenticated;
