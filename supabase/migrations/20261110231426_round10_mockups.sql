-- Round 10 (Keenan, 2026-11-10): mockups per house. Keenan uploads as many
-- mockups of a customer's house as he likes, names each one ("Christmas",
-- "Warm white") and marks what each is for: Main (lights on), Day, Night, a
-- scene for the phone page, or the picture for particular offers. One image
-- can do more than one job. Mockups stay Keenan's alone, like the mockup
-- slot before them: owner only, never a setter, never View as.
--
-- The lead's existing mockup (lead_photos slot 'mockup') is carried over as
-- its Main. The old row stays where it is; nothing reads it for the deck now.

create table public.lead_mockups (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id),
  storage_path text not null unique check (
    storage_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
  ),
  name text not null default '' check (length(name) <= 40),
  is_main boolean not null default false,
  is_day boolean not null default false,
  is_night boolean not null default false,
  is_scene boolean not null default false,
  -- The offers (quotes.offers ids) this picture shows.
  offer_ids text[] not null default '{}' check (cardinality(offer_ids) <= 8),
  position integer not null default 0,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  -- Taken off the lead page: kept, never shown (rows are never removed).
  removed_at timestamptz
);
create index lead_mockups_lead on public.lead_mockups (lead_id, position, created_at) where removed_at is null;
-- One Main, one Day and one Night per house.
create unique index lead_mockups_one_main on public.lead_mockups (lead_id) where is_main and removed_at is null;
create unique index lead_mockups_one_day on public.lead_mockups (lead_id) where is_day and removed_at is null;
create unique index lead_mockups_one_night on public.lead_mockups (lead_id) where is_night and removed_at is null;

alter table public.lead_mockups enable row level security;

create policy "owner reads mockups" on public.lead_mockups
  for select to authenticated using (public.is_owner());
create policy "owner adds mockups" on public.lead_mockups
  for insert to authenticated with check (public.is_owner());
create policy "owner changes mockups" on public.lead_mockups
  for update to authenticated using (public.is_owner()) with check (public.is_owner());

revoke all on public.lead_mockups from anon;
grant select, insert, update on public.lead_mockups to authenticated;

-- Carry each lead's mockup over as its Main.
insert into public.lead_mockups (lead_id, storage_path, name, is_main, created_by, created_at)
select p.lead_id, p.storage_path, 'Main', true, p.created_by, p.created_at
  from public.lead_photos p
 where p.slot = 'mockup'
   and not exists (select 1 from public.lead_mockups m where m.lead_id = p.lead_id and m.is_main and m.removed_at is null)
on conflict (storage_path) do nothing;

-- The customer's link: the pictures it may show, the Main and the ones
-- marked for offers, by a live token only. Scenes, Day and Night stay in
-- the meeting. Paths only; the page signs each one through storage.
create or replace function public.quote_link_mockups(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  link public.quote_links;
begin
  link := public.quote_link_live(p_token);
  if link.id is null then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(
             jsonb_build_object('path', m.storage_path, 'main', m.is_main, 'offers', to_jsonb(m.offer_ids))
             order by m.is_main desc, m.position, m.created_at)
      from public.lead_mockups m
     where m.lead_id = link.lead_id
       and m.removed_at is null
       and (m.is_main or cardinality(m.offer_ids) > 0)
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.quote_link_mockups(text) from public;
grant execute on function public.quote_link_mockups(text) to anon, authenticated;

-- Storage signs a mockup for a live token: the old mockup slot, or a
-- mockup the link may show (the Main or one marked for an offer).
create or replace function public.quote_mockup_signable(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_token text;
  link public.quote_links;
begin
  begin
    v_token := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-quote-token';
  exception when others then
    return false;
  end;
  link := public.quote_link_live(v_token);
  if link.id is null then
    return false;
  end if;
  return exists (
    select 1
      from public.lead_photos p
     where p.lead_id = link.lead_id
       and p.slot = 'mockup'
       and p.storage_path = p_name
  ) or exists (
    select 1
      from public.lead_mockups m
     where m.lead_id = link.lead_id
       and m.storage_path = p_name
       and m.removed_at is null
       and (m.is_main or cardinality(m.offer_ids) > 0)
  );
end;
$$;
