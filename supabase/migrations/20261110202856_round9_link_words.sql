-- Round 9, the customer's quote link: one colour rule (Keenan, 2026-11-10;
-- settled by the five seats).
--
-- What: the track point under What you're getting on the customer's link,
-- "A slim aluminum track, colour matched to your soffit, so it blends into
-- your roofline by day.", now reads "A slim aluminum track tucked under your
-- roof edge, so it's hard to spot by day." It changes only where the point
-- still reads exactly as seeded on 2026-11-04, wherever it sits in the list,
-- so a point Keenan has rewritten in Settings stays his. Its icon and the
-- other points are untouched.
-- Why: white is the only stock track colour and every other colour is made
-- to order, the same rule as the iPad's colour page, so the link no longer
-- promises a track matched to the soffit. One plain update.

update public.settings
   set product_points = (
         select jsonb_agg(
                  case
                    when p.value ->> 'text' = 'A slim aluminum track, colour matched to your soffit, so it blends into your roofline by day.'
                      then jsonb_set(p.value, '{text}', to_jsonb('A slim aluminum track tucked under your roof edge, so it''s hard to spot by day.'::text))
                    else p.value
                  end
                  order by p.at)
           from jsonb_array_elements(product_points) with ordinality as p (value, at)
       )
 where id = 1
   and jsonb_typeof(product_points) = 'array'
   and product_points @> '[{"text": "A slim aluminum track, colour matched to your soffit, so it blends into your roofline by day."}]'::jsonb;
