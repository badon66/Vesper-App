-- Customer quote link, take 1 (Keenan, 2026-11-02).
--
-- What:
--   - settings.min_job_total and quotes.min_job_total: the least a job can
--     cost before GST, empty by default, copied onto each quote when it is
--     saved like every other price;
--   - quote_links: the customer's private link to their quote. Owner only;
--     the token (144 random bits) lives nowhere else. One live link per
--     lead; revoking kills it;
--   - push_subscriptions: members' devices for web push, stored sealed;
--   - issue_quote_link and revoke_quote_link (owner only);
--   - quote_for_customer, quote_link_visit, quote_link_select and
--     quote_link_book: the only way the public page reads or writes, each
--     scoped to its token and returning only customer-safe fields;
--   - a storage rule: a request carrying a live token in the x-quote-token
--     header can sign that quote's mockup, and nothing else.
-- Why: after a meeting Keenan sends the homeowner a private link to their
-- quote, read from the same lead, runs, prices and mockup as meeting mode.
-- Anonymous callers get no access to any table, and the secret key never
-- runs in a customer's request (CLAUDE.md).
-- Additive: new columns, tables, functions and policies; nothing is
-- replaced or removed.

-- ---------------------------------------------------------------- prices

alter table public.settings
  add column min_job_total numeric(10,2) check (min_job_total is null or min_job_total >= 0);
comment on column public.settings.min_job_total is
  'The least a job can cost before GST. Null = no minimum. Copied onto each quote when it is saved.';

alter table public.quotes
  add column min_job_total numeric(10,2) check (min_job_total is null or min_job_total >= 0);
comment on column public.quotes.min_job_total is
  'The minimum job total this quote used (from settings when saved). Null = no minimum.';

-- ---------------------------------------------------------------- quote_links

create table public.quote_links (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id),
  token text not null unique check (token ~ '^[A-Za-z0-9_-]{24}$'),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (id),
  view_count int not null default 0 check (view_count >= 0),
  first_viewed_at timestamptz,
  last_viewed_at timestamptz,
  selection int[],
  selection_runs text,
  selection_at timestamptz,
  booked_at timestamptz,
  booked_option text check (booked_option is null or length(booked_option) <= 400),
  booked_selection int[],
  notified_option text,
  updated_at timestamptz not null default now()
);

comment on table public.quote_links is
  'The customer quote link (2026-11-02). Owner only; the public page reaches it only through the token functions.';
comment on column public.quote_links.selection is
  'Positions (0-based) of the runs the customer has switched on. Null = the Recommended package (every run).';
comment on column public.quote_links.selection_runs is
  'md5 of the quote''s runs when the selection was made. A different value means the runs changed and the selection is ignored.';

create unique index quote_links_one_live_per_lead on public.quote_links (lead_id) where revoked_at is null;
create index quote_links_lead_id on public.quote_links (lead_id);
create index quote_links_created_by on public.quote_links (created_by);
create index quote_links_revoked_by on public.quote_links (revoked_by);

create trigger quote_links_set_updated_at
  before update on public.quote_links
  for each row execute function public.set_updated_at();

alter table public.quote_links enable row level security;
revoke all on public.quote_links from anon;

-- Keenan reads them; every write goes through the functions below.
create policy "owner reads quote links"
  on public.quote_links for select to authenticated
  using (public.is_owner());

-- ---------------------------------------------------------------- push_subscriptions

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id),
  endpoint_hash text not null unique check (endpoint_hash ~ '^[0-9a-f]{64}$'),
  sealed text not null check (length(sealed) between 20 and 8000),
  label text not null check (length(trim(label)) between 1 and 60),
  created_at timestamptz not null default now(),
  last_sent_at timestamptz,
  removed_at timestamptz
);

comment on table public.push_subscriptions is
  'Web push addresses for members'' devices (2026-11-02). sealed holds the address and its keys, AES-GCM sealed by the server; only the server can open it. A device switched off is stamped removed_at and gets nothing.';

create index push_subscriptions_profile_id on public.push_subscriptions (profile_id);

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon;

