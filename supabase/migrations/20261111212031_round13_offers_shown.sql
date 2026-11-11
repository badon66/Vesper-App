-- Round 13 (Keenan, 2026-11-11): Keenan chooses which offers the customer
-- sees. Every offer in quotes.offers can carry "hidden": true (his "Show to
-- customer" switch, off). A hidden offer stays on the quote for him and is
-- left out of everything the customer's link reads or does:
--   - quote_offers_clean keeps the flag (true only), so nothing else changes
--     for a quote without one;
--   - quote_offers_shown is the cleaned list without the hidden ones, and
--     without the flag;
--   - quote_for_customer sends only the shown offers, and the table's
--     choice, the last option looked at and the booked option only while
--     they are shown;
--   - quote_link_select_offer and quote_link_book_offer refuse a hidden one
--     the same way they refuse an offer that isn't on the quote;
--   - quote_accept_offer refuses a hidden one (hint hidden_offer): an
--     accepted offer can't be hidden, and an accepted quote is locked, so
--     it can't be hidden afterwards either;
--   - a check on quotes.offers: never every offer hidden, so the customer
--     always has at least one to look at.
-- Additive: functions re-created with the same signatures, one new
-- function, one new check that every existing row passes (none has the
-- flag). The link's mockup functions follow in the next migration.

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
             end,
             'upper_access', case
               when jsonb_typeof(g.offer -> 'upper_access') = 'number'
                and (g.offer ->> 'upper_access')::numeric >= 0
                and (g.offer ->> 'upper_access')::numeric <= 100000
               then round((g.offer ->> 'upper_access')::numeric, 2)
               else null
             end
           ) || case
             when g.offer -> 'hidden' = 'true'::jsonb then jsonb_build_object('hidden', true)
             else '{}'::jsonb
           end as offer
      from given g
  )
  select case
    when (select count(*) from cleaned) > 0 then (select jsonb_agg(c.offer order by c.at) from cleaned c)
    when (select n from run_count) > 0 then jsonb_build_array(jsonb_build_object(
      'id', 'full',
      'name', 'Full wrap',
      'runs', (select jsonb_agg(i) from run_count, generate_series(0, run_count.n - 1) as i),
      'boxes', null,
      'upper_access', null))
    else '[]'::jsonb
  end;
$$;

create or replace function public.quote_offers_shown(p_quote public.quotes)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(o.value - 'hidden' order by o.ordinality), '[]'::jsonb)
    from jsonb_array_elements(public.quote_offers_clean(p_quote)) with ordinality as o (value, ordinality)
   where o.value -> 'hidden' is distinct from 'true'::jsonb;
$$;
revoke execute on function public.quote_offers_shown(public.quotes) from public, anon, authenticated;

-- At least one offer is always shown: true unless every offer is hidden.
create or replace function public.quote_offers_one_shown(p_offers jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_offers is null then true
    when jsonb_typeof(p_offers) <> 'array' then true
    when jsonb_array_length(p_offers) = 0 then true
    else exists (
      select 1
        from jsonb_array_elements(p_offers) as o (value)
       where o.value -> 'hidden' is distinct from 'true'::jsonb)
  end;
$$;
revoke execute on function public.quote_offers_one_shown(jsonb) from public, anon;
grant execute on function public.quote_offers_one_shown(jsonb) to authenticated, service_role;

alter table public.quotes
  add constraint quotes_offers_one_shown check (public.quote_offers_one_shown(offers));

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
  shown jsonb;
  shown_ids text[];
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
  -- Round 13: only the offers Keenan shows. A hidden one is left out of
  -- everything below: the list, the table's choice, what they last looked
  -- at and what they booked.
  shown := public.quote_offers_shown(q);
  select coalesce(array_agg(o.value ->> 'id'), array[]::text[]) into shown_ids from jsonb_array_elements(shown) as o (value);

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
      'offers', shown,
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
      'meeting_offer', case when q.meeting_offer = any (shown_ids) then q.meeting_offer end,
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
    'lines', case when jsonb_typeof(s.deck -> 'lines') = 'object' then s.deck -> 'lines' else null end,
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
    'selection', case
      when link.selection_runs = fingerprint and (link.selection_offer is null or link.selection_offer = any (shown_ids))
        then to_jsonb(link.selection)
      else null
    end,
    'selection_offer', case
      when link.selection_runs = fingerprint and link.selection_offer = any (shown_ids) then link.selection_offer
      else null
    end,
    'booked_at', case when link.booked_offer is null or link.booked_offer = any (shown_ids) then link.booked_at end,
    'booked_option', case when link.booked_offer is null or link.booked_offer = any (shown_ids) then link.booked_option end,
    'booked_offer', case when link.booked_offer = any (shown_ids) then link.booked_offer end
  );
