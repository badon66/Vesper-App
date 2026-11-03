-- Setter side, round 2 (Keenan, 2026-11-03): the hold timer, Not collected,
-- and the "everyone who decides" question.
--
-- What:
--   - settings.hold_minutes (5): how long a hold lasts, and what Add 5 minutes
--     adds. hold_grace() now returns it, so every booking function's one
--     live-hold test ("renewed_at within hold_grace() of now") becomes the
--     timer: renewed_at is where the hold's timer counts from;
--   - hold_slot: holding your own live time again keeps its timer (no free
--     minutes); its reply says when the hold runs out;
--   - extend_hold(): the holder only. Adds hold_minutes to a live hold, or
--     takes a run-out hold back while the time is still free; never once
--     someone else has it. Under the evening lock, like every hold change;
--   - hold_status(): the caller's own hold and when it runs out;
--     renew_hold() now only reports, the same way, and never extends;
--   - leads.not_collected: the questions marked Not collected; a trigger
--     keeps an answered question out of it;
--   - leads.both_decision_makers (unused until now) is the question
--     "Everyone who decides will be there": Yes true, No false;
--   - the lead timeline notes changes to both, like any other edit;
--   - settings_public gains hold_minutes.
-- Why: Keenan's round 2: a hold is a 5 minute timer the holder can extend,
-- replacing the check-in grace period, and every question takes an answer
-- or Not collected.
-- Additive: one column on settings, one on leads, functions redefined;
-- nothing is taken away. hold_grace_minutes stays, unused.

-- ---------------------------------------------------------------- settings

alter table public.settings
  add column hold_minutes int not null default 5
    check (hold_minutes between 1 and 30);
comment on column public.settings.hold_minutes is
  'Round 2: how long a hold lasts, and what Add 5 minutes adds. The timer is what frees a time.';
comment on column public.settings.hold_grace_minutes is
  'Unused since round 2 (2026-11-03): the hold timer (hold_minutes) replaced the check-in grace period.';

create or replace function public.hold_grace()
returns interval
language sql
stable
security definer
set search_path = ''
as $$
  select make_interval(mins => hold_minutes) from public.settings where id = 1;
$$;

create or replace view public.settings_public with (security_invoker = false) as
  select meeting_days, meeting_start, meeting_slot_minutes, meeting_slot_count,
         distance_warning_km, lost_reasons, door_guide,
         booking_cutoff_minutes, hold_grace_minutes, booking_window_days,
         step_note_at_door, step_note_after_door, step_note_book,
         hold_minutes
  from public.settings
  where id = 1
    and exists (select 1 from public.profiles me where me.id = auth.uid() and me.active);

-- ---------------------------------------------------------------- holds

comment on column public.slot_holds.renewed_at is
  'Round 2: where the hold''s timer counts from. It lasts settings.hold_minutes from here; Add 5 minutes moves it on by that much.';

-- Tapping an open time holds it. The caller's other hold lets go (one hold
-- per person). Holding a time the caller already holds keeps its timer as
-- it is: extra minutes only come from extend_hold.
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
  hold public.slot_holds;
begin
  if me is null or not public.is_sales_side() then
    raise exception 'Not for your role' using errcode = '42501', hint = 'not_allowed';
  end if;
  h := public.resolve_meeting_host(p_host);
  perform public.lock_evening(h, p_starts_at);
  perform public.release_lapsed_holds(h, p_starts_at);

  update public.slot_holds
     set lead_id = coalesce(p_lead_id, lead_id),
         meeting_id = coalesce(p_meeting_id, meeting_id)
   where host_id = h and starts_at = p_starts_at and holder_id = me and released_at is null
  returning * into hold;
  if hold.id is not null then
    return jsonb_build_object('hold_id', hold.id, 'starts_at', p_starts_at,
                              'expires_at', hold.renewed_at + public.hold_grace(), 'now', now());
  end if;

  perform public.check_slot_free(h, p_starts_at, public.is_owner(), me);

  update public.slot_holds
     set released_at = now(),
         release_reason = case when renewed_at <= now() - public.hold_grace() then 'lapsed' else 'switched' end
   where holder_id = me and released_at is null;

  insert into public.slot_holds (host_id, starts_at, holder_id, lead_id, meeting_id)
  values (h, p_starts_at, me, p_lead_id, p_meeting_id)
  returning * into hold;
  return jsonb_build_object('hold_id', hold.id, 'starts_at', p_starts_at,
                            'expires_at', hold.renewed_at + public.hold_grace(), 'now', now());
exception
  when unique_violation then
    raise exception 'Someone else is booking this time' using errcode = 'P0001', hint = 'slot_held';
end;
$$;

