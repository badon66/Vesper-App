-- M1: profiles, settings, roles and Row Level Security.
-- Why: the first tables the app needs. Every later table references profiles,
-- and settings holds every number the business tunes without a deploy.
-- Applied to the Vesper-App project through the Supabase connector on
-- 2026-10-26 as migration "m1_profiles_settings".

-- Roles. Enum values stay owner | sales | crew. The UI labels them
-- Admin, Sales associate and Crew.
create type public.user_role as enum ('owner', 'sales', 'crew');

-- Keeps updated_at current on any table that has the column.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------- profiles

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null,
  phone text,
  role public.user_role not null default 'sales',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.profiles is
  'One row per user, created by a trigger when Supabase Auth creates the user.';

-- There is exactly one owner, ever. A unique index on a constant, limited to
-- owner rows, allows at most one such row.
create unique index profiles_single_owner on public.profiles ((true))
  where role = 'owner';
create index profiles_role_active on public.profiles (role, active);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- The owner row can never be demoted or deactivated, whoever is asking.
create or replace function public.protect_owner_profile()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.role = 'owner' and (new.role <> 'owner' or new.active = false) then
    raise exception 'The owner profile cannot be demoted or deactivated';
  end if;
  return new;
end;
$$;

create trigger profiles_protect_owner
  before update on public.profiles
  for each row execute function public.protect_owner_profile();

-- Creates the profile when Supabase Auth creates the user. The owner's email
-- address is fixed here on purpose; every other account starts as sales.
-- full_name and phone come from the user metadata set by the People screen.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, email, full_name, phone, role)
  values (
    new.id,
    new.email,
    coalesce(nullif(trim(meta->>'full_name'), ''), split_part(new.email, '@', 1)),
    nullif(trim(meta->>'phone'), ''),
    case
      when lower(new.email) = 'info@vesperlighting.ca' then 'owner'::public.user_role
      else 'sales'::public.user_role
    end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keeps profiles.email in step if an email is ever changed in Auth.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

-- Backfill for users that already exist. The owner account was created in
-- the dashboard before this migration ran.
insert into public.profiles (id, email, full_name, role)
select
  u.id,
  u.email,
  coalesce(nullif(trim(u.raw_user_meta_data->>'full_name'), ''), split_part(u.email, '@', 1)),
  case
    when lower(u.email) = 'info@vesperlighting.ca' then 'owner'::public.user_role
    else 'sales'::public.user_role
  end
from auth.users u
where u.email is not null
  and not exists (select 1 from public.profiles p where p.id = u.id);

-- Role helpers. SECURITY DEFINER so policies can read profiles without
-- recursing into the profiles policies. Inactive users have no role.
create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = auth.uid() and active;
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select role = 'owner' and active from public.profiles where id = auth.uid()),
    false
  );
$$;

revoke execute on function public.current_user_role() from public, anon;
revoke execute on function public.is_owner() from public, anon;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_owner() to authenticated;

-- ---------------------------------------------------------------- settings

create table public.settings (
  id int primary key check (id = 1),
  price_per_ft numeric(10,2) not null default 23.00 check (price_per_ft >= 0),
  box_price numeric(10,2) not null default 500.00 check (box_price >= 0),
  neighbour_discount numeric(10,2) not null default 150.00 check (neighbour_discount >= 0),
  referral_credit numeric(10,2) not null default 150.00 check (referral_credit >= 0),
  gst_rate numeric(5,4) not null default 0.0500 check (gst_rate >= 0 and gst_rate < 1),
  gst_enabled boolean not null default false,
  booking_pay numeric(10,2) not null default 20.00 check (booking_pay >= 0),
  commission_rate numeric(5,4) not null default 0.0500 check (commission_rate >= 0 and commission_rate < 1),
  warranty_text text not null,
  presentation jsonb not null,            -- pages: [{title, body, image_paths[]}]
  lost_reasons text[] not null default '{price,"other company","not now","could not reach",other}',
  meeting_days int[] not null default '{1,2,3,4,5,6}'   -- 0 = Sunday
    check (meeting_days <@ array[0,1,2,3,4,5,6]),
  meeting_start time not null default '18:00',
  meeting_slot_minutes int not null default 45 check (meeting_slot_minutes between 15 and 180),
  meeting_slot_count int not null default 4 check (meeting_slot_count between 1 and 12),
  distance_warning_km numeric(5,1) not null default 10 check (distance_warning_km >= 0),
  company jsonb not null,                 -- {name, phone, email, address} for PDFs
  updated_at timestamptz not null default now()
);
comment on table public.settings is
  'Single row (id = 1). Everything the business tunes without a deploy.';

