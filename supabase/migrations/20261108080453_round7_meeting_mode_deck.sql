-- Round 7, Branch B (Keenan, 2026-11-08): meeting mode, deeper. Additive and
-- approved up front. Nothing here is read by the meeting mode that is live
-- today: the new deck reads only these new columns and tables, so the live
-- presentation is unchanged until Keenan says "push the changes".
--
-- 1. settings.deck: every customer word on the new pages (headline, words,
--    the More button's label and its words), seeded from the five-seat
--    debate (docs/decisions.md, 2026-11-08). Edited in Settings.
-- 2. settings.light_looks: the light picker's looks (name, colour words,
--    light colours, lights per block, on or off), in order.
-- 3. deck_photos: Keenan's own photos for the deck's named slots, in the
--    private presentation bucket. Owner only.
-- 4. presentation_references: one or two researched example shots per
--    slot, stored only as links (never downloaded or re-hosted), shown only
--    in Settings and the rehearsal view. Owner only.
-- 5. roofline_traces: the roofline Keenan traces on a lead's photo in prep,
--    with its scale and dusk numbers, for the light picker. Owner only.

alter table public.settings
  add column deck jsonb not null default '{}'::jsonb,
  add column light_looks jsonb not null default '[]'::jsonb;
comment on column public.settings.deck is
  'Round 7: the deck''s customer words per page (headline, words, more_label, more_text) and warranty_lines_up_front. Read by meeting mode from round 7; settings.presentation stays for the deck that was live before it.';
comment on column public.settings.light_looks is
  'Round 7: the light picker''s looks, in order: key, name (14 characters at most), words (18 at most), colours (1 to 4 of hex and name), block (lights per colour), active. At most 6 active.';

-- ---------------------------------------------------------------- Keenan's photos for the deck

create table public.deck_photos (
  id uuid primary key default gen_random_uuid(),
  slot text not null check (slot ~ '^[a-z_]+\.[a-z_]+$'),
  path text not null,
  thumb_path text,
  focus_x real not null default 0.5 check (focus_x between 0 and 1),
  focus_y real not null default 0.5 check (focus_y between 0 and 1),
  caption text check (caption is null or char_length(caption) <= 40),
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id)
);
comment on table public.deck_photos is
  'Round 7: Keenan''s own photos for the deck''s named slots (lib/deck.ts), in the presentation bucket, with a 640 px thumbnail, a focus point every crop uses, and a caption for the gallery (the look only). Owner only.';
create index deck_photos_slot_idx on public.deck_photos (slot, sort);
alter table public.deck_photos enable row level security;
create policy "owner manages deck photos" on public.deck_photos
  for all to authenticated using (public.is_owner()) with check (public.is_owner());
revoke all on table public.deck_photos from anon;


-- ---------------------------------------------------------------- researched example shots, as links only

create table public.presentation_references (
  id uuid primary key default gen_random_uuid(),
  slot text not null check (slot ~ '^[a-z_]+\.[a-z_]+$'),
  rank integer not null default 1,
  image_url text,
  page_url text not null,
  site text not null,
  why text not null,
  shot text not null,
  created_at timestamptz not null default now(),
  unique (slot, rank)
);
comment on table public.presentation_references is
  'Round 7: researched example shots per deck slot, stored only as links and loaded from where they live with no referrer. Shown only in Settings and the rehearsal view, never in a meeting, its payload or the offline cache. Owner only.';
alter table public.presentation_references enable row level security;
create policy "owner manages presentation references" on public.presentation_references
  for all to authenticated using (public.is_owner()) with check (public.is_owner());
revoke all on table public.presentation_references from anon;

-- ---------------------------------------------------------------- the roofline, traced in prep

create table public.roofline_traces (
  lead_id uuid primary key references public.leads (id),
  photo_id uuid not null,
  photo_slot public.photo_slot,
  lines jsonb not null,
  line_feet jsonb not null default '[]'::jsonb,
  scale jsonb not null,
  dusk_brightness real not null check (dusk_brightness > 0 and dusk_brightness <= 1),
  luminance real check (luminance is null or luminance between 0 and 1),
  light_count integer not null check (light_count between 1 and 1500),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);
comment on table public.roofline_traces is
  'Round 7: the roofline Keenan traced on one of the lead''s photos (photo_id, a lead_photos row, and the slot it had then): lines of points from 0 to 1 on that photo, feet per line when measured, the scale from the garage door, and the dusk brightness measured from the photo. If that photo is gone or has left its slot, the trace no longer counts. Owner only.';
alter table public.roofline_traces enable row level security;
create policy "owner manages roofline traces" on public.roofline_traces
  for all to authenticated using (public.is_owner()) with check (public.is_owner());
revoke all on table public.roofline_traces from anon;
