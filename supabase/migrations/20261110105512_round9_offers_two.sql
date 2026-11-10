-- Round 9, part 2: offers at the table and on the Accepted sheet (Keenan,
-- 2026-11-10; settled by the five seats).
--
-- What:
--   - quotes.meeting_offer: the option the customer chose at the table (an
--     offer id), and quotes.meeting_install_on: the install day picked at
--     the table. Both save with the draft; neither is written to the lead
--     before Keenan marks the quote accepted;
--   - quotes.accepted_offer and accepted_boxes: the option the Accepted
--     sheet recorded and its control box count, beside round 8's
--     accepted_runs;
--   - quote_offers_clean keeps each offer's own box count (a whole number
--     from 1 to 9, else null for the quote's own count);
--   - quote_commission_base_boxes: round 8's base with the option's own box
--     count (the lights for its runs and its boxes, less the discounts,
--     never below zero; rush colour, upper access, extra work and the
--     minimum top-up still left out);
--   - quote_accept_offer: round 8's quote_accept, choosing by offer id. It
--     records the option, its runs and its boxes, and the setter's
--     commission is worked out on that option's lights and boxes. The
--     timeline event carries the option's name, never an amount;
--   - quote_undo_acceptance: also clears accepted_offer and accepted_boxes;
--   - quote_for_customer: also hands the page the option chosen at the
--     meeting, the planned install day (the lead's, else the meeting's),
--     whether the colour was confirmed with initials, and once the quote is
--     accepted, which option was agreed. Everything else as before.
-- Why: the meeting walks the options down from the full wrap, the customer
-- picks one at the table or on their link, and Keenan's Accepted sheet
-- starts from that pick. Additive: new columns and functions; three
-- functions re-created with the same signatures.

alter table public.quotes
  add column meeting_offer text check (meeting_offer is null or char_length(meeting_offer) between 1 and 40),
  add column meeting_install_on date,
  add column accepted_offer text check (accepted_offer is null or char_length(accepted_offer) between 1 and 40),
  add column accepted_boxes smallint check (accepted_boxes is null or accepted_boxes between 0 and 9);

comment on column public.quotes.meeting_offer is 'The option chosen at the table (an offer id); prefills the Accepted sheet.';
comment on column public.quotes.meeting_install_on is 'The install day picked at the table; prefills the Accepted sheet. Never written to the lead before Accepted.';
comment on column public.quotes.accepted_offer is 'The option the Accepted sheet recorded (an offer id).';
comment on column public.quotes.accepted_boxes is 'The control box count of the accepted option.';

-- ---------------------------------------------------------------- offers

create or replace function public.quote_offers_clean(p_quote public.quotes)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with run_count as (
    select case when jsonb_typeof(p_quote.runs) = 'array' then jsonb_array_length(p_quote.runs) else 0 end as n
  ),
  given as (
    select o.value as offer, o.ordinality as at
      from jsonb_array_elements(case when jsonb_typeof(p_quote.offers) = 'array' then p_quote.offers else '[]'::jsonb end)
           with ordinality as o (value, ordinality)
     where jsonb_typeof(o.value) = 'object'
       and coalesce(btrim(o.value ->> 'id'), '') <> ''
  ),
  cleaned as (
    select g.at,
           jsonb_build_object(
             'id', left(btrim(g.offer ->> 'id'), 40),
             'name', left(coalesce(nullif(btrim(g.offer ->> 'name'), ''), 'Offer'), 60),
             'runs', coalesce((
               select jsonb_agg(distinct (p.value)::int order by (p.value)::int)
                 from jsonb_array_elements_text(case when jsonb_typeof(g.offer -> 'runs') = 'array' then g.offer -> 'runs' else '[]'::jsonb end) as p (value),
                      run_count
                where p.value ~ '^[0-9]+$' and (p.value)::int < run_count.n
             ), '[]'::jsonb),
             'boxes', case
               when coalesce(g.offer ->> 'boxes', '') ~ '^[1-9]$' then (g.offer ->> 'boxes')::int
               else null
             end
           ) as offer
      from given g
  )
  select case
    when (select count(*) from cleaned) > 0 then (select jsonb_agg(c.offer order by c.at) from cleaned c)
    when (select n from run_count) > 0 then jsonb_build_array(jsonb_build_object(
      'id', 'full',
      'name', 'Full wrap',
      'runs', (select jsonb_agg(i) from run_count, generate_series(0, run_count.n - 1) as i),
      'boxes', null))
    else '[]'::jsonb
  end;
