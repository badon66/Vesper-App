-- Round 23 (Keenan, 2026-11-17): install days the customer picks from
-- Keenan's calendar. Additive: new settings columns, a new table, new
-- functions and triggers, and the general "edited" timeline entry without
-- the install day (below). The lead's own install day (leads.install_on)
-- is the one spot a job holds: picked with a yes at the meeting, by the
-- customer on their link, or set by Keenan.
--
-- 1. Settings: how many jobs a day by default (1), and the earliest day a
--    customer can pick: 3 days out for white track, 7 for a colour-matched
--    track (time to prep the material).
-- 2. install_days: Keenan's calendar. A day is closed until he opens it;
--    an open day takes the default number of jobs, or its own (2 on a day
--    with extra crew). Owner only.
-- 3. A guard on leads.install_on, under a lock per day: a day must be open
--    and can never go over its limit, the same way meeting times are
--    guarded. A lead that goes Lost or is deleted gives its day back.
--    Lowering a day's limit below what's booked on it is refused; closing
--    it never moves anyone.
-- 4. The timeline records a day picked, changed or taken off, and who did
--    it (the customer, the meeting or Keenan). The general "edited" entry no
--    longer lists the install day, so nothing is said twice.
-- 5. The customer's link: quote_link_install(token) returns their day,
--    whether they can still change it (until 2 days before), the earliest
--    day and the open days of the next nine weeks with which are full;
--    quote_link_pick_install_day(token, day) picks or changes it and hands
--    the server Keenan's sealed push addresses. Both read and change only
--    that link's lead.
-- 6. install_day_set(lead, day, by): Keenan's own way to set or change a
--    day (the lead page, the Accepted sheet, the meeting's yes).
-- 7. Accepted keeps the day already picked when the sheet gives none, and
--    Undo acceptance keeps it (the customer still has that day): the
--    guard keeps the day while the quote outcome functions are running,
--    unless the lead goes Lost.

-- ---------------------------------------------------------------- 1. settings

alter table public.settings
  add column if not exists install_jobs_per_day integer not null default 1 check (install_jobs_per_day between 1 and 20),
  add column if not exists install_lead_days_white integer not null default 3 check (install_lead_days_white between 0 and 60),
  add column if not exists install_lead_days_colour integer not null default 7 check (install_lead_days_colour between 0 and 60);

comment on column public.settings.install_jobs_per_day is 'Round 23: installs a day, unless the day has its own number.';
comment on column public.settings.install_lead_days_white is 'Round 23: the earliest install day a customer can pick, in days from today, for white track.';
comment on column public.settings.install_lead_days_colour is 'Round 23: the same for a colour-matched track (or none set yet).';

-- ---------------------------------------------------------------- 2. Keenan's calendar

create table if not exists public.install_days (
  day date primary key,
  open boolean not null default false,
  job_limit integer check (job_limit between 1 and 20),
  updated_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.install_days is 'Round 23: Keenan''s install calendar. A day with no row, or closed, takes no installs; job_limit null means settings.install_jobs_per_day.';

create trigger install_days_set_updated_at
  before update on public.install_days
  for each row execute function public.set_updated_at();

alter table public.install_days enable row level security;

create policy "owner reads install days" on public.install_days
  for select to authenticated
  using ((select public.is_owner()));

create policy "owner opens install days" on public.install_days
  for insert to authenticated
  with check ((select public.is_owner()));

create policy "owner changes install days" on public.install_days
  for update to authenticated
  using ((select public.is_owner()))
  with check ((select public.is_owner()));

create index if not exists leads_install_on on public.leads (install_on) where install_on is not null;

-- ---------------------------------------------------------------- helpers (not served by the API)

-- How many jobs a day takes: 0 when it isn't open.
create or replace function private.install_day_limit(p_day date)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select case when d.open then coalesce(d.job_limit, s.install_jobs_per_day) else 0 end
       from public.install_days d, public.settings s
      where d.day = p_day and s.id = 1),
    0);
$$;

