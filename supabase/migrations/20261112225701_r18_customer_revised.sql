-- Round 18 part 6 (Keenan, 2026-11-12): the customer's link learns when
-- Keenan changed their quote after they said yes, and what changed, for
-- "Updated by Keenan on [date]" at the top of the price. Everything else is
-- as round 17 left it.

create or replace function public.quote_for_customer(p_token text)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
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
  christmas jsonb;
  visit public.lead_site_visits;
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
  select * into visit from public.lead_site_visits sv where sv.lead_id = link.lead_id;
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

  -- Round 17: the banner by Keenan's dates, until the season ends.
  christmas := null;
  if s.christmas_banner_on and s.christmas_book_by_white is not null and s.christmas_season_end is not null
     and today <= s.christmas_season_end then
    christmas := jsonb_build_object(
      'book_by_white', s.christmas_book_by_white,
      'book_by_colour', coalesce(s.christmas_book_by_colour, s.christmas_book_by_white),
      'season_end', s.christmas_season_end,
      'words', jsonb_build_object(
        'book_by', s.christmas_banner_book_by,
        'white', s.christmas_banner_white,
        'colour', s.christmas_banner_colour,
        'no_colour', s.christmas_banner_no_colour,
        'after', s.christmas_banner_after));
  end if;
  -- The page from before round 17 reads a heading and words, in its window.
  if s.christmas_banner_on and in_season then
    christmas := coalesce(christmas, '{}'::jsonb)
      || jsonb_build_object('title', s.christmas_banner_title, 'text', s.christmas_banner_text);
  end if;

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
    'christmas', christmas,
    'product_points', s.product_points,
    'install_day', install_page,
    'install_day_deck', deck_install,
    'lines', case when jsonb_typeof(s.deck -> 'lines') = 'object' then s.deck -> 'lines' else null end,
    'next_steps', jsonb_build_object(
      'colour_confirmed', v_lead.track_colour_initialled_at is not null,
      'install_on', coalesce(v_lead.install_on, q.meeting_install_on),
      'what_we_need', nullif(btrim(coalesce(s.deck -> 'pages' -> 'next_steps' ->> 'more_text', s.deck -> 'pages' -> 'install_day' ->> 'more_text', '')), '')
    ),
    -- Round 17: where they're at, for the tracker: the site visit Keenan
    -- marks on the lead, and whether the job is installed.
    'progress', jsonb_build_object(
      'site_visit_on', visit.visit_on,
      'site_visit_done', visit.done_at is not null,
      'installed', v_lead.status = 'installed'
    ),
    -- Round 18: on an accepted quote Keenan changed after the yes, when he
    -- last changed it and everything that changed since the yes, in the
    -- customer's own words (lib/quotes/revise.ts), for "Updated by Keenan
    -- on [date]" at the top of the price. Never the totals' history or who.
    'revised', case
      when q.status = 'accepted' and exists (
        select 1 from public.quote_revisions r
         where r.quote_id = q.id and r.revised_at >= coalesce(q.accepted_at, '-infinity'::timestamptz))
      then jsonb_build_object(
        'at', (select max(r.revised_at) from public.quote_revisions r
                where r.quote_id = q.id and r.revised_at >= coalesce(q.accepted_at, '-infinity'::timestamptz)),
        'changes', (select coalesce(jsonb_agg(c.value order by r.revised_at, c.ordinality), '[]'::jsonb)
                      from public.quote_revisions r
                      cross join lateral jsonb_array_elements(r.changes) with ordinality as c (value, ordinality)
                     where r.quote_id = q.id and r.revised_at >= coalesce(q.accepted_at, '-infinity'::timestamptz)
                       and jsonb_typeof(c.value) = 'string'))
    end,
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
$function$;
