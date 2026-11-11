-- Round 13 (Keenan, 2026-11-11): "See it on your house" on the customer's
-- link, and the link's pictures following the Show to customer switch.
--   - quote_link_mockups now also returns the lead's phone scenes, each
--     with its name (the Looks row: Christmas, Halloween, Warm white), and
--     says which is a scene. A picture's name is sent only for a scene:
--     scene names are already what the customer reads on the phone page in
--     the meeting; other pictures' names stay Keenan's own.
--   - an offer's picture is listed only while that offer is shown to the
--     customer, and each picture's list of offers carries shown ones only,
--     so a hidden offer's picture never reaches the page.
--   - quote_mockup_signable (storage's rule for a live token) follows the
--     same list: the Main, a scene, or a picture for a shown offer. Until
--     now a scene was never signed for a link; Keenan asked for them here.
-- A Day or Night picture, a removed one and another house's stay out, as
-- before. Additive: both functions re-created with the same signatures.

create or replace function public.quote_link_mockups(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  link public.quote_links;
  q public.quotes;
  shown_ids text[];
begin
  link := public.quote_link_live(p_token);
  if link.id is null then
    return '[]'::jsonb;
  end if;
  q := public.quote_link_current_quote(link.lead_id);
  select coalesce(array_agg(o.value ->> 'id'), array[]::text[]) into shown_ids
    from jsonb_array_elements(public.quote_offers_shown(q)) as o (value);
  return coalesce((
    select jsonb_agg(
             jsonb_build_object(
               'path', m.storage_path,
               'main', m.is_main,
               'scene', m.is_scene,
               'name', case when m.is_scene then m.name else '' end,
               'offers', to_jsonb(array(select x from unnest(m.offer_ids) as x where x = any (shown_ids))))
             order by m.is_main desc, m.position, m.created_at)
      from public.lead_mockups m
     where m.lead_id = link.lead_id
       and m.removed_at is null
       and (m.is_main or m.is_scene or m.offer_ids && shown_ids)
  ), '[]'::jsonb);
end;
$$;

create or replace function public.quote_mockup_signable(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_token text;
  link public.quote_links;
  q public.quotes;
  shown_ids text[];
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
  if exists (
    select 1
      from public.lead_photos p
     where p.lead_id = link.lead_id
       and p.slot = 'mockup'
       and p.storage_path = p_name
  ) then
    return true;
  end if;
  q := public.quote_link_current_quote(link.lead_id);
  select coalesce(array_agg(o.value ->> 'id'), array[]::text[]) into shown_ids
    from jsonb_array_elements(public.quote_offers_shown(q)) as o (value);
  return exists (
    select 1
      from public.lead_mockups m
     where m.lead_id = link.lead_id
       and m.storage_path = p_name
       and m.removed_at is null
       and (m.is_main or m.is_scene or m.offer_ids && shown_ids)
  );
end;
$$;
