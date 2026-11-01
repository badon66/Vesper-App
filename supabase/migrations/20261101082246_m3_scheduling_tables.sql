-- M3: scheduling, slot holds and booking pay (Keenan, 2026-11-01).
-- Tables, columns and row security. The booking functions that write them
-- follow in the next migration. No double booking is a hard rule: nobody
-- may write slot_holds, meetings or earnings directly, so every write goes
-- through those functions, under one lock per host and Calgary evening.
-- Additive only.

-- ---------------------------------------------------------------- types

create type public.meeting_status as enum
  ('booked', 'confirmed', 'qualified', 'not_qualified', 'no_show', 'cancelled', 'moved');
create type public.earning_type as enum ('booking', 'commission');
create type public.earning_status as enum ('pending', 'paid', 'void');
create type public.map_position_source as enum ('picked', 'device');

-- ---------------------------------------------------------------- profiles

-- Who may run meetings besides the default host (Keenan). Not tied to the
-- owner role, so a setter who moves up to closing can host later.
alter table public.profiles
  add column hosts_meetings boolean not null default false;

-- ---------------------------------------------------------------- settings

alter table public.settings
  add column not_qualified_reasons text[] not null
    default array['Not the homeowner', 'Decision maker missing', 'Didn''t want a price', 'Roofline we can''t do', 'Other'],
  add column booking_cutoff_minutes int not null default 30
    check (booking_cutoff_minutes between 0 and 240),
  add column hold_grace_minutes int not null default 2
    check (hold_grace_minutes between 1 and 30),
  add column booking_window_days int not null default 14
    check (booking_window_days between 1 and 60),
  add column meeting_host_id uuid references public.profiles (id),
  add constraint settings_not_qualified_reasons_present check (cardinality(not_qualified_reasons) >= 1);

-- Same view, with the booking cutoff, hold grace period and booking window
-- added at the end. Still a row only for an active profile, still no money.
create or replace view public.settings_public with (security_invoker = false) as
  select meeting_days, meeting_start, meeting_slot_minutes, meeting_slot_count,
         distance_warning_km, lost_reasons, door_guide,
         booking_cutoff_minutes, hold_grace_minutes, booking_window_days
  from public.settings
  where id = 1
    and exists (select 1 from public.profiles me where me.id = auth.uid() and me.active);

-- ---------------------------------------------------------------- leads

-- Where a lead's map position came from: picked from the address
-- suggestions, or the phone's own GPS at the door for a brand-new street
-- Google doesn't have yet. The rules arrive with the guard, next migration.
alter table public.leads
  add column position_source public.map_position_source,
  add column position_accuracy_m numeric(6,1)
    check (position_accuracy_m is null or position_accuracy_m between 0 and 50);

update public.leads set position_source = 'picked'
 where lat is not null and position_source is null;

-- ---------------------------------------------------------------- time_blocks

