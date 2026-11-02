-- M3.5 fix: every booked meeting always shows on the board.
--
-- What: schedule_board now lists each live meeting at its own start and end,
-- plus the evening's times that overlap no meeting.
-- Why: after a day change made meetings longer, a booking that still lined
-- up with a new time could vanish from the board. Its new time overlapped a
-- kept booking at another time, so the time was left off, and the booking
-- itself was only listed when its start was not one of the new times
-- (found by the M3.5 critique, proved by tests/rls/m35-day-schedules.test.ts).
-- Booking, holds and the double-booking checks are unchanged: they never
-- read the board. On a normal evening the board is the same as before,
-- because a meeting booked at a time has exactly that time's start and end.

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
    -- The evening's times, less any that overlap a booked meeting, so
    -- nobody is booked into two meetings at once (M3.5).
    select tp.slot_day, tp.slot_start, tp.slot_end
    from template tp
    where not exists (
      select 1 from live lv
      where lv.starts_at < tp.slot_end and lv.ends_at > tp.slot_start
    )
    union all
    -- Every booked meeting shows at its own time and length, whether or not
    -- it still lines up with its evening's times.
    select (lv.starts_at at time zone 'America/Edmonton')::date, lv.starts_at, lv.ends_at
    from live lv
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