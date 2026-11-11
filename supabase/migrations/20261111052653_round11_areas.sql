-- Round 11 (Keenan, 2026-11-11): quoting by area. Each run in quotes.runs
-- is an area of the house and may carry its own price a foot (rate) or a
-- flat price (flat); each offer may carry an upper access amount Keenan
-- typed over (upper_access, 0 included). The commission is 5% of the
-- lights and boxes after discounts, the lights being whatever each area
-- is priced at, by the foot or flat; upper access stays out, automatic or
-- typed. A quote from before this round has none of these keys and prices
-- exactly as before. Functions are replaced in place; nothing is removed.

-- The offers cleaned, now keeping the typed upper access amount.
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
           ) as offer
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

-- The lights of the runs counted, in cents: a flat-priced run its flat
-- price, any other its feet at its own rate or the quote's price a foot.
-- The TypeScript mirror is lib/pricing.ts runLightsCents.
create or replace function public.quote_lights_cents(p_quote uuid, p_runs int[])
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  with q as (
    select x.price_per_ft,
           case when jsonb_typeof(x.runs) = 'array' then x.runs else '[]'::jsonb end as runs
      from public.quotes x
     where x.id = p_quote
  )
  select coalesce(sum(
           case
             when jsonb_typeof(r.value -> 'flat') = 'number' and (r.value ->> 'flat')::numeric >= 0
               then round((r.value ->> 'flat')::numeric * 100)
             else
               least(10000, greatest(0, round(case when jsonb_typeof(r.value -> 'feet') = 'number' then (r.value ->> 'feet')::numeric else 0 end)))
               * round(
                   case
                     when jsonb_typeof(r.value -> 'rate') = 'number' and (r.value ->> 'rate')::numeric > 0 then (r.value ->> 'rate')::numeric
                     else q.price_per_ft
                   end * 100)
           end), 0)
    from q, jsonb_array_elements(q.runs) with ordinality as r (value, pos)
   where p_runs is null or (r.pos - 1)::int = any (p_runs);
$$;
revoke execute on function public.quote_lights_cents(uuid, int[]) from public, anon, authenticated;

-- The commission base for an option with its own box count (round 9), the
-- lights now counted per area.
create or replace function public.quote_commission_base_boxes(p_quote uuid, p_runs int[], p_boxes int)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  with q as (
    select x.box_price,
           greatest(coalesce(p_boxes, x.box_count), 0) as box_count,
           case when jsonb_typeof(x.discounts) = 'array' then x.discounts else '[]'::jsonb end as discounts
      from public.quotes x
     where x.id = p_quote
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
           public.quote_lights_cents(p_quote, p_runs)
           + round(q.box_price * 100) * q.box_count
           - taken_off.cents
         ) / 100
    from q, taken_off;
$$;

-- Round 8's base (the full quote's own boxes), the same way.
create or replace function public.quote_commission_base(p_quote uuid, p_runs int[])
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select public.quote_commission_base_boxes(p_quote, p_runs, null);
$$;
