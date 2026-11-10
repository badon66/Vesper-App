-- The quote link rework's prices (Keenan, 2026-11-04). Additive.
-- Settings: the rush colour fee becomes a flat amount a job ($350) instead
-- of a fee per foot (the old column stays, unused), and upper access is
-- added automatically: $200 when a quote has upper runs but no upper gable,
-- $400 when an upper gable is in it, nothing without an upper run.
alter table public.settings
  add column rush_colour_fee numeric(10,2) check (rush_colour_fee is null or rush_colour_fee >= 0),
  add column upper_access_fee numeric(10,2) check (upper_access_fee is null or upper_access_fee >= 0),
  add column upper_gable_access_fee numeric(10,2) check (upper_gable_access_fee is null or upper_gable_access_fee >= 0);

comment on column public.settings.rush_colour_fee is
  'Flat rush colour fee a job, for a non-stock colour installed this season (2026-11-04; replaces rush_colour_fee_per_ft). Null hides the line.';
comment on column public.settings.upper_access_fee is
  'Upper access when a quote has upper runs but no upper gable (2026-11-04). Copied onto each new quote.';
comment on column public.settings.upper_gable_access_fee is
  'Upper access when an upper gable is on (2026-11-04). Copied onto each new quote.';

update public.settings
set rush_colour_fee = 350, upper_access_fee = 200, upper_gable_access_fee = 400
where id = 1;

-- Quotes: each keeps its own flat rush colour fee and upper access amounts,
-- copied from Settings and changed in the quote builder if Keenan wants.
-- Quotes already made have none, so they get neither line.
alter table public.quotes
  add column rush_fee numeric(10,2) check (rush_fee is null or rush_fee >= 0),
  add column upper_access_fee numeric(10,2) check (upper_access_fee is null or upper_access_fee >= 0),
  add column upper_gable_access_fee numeric(10,2) check (upper_gable_access_fee is null or upper_gable_access_fee >= 0);

comment on column public.quotes.rush_fee is
  'This quote''s flat rush colour fee (2026-11-04), counted only when colour_timing is rush. Null: no line.';
comment on column public.quotes.upper_access_fee is
  'This quote''s upper access amount with upper runs but no upper gable (2026-11-04). Null: no line.';
comment on column public.quotes.upper_gable_access_fee is
  'This quote''s upper access amount when an upper gable is on (2026-11-04). Null: no line.';