end;
$$;

create or replace function public.quote_link_select_offer(p_token text, p_offer text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  link public.quote_links;
  q public.quotes;
  offer jsonb;
  chosen int[];
  run_count int;
begin
  link := public.quote_link_live(p_token);
  if link.id is null then
    return false;
  end if;
  q := public.quote_link_current_quote(link.lead_id);
  select o.value into offer from jsonb_array_elements(public.quote_offers_shown(q)) as o (value) where o.value ->> 'id' = p_offer limit 1;
  if offer is null then
    return false;
  end if;
  select coalesce(array_agg((p.value)::int order by (p.value)::int), array[]::int[]) into chosen
    from jsonb_array_elements_text(offer -> 'runs') as p (value);
  if cardinality(chosen) = 0 then
    return false;
  end if;
  run_count := coalesce(jsonb_array_length(q.runs), 0);
  update public.quote_links
     set selection = case when cardinality(chosen) = run_count then null else chosen end,
         selection_offer = offer ->> 'id',
         selection_runs = md5(q.runs::text),
         selection_at = now()
   where id = link.id;
  return true;
end;
$$;

create or replace function public.quote_link_book_offer(p_token text, p_offer text)
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
  offer jsonb;
  chosen int[];
  run_count int;
  v_names text[];
  v_option text;
  v_notify boolean;
  v_targets jsonb := '[]'::jsonb;
begin
  link := public.quote_link_live(p_token);
  if link.id is null then
    return jsonb_build_object('ok', false, 'state', 'expired');
  end if;
  q := public.quote_link_current_quote(link.lead_id);
  select o.value into offer from jsonb_array_elements(public.quote_offers_shown(q)) as o (value) where o.value ->> 'id' = p_offer limit 1;
  if offer is null then
    return jsonb_build_object('ok', false, 'state', 'no_offer');
  end if;
  select coalesce(array_agg((p.value)::int order by (p.value)::int), array[]::int[]) into chosen
    from jsonb_array_elements_text(offer -> 'runs') as p (value);
  if cardinality(chosen) = 0 then
    return jsonb_build_object('ok', false, 'state', 'no_runs');
  end if;
  run_count := coalesce(jsonb_array_length(q.runs), 0);

  select array_agg(public.quote_link_run_name(q.runs -> p, p) order by p) into v_names from unnest(chosen) as p;
  v_option := offer ->> 'name';
  v_notify := link.notified_option is distinct from v_option;

  update public.quote_links
     set booked_at = now(),
         booked_option = left(v_option, 400),
         booked_offer = offer ->> 'id',
         booked_selection = chosen,
         selection = case when cardinality(chosen) = run_count then null else chosen end,
         selection_offer = offer ->> 'id',
         selection_runs = md5(q.runs::text),
         selection_at = now(),
         notified_option = case when v_notify then v_option else notified_option end
   where id = link.id;

  if v_notify then
    insert into public.lead_events (lead_id, actor_id, type, payload)
    values (link.lead_id, null, 'install_requested', jsonb_build_object('option', v_option, 'runs', to_jsonb(v_names)));
    select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'sealed', p.sealed)), '[]'::jsonb)
      into v_targets
      from public.push_subscriptions p
     where p.profile_id = link.created_by
       and p.removed_at is null;
  end if;

  select * into v_lead from public.leads l where l.id = link.lead_id;
  return jsonb_build_object(
    'ok', true,
    'option', v_option,
    'name', btrim(v_lead.first_name || ' ' || coalesce(v_lead.last_name, '')),
    'lead_id', link.lead_id,
    'notify', v_notify,
    'targets', v_targets
  );
end;
$$;

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
  -- Round 13: an accepted offer is never a hidden one. Keenan shows it
  -- first; once accepted the quote is locked, so it can't be hidden after.
  if offer -> 'hidden' = 'true'::jsonb then
    raise exception 'That option is hidden from the customer. Show it first' using errcode = 'P0001', hint = 'hidden_offer';
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
