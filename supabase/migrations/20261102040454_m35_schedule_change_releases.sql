-- M3.5 follow-up: a hold whose time disappears in a day change is stamped
-- 'released', one of the reasons slot_holds already allows, instead of a new
-- reason the table's check would refuse. Widening that check would mean
-- replacing it, which isn't additive. The holder's screen learns why from
-- the board: the time is no longer offered. Same function otherwise.

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
     where id = 1
       and (meeting_start, meeting_slot_minutes, meeting_slot_count)
           is distinct from (p_start, p_minutes, p_count);
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
     set released_at = now(), release_reason = 'released'
   where x.host_id = h
     and x.released_at is null
     and (p_scope = 'all' or (x.starts_at at time zone 'America/Edmonton')::date = p_day)
     and not public.is_template_slot(x.starts_at, h);
  get diagnostics released = row_count;

  return jsonb_build_object('released_holds', released);
end;
$$;
