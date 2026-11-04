-- A new lead saves once (Keenan, 2026-11-04). The phone makes a save key
-- once per new lead, the first time the booking sheet or New lead saves that
-- person, keeps it in the draft and sends it with every try. Only one lead
-- can have a key, so a try after a lost answer finds the lead the first try
-- made instead of making a copy, even when two tries arrive at once.
-- Additive: existing leads, and leads saved by other paths, have no key.
-- No policy change: the key goes in with the insert setters already make.
alter table public.leads add column save_key uuid;

comment on column public.leads.save_key is
  'Made on the phone once per new lead and sent with every try of its first save, so a retry finds this lead instead of making a copy (2026-11-04).';

create unique index leads_save_key on public.leads (save_key) where save_key is not null;