create trigger settings_set_updated_at
  before update on public.settings
  for each row execute function public.set_updated_at();

-- Seed. Warranty wording and company details are placeholders the admin
-- replaces in Settings. Presentation bodies are drafts from the spec outline;
-- the warranty page and the price page are filled at render time in M5.
insert into public.settings (id, warranty_text, presentation, company) values (
  1,
  'Warranty text has not been set. Replace this in Settings with the exact warranty wording before presenting any quote.',
  '[
    {"title": "Vesper", "body": "Permanent roofline lighting for your home. An investment in the house, not Christmas lights. Installed once, controlled from your phone, there every night of the year.", "image_paths": []},
    {"title": "The product", "body": "24V RGBW nodes sit in a slim aluminum track tucked tight under the soffit. The track is colour matched to your soffit and is hard to spot by day. A dedicated white LED gives true warm and cool whites.", "image_paths": []},
    {"title": "Scenes", "body": "Warm white every night. Christmas, Halloween, game day, a birthday. Set a scene once and it runs on a schedule, or change it from the couch.", "image_paths": []},
    {"title": "Install day", "body": "A small crew does the install, usually in a day. The control box plugs into a standard outlet, indoors or outdoors, and runs the zones on your house. We set up the app with you before we leave.", "image_paths": []},
    {"title": "Warranty", "body": "", "image_paths": []},
    {"title": "Your price", "body": "", "image_paths": []},
    {"title": "Payment and financing", "body": "No payment until your install is complete. Financing is available if you would rather spread it out. We will go over the options with you.", "image_paths": []},
    {"title": "Neighbours and referrals", "body": "Install at the same time as a neighbour and you both get the neighbour discount. Refer a friend who installs and you get a referral credit.", "image_paths": []}
  ]'::jsonb,
  '{"name": "Vesper Lighting, Inc.", "phone": "", "email": "info@vesperlighting.ca", "address": ""}'::jsonb
);

-- ---------------------------------------------------------------- RLS

alter table public.profiles enable row level security;
alter table public.settings enable row level security;

revoke all on public.profiles from anon;
revoke all on public.settings from anon;

-- profiles: owner everything; everyone else reads only their own row.
create policy "owner manages profiles"
  on public.profiles for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

create policy "users read own profile"
  on public.profiles for select to authenticated
  using (id = auth.uid());

-- settings: owner only. Sales read the safe columns through settings_public.
create policy "owner manages settings"
  on public.settings for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- ---------------------------------------------------------------- views
-- Both views run with the view owner's privileges and bypass RLS on purpose.
-- They must never gain a column that is not listed in docs/02-data-model.md.

create view public.settings_public with (security_invoker = false) as
  select meeting_days, meeting_start, meeting_slot_minutes, meeting_slot_count, distance_warning_km
  from public.settings
  where id = 1;

create view public.profiles_public with (security_invoker = false) as
  select id, full_name, role
  from public.profiles
  where active;

revoke all on public.settings_public from anon, public;
revoke all on public.profiles_public from anon, public;
grant select on public.settings_public to authenticated;
grant select on public.profiles_public to authenticated;
