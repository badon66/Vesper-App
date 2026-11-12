-- Quote link take 3, part 2 (Keenan, 2026-11-11): Build your own.
-- On the link, after Keenan's offers, the customer can build their own
-- option: it starts from the offer they are looking at and they tick the
-- areas Keenan measured on or off. Book my install on it saves it to the
-- quote as one offer, "Custom quote (from the customer)", under the id
-- "customer" with "from_customer": true, so a newer one replaces their last
-- one and never one of Keenan's. Keenan sees it with his other offers and
-- accepts it like any other.
--   - quote_offers_clean keeps the flag (true only), so nothing changes for
--     a quote without one. quote_offers_shown keeps it too, so the page can
--     tell the customer's own from Keenan's.
--   - quote_link_book_custom(token, runs, from): the only way the customer
--     writes an offer. It takes positions, never a price: only areas that
--     are measured (feet over 0) and in one of the offers Keenan shows can
--     be picked, anything else is refused; never on an accepted quote. The
--     box count comes from the offer they started from, upper access is
--     the automatic amount. Then it books it the same way as
--     quote_link_book_offer, and Keenan is told again when the areas
--     changed since their last one.
-- Additive: one function re-created with the same signature, one new
-- function for anonymous callers holding a live token.

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
           end || case
             when g.offer -> 'from_customer' = 'true'::jsonb then jsonb_build_object('from_customer', true)
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

create or replace function public.quote_link_book_custom(p_token text, p_runs int[], p_from text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  link public.quote_links;
  q public.quotes;
  shown jsonb;
  run_count int;
  allowed int[];
  chosen int[];
  from_offer jsonb;
  last_runs jsonb;
  base jsonb;
  v_offers jsonb;
begin
  link := public.quote_link_live(p_token);
  if link.id is null then
    return jsonb_build_object('ok', false, 'state', 'expired');
  end if;
  q := public.quote_link_current_quote(link.lead_id);
  if q.id is null then
    return jsonb_build_object('ok', false, 'state', 'expired');
  end if;
  if q.status = 'accepted' then
    return jsonb_build_object('ok', false, 'state', 'accepted');
  end if;
  run_count := case when jsonb_typeof(q.runs) = 'array' then jsonb_array_length(q.runs) else 0 end;
  shown := public.quote_offers_shown(q);

  -- The areas they may pick: in one of the offers Keenan shows, and measured.
  select coalesce(array_agg(distinct (r.value)::int order by (r.value)::int), array[]::int[]) into allowed
    from jsonb_array_elements(shown) as o (value)
         cross join lateral jsonb_array_elements_text(o.value -> 'runs') as r (value)
   where o.value -> 'from_customer' is distinct from 'true'::jsonb
     and (r.value)::int < run_count
     and jsonb_typeof(q.runs -> (r.value)::int -> 'feet') = 'number'
     and round((q.runs -> (r.value)::int ->> 'feet')::numeric) > 0;

  if exists (select 1 from unnest(coalesce(p_runs, array[]::int[])) as p where p is null or not (p = any (allowed))) then
    return jsonb_build_object('ok', false, 'state', 'bad_runs');
  end if;
  select coalesce(array_agg(distinct p order by p), array[]::int[]) into chosen
    from unnest(coalesce(p_runs, array[]::int[])) as p;
  if cardinality(chosen) = 0 then
    return jsonb_build_object('ok', false, 'state', 'no_runs');
  end if;

  select o.value into from_offer
    from jsonb_array_elements(shown) as o (value)
   where o.value ->> 'id' = p_from
     and o.value -> 'from_customer' is distinct from 'true'::jsonb
   limit 1;

  -- Their last one, to tell Keenan again only when the areas changed.
  select o.value -> 'runs' into last_runs
    from jsonb_array_elements(public.quote_offers_clean(q)) as o (value)
   where o.value -> 'from_customer' = 'true'::jsonb
   limit 1;

  -- An empty list stands for one full wrap: keep it as a real offer.
  base := case
    when jsonb_typeof(q.offers) = 'array' and jsonb_array_length(q.offers) > 0 then q.offers
    else public.quote_offers_clean(q)
  end;
  select coalesce(jsonb_agg(o.value order by o.ordinality), '[]'::jsonb) into v_offers
    from jsonb_array_elements(base) with ordinality as o (value, ordinality)
   where coalesce(o.value ->> 'id', '') <> 'customer'
     and o.value -> 'from_customer' is distinct from 'true'::jsonb;
  v_offers := v_offers || jsonb_build_array(jsonb_build_object(
    'id', 'customer',
    'name', 'Custom quote (from the customer)',
    'runs', to_jsonb(chosen),
    'boxes', from_offer -> 'boxes',
    'upper_access', null,
    'from_customer', true));

  update public.quotes set offers = v_offers where id = q.id;

  if last_runs is distinct from to_jsonb(chosen) then
    update public.quote_links set notified_option = null where id = link.id;
  end if;

  return public.quote_link_book_offer(p_token, 'customer');
end;
$$;

revoke execute on function public.quote_link_book_custom(text, int[], text) from public;
grant execute on function public.quote_link_book_custom(text, int[], text) to anon, authenticated, service_role;
