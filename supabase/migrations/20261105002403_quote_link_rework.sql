-- The quote link rework (Keenan, 2026-11-04).
--
-- What:
--   - settings: the Christmas banner (on by default, a heading and a line,
--     both editable) and the six product points (a line and a line icon
--     each, editable), seeded with Keenan's words;
--   - quote_link_live: a link no longer closes after its quote's
--     valid_until date. Prices are held, links don't expire: a link stays
--     live until Keenan turns it off;
--   - quote_for_customer: a turned-off or unknown link answers 'closed'
--     (was 'expired'). A live one adds the quote's flat rush colour fee and
--     upper access amounts (each run's part travels inside runs), the
--     track colour's name, Calgary's date today (so the page knows whether
--     the price hold has passed without trusting the phone's clock), the
--     service call fee, the Christmas banner while it is on and in season
--     (September 1 to December 24, Calgary), the product points, the
--     install day page and the gallery's photo paths from the presentation;
--     the old fee per foot is no longer returned;
--   - quote_gallery_signable and a storage policy: a request carrying a
--     live token (x-quote-token) may sign the presentation gallery's
--     photos, Vesper's own install photos, and nothing else in that bucket.
-- Why: the rework's page (decisions.md, 2026-11-04). Additive: new columns,
-- replaced functions with the same signatures and grants, one new policy.

alter table public.settings
  add column christmas_banner_on boolean not null default true,
  add column christmas_banner_title text not null default 'Want them up for Christmas?'
    check (char_length(christmas_banner_title) between 1 and 80),
  add column christmas_banner_text text not null
    default 'We install every day the weather allows. Book now to get on the schedule.'
    check (char_length(christmas_banner_text) <= 300),
  add column product_points jsonb not null default '[
    {"icon": "lightbulb", "text": "RGBW lights with a dedicated white, so warm white looks right and any colour is a tap away."},
    {"icon": "house", "text": "A slim aluminum track, colour matched to your soffit, so it blends into your roofline by day."},
    {"icon": "zap", "text": "A 24V system: fewer power points along the roofline, fewer things to go wrong."},
    {"icon": "smartphone", "text": "Control it all from your phone."},
    {"icon": "plug", "text": "Plugs into a standard outlet, indoors or out. No hardwiring."},
    {"icon": "shield-check", "text": "A 10-year warranty, installed by our own crew."}
  ]'::jsonb
    check (jsonb_typeof(product_points) = 'array' and jsonb_array_length(product_points) <= 8);

-- A live link: not turned off, with a quote to show. Null for anything else.
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
  q := public.quote_link_current_quote(link.lead_id);
  if q.id is null then
    return null;
  end if;
  return link;
end;
$$;

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
  -- The Christmas banner hides itself after December 24, until the next
  -- season starts on September 1.
  in_season := extract(month from today) >= 9 and not (extract(month from today) = 12 and extract(day from today) > 24);

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

-- True when this request carries a live token (x-quote-token header) and
-- the object is one of the presentation gallery's photos. Storage asks
-- this for anonymous requests; anything else, including a list, gets
-- nothing.
create or replace function public.quote_gallery_signable(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_token text;
  link public.quote_links;
begin
  begin
    v_token := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-quote-token';
  exception when others then
    return false;
  end;
  link := public.quote_link_live(v_token);
  if link.id is null then
    return false;
  end if;
  return exists (
    select 1
      from public.settings s,
           jsonb_array_elements(coalesce(s.presentation, '[]'::jsonb)) as page,
           jsonb_array_elements_text(case when jsonb_typeof(page -> 'image_paths') = 'array' then page -> 'image_paths' else '[]'::jsonb end) as path
     where s.id = 1
       and page ->> 'kind' = 'gallery'
       and path = p_name
  );
end;
$$;

create policy "a live quote link signs the gallery photos"
  on storage.objects for select to anon
  using (bucket_id = 'presentation' and public.quote_gallery_signable(name));