create policy "members read their own devices"
  on public.push_subscriptions for select to authenticated
  using (profile_id = (select auth.uid()));
create policy "members add their own devices"
  on public.push_subscriptions for insert to authenticated
  with check (profile_id = (select auth.uid()));
-- Switching a device off stamps removed_at; rows are kept, sealed.
create policy "members update their own devices"
  on public.push_subscriptions for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

-- ---------------------------------------------------------------- helpers

-- The quote a link shows: the lead's latest quote that is still in play.
create or replace function public.quote_link_current_quote(p_lead_id uuid)
returns public.quotes
language sql
stable
security definer
set search_path = ''
as $$
  select q.*
    from public.quotes q
   where q.lead_id = p_lead_id
     and q.status in ('draft', 'presented', 'accepted')
   order by q.created_at desc
   limit 1;
$$;

-- The live link for a token: not revoked, with a quote that is good today
-- (Calgary). Null for anything else.
create or replace function public.quote_link_live(p_token text)
returns public.quote_links
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  link public.quote_links;
  q public.quotes;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{24}$' then
    return null;
  end if;
  select * into link from public.quote_links l where l.token = p_token and l.revoked_at is null;
  if not found then
    return null;
  end if;
  q := public.quote_link_current_quote(link.lead_id);
  if q.id is null or (q.valid_until is not null and q.valid_until < (now() at time zone 'America/Edmonton')::date) then
    return null;
  end if;
  return link;
end;
$$;

-- A run's name for the option in words.
create or replace function public.quote_link_run_name(p_run jsonb, p_position int)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(nullif(btrim(p_run ->> 'name'), ''), 'Run ' || (p_position + 1));
$$;

