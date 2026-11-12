-- Quote link take 3, part 1 (Keenan, 2026-11-11): track types.
-- Three track types: Hat track (the standard, priced at the quote's price a
-- foot), Double track and J track, each with its own price a foot in
-- Settings, Pricing. Empty means not set yet: the quote editor greys that
-- track out until it has a price.
-- An area (a run in quotes.runs) on Double or J track carries "track" and
-- "trackRate", the track's price a foot copied from Settings when Keenan
-- picks it, so the quote keeps the price it used. Keenan's own rate or a
-- flat price on the area still wins. The commission counts the area as
-- lights at what it is priced at, so quote_lights_cents reads the track's
-- price after the area's own rate and before the quote's price a foot.
-- Additive: two nullable columns and one function re-created with the same
-- signature; a run without a track prices exactly as before.

alter table public.settings
  add column double_track_per_ft numeric(10,2) check (double_track_per_ft is null or double_track_per_ft > 0),
  add column j_track_per_ft numeric(10,2) check (j_track_per_ft is null or j_track_per_ft > 0);

comment on column public.settings.double_track_per_ft is 'Double track price a foot; null until Keenan sets it.';
comment on column public.settings.j_track_per_ft is 'J track price a foot; null until Keenan sets it.';

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
                     when r.value ->> 'track' in ('double', 'j')
                      and jsonb_typeof(r.value -> 'trackRate') = 'number' and (r.value ->> 'trackRate')::numeric > 0
                       then (r.value ->> 'trackRate')::numeric
                     else q.price_per_ft
                   end * 100)
           end), 0)
    from q, jsonb_array_elements(q.runs) with ordinality as r (value, pos)
   where p_runs is null or (r.pos - 1)::int = any (p_runs);
$$;
revoke execute on function public.quote_lights_cents(uuid, int[]) from public, anon, authenticated;
