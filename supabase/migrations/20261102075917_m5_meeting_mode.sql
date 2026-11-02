-- M5 take 1: Meeting mode (Keenan, 2026-11-02).
--
-- What: the mockup photo slot and the colour_confirmed event; the rush
-- colour fee, service call fee, quote valid days and FAQ in settings; the
-- exact warranty wording, the company contact and the six presentation
-- pages seeded; the quotes table (owner-only, drafts in take 1); the
-- customer's colour initials on leads, under the owner-only guard; and a
-- private presentation bucket for Keenan's photos.
-- Why: Keenan presents, prices live and confirms the track colour with
-- initials at every meeting, on the iPad, starting 2026-11-03. All
-- additive: new enum values, new columns, new table, new bucket, and
-- seed updates; nothing is dropped or removed.

-- ---------------------------------------------------------------- enums

alter type public.photo_slot add value if not exists 'mockup';
alter type public.event_type add value if not exists 'colour_confirmed';

-- ---------------------------------------------------------------- settings

alter table public.settings
  add column rush_colour_fee_per_ft numeric(10,2)
    check (rush_colour_fee_per_ft is null or rush_colour_fee_per_ft >= 0),
  add column service_call_fee numeric(10,2)
    check (service_call_fee is null or service_call_fee >= 0),
  add column quote_valid_days int not null default 14
    check (quote_valid_days between 1 and 90),
  add column faq_text text not null default '';

comment on column public.settings.rush_colour_fee_per_ft is
  'Per foot, for a non-stock track colour installed this season. Null = not set: the line is hidden everywhere.';
comment on column public.settings.service_call_fee is
  'Warranty years 6 to 10. Null = not set: no amount shows anywhere.';

-- The exact warranty wording Keenan gave, the company contact for the
-- folder, the FAQ draft, and the presentation reshaped to the six meeting
-- mode pages (each with a kind the iPad renders by). The old M1 seed pages
-- are replaced: price, payment and neighbours live on the quote screen now.
update public.settings set
  warranty_text = $w$10 years parts: lights, track and hardware, control box.
5 years labour: we come out and fix covered issues at no charge.
Years 6 to 10: parts still free, with a flat service call fee.
5 years workmanship, including any holes we drilled.
Transfers with the home once for the remaining term if the new owner tells us within 90 days.
No registration needed. The certificate number is issued at install.
We respond within 2 business days. Work at height waits for safe weather.
In addition to your rights under Alberta law.$w$,
  company = $c${"name": "Vesper Lighting, Inc.", "phone": "(403) 895-9915", "email": "info@vesperlighting.ca", "address": "448 Strathcona Drive SW, Calgary, AB T3H 1M3"}$c$::jsonb,
  faq_text = $f$What does it cost to run?
LED lighting uses very little power. The exact cost depends on your electricity rate, the length of the run and how long the lights are on; for most homes it is small. We can walk through an estimate for your house.

What about snow and ice?
The track mounts under the soffit, tucked up out of the weather, and there are no bulbs to change.

Does it need Wi-Fi?
The lights are controlled from the app on your phone, over your home Wi-Fi. We set the app up with you on install day.

What if we move?
The warranty transfers with the home once for the remaining term, if the new owner tells us within 90 days.

What about HOAs?
The track is colour matched to your soffit and hard to spot by day. If your community has guidelines, we are happy to answer questions.$f$,
  presentation = $p$[
    {"kind": "what_vesper_is", "title": "Permanent roofline lighting", "body": "A slim aluminum track, colour matched to your soffit, with the lights built in. Installed once and there year round, controlled from your phone.\n\nA permanent fixture and an investment in your home, not Christmas lights.", "image_paths": []},
    {"kind": "hidden_by_day", "title": "Hidden by day", "body": "The track tucks under the soffit and matches its colour. By day you see your house. By night you choose the light.", "image_paths": []},
    {"kind": "whites_first", "title": "Warm white, every night", "body": "Most nights it is a warm white glow along the roofline, from a dedicated white LED.\n\nFor the nights that matter, pick any colour from the couch: Christmas, Halloween, game day, a birthday.", "image_paths": []},
    {"kind": "install_day", "title": "How install day works", "body": "We confirm the plan and the colours with you.\nA small crew fits the track under the soffit and ties it into a compact control box on a standard outlet.\nWe clean up, walk the house with you and set up the app on your phone.", "image_paths": []},
    {"kind": "warranty", "title": "Our warranty", "body": "", "image_paths": []},
    {"kind": "gallery", "title": "Our installs", "body": "", "image_paths": []}
  ]$p$::jsonb
