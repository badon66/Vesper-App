-- Round 8, part 3 of 3: quote outcomes and setter commission, the functions
-- (Keenan, 2026-11-09).
--
-- What: the only way a quote becomes Accepted, Declined or Cancelled, an
-- acceptance is undone, or a sold lead is marked Installed. Each is owner
-- only (Keenan, or the test suite's service role standing in for him),
-- locks the lead and then the quote, and writes the lead's timeline:
--   - quote_accept: the full quote or a smaller option (run positions),
--     an optional planned install date, the lead's track colour needed
--     first and copied onto the quote; the lead moves to Sold and the
--     quote's numbers lock. The lead's setter (assigned, else who added
--     it) gets one pending commission when they are a sales member and the
--     lead has none pending or paid already;
--   - quote_decline: one reason from the fixed list (a note only with
--     Other, kept on the quote); the lead moves to Lost with the reason;
--   - quote_cancel: an accepted quote taken back later; an unpaid
--     commission is voided with the reason; the lead moves to Lost with
--     "cancelled, <reason>";
--   - quote_undo_acceptance: back to a draft and the lead back to where it
--     was; an unpaid commission is voided; a paid one stays paid;
--   - lead_mark_installed: the install day (no later than today, Calgary),
--     stamped at noon Calgary time; the commission becomes payable through
--     the safety-net trigger;
--   - quote_commission_base: the commission base, worked out here from the
--     stored quote and never sent by a browser: the lights (price per foot
--     times the accepted runs' feet) and the control boxes, less the
--     discounts, never below zero. Rush colour, upper access, every extra
--     work line and the minimum top-up are never read, so they are left out
--     by construction. lib/pay/commission.ts mirrors it for previews.
-- Why: Keenan marks the outcome on the lead page and the setter earns
-- settings.commission_rate of that base (Keenan, 2026-11-09). Timeline
-- events carry the quote's id and fixed-list facts only, never an amount
-- or a typed note, because every setter reads the timeline.
-- Errors carry a stable code in their hint for the app to turn into plain
-- words. Additive: new functions only.

-- ---------------------------------------------------------------- the base

create or replace function public.quote_commission_base(p_quote uuid, p_runs int[])
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  with q as (
    select x.price_per_ft, x.box_price, x.box_count,
           case when jsonb_typeof(x.runs) = 'array' then x.runs else '[]'::jsonb end as runs,
           case when jsonb_typeof(x.discounts) = 'array' then x.discounts else '[]'::jsonb end as discounts
      from public.quotes x
     where x.id = p_quote
  ),
  feet as (
    select coalesce(sum(
             case when jsonb_typeof(r.value -> 'feet') = 'number'
                  then least(10000, greatest(0, round((r.value ->> 'feet')::numeric)))
                  else 0 end), 0) as total
      from q, jsonb_array_elements(q.runs) with ordinality as r (value, pos)
     where p_runs is null or (r.pos - 1)::int = any (p_runs)
  ),
  taken_off as (
    select coalesce(sum(
             case when jsonb_typeof(d.value -> 'amount') = 'number'
                  then round(greatest(0, (d.value ->> 'amount')::numeric) * 100)
                  else 0 end), 0) as cents
      from q, jsonb_array_elements(q.discounts) as d (value)
  )
  select greatest(
           0,
           round(q.price_per_ft * 100) * feet.total
           + round(q.box_price * 100) * greatest(q.box_count, 0)
           - taken_off.cents
         ) / 100
    from q, feet, taken_off;
$$;

-- ---------------------------------------------------------------- accept

create or replace function public.quote_accept(
  p_quote uuid,
  p_runs int[] default null,
  p_install_on date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  q public.quotes;
  l public.leads;
  run_count int;
  v_runs int[];
  v_colour text;
  v_before public.lead_status;
  receiver uuid;
  receiver_role public.user_role;
  existing public.earnings;
  v_rate numeric(5,4);
  v_base numeric(10,2);
  v_amount numeric(10,2);
  v_commission jsonb;
  v_why text;
begin
  if not public.acts_as_owner() then
    raise exception 'Only Keenan marks a quote''s outcome' using errcode = '42501', hint = 'not_allowed';
  end if;

  select * into q from public.quotes where id = p_quote;
  if not found then
    raise exception 'That quote was not found' using errcode = 'P0001', hint = 'not_open';
  end if;
  select * into l from public.leads where id = q.lead_id for update;
  select * into q from public.quotes where id = p_quote for update;

  if q.status not in ('draft', 'presented', 'declined', 'cancelled') then
    raise exception 'This quote can''t be accepted as it stands' using errcode = 'P0001', hint = 'not_open';
  end if;
  if exists (select 1 from public.quotes x where x.lead_id = l.id and x.status = 'accepted') then
    raise exception 'Another quote on this lead is already accepted' using errcode = 'P0001', hint = 'already_accepted';
  end if;
  if l.track_colour_id is null and l.track_ral_code is null then
    raise exception 'Set the track colour first' using errcode = 'P0001', hint = 'track_colour_needed';
  end if;

  run_count := case when jsonb_typeof(q.runs) = 'array' then jsonb_array_length(q.runs) else 0 end;
  if p_runs is not null then
    if cardinality(p_runs) = 0
       or exists (select 1 from unnest(p_runs) as p (pos) where p.pos is null or p.pos < 0 or p.pos >= run_count)
       or (select count(distinct p.pos) from unnest(p_runs) as p (pos)) <> cardinality(p_runs) then
      raise exception 'Pick runs that are on this quote' using errcode = 'P0001', hint = 'bad_runs';
    end if;
    select array_agg(p.pos order by p.pos) into v_runs from unnest(p_runs) as p (pos);
    -- Every run is the full quote.
    if cardinality(v_runs) = run_count then
      v_runs := null;
    end if;
  end if;

  v_before := case when l.status in ('sold', 'installed', 'lost') then 'met'::public.lead_status else l.status end;

  -- The colour by name, the way meeting mode copies it onto a draft.
  select c.name into v_colour from public.track_colours c where c.id = l.track_colour_id;
  if v_colour is null and l.track_ral_code is not null then
    v_colour := 'RAL ' || l.track_ral_code;
  end if;

  perform set_config('vesper.quote_outcome', 'on', true);
  update public.quotes
     set status = 'accepted',
         accepted_at = now(),
         accepted_by = actor,
         accepted_runs = v_runs,
         lead_status_before = v_before,
         declined_at = null,
         decline_reason = null,
         cancelled_at = null,
         cancel_reason = null,
         outcome_note = null,
         track_colour_name = v_colour,
         track_ral_code = l.track_ral_code,
         track_custom = (l.track_ral_code is not null)
   where id = q.id;
  update public.leads set status = 'sold', install_on = p_install_on where id = l.id;

  -- The commission goes to the lead's setter, the same person as the
  -- booking pay; leads assigned to Keenan earn nothing. One per lead while
  -- one is pending or paid.
  receiver := coalesce(l.assigned_to, l.created_by);
  select p.role into receiver_role from public.profiles p where p.id = receiver;
  if receiver_role is distinct from 'sales' then
    v_why := 'owner_lead';
  else
    select * into existing from public.earnings e
     where e.lead_id = l.id and e.type = 'commission' and e.status in ('pending', 'paid')
     order by (e.status = 'paid') desc, e.created_at desc
     limit 1;
    if found and existing.status = 'paid' then
      v_why := 'already_paid';
    elsif found then
      v_commission := jsonb_build_object('profile_id', existing.profile_id, 'amount', existing.amount);
    else
      -- A voided commission still naming this quote lets go of it first.
      update public.earnings set quote_id = null
       where quote_id = q.id and type = 'commission' and status = 'void';
      select s.commission_rate into v_rate from public.settings s where s.id = 1;
      v_base := coalesce(public.quote_commission_base(q.id, v_runs), 0);
      v_amount := round(v_base * v_rate, 2);
      insert into public.earnings (
        profile_id, lead_id, quote_id, source_quote_id, type, rate, base_amount, amount, status, payable_at
      ) values (
        receiver, l.id, q.id, q.id, 'commission', v_rate, v_base, v_amount, 'pending', null
      );
      v_commission := jsonb_build_object('profile_id', receiver, 'amount', v_amount);
    end if;
  end if;

  insert into public.lead_events (lead_id, actor_id, type, payload)
  values (l.id, actor, 'quote_accepted', jsonb_build_object('quote_id', q.id, 'install_on', p_install_on));

  perform set_config('vesper.quote_outcome', 'off', true);
  return jsonb_build_object('commission', v_commission, 'reason', v_why);
end;
$$;

-- ---------------------------------------------------------------- decline

create or replace function public.quote_decline(p_quote uuid, p_reason text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  q public.quotes;
  l public.leads;
  v_note text := nullif(btrim(p_note), '');
begin
  if not public.acts_as_owner() then
    raise exception 'Only Keenan marks a quote''s outcome' using errcode = '42501', hint = 'not_allowed';
  end if;

  select * into q from public.quotes where id = p_quote;
  if not found then
    raise exception 'That quote was not found' using errcode = 'P0001', hint = 'not_open';
  end if;
  select * into l from public.leads where id = q.lead_id for update;
  select * into q from public.quotes where id = p_quote for update;

  if q.status not in ('draft', 'presented') then
    raise exception 'Only an open quote can be declined' using errcode = 'P0001', hint = 'not_open';
  end if;
  -- A sale stands on the accepted quote: declining another one must not
  -- send the lead to Lost.
  if exists (select 1 from public.quotes x where x.lead_id = l.id and x.status = 'accepted') then
    raise exception 'Another quote on this lead is already accepted' using errcode = 'P0001', hint = 'already_accepted';
  end if;
  if p_reason is null
     or p_reason not in ('price', 'timing', 'partner said no', 'went with someone else', 'other') then
    raise exception 'Pick a reason from the list' using errcode = 'P0001', hint = 'bad_reason';
  end if;
  if v_note is not null and (p_reason <> 'other' or char_length(v_note) > 300) then
    raise exception 'A note goes with Other only, in 300 characters or fewer' using errcode = 'P0001', hint = 'bad_note';
  end if;

  perform set_config('vesper.quote_outcome', 'on', true);
  update public.quotes
     set status = 'declined',
         declined_at = now(),
         decline_reason = p_reason,
         cancelled_at = null,
         cancel_reason = null,
         outcome_note = v_note
   where id = q.id;
  update public.leads set status = 'lost', lost_reason = p_reason, install_on = null where id = l.id;

  insert into public.lead_events (lead_id, actor_id, type, payload)
  values (l.id, actor, 'quote_declined', jsonb_build_object('quote_id', q.id, 'reason', p_reason));

  perform set_config('vesper.quote_outcome', 'off', true);
end;
$$;

-- ---------------------------------------------------------------- cancel

create or replace function public.quote_cancel(p_quote uuid, p_reason text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  q public.quotes;
  l public.leads;
  v_note text := nullif(btrim(p_note), '');
begin
  if not public.acts_as_owner() then
    raise exception 'Only Keenan marks a quote''s outcome' using errcode = '42501', hint = 'not_allowed';
  end if;

  select * into q from public.quotes where id = p_quote;
  if not found then
    raise exception 'That quote was not found' using errcode = 'P0001', hint = 'not_accepted';
  end if;
  select * into l from public.leads where id = q.lead_id for update;
  select * into q from public.quotes where id = p_quote for update;

  if q.status <> 'accepted' then
    raise exception 'Only an accepted quote can be cancelled' using errcode = 'P0001', hint = 'not_accepted';
  end if;
  if p_reason is null
     or p_reason not in ('price', 'timing', 'partner said no', 'went with someone else', 'other') then
    raise exception 'Pick a reason from the list' using errcode = 'P0001', hint = 'bad_reason';
  end if;
  if v_note is not null and (p_reason <> 'other' or char_length(v_note) > 300) then
    raise exception 'A note goes with Other only, in 300 characters or fewer' using errcode = 'P0001', hint = 'bad_note';
  end if;

  -- An unpaid commission is voided with the reason and lets go of the
  -- quote; a paid one stays paid. Done before the lead moves, so the
  -- safety net finds nothing left to void.
  update public.earnings
     set status = 'void', note = 'Cancelled: ' || p_reason, quote_id = null
   where lead_id = l.id and type = 'commission' and status = 'pending';

  perform set_config('vesper.quote_outcome', 'on', true);
  update public.quotes
     set status = 'cancelled',
         cancelled_at = now(),
         cancel_reason = p_reason,
         outcome_note = v_note
   where id = q.id;
  update public.leads
     set status = 'lost', lost_reason = 'cancelled, ' || p_reason, install_on = null
   where id = l.id;

  insert into public.lead_events (lead_id, actor_id, type, payload)
  values (l.id, actor, 'quote_cancelled', jsonb_build_object(
    'quote_id', q.id,
    'reason', p_reason,
    'inside_window', coalesce(q.accepted_at > now() - interval '10 days', false)));

  perform set_config('vesper.quote_outcome', 'off', true);
end;
$$;

-- ---------------------------------------------------------------- undo

create or replace function public.quote_undo_acceptance(p_quote uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  q public.quotes;
  l public.leads;
  v_back public.lead_status;
begin
  if not public.acts_as_owner() then
    raise exception 'Only Keenan marks a quote''s outcome' using errcode = '42501', hint = 'not_allowed';
  end if;

  select * into q from public.quotes where id = p_quote;
  if not found then
    raise exception 'That quote was not found' using errcode = 'P0001', hint = 'not_undoable';
  end if;
  select * into l from public.leads where id = q.lead_id for update;
  select * into q from public.quotes where id = p_quote for update;

  if q.status <> 'accepted' or l.status <> 'sold' then
    raise exception 'Only an accepted quote on a sold lead can be undone' using errcode = 'P0001', hint = 'not_undoable';
  end if;

  update public.earnings
     set status = 'void', note = 'Acceptance undone', quote_id = null
   where lead_id = l.id and type = 'commission' and status = 'pending';

  perform set_config('vesper.quote_outcome', 'on', true);
  update public.quotes
     set status = 'draft',
         accepted_at = null,
         accepted_by = null,
         accepted_runs = null,
         lead_status_before = null
   where id = q.id;

  -- Back to where the lead was. Follow up needs its day, so it comes back
  -- due tomorrow, as a cancelled booking does.
  v_back := coalesce(q.lead_status_before, 'met');
  if v_back in ('sold', 'installed', 'lost') then
    v_back := 'met';
  end if;
  update public.leads
     set status = v_back,
         install_on = null,
         follow_up_on = case when v_back = 'follow_up' then public.calgary_tomorrow() end
   where id = l.id;

  insert into public.lead_events (lead_id, actor_id, type, payload)
  values (l.id, actor, 'quote_acceptance_undone', jsonb_build_object('quote_id', q.id));

  perform set_config('vesper.quote_outcome', 'off', true);
end;
$$;

-- ---------------------------------------------------------------- installed

create or replace function public.lead_mark_installed(p_lead uuid, p_on date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.leads;
begin
  if not public.acts_as_owner() then
    raise exception 'Only Keenan marks a job installed' using errcode = '42501', hint = 'not_allowed';
  end if;

  select * into l from public.leads where id = p_lead for update;
  if not found
     or l.status <> 'sold'
     or not exists (select 1 from public.quotes x where x.lead_id = l.id and x.status = 'accepted') then
    raise exception 'Only a sold lead with an accepted quote can be marked installed'
      using errcode = 'P0001', hint = 'not_sold';
  end if;
  if p_on is null or p_on > (now() at time zone 'America/Edmonton')::date then
    raise exception 'Pick the install day, today or earlier' using errcode = 'P0001', hint = 'bad_date';
  end if;

  -- The status change logs itself on the timeline, and the commission
  -- safety net makes the setter's commission payable.
  update public.leads
     set status = 'installed',
         installed_at = (p_on + time '12:00') at time zone 'America/Edmonton'
   where id = l.id;
end;
$$;

-- ---------------------------------------------------------------- privileges

-- Internal helper: only the functions above use it.
revoke execute on function public.quote_commission_base(uuid, int[]) from public, anon, authenticated;

-- The outcome functions: each checks who is calling.
revoke execute on function public.quote_accept(uuid, int[], date) from public, anon;
revoke execute on function public.quote_decline(uuid, text, text) from public, anon;
revoke execute on function public.quote_cancel(uuid, text, text) from public, anon;
revoke execute on function public.quote_undo_acceptance(uuid) from public, anon;
revoke execute on function public.lead_mark_installed(uuid, date) from public, anon;
grant execute on function public.quote_accept(uuid, int[], date) to authenticated, service_role;
grant execute on function public.quote_decline(uuid, text, text) to authenticated, service_role;
grant execute on function public.quote_cancel(uuid, text, text) to authenticated, service_role;
grant execute on function public.quote_undo_acceptance(uuid) to authenticated, service_role;
grant execute on function public.lead_mark_installed(uuid, date) to authenticated, service_role;
