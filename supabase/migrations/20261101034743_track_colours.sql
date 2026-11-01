-- Track colours (Keenan, 2026-11-01). Keenan keeps a list of track colours in
-- Settings, each with a name and an optional RAL code. Colours are added,
-- renamed, reordered and retired, never removed, so old leads keep theirs.
-- Only the owner sets a lead's track colour: one of the active colours, or
-- Custom, a RAL Classic code. The RAL Classic list (the system in the RAL K7
-- colour book) is seeded here so the database itself refuses a code that does
-- not exist. Names only: the app shows no swatches. Additive only.

-- ---------------------------------------------------------------- RAL Classic

create table public.ral_classic_colours (
  code text primary key check (code ~ '^[0-9]{4}$'),
  name text not null check (length(name) between 1 and 60)
);
comment on table public.ral_classic_colours is
  'RAL Classic colours as in the RAL K7 colour book: code and English name. Read only.';

-- 216 colours, cross-checked against an independent published list; see
-- docs/decisions.md, 2026-11-01.
insert into public.ral_classic_colours (code, name) values
  ('1000', 'Green beige'),
  ('1001', 'Beige'),
  ('1002', 'Sand yellow'),
  ('1003', 'Signal yellow'),
  ('1004', 'Golden yellow'),
  ('1005', 'Honey yellow'),
  ('1006', 'Maize yellow'),
  ('1007', 'Daffodil yellow'),
  ('1011', 'Brown beige'),
  ('1012', 'Lemon yellow'),
  ('1013', 'Oyster white'),
  ('1014', 'Ivory'),
  ('1015', 'Light ivory'),
  ('1016', 'Sulfur yellow'),
  ('1017', 'Saffron yellow'),
  ('1018', 'Zinc yellow'),
  ('1019', 'Grey beige'),
  ('1020', 'Olive yellow'),
  ('1021', 'Colza yellow'),
  ('1023', 'Traffic yellow'),
  ('1024', 'Ochre yellow'),
  ('1026', 'Luminous yellow'),
  ('1027', 'Curry'),
  ('1028', 'Melon yellow'),
  ('1032', 'Broom yellow'),
  ('1033', 'Dahlia yellow'),
  ('1034', 'Pastel yellow'),
  ('1035', 'Pearl beige'),
  ('1036', 'Pearl gold'),
  ('1037', 'Sun yellow'),
  ('2000', 'Yellow orange'),
  ('2001', 'Red orange'),
  ('2002', 'Vermilion'),
  ('2003', 'Pastel orange'),
  ('2004', 'Pure orange'),
  ('2005', 'Luminous orange'),
  ('2007', 'Luminous bright orange'),
  ('2008', 'Bright red orange'),
  ('2009', 'Traffic orange'),
  ('2010', 'Signal orange'),
  ('2011', 'Deep orange'),
  ('2012', 'Salmon orange'),
  ('2013', 'Pearl orange'),
  ('2017', 'RAL orange'),
  ('3000', 'Flame red'),
  ('3001', 'Signal red'),
  ('3002', 'Carmine red'),
  ('3003', 'Ruby red'),
  ('3004', 'Purple red'),
  ('3005', 'Wine red'),
  ('3007', 'Black red'),
  ('3009', 'Oxide red'),
  ('3011', 'Brown red'),
  ('3012', 'Beige red'),
  ('3013', 'Tomato red'),
  ('3014', 'Antique pink'),
  ('3015', 'Light pink'),
  ('3016', 'Coral red'),
  ('3017', 'Rose'),
  ('3018', 'Strawberry red'),
  ('3020', 'Traffic red'),
  ('3022', 'Salmon pink'),
  ('3024', 'Luminous red'),
  ('3026', 'Luminous bright red'),
  ('3027', 'Raspberry red'),
  ('3028', 'Pure red'),
  ('3031', 'Orient red'),
  ('3032', 'Pearl ruby red'),
  ('3033', 'Pearl pink'),
  ('4001', 'Red lilac'),
  ('4002', 'Red violet'),
  ('4003', 'Heather violet'),
  ('4004', 'Claret violet'),
  ('4005', 'Blue lilac'),
  ('4006', 'Traffic purple'),
  ('4007', 'Purple violet'),
  ('4008', 'Signal violet'),
  ('4009', 'Pastel violet'),
  ('4010', 'Telemagenta'),
  ('4011', 'Pearl violet'),
  ('4012', 'Pearl blackberry'),
  ('5000', 'Violet blue'),
  ('5001', 'Green blue'),
  ('5002', 'Ultramarine blue'),
  ('5003', 'Sapphire blue'),
  ('5004', 'Black blue'),
  ('5005', 'Signal blue'),
  ('5007', 'Brilliant blue'),
  ('5008', 'Grey blue'),
  ('5009', 'Azure blue'),
  ('5010', 'Gentian blue'),
  ('5011', 'Steel blue'),
  ('5012', 'Light blue'),
  ('5013', 'Cobalt blue'),
  ('5014', 'Pigeon blue'),
  ('5015', 'Sky blue'),
  ('5017', 'Traffic blue'),
  ('5018', 'Turquoise blue'),
  ('5019', 'Capri blue'),
  ('5020', 'Ocean blue'),
  ('5021', 'Water blue'),
  ('5022', 'Night blue'),
  ('5023', 'Distant blue'),
  ('5024', 'Pastel blue'),
  ('5025', 'Pearl gentian blue'),
  ('5026', 'Pearl night blue'),
  ('6000', 'Patina green'),
  ('6001', 'Emerald green'),
  ('6002', 'Leaf green'),
  ('6003', 'Olive green'),
  ('6004', 'Blue green'),
  ('6005', 'Moss green'),
  ('6006', 'Grey olive'),
  ('6007', 'Bottle green'),
  ('6008', 'Brown green'),
  ('6009', 'Fir green'),
  ('6010', 'Grass green'),
  ('6011', 'Reseda green'),
  ('6012', 'Black green'),
  ('6013', 'Reed green'),
  ('6014', 'Yellow olive'),
  ('6015', 'Black olive'),
  ('6016', 'Turquoise green'),
  ('6017', 'May green'),
  ('6018', 'Yellow green'),
  ('6019', 'Pastel green'),
  ('6020', 'Chrome green'),
  ('6021', 'Pale green'),
  ('6022', 'Olive drab'),
  ('6024', 'Traffic green'),
  ('6025', 'Fern green'),
  ('6026', 'Opal green'),
  ('6027', 'Light green'),
  ('6028', 'Pine green'),
  ('6029', 'Mint green'),
  ('6032', 'Signal green'),
  ('6033', 'Mint turquoise'),
  ('6034', 'Pastel turquoise'),
  ('6035', 'Pearl green'),
  ('6036', 'Pearl opal green'),
  ('6037', 'Pure green'),
  ('6038', 'Luminous green'),
  ('6039', 'Fibrous green'),
  ('7000', 'Squirrel grey'),
  ('7001', 'Silver grey'),
  ('7002', 'Olive grey'),
  ('7003', 'Moss grey'),
  ('7004', 'Signal grey'),
  ('7005', 'Mouse grey'),
  ('7006', 'Beige grey'),
  ('7008', 'Khaki grey'),
  ('7009', 'Green grey'),
  ('7010', 'Tarpaulin grey'),
  ('7011', 'Iron grey'),
  ('7012', 'Basalt grey'),
  ('7013', 'Brown grey'),
  ('7015', 'Slate grey'),
  ('7016', 'Anthracite grey'),
  ('7021', 'Black grey'),
  ('7022', 'Umbra grey'),
  ('7023', 'Concrete grey'),
  ('7024', 'Graphite grey'),
  ('7026', 'Granite grey'),
  ('7030', 'Stone grey'),
  ('7031', 'Blue grey'),
  ('7032', 'Pebble grey'),
  ('7033', 'Cement grey'),
  ('7034', 'Yellow grey'),
  ('7035', 'Light grey'),
  ('7036', 'Platinum grey'),
  ('7037', 'Dusty grey'),
  ('7038', 'Agate grey'),
  ('7039', 'Quartz grey'),
  ('7040', 'Window grey'),
  ('7042', 'Traffic grey A'),
  ('7043', 'Traffic grey B'),
  ('7044', 'Silk grey'),
  ('7045', 'Telegrey 1'),
  ('7046', 'Telegrey 2'),
  ('7047', 'Telegrey 4'),
  ('7048', 'Pearl mouse grey'),
  ('8000', 'Green brown'),
  ('8001', 'Ochre brown'),
  ('8002', 'Signal brown'),
  ('8003', 'Clay brown'),
  ('8004', 'Copper brown'),
  ('8007', 'Fawn brown'),
  ('8008', 'Olive brown'),
  ('8011', 'Nut brown'),
  ('8012', 'Red brown'),
  ('8014', 'Sepia brown'),
  ('8015', 'Chestnut brown'),
  ('8016', 'Mahogany brown'),
  ('8017', 'Chocolate brown'),
  ('8019', 'Grey brown'),
  ('8022', 'Black brown'),
  ('8023', 'Orange brown'),
  ('8024', 'Beige brown'),
  ('8025', 'Pale brown'),
  ('8028', 'Terra brown'),
  ('8029', 'Pearl copper'),
  ('9001', 'Cream'),
  ('9002', 'Grey white'),
  ('9003', 'Signal white'),
  ('9004', 'Signal black'),
  ('9005', 'Jet black'),
  ('9006', 'White aluminium'),
  ('9007', 'Grey aluminium'),
  ('9010', 'Pure white'),
  ('9011', 'Graphite black'),
  ('9012', 'Clean room white'),
  ('9016', 'Traffic white'),
  ('9017', 'Traffic black'),
  ('9018', 'Papyrus white'),
  ('9022', 'Pearl light grey'),
  ('9023', 'Pearl dark grey');