where id = 1;

-- ---------------------------------------------------------------- quotes

create type public.quote_status as enum ('draft', 'presented', 'accepted', 'declined', 'expired');

-- One quote, with every price it used copied onto it, so later Settings
-- changes never alter it. Take 1 writes drafts only; the totals are stored
-- for history and always recomputed by lib/pricing.ts for display.
create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id),
  created_by uuid not null references public.profiles (id),
  status public.quote_status not null default 'draft',
  price_per_ft numeric(10,2) not null check (price_per_ft >= 0),
  box_price numeric(10,2) not null check (box_price >= 0),
  box_count int not null default 1 check (box_count between 0 and 20),
  runs jsonb not null default '[]',                -- [{name, feet, level}]
  total_feet int not null default 0 check (total_feet >= 0),
  adders jsonb not null default '[]',              -- [{label, amount}]
  discounts jsonb not null default '[]',           -- [{label, amount}]
  colour_timing text check (colour_timing is null or colour_timing in ('stock', 'factory_order', 'rush')),
  rush_fee_per_ft numeric(10,2) check (rush_fee_per_ft is null or rush_fee_per_ft >= 0),
  gst_enabled boolean not null default false,
  gst_rate numeric(5,4) not null check (gst_rate >= 0 and gst_rate < 1),
  gst_number text,
  subtotal numeric(10,2) not null default 0,
  gst numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  financing_offered boolean not null default false,
  track_colour_name text,
  track_ral_code text,
  track_custom boolean not null default false,
  notes text,
  pdf_path text,
  valid_until date,
  presented_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.quotes is
  'Dollar amounts live here and in earnings only. Owner-only in RLS: sales users can never read a quote.';

create index quotes_lead on public.quotes (lead_id);

create trigger quotes_set_updated_at
  before update on public.quotes
  for each row execute function public.set_updated_at();

alter table public.quotes enable row level security;
revoke all on public.quotes from anon;

create policy "owner manages quotes"
  on public.quotes for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- ---------------------------------------------------------------- leads

alter table public.leads
  add column track_colour_initials text
    check (track_colour_initials is null or char_length(track_colour_initials) between 1 and 12),
  add column track_colour_initialled_at timestamptz;

comment on column public.leads.track_colour_initials is
  'The customer''s initials confirming the track colour, recorded by the owner at the meeting (M5). Confirmed again at every meeting.';

create or replace function public.leads_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  is_admin boolean := public.is_owner();
  setter_statuses public.lead_status[] := array['new', 'follow_up', 'lost']::public.lead_status[];
