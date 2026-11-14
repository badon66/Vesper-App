-- Round 20 (Keenan, 2026-11-14): Keenan can take a lead out. It moves to
-- Deleted for 30 days, then the app removes it for good (lib/leads/purge.ts,
-- on Keenan's own visits, never from a migration).
--
-- While deleted, the lead is out of every list: a restrictive rule hides it
-- from every read of the table, Keenan's included, so Leads, Home, Meetings
-- and search leave it out without each query saying so. Only these functions, all
-- Keenan's alone, see it: lead_delete_check (what deleting would do),
-- lead_soft_delete, lead_restore and deleted_leads. Its customer's link stops
-- working (quote_link_live) and its meetings leave the schedule board. A lead
-- with an accepted quote, or any booking pay or commission that isn't void,
-- can't be deleted. Its upcoming meetings are cancelled and their times freed
-- up, the way cancel_meeting does it; restoring brings the lead, its quote
-- and its link back, but never a cancelled meeting.

alter table public.leads
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.profiles (id);

comment on column public.leads.deleted_at is
  'Round 20: when Keenan deleted the lead; null while it is live. Out of every read of the table while set; removed for good 30 days later.';

create index if not exists leads_deleted_at on public.leads (deleted_at) where deleted_at is not null;

create policy "deleted leads are out of every list" on public.leads
  as restrictive
  for select
  to authenticated
  using (deleted_at is null);

-- What deleting this lead would do, for the confirm: refused (an accepted
-- quote, or pay that isn't void), or the upcoming meetings it would cancel.
create or replace function public.lead_delete_check(p_lead uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  l public.leads;
  v_meetings jsonb;
begin
  if not public.is_owner() then
    raise exception 'Only Keenan deletes a lead' using errcode = '42501', hint = 'not_allowed';
  end if;
  select * into l from public.leads where id = p_lead;
  if not found or l.deleted_at is not null then
    return jsonb_build_object('ok', false, 'state', 'not_found');
  end if;
  if exists (select 1 from public.quotes q where q.lead_id = l.id and q.status = 'accepted') then
    return jsonb_build_object('ok', false, 'state', 'accepted', 'status', l.status);
  end if;
  if exists (select 1 from public.earnings e where e.lead_id = l.id and e.status <> 'void') then
    return jsonb_build_object('ok', false, 'state', 'pay', 'status', l.status);
  end if;
  select coalesce(jsonb_agg(m.starts_at order by m.starts_at), '[]'::jsonb) into v_meetings
    from public.meetings m
   where m.lead_id = l.id and m.status in ('booked', 'confirmed') and m.starts_at > now();
  return jsonb_build_object('ok', true, 'meetings', v_meetings);
end;
$$;

create or replace function public.lead_soft_delete(p_lead uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  l public.leads;
  m public.meetings;
  v_cancelled jsonb := '[]'::jsonb;
begin
  if me is null or not public.is_owner() then
    raise exception 'Only Keenan deletes a lead' using errcode = '42501', hint = 'not_allowed';
  end if;
  -- The evenings first, in the order booking takes its locks.
  for m in
    select * from public.meetings x
     where x.lead_id = p_lead and x.status in ('booked', 'confirmed') and x.starts_at > now()
     order by x.starts_at
  loop
    perform public.lock_evening(m.host_id, m.starts_at);
  end loop;
  select * into l from public.leads where id = p_lead for update;
  if not found or l.deleted_at is not null then
    raise exception 'That lead was not found' using errcode = 'P0001', hint = 'not_found';
  end if;
  if exists (select 1 from public.quotes q where q.lead_id = l.id and q.status = 'accepted') then
    raise exception 'A lead with an accepted quote can''t be deleted' using errcode = 'P0001', hint = 'accepted_quote';
  end if;
  if exists (select 1 from public.earnings e where e.lead_id = l.id and e.status <> 'void') then
    raise exception 'A lead with booking pay or commission can''t be deleted' using errcode = 'P0001', hint = 'has_pay';
  end if;

  for m in
    select * from public.meetings x
     where x.lead_id = l.id and x.status in ('booked', 'confirmed') and x.starts_at > now()
     order by x.starts_at
     for update
  loop
    update public.meetings
       set status = 'cancelled', outcome_note = 'The lead was deleted.', outcome_at = now(), outcome_by = me
     where id = m.id;
    insert into public.lead_events (lead_id, actor_id, type, payload)
    values (l.id, me, 'meeting_cancelled', jsonb_build_object('meeting_id', m.id, 'starts_at', m.starts_at));
    v_cancelled := v_cancelled || jsonb_build_array(m.id);
  end loop;
  -- As cancelling a booking does: the lead goes to Follow up, for tomorrow.
  update public.leads set status = 'follow_up', follow_up_on = public.calgary_tomorrow()
   where id = l.id and status = 'meeting_booked';

  update public.leads set deleted_at = now(), deleted_by = me where id = l.id;
  insert into public.lead_events (lead_id, actor_id, type, payload)
  values (l.id, me, 'lead_deleted', '{}'::jsonb);
  return jsonb_build_object('ok', true, 'cancelled', v_cancelled);
end;
$$;

create or replace function public.lead_restore(p_lead uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  l public.leads;
begin
  if me is null or not public.is_owner() then
    raise exception 'Only Keenan restores a lead' using errcode = '42501', hint = 'not_allowed';
  end if;
  select * into l from public.leads where id = p_lead for update;
  if not found or l.deleted_at is null then
    raise exception 'That lead isn''t in Deleted' using errcode = 'P0001', hint = 'not_deleted';
  end if;
  update public.leads set deleted_at = null, deleted_by = null where id = l.id;
  insert into public.lead_events (lead_id, actor_id, type, payload)
  values (l.id, me, 'lead_restored', '{}'::jsonb);
  return jsonb_build_object('ok', true);
end;
$$;

-- Admin, Deleted: newest first, with the day each is removed for good.
create or replace function public.deleted_leads()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception 'Only Keenan sees Deleted' using errcode = '42501', hint = 'not_allowed';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', l.id,
             'first_name', l.first_name,
             'last_name', l.last_name,
             'address_line', l.address_line,
             'city', l.city,
             'deleted_at', l.deleted_at,
             'gone_after', l.deleted_at + interval '30 days') order by l.deleted_at desc), '[]'::jsonb)
      from public.leads l
     where l.deleted_at is not null
  );
end;
$$;

revoke execute on function public.lead_delete_check(uuid) from public, anon;
revoke execute on function public.lead_soft_delete(uuid) from public, anon;
revoke execute on function public.lead_restore(uuid) from public, anon;
revoke execute on function public.deleted_leads() from public, anon;
grant execute on function public.lead_delete_check(uuid) to authenticated, service_role;
grant execute on function public.lead_soft_delete(uuid) to authenticated, service_role;
grant execute on function public.lead_restore(uuid) to authenticated, service_role;
grant execute on function public.deleted_leads() to authenticated, service_role;

-- A deleted lead's link stops working; restoring brings it back.
create or replace function public.quote_link_live(p_token text)
returns public.quote_links
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  link public.quote_links;
  q public.quotes;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{24}$' then
    return null;
  end if;
  select * into link from public.quote_links l where l.token = p_token and l.revoked_at is null;
  if not found then
    return null;
  end if;
  if exists (select 1 from public.leads dl where dl.id = link.lead_id and dl.deleted_at is not null) then
    return null;
  end if;
  q := public.quote_link_current_quote(link.lead_id);
  if q.id is null then
    return null;
  end if;
  return link;
end;
$$;

-- The schedule board leaves out a deleted lead's meetings (its upcoming ones
-- are cancelled anyway; this covers one earlier the same evening). Otherwise
-- exactly as round 3.5 left it.
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
      and not exists (select 1 from public.leads dl where dl.id = m.lead_id and dl.deleted_at is not null)
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
      and not exists (select 1 from public.leads dl where dl.id = m.lead_id and dl.deleted_at is not null)
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
