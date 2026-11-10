-- Round 9, the meeting as one story: offers (Keenan, 2026-11-10).
--
-- What:
--   - quotes.offers: the offers on a quote. The house's measured runs stay
--     once on the quote (quotes.runs); each offer is {id, name, runs}, where
--     runs are positions into quotes.runs. An empty list reads as one offer
--     covering every run (the full wrap), so quotes made before today keep
--     working;
--   - quote_links.selection_offer and booked_offer: the offer the customer
--     is looking at on their link, and the one they booked with Book my
--     install;
--   - quote_for_customer: hands the page the offers (id, name and runs only)
--     and the offer they last looked at or booked, and the meeting's own
--     install day words (settings.deck) beside the old presentation page's,
--     which stay as they were for the page live today;
--   - quote_link_select_offer and quote_link_book_offer: the customer's taps
--     on an offer, through their token only, changing nothing else. Book
--     records the offer's name (never a price) on the timeline, as Book my
--     install always has.
-- Why: Keenan walks the offers down from the full wrap in the meeting, and
-- the customer sees the same offers on their link. Additive: new columns
-- and functions; quote_for_customer re-created with the same signature.

alter table public.quotes
  add column offers jsonb not null default '[]'::jsonb
    check (jsonb_typeof(offers) = 'array');

comment on column public.quotes.offers is
  'The offers on this quote, biggest first on screen: [{id, name, runs}], runs = positions into quotes.runs. Empty = one offer, every run.';

alter table public.quote_links
  add column selection_offer text check (selection_offer is null or char_length(selection_offer) between 1 and 40),
  add column booked_offer text check (booked_offer is null or char_length(booked_offer) between 1 and 40);

comment on column public.quote_links.selection_offer is 'The offer id the customer last looked at on their link.';
comment on column public.quote_links.booked_offer is 'The offer id the customer booked with Book my install.';

-- The offers a quote shows, cleaned: objects with an id and a name, runs
-- kept to positions on the quote, sorted, without repeats. Empty offers
-- give one offer covering every run.
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
             ), '[]'::jsonb)
           ) as offer
      from given g
  )
  select case
    when (select count(*) from cleaned) > 0 then (select jsonb_agg(c.offer order by c.at) from cleaned c)
    when (select n from run_count) > 0 then jsonb_build_array(jsonb_build_object(
      'id', 'full',
      'name', 'Full wrap',
      'runs', (select jsonb_agg(i) from run_count, generate_series(0, run_count.n - 1) as i)))
    else '[]'::jsonb
  end;
$$;

revoke execute on function public.quote_offers_clean(public.quotes) from public, anon, authenticated;

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

  -- How install day works: the old presentation page, as before, and the
  -- meeting's own words (settings.deck) beside it for the page that reads
  -- them, so one set of words serves the meeting and the link.
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
  -- The Christmas banner runs September 1 to November 30 (Keenan,
  -- 2026-11-05).
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
      'track_custom', q.track_custom
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

-- ---------------------------------------------------------------- the customer's taps

-- The offer they are looking at, so the page opens on it next time and
-- Keenan can see it. Nothing else changes.
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
  select o.value into offer from jsonb_array_elements(public.quote_offers_clean(q)) as o (value) where o.value ->> 'id' = p_offer limit 1;
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

-- Book my install on an offer: saves the offer's name (never a price) and
-- its runs, puts it on the timeline once per offer, and returns the link
-- maker's sealed push addresses for the server to open and send. It never
-- accepts the quote and never creates an earning.
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
  select o.value into offer from jsonb_array_elements(public.quote_offers_clean(q)) as o (value) where o.value ->> 'id' = p_offer limit 1;
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

revoke execute on function public.quote_link_select_offer(text, text) from public;
revoke execute on function public.quote_link_book_offer(text, text) from public;
grant execute on function public.quote_link_select_offer(text, text) to anon, authenticated, service_role;
grant execute on function public.quote_link_book_offer(text, text) to anon, authenticated, service_role;