alter table public.ral_classic_colours enable row level security;
revoke all on public.ral_classic_colours from anon;
create policy "sales side reads the RAL Classic list"
  on public.ral_classic_colours for select to authenticated
  using (public.is_sales_side());

-- ---------------------------------------------------------------- track colours

create table public.track_colours (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 40),
  ral_code text references public.ral_classic_colours (code),
  sort_order int not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.track_colours is
  'Keenan''s track colour list. Retired colours stay so old leads keep them; nothing removes a row.';

create unique index track_colours_name_unique on public.track_colours (lower(trim(name)));
create index track_colours_order on public.track_colours (sort_order);

create trigger track_colours_set_updated_at
  before update on public.track_colours
  for each row execute function public.set_updated_at();

insert into public.track_colours (name, sort_order) values
  ('White', 1),
  ('Off-white', 2),
  ('Brown', 3),
  ('Black', 4),
  ('Grey', 5);

alter table public.track_colours enable row level security;
revoke all on public.track_colours from anon;
create policy "sales side reads track colours"
  on public.track_colours for select to authenticated
  using (public.is_sales_side());
create policy "owner adds track colours"
  on public.track_colours for insert to authenticated
  with check (public.is_owner());
create policy "owner changes track colours"
  on public.track_colours for update to authenticated
  using (public.is_owner()) with check (public.is_owner());