-- How many jobs hold a day, leaving one lead out (the one being moved).
create or replace function private.install_day_taken(p_day date, p_except uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
    from public.leads l
   where l.install_on = p_day
     and l.deleted_at is null
     and l.status <> 'lost'
     and l.id is distinct from p_except;
$$;

-- A lead's track as far as prep time goes: white is the stock track; any
-- other colour, a Custom code, or none set yet counts as colour-matched.
create or replace function private.install_track_kind(p_lead uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when l.track_ral_code is not null then 'colour'
    when c.name ~* '^\s*white\M' then 'white'
    else 'colour'
  end
    from public.leads l
    left join public.track_colours c on c.id = l.track_colour_id
   where l.id = p_lead;
$$;

-- The earliest day the customer can pick for a lead.
create or replace function private.install_earliest(p_lead uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (now() at time zone 'America/Edmonton')::date
       + case when private.install_track_kind(p_lead) = 'white' then s.install_lead_days_white else s.install_lead_days_colour end
    from public.settings s
   where s.id = 1;
$$;

-- ---------------------------------------------------------------- 3. the guard on a lead's day

create or replace function public.leads_place_install_day()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
begin
  -- Accepted with no day on its sheet, and Undo acceptance, keep the day
  -- already picked. The outcome functions mark themselves as running;
  -- going Lost (Declined, Cancelled) still gives the day back.
  if tg_op = 'UPDATE' and new.install_on is null and old.install_on is not null
     and current_setting('vesper.quote_outcome', true) = 'on'
     and new.status is distinct from 'lost' and new.deleted_at is null then
    new.install_on := old.install_on;
  end if;

  -- Lost or removed gives the day back.
  if tg_op = 'UPDATE' and new.install_on is not null
     and ((new.status = 'lost' and old.status is distinct from 'lost')
          or (new.deleted_at is not null and old.deleted_at is null)) then
    new.install_on := null;
  end if;

  if new.install_on is not null
     and (tg_op = 'INSERT'
          or new.install_on is distinct from old.install_on
          or (old.status = 'lost' and new.status is distinct from 'lost')) then
    -- One at a time per day, so two people can never take its last spot.
    perform pg_advisory_xact_lock(hashtextextended('install_day:' || new.install_on::text, 0));
    v_limit := private.install_day_limit(new.install_on);
    if v_limit = 0 then
      raise exception 'That day is not open for installs' using errcode = 'P0001', hint = 'day_closed';
    end if;
    if private.install_day_taken(new.install_on, new.id) >= v_limit then
      raise exception 'That day is full' using errcode = 'P0001', hint = 'day_full';
    end if;
  end if;
  return new;
end;
$$;

-- Named to run after leads_guard and leads_owner_dates, which decide who
-- may set the day at all.
create trigger leads_place_install_day
  before insert or update on public.leads
  for each row execute function public.leads_place_install_day();

-- A day's own limit can't go below what's booked on it; closing it never
-- moves anyone.
create or replace function public.install_days_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_taken integer;
  v_limit integer;
begin
  if new.open then
    perform pg_advisory_xact_lock(hashtextextended('install_day:' || new.day::text, 0));
    select coalesce(new.job_limit, s.install_jobs_per_day) into v_limit from public.settings s where s.id = 1;
    v_taken := private.install_day_taken(new.day, null);
    if v_taken > v_limit then
      raise exception 'More jobs are booked on that day than that' using errcode = 'P0001', hint = 'below_booked';
    end if;
  end if;
  return new;
end;
$$;

create trigger install_days_guard
  before insert or update on public.install_days
  for each row execute function public.install_days_guard();

-- ---------------------------------------------------------------- 4. the timeline

create or replace function public.leads_log_install_day()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_by text := nullif(current_setting('vesper.install_by', true), '');
  v_from date := case when tg_op = 'UPDATE' then old.install_on end;
begin
  if new.install_on is not distinct from v_from then
    return null;
  end if;
  -- A day given back by Lost, or by the lead being removed, is said by those entries.
  if new.install_on is null and (new.status = 'lost' or new.deleted_at is not null) then
    return null;
  end if;
  if v_by is null then
    v_by := case when auth.uid() is null then 'system' else 'keenan' end;
  end if;
  insert into public.lead_events (lead_id, actor_id, type, payload)
  values (
    new.id,
    auth.uid(),
    case
      when new.install_on is null then 'install_day_cleared'::public.event_type
      when v_from is null then 'install_day_picked'::public.event_type
      else 'install_day_changed'::public.event_type
    end,
    jsonb_strip_nulls(jsonb_build_object('day', new.install_on, 'from', v_from, 'by', v_by))
  );
  return null;
end;
$$;

create trigger leads_log_install_day
  after insert or update on public.leads
  for each row execute function public.leads_log_install_day();

-- The general "edited" entry, without install_on (said above).
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
           'install_timing', 'track_colour_id', 'track_ral_code', 'looked_into_before',
           'both_decision_makers', 'not_collected', 'setter_read', 'hot_buttons', 'confirm_by',
           'soffit_colour_2', 'soffit_ral_code', 'soffit_ral_code_2'
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

-- ---------------------------------------------------------------- 5. the customer's link

create or replace function public.quote_link_install(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  link public.quote_links;
  q public.quotes;
  v_lead public.leads;
  today date := (now() at time zone 'America/Edmonton')::date;
  v_earliest date;
  v_days jsonb;
begin
  link := public.quote_link_live(p_token);
  if link.id is null then
    return jsonb_build_object('state', 'expired');
  end if;
  select * into v_lead from public.leads l where l.id = link.lead_id;
  q := public.quote_link_current_quote(link.lead_id);
  v_earliest := private.install_earliest(link.lead_id);
  select coalesce(jsonb_agg(jsonb_build_object(
           'day', d.day,
           'full', private.install_day_taken(d.day, v_lead.id) >= private.install_day_limit(d.day)
         ) order by d.day), '[]'::jsonb)
    into v_days
    from public.install_days d
   where d.open
     and d.day >= v_earliest
     and d.day < v_earliest + 63;
  return jsonb_build_object(
    'state', 'live',
    -- Shown once they've booked an option (or signed, which books it), a
    -- day is already theirs, or the quote is accepted.
    'ready', coalesce(link.booked_at is not null or v_lead.install_on is not null or q.status = 'accepted', false),
    'day', v_lead.install_on,
    'today', today,
    'earliest', v_earliest,
    'kind', private.install_track_kind(link.lead_id),
    'change_until', v_lead.install_on - 2,
    'can_change', v_lead.install_on is null or today <= v_lead.install_on - 2,
    'days', v_days
  );
end;
$$;

create or replace function public.quote_link_pick_install_day(p_token text, p_day date)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  link public.quote_links;
  q public.quotes;
  v_lead public.leads;
  today date := (now() at time zone 'America/Edmonton')::date;
  v_from date;
  v_hint text;
  v_targets jsonb := '[]'::jsonb;
begin
  link := public.quote_link_live(p_token);
  if link.id is null then
    return jsonb_build_object('ok', false, 'state', 'expired');
  end if;
  select * into v_lead from public.leads l where l.id = link.lead_id for update;
  q := public.quote_link_current_quote(link.lead_id);
  if not coalesce(link.booked_at is not null or v_lead.install_on is not null or q.status = 'accepted', false) then
    return jsonb_build_object('ok', false, 'state', 'not_booked');
  end if;
  if v_lead.install_on is not null and today > v_lead.install_on - 2 then
    return jsonb_build_object('ok', false, 'state', 'too_late', 'day', v_lead.install_on);
  end if;
  if p_day is null then
    return jsonb_build_object('ok', false, 'state', 'bad_day');
  end if;
  if p_day < private.install_earliest(link.lead_id) then
    return jsonb_build_object('ok', false, 'state', 'too_soon');
  end if;
  if v_lead.install_on = p_day then
    return jsonb_build_object('ok', true, 'changed', false, 'day', p_day);
  end if;

  v_from := v_lead.install_on;
  perform set_config('vesper.install_by', 'customer', true);
  begin
    update public.leads set install_on = p_day where id = v_lead.id;
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_hint = pg_exception_hint;
    if v_hint in ('day_full', 'day_closed') then
      return jsonb_build_object('ok', false, 'state', v_hint);
    end if;
    raise;
  end;

  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'sealed', p.sealed)), '[]'::jsonb)
    into v_targets
    from public.push_subscriptions p
   where p.profile_id = link.created_by
     and p.removed_at is null;

  return jsonb_build_object(
    'ok', true,
    'changed', true,
    'day', p_day,
    'from', v_from,
    'name', btrim(v_lead.first_name || ' ' || coalesce(v_lead.last_name, '')),
    'lead_id', v_lead.id,
    'targets', v_targets
  );
end;
$$;

grant execute on function public.quote_link_install(text) to anon, authenticated, service_role;
grant execute on function public.quote_link_pick_install_day(text, date) to anon, authenticated, service_role;

-- ---------------------------------------------------------------- 6. Keenan's own

-- Runs as Keenan (invoker): his session's own rights on leads, the same
-- guard, and the timeline says who (the meeting or Keenan).
create or replace function public.install_day_set(p_lead uuid, p_day date, p_by text default 'keenan')
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  if not (public.is_owner() or coalesce(auth.jwt() ->> 'role', '') = 'service_role') then
    raise exception 'Only Keenan sets install days' using errcode = '42501', hint = 'not_allowed';
  end if;
  perform set_config('vesper.install_by', case when p_by = 'meeting' then 'meeting' else 'keenan' end, true);
  update public.leads set install_on = p_day where id = p_lead and deleted_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'state', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'day', p_day);
end;
$$;

grant execute on function public.install_day_set(uuid, date, text) to authenticated, service_role;
