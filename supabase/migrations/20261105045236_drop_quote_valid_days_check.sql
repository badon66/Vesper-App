-- Drop the old quote_valid_days check (Keenan approved, 2026-11-05).
--
-- What: removes settings_quote_valid_days_check (quote_valid_days between 1
-- and 90).
-- Why: since 2026-11-04 the app holds a quote's prices for price_hold_days
-- (1 to 365, default 120); quote_valid_days is no longer read, and its
-- 1-to-90 limit was why the 120-day hold needed a new column. The column
-- itself stays, unused, per the additive rule.

alter table public.settings drop constraint settings_quote_valid_days_check;