create table public.time_blocks (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles (id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text check (reason is null or length(reason) between 1 and 200),
  created_by uuid not null references public.profiles (id),
  removed_at timestamptz,
  removed_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint time_blocks_ends_after_start check (ends_at > starts_at),
  constraint time_blocks_removal_stamped check ((removed_at is null) = (removed_by is null))
);
comment on table public.time_blocks is
  'Times the owner blocks from booking. Removing one stamps removed_at; rows stay.';

create index time_blocks_active on public.time_blocks (host_id, starts_at) where removed_at is null;

alter table public.time_blocks enable row level security;
revoke all on public.time_blocks from anon;
create policy "sales side reads time blocks"
  on public.time_blocks for select to authenticated
  using (public.is_sales_side());

-- ---------------------------------------------------------------- meetings

create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id),
  host_id uuid not null references public.profiles (id),
  setter_id uuid not null references public.profiles (id),
  booked_by uuid not null references public.profiles (id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.meeting_status not null default 'booked',
  everyone_deciding_present boolean not null,
  photos_skipped text,
  photos_skip_note text,
  outcome_reason text,
  outcome_note text,
  outcome_at timestamptz,
  outcome_by uuid references public.profiles (id),
  rebooked_as uuid references public.meetings (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meetings_ends_after_start check (ends_at > starts_at),
  constraint meetings_everyone_deciding_present check (everyone_deciding_present),
  constraint meetings_photos_skipped_reason check (photos_skipped in ('homeowner_said_no', 'other')),
  constraint meetings_photos_skip_note_for_other check (photos_skipped is distinct from 'other' or photos_skip_note is not null),
  constraint meetings_photos_skip_note_length check (photos_skip_note is null or length(photos_skip_note) between 1 and 300),
  constraint meetings_reason_for_not_qualified check (status <> 'not_qualified' or outcome_reason is not null),
  constraint meetings_outcome_reason_length check (outcome_reason is null or length(outcome_reason) between 1 and 200),
  constraint meetings_outcome_note_length check (outcome_note is null or length(outcome_note) between 1 and 500)
);
comment on table public.meetings is
  'Booked meetings. Written only through the booking functions; sales read every row, so no price ever goes in.';

-- The last line against double booking: one meeting per host and time.
create unique index meetings_one_per_time on public.meetings (host_id, starts_at)
  where status in ('booked', 'confirmed', 'qualified', 'not_qualified');
-- One live booking per lead.
create unique index meetings_one_live_per_lead on public.meetings (lead_id)
  where status in ('booked', 'confirmed');
create index meetings_host_time on public.meetings (host_id, starts_at);
create index meetings_lead on public.meetings (lead_id);
create index meetings_setter_time on public.meetings (setter_id, starts_at);

create trigger meetings_set_updated_at
  before update on public.meetings
  for each row execute function public.set_updated_at();

alter table public.meetings enable row level security;
revoke all on public.meetings from anon;
create policy "sales side reads meetings"
  on public.meetings for select to authenticated
  using (public.is_sales_side());

-- ---------------------------------------------------------------- slot_holds

-- A time someone has started booking. A hold that ends is stamped with
-- released_at and a reason; rows stay. The partial unique indexes make
-- one hold per time and one hold per person hard limits.
create table public.slot_holds (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles (id),
  starts_at timestamptz not null,
  holder_id uuid not null references public.profiles (id),
  lead_id uuid references public.leads (id),
  meeting_id uuid references public.meetings (id),
  renewed_at timestamptz not null default now(),
  released_at timestamptz,
  release_reason text,
  created_at timestamptz not null default now(),
  constraint slot_holds_release_reason check (release_reason in ('booked', 'moved', 'released', 'switched', 'lapsed')),
  constraint slot_holds_release_stamped check ((released_at is null) = (release_reason is null))
);
comment on table public.slot_holds is
  'Times being booked right now. Written only through the booking functions, under the evening lock.';

create unique index slot_holds_one_per_time on public.slot_holds (host_id, starts_at)
  where released_at is null;
create unique index slot_holds_one_per_person on public.slot_holds (holder_id)
  where released_at is null;
create index slot_holds_host_time on public.slot_holds (host_id, starts_at);

alter table public.slot_holds enable row level security;
revoke all on public.slot_holds from anon;
create policy "sales side reads holds"
  on public.slot_holds for select to authenticated
  using (public.is_sales_side());

-- ---------------------------------------------------------------- earnings

create table public.earnings (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id),
  lead_id uuid not null references public.leads (id),
  meeting_id uuid references public.meetings (id),
  quote_id uuid,
  type public.earning_type not null,
  rate numeric(10,4) not null check (rate >= 0),
  base_amount numeric(10,2) check (base_amount is null or base_amount >= 0),
  amount numeric(10,2) not null check (amount >= 0),
  status public.earning_status not null default 'pending',
  payable_at timestamptz,
  paid_at timestamptz,
  paid_by uuid references public.profiles (id),
  note text check (note is null or length(note) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint earnings_booking_has_meeting check (type <> 'booking' or meeting_id is not null),
  constraint earnings_paid_stamped check ((status = 'paid') = (paid_at is not null)),
  constraint earnings_paid_was_payable check (status <> 'paid' or payable_at is not null)
);
comment on table public.earnings is
  'What setters are owed and paid. Written only through the booking functions (and the quote functions in M5).';
comment on column public.earnings.quote_id is
  'Set for commission earnings; the foreign key to quotes is added with the quotes table in M5.';

create unique index earnings_one_booking_fee_per_lead on public.earnings (lead_id) where type = 'booking';
create unique index earnings_one_commission_per_quote on public.earnings (quote_id) where type = 'commission';
create index earnings_profile on public.earnings (profile_id, created_at);
create index earnings_meeting on public.earnings (meeting_id) where meeting_id is not null;

create trigger earnings_set_updated_at
  before update on public.earnings
  for each row execute function public.set_updated_at();

alter table public.earnings enable row level security;
revoke all on public.earnings from anon;
create policy "owner reads every earning"
  on public.earnings for select to authenticated
  using (public.is_owner());
create policy "setters read their own earnings"
  on public.earnings for select to authenticated
  using (public.is_sales_side() and profile_id = auth.uid());
