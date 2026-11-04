-- Prices, and Todd Dean's quote (Keenan, 2026-11-04), changed right away.
-- The settings that already exist: price per foot $24 (a quote already made
-- keeps its own price), a $2,500 minimum job and a $200 service call fee
-- for warranty years 6 to 10.
-- Prices are held 120 days instead of 14. quote_valid_days has a database
-- rule allowing 1 to 90 days, and lifting it would mean dropping that rule,
-- so the hold gets its own setting, price_hold_days (1 to 365, 120 now),
-- which the quote link rework reads. Until that is live, meeting mode still
-- reads quote_valid_days, so it goes to 90, the most its rule allows.
alter table public.settings
  add column price_hold_days int not null default 120
    check (price_hold_days between 1 and 365);

comment on column public.settings.price_hold_days is
  'How many days a new quote''s prices are held (Keenan, 2026-11-04: 120). Replaces quote_valid_days, which is capped at 90.';

update public.settings
set price_per_ft = 24,
    min_job_total = 2500,
    quote_valid_days = 90,
    service_call_fee = 200,
    price_hold_days = 120
where id = 1;

-- Todd Dean's quote: the typo in his discount ("Discound"), his price held
-- 120 days from the day the quote was made (Calgary's date, UTC-6), and the
-- $2,500 minimum. Found by the typo, so a fresh project changes nothing.
update public.quotes q
set discounts = (
      select jsonb_agg(
        case when d ->> 'label' = 'Family & Friends Discound'
             then jsonb_set(d, '{label}', to_jsonb('Family & Friends Discount'::text))
             else d end
        order by ordinality)
      from jsonb_array_elements(q.discounts) with ordinality as e(d, ordinality)
    ),
    valid_until = ((q.created_at - interval '6 hours') at time zone 'UTC')::date + 120,
    min_job_total = 2500
where q.discounts @> '[{"label": "Family & Friends Discound"}]';