-- No policy removes a colour: a retired colour stays so old leads keep it.

-- ---------------------------------------------------------------- leads

alter table public.leads
  add column track_colour_id uuid references public.track_colours (id),
  add column track_ral_code text references public.ral_classic_colours (code),
  add constraint leads_one_track_colour check (track_colour_id is null or track_ral_code is null);

create index leads_track_colour on public.leads (track_colour_id) where track_colour_id is not null;

-- The lead guard, whole, with the owner-only track colour rule added.
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

-- The timeline, whole, with the track colour fields added.
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
      case
        when new.status = 'lost' then jsonb_build_object('reason', new.lost_reason)
        when new.status = 'follow_up' then jsonb_build_object('follow_up_on', new.follow_up_on)
      end
    );
  end if;

  select coalesce(array_agg(n.key order by n.key), array[]::text[])
    into changed
    from jsonb_each(to_jsonb(new)) as n
   where n.key = any (array[
           'first_name', 'last_name', 'phone', 'email', 'address_line', 'city',
           'postal_code', 'neighbourhood', 'lat', 'lng', 'place_id', 'house_type',
           'soffit_colour', 'soffit_note', 'est_feet', 'notes', 'source', 'assigned_to',
           'follow_up_on', 'owns_home', 'wants_price', 'christmas_lights_now', 'areas_wanted',
           'install_timing', 'track_colour_id', 'track_ral_code'
         ])
     and n.value is distinct from (to_jsonb(old) -> n.key)
     -- A status change already records the date it sets or clears.
     and not (n.key = 'follow_up_on' and new.status is distinct from old.status);

  if cardinality(changed) > 0 then
    insert into public.lead_events (lead_id, actor_id, type, payload)
    values (new.id, auth.uid(), 'edited', jsonb_build_object('fields', to_jsonb(changed)));
  end if;

  return null;
end;
$$;