-- Add 5 minutes. Only ever the caller's own hold. A live hold gets the hold
-- length added to what's left; a run-out one is taken back, with a fresh
-- timer, only while the time is still free; once someone else has it, it
-- is gone and says so.
create or replace function public.extend_hold()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  hold public.slot_holds;
  len interval;
begin
  if me is null or not public.is_sales_side() then
    raise exception 'Not for your role' using errcode = '42501', hint = 'not_allowed';
  end if;
  select * into hold from public.slot_holds where holder_id = me and released_at is null;
  if not found then
    return jsonb_build_object('status', 'none');
  end if;

  perform public.lock_evening(hold.host_id, hold.starts_at);
  select * into hold from public.slot_holds where id = hold.id;
  if hold.released_at is not null then
    return jsonb_build_object('status', 'lost', 'starts_at', hold.starts_at);
  end if;

  len := public.hold_grace();
  if hold.renewed_at > now() - len then
    update public.slot_holds set renewed_at = renewed_at + len where id = hold.id
    returning * into hold;
    return jsonb_build_object('status', 'held', 'starts_at', hold.starts_at,
                              'expires_at', hold.renewed_at + len, 'now', now());
  end if;

  begin
    perform public.check_slot_free(hold.host_id, hold.starts_at, public.is_owner(), me);
  exception when others then
    update public.slot_holds set released_at = now(), release_reason = 'lapsed' where id = hold.id;
    return jsonb_build_object('status', 'lost', 'starts_at', hold.starts_at, 'message', sqlerrm);
  end;
  update public.slot_holds set renewed_at = now() where id = hold.id
  returning * into hold;
  return jsonb_build_object('status', 'held', 'starts_at', hold.starts_at,
                            'expires_at', hold.renewed_at + len, 'now', now(), 'retaken', true);
end;
$$;

-- The caller's own hold and when it runs out, from the server's clock.
create or replace function public.hold_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  hold public.slot_holds;
  len interval;
begin
  if me is null then
    return jsonb_build_object('status', 'none');
  end if;
  select * into hold from public.slot_holds where holder_id = me and released_at is null;
  if not found then
    return jsonb_build_object('status', 'none');
  end if;
  len := public.hold_grace();
  return jsonb_build_object(
    'status', case when hold.renewed_at > now() - len then 'held' else 'expired' end,
    'starts_at', hold.starts_at,
    'lead_id', hold.lead_id,
    'meeting_id', hold.meeting_id,
    'expires_at', hold.renewed_at + len,
    'now', now()
  );
end;
$$;

-- Before round 2 a screen checked in here to keep its hold alive. Now it
-- only reports: a run-out hold reads as lost, and nothing is extended.
create or replace function public.renew_hold()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  answer jsonb := public.hold_status();
begin
  if answer ->> 'status' = 'expired' then
    return jsonb_build_object('status', 'lost', 'starts_at', answer -> 'starts_at');
  end if;
  return answer;
end;
$$;

revoke execute on function public.extend_hold() from public, anon;
revoke execute on function public.hold_status() from public, anon;
grant execute on function public.extend_hold() to authenticated, service_role;
grant execute on function public.hold_status() to authenticated, service_role;

-- ---------------------------------------------------------------- leads

alter table public.leads
  add column not_collected text[] not null default '{}'
    check (not_collected <@ array['phone', 'owns_home', 'wants_price', 'both_decision_makers',
                                  'christmas_lights_now', 'looked_into_before', 'areas_wanted',
                                  'install_timing']::text[]);
comment on column public.leads.not_collected is
  'Round 2: the questions the setter marked Not collected. An answered question is never in it (leads_tidy_not_collected).';
comment on column public.leads.both_decision_makers is
  'Round 2: the question "Everyone who decides will be there": Yes true, No false. Booking copies it to meetings.everyone_deciding_present.';

-- An answer always wins over Not collected, and each question is listed once.
create or replace function public.leads_tidy_not_collected()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.not_collected := coalesce((
    select array_agg(distinct q order by q)
      from unnest(coalesce(new.not_collected, '{}'::text[])) as q
     where (q = 'phone' and new.phone is null)
        or (q = 'owns_home' and new.owns_home is null)
        or (q = 'wants_price' and new.wants_price is null)
        or (q = 'both_decision_makers' and new.both_decision_makers is null)
        or (q = 'christmas_lights_now' and new.christmas_lights_now is null)
        or (q = 'looked_into_before' and new.looked_into_before is null)
        or (q = 'areas_wanted' and new.areas_wanted is null)
        or (q = 'install_timing' and new.install_timing is null)
  ), '{}'::text[]);
  return new;
end;
$$;

create trigger leads_tidy_not_collected
  before insert or update on public.leads
  for each row execute function public.leads_tidy_not_collected();

-- The timeline notes the two new answers like any other edit: the same
-- trigger function with both fields added to its list.
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
           'both_decision_makers', 'not_collected'
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