$$;

revoke execute on function public.quote_offers_clean(public.quotes) from public, anon, authenticated;

-- ---------------------------------------------------------------- the base

create or replace function public.quote_commission_base_boxes(p_quote uuid, p_runs int[], p_boxes int)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  with q as (
    select x.price_per_ft, x.box_price,
           greatest(coalesce(p_boxes, x.box_count), 0) as box_count,
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
           + round(q.box_price * 100) * q.box_count
           - taken_off.cents
         ) / 100
    from q, feet, taken_off;
$$;

revoke execute on function public.quote_commission_base_boxes(uuid, int[], int) from public, anon, authenticated;

-- ---------------------------------------------------------------- accept an option

create or replace function public.quote_accept_offer(
  p_quote uuid,
  p_offer text,
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
  offer jsonb;
  run_count int;
  v_runs int[];
  v_boxes int;
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

  select o.value into offer
    from jsonb_array_elements(public.quote_offers_clean(q)) as o (value)
   where o.value ->> 'id' = p_offer
   limit 1;
  if offer is null then
    raise exception 'Pick an option that is on this quote' using errcode = 'P0001', hint = 'bad_offer';
  end if;
  select coalesce(array_agg((p.value)::int order by (p.value)::int), array[]::int[]) into v_runs
    from jsonb_array_elements_text(offer -> 'runs') as p (value);
  if cardinality(v_runs) = 0 then
    raise exception 'That option covers no runs yet' using errcode = 'P0001', hint = 'bad_runs';
  end if;
  run_count := case when jsonb_typeof(q.runs) = 'array' then jsonb_array_length(q.runs) else 0 end;
  -- Every run is the full quote.
  if cardinality(v_runs) = run_count then
    v_runs := null;
  end if;
  v_boxes := coalesce((offer ->> 'boxes')::int, q.box_count);

  v_before := case when l.status in ('sold', 'installed', 'lost') then 'met'::public.lead_status else l.status end;

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
         accepted_offer = offer ->> 'id',
         accepted_boxes = v_boxes,
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
  -- one is pending or paid. Worked out on this option's lights and boxes.
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
      update public.earnings set quote_id = null
       where quote_id = q.id and type = 'commission' and status = 'void';
      select s.commission_rate into v_rate from public.settings s where s.id = 1;
      v_base := coalesce(public.quote_commission_base_boxes(q.id, v_runs, v_boxes), 0);
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
  values (l.id, actor, 'quote_accepted', jsonb_build_object(
    'quote_id', q.id, 'install_on', p_install_on, 'option', left(offer ->> 'name', 60)));

  perform set_config('vesper.quote_outcome', 'off', true);
  return jsonb_build_object('commission', v_commission, 'reason', v_why);
end;
$$;

revoke execute on function public.quote_accept_offer(uuid, text, date) from public, anon;
grant execute on function public.quote_accept_offer(uuid, text, date) to authenticated, service_role;

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
         accepted_offer = null,
         accepted_boxes = null,
         lead_status_before = null
   where id = q.id;

  -- Back to where the lead was. Follow up needs its day, so it comes back
  -- due tomorrow, as a cancelled booking does. Meeting booked needs a
  -- meeting still booked; once it has happened the lead was met.
  v_back := coalesce(q.lead_status_before, 'met');
  if v_back in ('sold', 'installed', 'lost') then
    v_back := 'met';
  end if;
  if v_back = 'meeting_booked'
     and not exists (select 1 from public.meetings m
                      where m.lead_id = l.id and m.status in ('booked', 'confirmed')) then
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

-- ---------------------------------------------------------------- the customer's page

create or replace function public.quote_for_customer(p_token text)
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
  s public.settings;
  mockup text;
  fingerprint text;
  today date := (now() at time zone 'America/Edmonton')::date;
  install_page jsonb;
  deck_install jsonb;
  gallery jsonb;
  in_season boolean;
begin
  select * into s from public.settings st where st.id = 1;
  link := public.quote_link_live(p_token);
  if link.id is null then
    return jsonb_build_object(
      'state', 'closed',
      'company', jsonb_build_object(
        'name', s.company ->> 'name',
        'phone', s.company ->> 'phone',
        'email', s.company ->> 'email'
      )
    );
  end if;
  q := public.quote_link_current_quote(link.lead_id);
  select * into v_lead from public.leads l where l.id = link.lead_id;
  select p.storage_path into mockup
    from public.lead_photos p
   where p.lead_id = link.lead_id and p.slot = 'mockup'
   limit 1;
  fingerprint := md5(q.runs::text);

  select jsonb_build_object('title', page ->> 'title', 'body', page ->> 'body') into install_page
    from jsonb_array_elements(coalesce(s.presentation, '[]'::jsonb)) as page
   where page ->> 'kind' = 'install_day'
   limit 1;
  deck_install := s.deck -> 'pages' -> 'install_day';
  if jsonb_typeof(deck_install) = 'object' and coalesce(btrim(deck_install ->> 'words'), '') <> '' then
    deck_install := jsonb_build_object(
      'title', nullif(btrim(deck_install ->> 'title'), ''),
      'body', deck_install ->> 'words');
  else
    deck_install := null;
  end if;
  select coalesce(jsonb_agg(path), '[]'::jsonb) into gallery
    from jsonb_array_elements(coalesce(s.presentation, '[]'::jsonb)) as page,
         jsonb_array_elements_text(case when jsonb_typeof(page -> 'image_paths') = 'array' then page -> 'image_paths' else '[]'::jsonb end) as path
   where page ->> 'kind' = 'gallery' and coalesce(path, '') <> '';
  in_season := extract(month from today) between 9 and 11;

  return jsonb_build_object(
    'state', 'live',
    'first_name', v_lead.first_name,
    'last_name', v_lead.last_name,
    'address', v_lead.address_line,
    'city', v_lead.city,
    'valid_until', q.valid_until,
    'today', today,
    'quote', jsonb_build_object(
      'runs', q.runs,
      'runs_fingerprint', fingerprint,
      'offers', public.quote_offers_clean(q),
      'price_per_ft', q.price_per_ft,
      'box_price', q.box_price,
      'box_count', q.box_count,
      'adders', q.adders,
      'discounts', q.discounts,
      'colour_timing', q.colour_timing,
      'rush_fee', q.rush_fee,
      'upper_access_fee', q.upper_access_fee,
      'upper_gable_access_fee', q.upper_gable_access_fee,
      'min_job_total', q.min_job_total,
      'gst_enabled', q.gst_enabled,
      'gst_rate', q.gst_rate,
      'track_colour_name', q.track_colour_name,
      'track_custom', q.track_custom,
      'financing_offered', q.financing_offered,
      'meeting_offer', q.meeting_offer,
      'accepted', q.status = 'accepted',
      'accepted_offer', case when q.status = 'accepted' then q.accepted_offer end
    ),
    'warranty', s.warranty_text,
    'service_call_fee', s.service_call_fee,
    'christmas', case
      when s.christmas_banner_on and in_season
        then jsonb_build_object('title', s.christmas_banner_title, 'text', s.christmas_banner_text)
      else null
    end,
    'product_points', s.product_points,
    'install_day', install_page,
    'install_day_deck', deck_install,
    'next_steps', jsonb_build_object(
      'colour_confirmed', v_lead.track_colour_initialled_at is not null,
      'install_on', coalesce(v_lead.install_on, q.meeting_install_on),
      'what_we_need', nullif(btrim(coalesce(s.deck -> 'pages' -> 'next_steps' ->> 'more_text', s.deck -> 'pages' -> 'install_day' ->> 'more_text', '')), '')
    ),
    'gallery', gallery,
    'company', jsonb_build_object(
      'name', s.company ->> 'name',
      'phone', s.company ->> 'phone',
      'email', s.company ->> 'email',
      'address', s.company ->> 'address'
    ),
    'mockup_path', mockup,
    'selection', case when link.selection_runs = fingerprint then to_jsonb(link.selection) else null end,
    'selection_offer', case when link.selection_runs = fingerprint then link.selection_offer else null end,
    'booked_at', link.booked_at,
    'booked_option', link.booked_option,
    'booked_offer', link.booked_offer
  );
end;
$$;

grant execute on function public.quote_for_customer(text) to anon, authenticated, service_role;
