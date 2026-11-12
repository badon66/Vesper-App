-- Round 17 part 6 (Keenan, 2026-11-12): the site visit, step 3 of "Where
-- you're at" on the customer's link. After they choose, Keenan comes by to
-- measure up close, take photos for the install and check the track colour
-- against the soffit; then they pick an install day. He marks it on the
-- lead's Outcome card: a date, and Done. One row per lead, owner only, like
-- the rest of the quote; the customer's link reads it through
-- quote_for_customer. Rows are never taken out: the date can be cleared and
-- Done undone.

create table if not exists public.lead_site_visits (
  lead_id uuid primary key references public.leads (id),
  visit_on date,
  done_at timestamptz,
  updated_by uuid references public.profiles (id) default auth.uid(),
  updated_at timestamptz not null default now()
);

alter table public.lead_site_visits enable row level security;

create policy "owner reads site visits"
  on public.lead_site_visits for select
  to authenticated
  using (public.is_owner());

create policy "owner adds site visits"
  on public.lead_site_visits for insert
  to authenticated
  with check (public.is_owner());

create policy "owner changes site visits"
  on public.lead_site_visits for update
  to authenticated
  using (public.is_owner())
  with check (public.is_owner());

revoke all on public.lead_site_visits from anon;
revoke all on public.lead_site_visits from authenticated;
grant select, insert, update on public.lead_site_visits to authenticated;
