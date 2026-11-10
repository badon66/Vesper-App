-- The Christmas banner's season (Keenan, 2026-11-05).
--
-- What: quote_for_customer hands the page the Christmas banner from
-- September 1 to November 30 (Calgary), no longer to December 24. The rest
-- of the function is unchanged.
-- Why: Vesper's install season ends mid-December and custom colours take one
-- to two weeks, so a banner after November would promise something Vesper
-- can't deliver. Replaces the function with the same signature and grants.

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

  select page into install_page
    from jsonb_array_elements(coalesce(s.presentation, '[]'::jsonb)) as page
   where page ->> 'kind' = 'install_day'
   limit 1;
  select coalesce(jsonb_agg(path), '[]'::jsonb) into gallery
    from jsonb_array_elements(coalesce(s.presentation, '[]'::jsonb)) as page,
         jsonb_array_elements_text(case when jsonb_typeof(page -> 'image_paths') = 'array' then page -> 'image_paths' else '[]'::jsonb end) as path
   where page ->> 'kind' = 'gallery' and coalesce(path, '') <> '';
  -- The Christmas banner runs September 1 to November 30 (Keenan,
  -- 2026-11-05): the season ends mid-December and custom colours take one to
  -- two weeks, so a later banner would promise what Vesper can't deliver.
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
    'install_day', case
      when install_page is null then null
      else jsonb_build_object('title', install_page ->> 'title', 'body', install_page ->> 'body')
    end,
    'gallery', gallery,
    'company', jsonb_build_object(
      'name', s.company ->> 'name',
      'phone', s.company ->> 'phone',
      'email', s.company ->> 'email',
      'address', s.company ->> 'address'
    ),
    'mockup_path', mockup,
    'selection', case when link.selection_runs = fingerprint then to_jsonb(link.selection) else null end,
    'booked_at', link.booked_at,
    'booked_option', link.booked_option
  );
end;
$$;

grant execute on function public.quote_for_customer(text) to anon, authenticated, service_role;
