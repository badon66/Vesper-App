-- Round 18 part 5 (Keenan, 2026-11-12): the rush fee moves onto each offer.
-- A quote that charged one fee for the whole quote (this season, with an
-- amount) carries it onto every offer it has, so no total moves; a quote
-- with no offers yet (one full wrap) gets that full wrap as a real offer
-- holding the fee. The quote's own rush_fee is left as it is. Plain
-- updates only, on quotes whose offers hold no fee of their own yet.

update public.quotes q
   set offers = (
     select coalesce(jsonb_agg(
              case when jsonb_typeof(o.value) = 'object' then o.value || jsonb_build_object('rush_fee', q.rush_fee) else o.value end
              order by o.ordinality), '[]'::jsonb)
       from jsonb_array_elements(q.offers) with ordinality as o (value, ordinality))
 where q.colour_timing = 'rush'
   and q.rush_fee > 0
   and q.status <> 'accepted'
   and jsonb_typeof(q.offers) = 'array'
   and jsonb_array_length(q.offers) > 0
   and not exists (select 1 from jsonb_array_elements(q.offers) as o (value) where o.value ? 'rush_fee');

update public.quotes q
   set offers = jsonb_build_array(jsonb_build_object(
         'id', 'full',
         'name', 'Full wrap',
         'runs', (select coalesce(jsonb_agg(i order by i), '[]'::jsonb) from generate_series(0, jsonb_array_length(q.runs) - 1) as i),
         'boxes', null,
         'upper_access', null,
         'rush_fee', q.rush_fee))
 where q.colour_timing = 'rush'
   and q.rush_fee > 0
   and q.status <> 'accepted'
   and (jsonb_typeof(q.offers) is distinct from 'array' or jsonb_array_length(q.offers) = 0)
   and jsonb_typeof(q.runs) = 'array'
   and jsonb_array_length(q.runs) > 0;
