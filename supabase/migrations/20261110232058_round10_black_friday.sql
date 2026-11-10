-- Round 10 (Keenan, 2026-11-10): Black Friday pricing. Keenan sets the deal
-- in Settings, a percent or a dollar amount off; until he does, meeting mode
-- shows no Black Friday button. When a customer says yes with it on, the
-- quote saves it as a discount line, so the link, the acceptance and
-- commission all read the same quote. Owner only, like every price in
-- settings (setters read settings_public, which leaves these out).
alter table public.settings
  add column black_friday_kind text check (black_friday_kind in ('percent', 'amount')),
  add column black_friday_value numeric(10, 2) check (black_friday_value > 0 and black_friday_value <= 100000),
  add constraint settings_black_friday_percent check (black_friday_kind is distinct from 'percent' or black_friday_value <= 90);
