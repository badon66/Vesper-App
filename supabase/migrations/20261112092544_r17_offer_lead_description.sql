-- Round 17 parts 3 and 4 (Keenan, 2026-11-12): two more things an offer
-- keeps in quotes.offers. lead: Keenan's "Lead with this one" star, listed
-- first and the one the customer's link opens on (unless they booked one);
-- at most one per quote, and never on a hidden offer or the customer's own
-- build. description: a few sentences under the offer's name on the link
-- and inside the breakdown in the meeting, one paragraph, up to 400
-- characters. Everything else is cleaned exactly as before, so the link,
-- Build your own and the Accepted sheet keep reading the same offers.

create or replace function public.quote_offers_clean(p_quote public.quotes)
 returns jsonb
 language sql
 stable
 set search_path to ''
as $function$
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
  first_lead as (
    select min(g.at) as at
      from given g
     where g.offer -> 'lead' = 'true'::jsonb
       and g.offer -> 'hidden' is distinct from 'true'::jsonb
       and g.offer -> 'from_customer' is distinct from 'true'::jsonb
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
           end || case
             when g.at = (select fl.at from first_lead fl) then jsonb_build_object('lead', true)
             else '{}'::jsonb
           end || case
             when jsonb_typeof(g.offer -> 'description') = 'string'
              and btrim(regexp_replace(g.offer ->> 'description', '\s+', ' ', 'g')) <> ''
             then jsonb_build_object('description', left(btrim(regexp_replace(g.offer ->> 'description', '\s+', ' ', 'g')), 400))
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
$function$;