-- The customer's positions, checked against the quote's runs: distinct,
-- in range, sorted, at least one. Null or empty means every run. Raises on
-- anything else.
create or replace function public.quote_link_positions(p_runs jsonb, p_positions int[])
returns int[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  run_count int := coalesce(jsonb_array_length(p_runs), 0);
  cleaned int[];
begin
  if p_positions is null or cardinality(p_positions) = 0 then
    return (select coalesce(array_agg(i order by i), '{}') from generate_series(0, run_count - 1) as i);
  end if;
  if exists (select 1 from unnest(p_positions) as p where p is null or p < 0 or p >= run_count) then
    raise exception 'Those runs are not on this quote.' using errcode = '22023';
  end if;
  select array_agg(distinct p order by p) into cleaned from unnest(p_positions) as p;
  return cleaned;
end;
$$;

revoke execute on function public.quote_link_current_quote(uuid) from public, anon, authenticated;
revoke execute on function public.quote_link_live(text) from public, anon, authenticated;
revoke execute on function public.quote_link_positions(jsonb, int[]) from public, anon, authenticated;
revoke execute on function public.quote_link_run_name(jsonb, int) from public, anon, authenticated;

-- ---------------------------------------------------------------- Keenan's side

-- Returns the lead's live link token, making one when there is none.
create or replace function public.issue_quote_link(p_lead_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  existing text;
  made text;
  made_id uuid;
  maker uuid;
begin
  if not public.acts_as_owner() then
    raise exception 'Only Keenan can send a quote link.' using errcode = '42501';
  end if;
  if (public.quote_link_current_quote(p_lead_id)).id is null then
    raise exception 'Save a quote for this lead first.' using errcode = 'P0001';
  end if;

  select l.token into existing from public.quote_links l where l.lead_id = p_lead_id and l.revoked_at is null;
  if existing is not null then
    return existing;
  end if;

  -- The owner, or for the test suite's service role, the owner it stands in for.
  maker := coalesce(
    auth.uid(),
    (select p.id from public.profiles p where p.role = 'owner' order by p.created_at limit 1)
  );
  made := translate(rtrim(encode(extensions.gen_random_bytes(18), 'base64'), '='), '+/', '-_');

  insert into public.quote_links (lead_id, token, created_by)
  values (p_lead_id, made, maker)
  on conflict (lead_id) where revoked_at is null do nothing
  returning id into made_id;

  if made_id is null then
    -- Someone made one at the same moment: theirs is the live one.
    select l.token into existing from public.quote_links l where l.lead_id = p_lead_id and l.revoked_at is null;
    return existing;
  end if;

  insert into public.lead_events (lead_id, actor_id, type, payload)
  values (p_lead_id, auth.uid(), 'quote_link_created', jsonb_build_object('link_id', made_id));
  return made;
end;
$$;

-- Turns the lead's live link off. True when there was one.
create or replace function public.revoke_quote_link(p_lead_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  revoked uuid;
begin
  if not public.acts_as_owner() then
    raise exception 'Only Keenan can turn a quote link off.' using errcode = '42501';
  end if;
  update public.quote_links
     set revoked_at = now(), revoked_by = auth.uid()
   where lead_id = p_lead_id and revoked_at is null
  returning id into revoked;
  if revoked is null then
    return false;
  end if;
  insert into public.lead_events (lead_id, actor_id, type, payload)
  values (p_lead_id, auth.uid(), 'quote_link_revoked', jsonb_build_object('link_id', revoked));
  return true;
end;
$$;

revoke execute on function public.issue_quote_link(uuid) from public, anon;
revoke execute on function public.revoke_quote_link(uuid) from public, anon;
grant execute on function public.issue_quote_link(uuid) to authenticated, service_role;
grant execute on function public.revoke_quote_link(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------- the customer's page

-- Everything the page shows, for a live token; {state: 'expired'} for
-- anything else (unknown, revoked, or past its valid-until date), with no
-- name and no prices. Never notes, costs, the setter, statuses, the
-- timeline or anyone else.
create or replace function public.quote_for_customer(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  link public.quote_links;
  q public.quotes;
  v_lead public.leads;
  s public.settings;
  mockup text;
  fingerprint text;
begin
  link := public.quote_link_live(p_token);
  if link.id is null then
    return jsonb_build_object('state', 'expired');
  end if;
  q := public.quote_link_current_quote(link.lead_id);
  select * into v_lead from public.leads l where l.id = link.lead_id;
  select * into s from public.settings st where st.id = 1;
  select p.storage_path into mockup
    from public.lead_photos p
   where p.lead_id = link.lead_id and p.slot = 'mockup'
   limit 1;
  fingerprint := md5(q.runs::text);

  return jsonb_build_object(
    'state', 'live',
    'first_name', v_lead.first_name,
    'last_name', v_lead.last_name,
    'address', v_lead.address_line,
    'city', v_lead.city,
    'valid_until', q.valid_until,
    'quote', jsonb_build_object(
      'runs', q.runs,
      'runs_fingerprint', fingerprint,
      'price_per_ft', q.price_per_ft,
      'box_price', q.box_price,
      'box_count', q.box_count,
      'adders', q.adders,
      'discounts', q.discounts,
      'colour_timing', q.colour_timing,
      'rush_fee_per_ft', q.rush_fee_per_ft,
      'min_job_total', q.min_job_total,
      'gst_enabled', q.gst_enabled,
      'gst_rate', q.gst_rate
    ),
    'warranty', s.warranty_text,
    'company', jsonb_build_object(
      'name', s.company ->> 'name',
      'phone', s.company ->> 'phone',
      'email', s.company ->> 'email',
      'address', s.company ->> 'address'
    ),
    'mockup_path', mockup,
    'selection', case when link.selection_runs = fingerprint then to_jsonb(link.selection) else null end,
    'booked_at', link.booked_at,
    'booked_option', link.booked_option
  );
end;
$$;

-- One visit: the count and the time, nothing about the visitor. The first
-- one goes on the lead's timeline.
create or replace function public.quote_link_visit(p_token text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  link public.quote_links;
  visits int;
begin
  link := public.quote_link_live(p_token);
  if link.id is null then
    return false;
  end if;
  update public.quote_links
     set view_count = view_count + 1,
         last_viewed_at = now(),
         first_viewed_at = coalesce(first_viewed_at, now())
   where id = link.id
  returning view_count into visits;
  if visits = 1 then
    insert into public.lead_events (lead_id, actor_id, type, payload)
    values (link.lead_id, null, 'quote_link_opened', jsonb_build_object('link_id', link.id));
  end if;
  return true;
end;
$$;

-- Which runs they have switched on, so the page opens the same way next
-- time and Keenan can see what they are looking at.
create or replace function public.quote_link_select(p_token text, p_positions int[])
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  link public.quote_links;
  q public.quotes;
  chosen int[];
begin
  link := public.quote_link_live(p_token);
  if link.id is null then
    return false;
  end if;
  q := public.quote_link_current_quote(link.lead_id);
  chosen := public.quote_link_positions(q.runs, p_positions);
  if cardinality(chosen) = 0 then
    return false;
  end if;
  update public.quote_links
     set selection = case when cardinality(chosen) = jsonb_array_length(q.runs) then null else chosen end,
         selection_runs = md5(q.runs::text),
         selection_at = now()
   where id = link.id;
  return true;
end;
$$;

-- Book my install: saves the option in words (never a price), puts it on
-- the timeline, and, when this option hasn't been pushed yet, returns the
-- link maker's sealed push addresses for the server to open and send.
-- It never accepts the quote and never creates an earning.
create or replace function public.quote_link_book(p_token text, p_positions int[])
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  link public.quote_links;
  q public.quotes;
  v_lead public.leads;
  chosen int[];
  run_count int;
  v_names text[];
  v_option text;
  v_notify boolean;
  v_targets jsonb := '[]'::jsonb;
begin
  link := public.quote_link_live(p_token);
  if link.id is null then
    return jsonb_build_object('ok', false, 'state', 'expired');
  end if;
  q := public.quote_link_current_quote(link.lead_id);
  run_count := coalesce(jsonb_array_length(q.runs), 0);
  chosen := public.quote_link_positions(q.runs, p_positions);
  if cardinality(chosen) = 0 then
    return jsonb_build_object('ok', false, 'state', 'no_runs');
  end if;

  select array_agg(public.quote_link_run_name(q.runs -> p, p) order by p) into v_names from unnest(chosen) as p;
  v_option := case
    when cardinality(chosen) = run_count then 'Recommended package'
    else 'Start smaller: ' || array_to_string(v_names, ', ')
  end;
  v_notify := link.notified_option is distinct from v_option;

  update public.quote_links
     set booked_at = now(),
         booked_option = left(v_option, 400),
         booked_selection = chosen,
         selection = case when cardinality(chosen) = run_count then null else chosen end,
         selection_runs = md5(q.runs::text),
         selection_at = now(),
         notified_option = case when v_notify then v_option else notified_option end
   where id = link.id;

  -- The timeline gets one entry per new option, so repeated taps don't
  -- fill it.
  if v_notify then
    insert into public.lead_events (lead_id, actor_id, type, payload)
    values (link.lead_id, null, 'install_requested', jsonb_build_object('option', v_option, 'runs', to_jsonb(v_names)));
    select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'sealed', p.sealed)), '[]'::jsonb)
      into v_targets
      from public.push_subscriptions p
     where p.profile_id = link.created_by
       and p.removed_at is null;
  end if;

  select * into v_lead from public.leads l where l.id = link.lead_id;
  return jsonb_build_object(
    'ok', true,
    'option', v_option,
    'name', btrim(v_lead.first_name || ' ' || coalesce(v_lead.last_name, '')),
    'lead_id', link.lead_id,
    'notify', v_notify,
    'targets', v_targets
  );
end;
$$;

grant execute on function public.quote_for_customer(text) to anon, authenticated, service_role;
grant execute on function public.quote_link_visit(text) to anon, authenticated, service_role;
grant execute on function public.quote_link_select(text, int[]) to anon, authenticated, service_role;
grant execute on function public.quote_link_book(text, int[]) to anon, authenticated, service_role;

-- ---------------------------------------------------------------- the mockup

-- True when this request carries a live token (x-quote-token header) and
-- the object is that quote's mockup. Storage asks this for anonymous
-- requests; anything else, including a list, gets nothing.
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
  );
end;
$$;

create policy "a live quote link signs its own mockup"
  on storage.objects for select to anon
  using (bucket_id = 'lead-photos' and public.quote_mockup_signable(name));
