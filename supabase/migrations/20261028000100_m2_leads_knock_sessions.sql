-- M2: knock sessions, leads, lead photos and the lead timeline.
-- Why: setters capture leads at the door with an address, phone and photo,
-- count doors and conversations in knock sessions, and every change to a lead
-- lands in an append-only timeline. The rules setters must follow are enforced
-- here, not only in the screens. Applied through the Supabase connector as
-- migration "m2_leads_knock_sessions".

-- ---------------------------------------------------------------- enums

create type public.lead_status as enum
  ('new', 'follow_up', 'meeting_booked', 'met', 'quoted', 'sold', 'installed', 'lost');
create type public.lead_source as enum
  ('door', 'referral', 'neighbour_card', 'website', 'other');
create type public.house_type as enum
  ('bungalow', 'bi_level', 'two_storey', 'other');
create type public.soffit_colour as enum
  ('white', 'black', 'brown', 'other');
create type public.event_type as enum
  ('created', 'note', 'status_change', 'call', 'text', 'meeting_booked',
   'meeting_outcome', 'quote_created', 'quote_presented', 'quote_accepted',
   'quote_declined', 'photo_added', 'edited');

-- ---------------------------------------------------------------- helper

-- True for an active owner or sales profile, the people who use the sales
-- side of the app. Crew and accounts without a profile get false.
create or replace function public.is_sales_side()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select active and role in ('owner', 'sales') from public.profiles where id = auth.uid()),
    false
  );
$$;

revoke execute on function public.is_sales_side() from public, anon;
grant execute on function public.is_sales_side() to authenticated;

-- ---------------------------------------------------------------- knock_sessions

create table public.knock_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  neighbourhood text not null check (length(trim(neighbourhood)) between 1 and 80),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  doors_knocked int not null default 0 check (doors_knocked >= 0),
  conversations int not null default 0 check (conversations >= 0),
  notes text check (notes is null or length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint knock_sessions_end_after_start check (ended_at is null or ended_at >= started_at)
);
comment on table public.knock_sessions is
  'A person''s time on the street: neighbourhood, doors knocked, conversations.';

create unique index knock_sessions_one_open_per_user
  on public.knock_sessions (user_id) where ended_at is null;
create index knock_sessions_user_started on public.knock_sessions (user_id, started_at desc);
create index knock_sessions_started on public.knock_sessions (started_at desc);

create trigger knock_sessions_set_updated_at
  before update on public.knock_sessions
  for each row execute function public.set_updated_at();

-- A new session always belongs to the person starting it and starts at zero.
create or replace function public.knock_sessions_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.user_id := auth.uid();
    new.started_at := now();
    new.ended_at := null;
    new.doors_knocked := 0;
    new.conversations := 0;
  end if;
  return new;
end;
$$;

create trigger knock_sessions_before_insert
  before insert on public.knock_sessions
  for each row execute function public.knock_sessions_before_insert();