begin
  if tg_op = 'INSERT' then
    if me is not null then
      new.created_by := me;
      if not is_admin then
        new.assigned_to := me;
        if not (new.status = any (setter_statuses)) then
          raise exception 'Setters can only add a lead as New, Follow up or Lost'
            using errcode = '42501';
        end if;
      end if;
    end if;
    new.assigned_to := coalesce(new.assigned_to, new.created_by);
  else
    if me is not null and not is_admin then
      if new.created_by is distinct from old.created_by
         or new.assigned_to is distinct from old.assigned_to then
        raise exception 'Only the admin can reassign a lead' using errcode = '42501';
      end if;
      if new.status is distinct from old.status
         and not (old.status = any (setter_statuses) and new.status = any (setter_statuses))
         and not (
           new.status = 'meeting_booked'
           and old.status in ('new', 'follow_up')
           and exists (
             select 1 from public.meetings m
             where m.lead_id = new.id and m.status = 'booked' and m.starts_at > now()
           )
         )
         and not (
           old.status = 'meeting_booked'
           and new.status = 'follow_up'
           and not exists (
             select 1 from public.meetings m
             where m.lead_id = new.id and m.status in ('booked', 'confirmed')
           )
         ) then
        raise exception 'Setters can only move a lead between New, Follow up and Lost'
          using errcode = '42501';
      end if;
    end if;
    new.created_at := old.created_at;
  end if;

  if new.knock_session_id is not null
     and (tg_op = 'INSERT' or new.knock_session_id is distinct from old.knock_session_id)
     and not exists (
       select 1 from public.knock_sessions s
       where s.id = new.knock_session_id and s.user_id = new.created_by
     ) then
    raise exception 'A lead can only link to a knock session of the person who added it'
      using errcode = '42501';
  end if;

  -- The track colour is the owner's call. A colour retired from the list
  -- stays on leads that have it but cannot be newly chosen.
  if me is not null and not is_admin
     and (
       (tg_op = 'INSERT' and (new.track_colour_id is not null or new.track_ral_code is not null))
       or (tg_op = 'UPDATE' and (new.track_colour_id is distinct from old.track_colour_id
                                 or new.track_ral_code is distinct from old.track_ral_code))
     ) then
    raise exception 'Only the admin sets the track colour' using errcode = '42501';
  end if;
  if new.track_colour_id is not null
     and (tg_op = 'INSERT' or new.track_colour_id is distinct from old.track_colour_id)
     and not exists (
       select 1 from public.track_colours c where c.id = new.track_colour_id and c.active
     ) then
    raise exception 'That track colour has been retired' using errcode = '22023';
  end if;

  -- The customer's initials confirming the colour are the owner's to record,
  -- at the meeting (M5).
  if me is not null and not is_admin
     and (
       (tg_op = 'INSERT' and (new.track_colour_initials is not null
                              or new.track_colour_initialled_at is not null))
       or (tg_op = 'UPDATE' and (new.track_colour_initials is distinct from old.track_colour_initials
                                 or new.track_colour_initialled_at is distinct from old.track_colour_initialled_at))
     ) then
    raise exception 'Only the admin records the colour initials' using errcode = '42501';
  end if;

  -- The map position's source follows the position.
  if new.lat is null or new.lng is null then
    new.position_source := null;
    new.position_accuracy_m := null;
  elsif new.position_source is null then
    new.position_source := 'picked';
  end if;
  if new.position_source is distinct from 'device' then
    new.position_accuracy_m := null;
  end if;

  if new.status <> 'follow_up' then
    new.follow_up_on := null;
  elsif me is not null
     and (tg_op = 'INSERT' or new.follow_up_on is distinct from old.follow_up_on)
     and new.follow_up_on < (now() at time zone 'America/Edmonton')::date then
    raise exception 'A follow-up date cannot be before today' using errcode = '22023';
  end if;

  if tg_op = 'INSERT' or new.status is distinct from old.status then
    if new.status = 'lost' then
      new.lost_at := now();
    else
      new.lost_at := null;
      new.lost_reason := null;
    end if;
    if new.status in ('sold', 'installed') then
      new.sold_at := coalesce(new.sold_at, now());
    else
      new.sold_at := null;
    end if;
    if new.status = 'installed' then
      new.installed_at := coalesce(new.installed_at, now());
    else
      new.installed_at := null;
    end if;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------- storage

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('presentation', 'presentation', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Meeting mode is the owner's surface, so his photos are too.
create policy "owner reads presentation files"
  on storage.objects for select to authenticated
  using (bucket_id = 'presentation' and public.is_owner());
create policy "owner uploads presentation files"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'presentation' and public.is_owner());
create policy "owner removes presentation files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'presentation' and public.is_owner());