-- ---------------------------------------------------------------- leads

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles (id),
  assigned_to uuid references public.profiles (id),
  knock_session_id uuid references public.knock_sessions (id),
  status public.lead_status not null default 'new',
  source public.lead_source not null default 'door',
  first_name text not null check (length(trim(first_name)) between 1 and 80),
  last_name text check (last_name is null or length(last_name) <= 80),
  phone text check (phone is null or phone ~ '^\+[1-9][0-9]{6,14}$'),
  email text check (email is null or (length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  address_line text not null check (length(trim(address_line)) between 1 and 200),
  city text not null default 'Calgary' check (length(trim(city)) between 1 and 80),
  postal_code text check (postal_code is null or length(postal_code) <= 12),
  neighbourhood text check (neighbourhood is null or length(neighbourhood) <= 80),
  lat double precision check (lat is null or lat between -90 and 90),
  lng double precision check (lng is null or lng between -180 and 180),
  place_id text check (place_id is null or length(place_id) <= 300),
  house_type public.house_type,
  soffit_colour public.soffit_colour,
  soffit_note text check (soffit_note is null or length(soffit_note) <= 200),
  est_feet int check (est_feet is null or est_feet between 0 and 100000),
  notes text check (notes is null or length(notes) <= 4000),
  both_decision_makers boolean,
  consent_text boolean not null default false,
  lost_reason text check (lost_reason is null or length(lost_reason) <= 200),
  lost_at timestamptz,
  sold_at timestamptz,
  installed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leads_lat_lng_together check ((lat is null) = (lng is null)),
  constraint leads_lost_needs_reason check (status <> 'lost' or lost_reason is not null)
);
comment on table public.leads is
  'Homeowners met at the door. Never store a price here: sales users can read every lead.';

create index leads_assigned_status on public.leads (assigned_to, status);
create index leads_status_created on public.leads (status, created_at desc);
create index leads_lat_lng on public.leads (lat, lng);
create index leads_place_id on public.leads (place_id) where place_id is not null;
create index leads_knock_session on public.leads (knock_session_id) where knock_session_id is not null;
create index leads_created_by_created on public.leads (created_by, created_at desc);

create trigger leads_set_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- lead_photos

create table public.lead_photos (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  storage_path text not null unique check (
    storage_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
  ),
  caption text check (caption is null or length(caption) <= 200),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index lead_photos_lead on public.lead_photos (lead_id, created_at);

-- ---------------------------------------------------------------- lead_events

create table public.lead_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  type public.event_type not null,
  from_status public.lead_status,
  to_status public.lead_status,
  payload jsonb,
  created_at timestamptz not null default now(),
  constraint lead_events_note_has_text check (
    type <> 'note'
    or (jsonb_typeof(payload -> 'text') = 'string' and length(payload ->> 'text') between 1 and 4000)
  )
);
comment on table public.lead_events is
  'Append-only lead timeline. Never store a price in payload: sales users can read every event.';

create index lead_events_lead_created on public.lead_events (lead_id, created_at desc);
create index lead_events_actor_created on public.lead_events (actor_id, created_at desc);
create index lead_events_type_created on public.lead_events (type, created_at desc);

-- ---------------------------------------------------------------- lead rules

-- Who a lead belongs to, which statuses a setter may use, and the status
-- timestamps. Signed-in setters may change status only when both the old and
-- the new status are new, follow_up or lost. Meeting booked is set by M3's
-- booking, everything after it by the owner. Service-role calls, where
-- auth.uid() is null, skip the role rules.
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
         and not (old.status = any (setter_statuses) and new.status = any (setter_statuses)) then
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

create trigger leads_guard
  before insert or update on public.leads
  for each row execute function public.leads_guard();

-- Writes the timeline: created, status_change with from and to, and edited
-- with the names of the changed fields, never their values.
create or replace function public.leads_log_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed text[];
begin
  if tg_op = 'INSERT' then
    insert into public.lead_events (lead_id, actor_id, type, to_status)
    values (new.id, auth.uid(), 'created', new.status);
    return null;
  end if;

  if new.status is distinct from old.status then
    insert into public.lead_events (lead_id, actor_id, type, from_status, to_status, payload)
    values (
      new.id, auth.uid(), 'status_change', old.status, new.status,
      case when new.status = 'lost' then jsonb_build_object('reason', new.lost_reason) end
    );
  end if;

  select coalesce(array_agg(n.key order by n.key), array[]::text[])
    into changed
    from jsonb_each(to_jsonb(new)) as n
   where n.key = any (array[
           'first_name', 'last_name', 'phone', 'email', 'address_line', 'city',
           'postal_code', 'neighbourhood', 'lat', 'lng', 'place_id', 'house_type',
           'soffit_colour', 'soffit_note', 'est_feet', 'notes', 'source', 'assigned_to'
         ])
     and n.value is distinct from (to_jsonb(old) -> n.key);

  if cardinality(changed) > 0 then
    insert into public.lead_events (lead_id, actor_id, type, payload)
    values (new.id, auth.uid(), 'edited', jsonb_build_object('fields', to_jsonb(changed)));
  end if;

  return null;
end;
$$;

create trigger leads_log_events
  after insert or update on public.leads
  for each row execute function public.leads_log_events();

-- Photos and hand-written events always record who added them, and when.
create or replace function public.stamp_actor_and_time()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    if tg_table_name = 'lead_events' then
      new.actor_id := auth.uid();
    else
      new.created_by := auth.uid();
    end if;
  end if;
  new.created_at := now();
  return new;
end;
$$;

create trigger lead_photos_stamp
  before insert on public.lead_photos
  for each row execute function public.stamp_actor_and_time();

create trigger lead_events_stamp
  before insert on public.lead_events
  for each row execute function public.stamp_actor_and_time();

create or replace function public.lead_photos_log_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.lead_events (lead_id, actor_id, type, payload)
  values (new.lead_id, auth.uid(), 'photo_added', jsonb_build_object('photo_id', new.id));
  return null;
end;
$$;

create trigger lead_photos_log_event
  after insert on public.lead_photos
  for each row execute function public.lead_photos_log_event();

revoke execute on function public.knock_sessions_before_insert() from public, anon, authenticated;
revoke execute on function public.leads_guard() from public, anon, authenticated;
revoke execute on function public.leads_log_events() from public, anon, authenticated;
revoke execute on function public.stamp_actor_and_time() from public, anon, authenticated;
revoke execute on function public.lead_photos_log_event() from public, anon, authenticated;

-- ---------------------------------------------------------------- knock functions

-- Adds to the counters of the caller's own open session in one atomic
-- statement, never below zero, so fast taps on a phone never lose a count.
create or replace function public.bump_knock_session(
  p_session uuid,
  p_doors int default 0,
  p_conversations int default 0
)
returns setof public.knock_sessions
language sql
security invoker
set search_path = ''
as $$
  update public.knock_sessions
     set doors_knocked = greatest(0, doors_knocked + greatest(-100, least(100, coalesce(p_doors, 0)))),
         conversations = greatest(0, conversations + greatest(-100, least(100, coalesce(p_conversations, 0))))
   where id = p_session
     and user_id = auth.uid()
     and ended_at is null
  returning *;
$$;

-- Closes the caller's sessions left open on an earlier Calgary day, ending
-- each at its last update, so the next day's leads don't link to them.
create or replace function public.close_my_stale_knock_sessions()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  closed integer;
begin
  update public.knock_sessions
     set ended_at = greatest(started_at, updated_at)
   where user_id = auth.uid()
     and ended_at is null
     and started_at < (date_trunc('day', now() at time zone 'America/Edmonton') at time zone 'America/Edmonton');
  get diagnostics closed = row_count;
  return closed;
end;
$$;

revoke execute on function public.bump_knock_session(uuid, int, int) from public, anon;
revoke execute on function public.close_my_stale_knock_sessions() from public, anon;
grant execute on function public.bump_knock_session(uuid, int, int) to authenticated;
grant execute on function public.close_my_stale_knock_sessions() to authenticated;

-- ---------------------------------------------------------------- RLS

alter table public.knock_sessions enable row level security;
alter table public.leads enable row level security;
alter table public.lead_photos enable row level security;
alter table public.lead_events enable row level security;

revoke all on public.knock_sessions, public.leads, public.lead_photos, public.lead_events from anon;
-- The timeline is append-only for everyone.
revoke update, delete on public.lead_events from authenticated;

create policy "sales side reads knock sessions"
  on public.knock_sessions for select to authenticated
  using (public.is_sales_side());
create policy "people start their own knock sessions"
  on public.knock_sessions for insert to authenticated
  with check (public.is_sales_side() and user_id = auth.uid());
create policy "people update their own knock sessions"
  on public.knock_sessions for update to authenticated
  using (public.is_sales_side() and user_id = auth.uid())
  with check (user_id = auth.uid());
create policy "owner manages knock sessions"
  on public.knock_sessions for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

create policy "sales side reads leads"
  on public.leads for select to authenticated
  using (public.is_sales_side());
create policy "sales side adds leads as themselves"
  on public.leads for insert to authenticated
  with check (public.is_sales_side() and created_by = auth.uid());
create policy "setters update their own leads"
  on public.leads for update to authenticated
  using (public.is_sales_side() and (created_by = auth.uid() or assigned_to = auth.uid()))
  with check (created_by = auth.uid() or assigned_to = auth.uid());
create policy "owner manages leads"
  on public.leads for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

create policy "sales side reads lead photos"
  on public.lead_photos for select to authenticated
  using (public.is_sales_side());
create policy "setters add photos to their own leads"
  on public.lead_photos for insert to authenticated
  with check (
    public.is_sales_side()
    and split_part(storage_path, '/', 1) = auth.uid()::text
    and exists (
      select 1 from public.leads l
      where l.id = lead_id and (l.created_by = auth.uid() or l.assigned_to = auth.uid())
    )
  );
create policy "owner manages lead photos"
  on public.lead_photos for all to authenticated
  using (public.is_owner()) with check (public.is_owner());

create policy "sales side reads the timeline"
  on public.lead_events for select to authenticated
  using (public.is_sales_side());
create policy "people add notes to leads they may edit"
  on public.lead_events for insert to authenticated
  with check (
    public.is_sales_side()
    and type = 'note'
    and actor_id = auth.uid()
    and (
      public.is_owner()
      or exists (
        select 1 from public.leads l
        where l.id = lead_id and (l.created_by = auth.uid() or l.assigned_to = auth.uid())
      )
    )
  );

-- ---------------------------------------------------------------- views
-- Both views run with the view owner's privileges and bypass RLS on purpose.
-- They return nothing to a caller without an active profile, and must never
-- gain a column that is not listed in docs/02-data-model.md.

create or replace view public.settings_public with (security_invoker = false) as
  select meeting_days, meeting_start, meeting_slot_minutes, meeting_slot_count,
         distance_warning_km, lost_reasons
  from public.settings
  where id = 1
    and exists (select 1 from public.profiles me where me.id = auth.uid() and me.active);

create view public.profile_names with (security_invoker = false) as
  select id, full_name
  from public.profiles
  where exists (select 1 from public.profiles me where me.id = auth.uid() and me.active);

revoke all on public.profile_names from anon, public;
grant select on public.profile_names to authenticated;

-- ---------------------------------------------------------------- storage

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lead-photos', 'lead-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "sales side reads lead photo files"
  on storage.objects for select to authenticated
  using (bucket_id = 'lead-photos' and public.is_sales_side());
create policy "people upload lead photos into their own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'lead-photos'
    and public.is_sales_side()
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "owner deletes lead photo files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'lead-photos' and public.is_owner());
