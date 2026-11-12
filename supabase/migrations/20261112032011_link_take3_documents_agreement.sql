-- Quote link take 3, parts 3 and 4 (Keenan, 2026-11-11): documents on the
-- customer's link, and the agreement they sign there.
--
-- Documents. Keenan uploads a standard set once in Settings, Documents
-- (link_documents: a name and a file each; Remove retires one, so a lead
-- that showed it simply stops showing it). On each lead he ticks which of
-- them that customer's link shows and can upload files for that customer
-- only (lead_link_documents; unticking or removing one sets removed_at, as
-- the mockups do, so nothing is ever taken out of a table). Files live in
-- the private link-documents bucket: Keenan reads and adds to it; a
-- request carrying a live link's token (the x-quote-token header, as for
-- the mockups) can sign only the files that link shows, for ten minutes.
-- Nothing ticked or uploaded, no Documents section.
--
-- The agreement. Keenan writes its text in Settings (settings.agreement_text)
-- and ticks Agreement to sign on a lead (lead_link_options). Only then does
-- the link show it: the customer reads it, types their name, signs with a
-- finger and taps Sign. quote_link_sign_agreement saves the signing
-- (agreement_signatures): their name, the signature, the time, the
-- agreement's text and the quote as it stood (a copy of its prices, offers
-- and lines, so the signed copy never changes when the quote does), with
-- the option they chose, worked out here from the quote, never from
-- anything the page sends but the option's id. The PDF is made from that
-- record, so the customer can't send in a total. One signing per link;
-- sending a new link allows a new one. Signing also books that option, the
-- same as Book my install, and Keenan is told.
--
-- Everything here is Keenan's: owner-only tables (a copy of a quote's
-- prices lives in agreement_signatures, as in quotes, which sales can't
-- read), and anonymous callers reach only the token functions below.
-- Additive: one settings column, one bucket, four tables, functions and
-- storage policies.

alter table public.settings
  add column agreement_text text check (agreement_text is null or char_length(agreement_text) <= 20000);
comment on column public.settings.agreement_text is
  'The agreement customers sign on their quote link. Empty: Agreement to sign stays off on every lead.';

-- ---------------------------------------------------------------- storage

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('link-documents', 'link-documents', false, 26214400,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "owner reads link documents"
  on storage.objects for select to authenticated
  using (bucket_id = 'link-documents' and public.is_owner());
create policy "owner uploads link documents"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'link-documents' and public.is_owner());

-- ---------------------------------------------------------------- tables

create table public.link_documents (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  storage_path text not null unique check (storage_path like 'library/%'),
  content_type text not null check (content_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  position int not null default 0,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) default auth.uid()
);
comment on table public.link_documents is
  'Keenan''s standard documents for quote links (warranty, how it works, FAQ). Retired ones show nowhere.';

create table public.lead_link_documents (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id),
  document_id uuid references public.link_documents (id),
  name text check (name is null or char_length(btrim(name)) between 1 and 80),
  storage_path text unique check (storage_path is null or storage_path like 'leads/%'),
  content_type text check (content_type is null or content_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) default auth.uid(),
  constraint lead_link_documents_kind check (
    (document_id is not null and storage_path is null)
    or (document_id is null and storage_path is not null and name is not null and content_type is not null)
  )
);
create unique index lead_link_documents_one_tick
  on public.lead_link_documents (lead_id, document_id) where document_id is not null;
create index lead_link_documents_lead on public.lead_link_documents (lead_id);
comment on table public.lead_link_documents is
  'What a lead''s quote link shows: a ticked standard document (document_id) or a file for this customer only (storage_path).';

create table public.lead_link_options (
  lead_id uuid primary key references public.leads (id),
  agreement_to_sign boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) default auth.uid()
);
comment on table public.lead_link_options is
  'Per lead quote link options: Agreement to sign.';

create table public.agreement_signatures (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id),
  link_id uuid references public.quote_links (id),
  quote_id uuid references public.quotes (id),
  offer_id text not null,
  offer_name text not null,
  signer_name text not null check (char_length(btrim(signer_name)) between 2 and 120),
  signature_png text not null check (signature_png like 'data:image/png;base64,%' and char_length(signature_png) <= 400000),
  agreement_text text not null,
  quote_snapshot jsonb not null,
  lead_snapshot jsonb not null,
  signed_at timestamptz not null default now()
);
create index agreement_signatures_lead on public.agreement_signatures (lead_id, signed_at desc);
create unique index agreement_signatures_one_per_link on public.agreement_signatures (link_id) where link_id is not null;
comment on table public.agreement_signatures is
  'Agreements signed on quote links, with the quote as it stood when signed. The signed PDF is made from this record.';

alter table public.link_documents enable row level security;
alter table public.lead_link_documents enable row level security;
alter table public.lead_link_options enable row level security;
alter table public.agreement_signatures enable row level security;

revoke all on public.link_documents from anon, public;
revoke all on public.lead_link_documents from anon, public;
revoke all on public.lead_link_options from anon, public;
revoke all on public.agreement_signatures from anon, public;

grant select, insert, update on public.link_documents to authenticated;
grant select, insert, update on public.lead_link_documents to authenticated;
grant select, insert, update on public.lead_link_options to authenticated;
-- Signed agreements are written only by the token function below.
grant select on public.agreement_signatures to authenticated;

create policy "owner reads link documents" on public.link_documents
  for select to authenticated using (public.is_owner());
create policy "owner adds link documents" on public.link_documents
  for insert to authenticated with check (public.is_owner());
create policy "owner changes link documents" on public.link_documents
  for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "owner reads a lead's link documents" on public.lead_link_documents
  for select to authenticated using (public.is_owner());
create policy "owner adds a lead's link documents" on public.lead_link_documents
  for insert to authenticated with check (public.is_owner());
create policy "owner changes a lead's link documents" on public.lead_link_documents
  for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "owner reads a lead's link options" on public.lead_link_options
  for select to authenticated using (public.is_owner());
create policy "owner adds a lead's link options" on public.lead_link_options
  for insert to authenticated with check (public.is_owner());
create policy "owner changes a lead's link options" on public.lead_link_options
  for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "owner reads signed agreements" on public.agreement_signatures
  for select to authenticated using (public.is_owner());

-- ---------------------------------------------------------------- the link's documents

-- The documents a live link shows: the ticked standard ones (not retired),
-- in Keenan's order, then this customer's own, oldest first.
create or replace function public.quote_link_documents(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  link public.quote_links;
  result jsonb;
begin
  link := public.quote_link_live(p_token);
  if link.id is null then
    return '[]'::jsonb;
  end if;
  select coalesce(jsonb_agg(d.doc order by d.kind, d.pos, d.sort_name, d.made), '[]'::jsonb) into result
    from (
      select jsonb_build_object('id', ld.id, 'name', ld.name, 'path', ld.storage_path,
                                'content_type', ld.content_type, 'size', ld.size_bytes) as doc,
             0 as kind, ld.position as pos, lower(ld.name) as sort_name, ld.created_at as made
        from public.lead_link_documents t
        join public.link_documents ld on ld.id = t.document_id
       where t.lead_id = link.lead_id
         and t.removed_at is null
         and ld.retired_at is null
      union all
      select jsonb_build_object('id', t.id, 'name', t.name, 'path', t.storage_path,
                                'content_type', t.content_type, 'size', t.size_bytes),
             1, 0, '', t.created_at
        from public.lead_link_documents t
       where t.lead_id = link.lead_id
         and t.removed_at is null
         and t.storage_path is not null
    ) d;
  return result;
end;
$$;

-- Storage signs a document for a request carrying a live token only when
-- that link shows it.
create or replace function public.quote_document_signable(p_name text)
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
             from public.lead_link_documents t
            where t.lead_id = link.lead_id
              and t.removed_at is null
              and t.storage_path = p_name)
      or exists (
           select 1
             from public.lead_link_documents t
             join public.link_documents ld on ld.id = t.document_id
            where t.lead_id = link.lead_id
              and t.removed_at is null
              and ld.retired_at is null
              and ld.storage_path = p_name);
end;
$$;

create policy "a live quote link signs its own documents"
  on storage.objects for select to anon
  using (bucket_id = 'link-documents' and public.quote_document_signable(name));

-- ---------------------------------------------------------------- the agreement

-- What the link shows of the agreement: null unless the lead has Agreement
-- to sign on and Settings has its text; then the text, and the signing on
-- this link if there is one.
create or replace function public.quote_link_agreement(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  link public.quote_links;
  v_text text;
  v_on boolean;
  sig public.agreement_signatures;
begin
  link := public.quote_link_live(p_token);
  if link.id is null then
    return null;
  end if;
  select nullif(btrim(coalesce(s.agreement_text, '')), '') into v_text from public.settings s where s.id = 1;
  select o.agreement_to_sign into v_on from public.lead_link_options o where o.lead_id = link.lead_id;
  if v_text is null or coalesce(v_on, false) = false then
    return null;
  end if;
  select * into sig from public.agreement_signatures a where a.link_id = link.id order by a.signed_at desc limit 1;
  return jsonb_build_object(
    'text', v_text,
    'signed', case when sig.id is null then null else jsonb_build_object(
      'signer_name', sig.signer_name,
      'signed_at', sig.signed_at,
      'offer_id', sig.offer_id,
      'offer_name', sig.offer_name) end
  );
end;
$$;

-- Sign: their typed name, their finger signature (a PNG) and the option on
-- screen. Saves the signing with a copy of the quote and the agreement as
-- they stood, books that option as Book my install does, and hands back
-- who to tell (sealed, as for Book my install).
create or replace function public.quote_link_sign_agreement(p_token text, p_name text, p_offer text, p_signature text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  link public.quote_links;
  q public.quotes;
  s public.settings;
  v_lead public.leads;
  v_text text;
  v_on boolean;
  shown jsonb;
  offer jsonb;
  v_name text;
  v_id uuid;
  v_targets jsonb := '[]'::jsonb;
begin
  link := public.quote_link_live(p_token);
  if link.id is null then
    return jsonb_build_object('ok', false, 'state', 'expired');
  end if;
  select * into s from public.settings st where st.id = 1;
  v_text := nullif(btrim(coalesce(s.agreement_text, '')), '');
  select o.agreement_to_sign into v_on from public.lead_link_options o where o.lead_id = link.lead_id;
  if v_text is null or coalesce(v_on, false) = false then
    return jsonb_build_object('ok', false, 'state', 'not_offered');
  end if;
  if exists (select 1 from public.agreement_signatures a where a.link_id = link.id) then
    return jsonb_build_object('ok', false, 'state', 'already_signed');
  end if;
  v_name := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  if char_length(v_name) < 2 or char_length(v_name) > 120 then
    return jsonb_build_object('ok', false, 'state', 'bad_name');
  end if;
  if p_signature is null
     or p_signature not like 'data:image/png;base64,%'
     or char_length(p_signature) < 200
     or char_length(p_signature) > 400000 then
    return jsonb_build_object('ok', false, 'state', 'bad_signature');
  end if;
  q := public.quote_link_current_quote(link.lead_id);
  if q.id is null then
    return jsonb_build_object('ok', false, 'state', 'expired');
  end if;
  shown := public.quote_offers_shown(q);
  select o.value into offer from jsonb_array_elements(shown) as o (value) where o.value ->> 'id' = p_offer limit 1;
  if offer is null then
    return jsonb_build_object('ok', false, 'state', 'no_offer');
  end if;
  select * into v_lead from public.leads l where l.id = link.lead_id;

  insert into public.agreement_signatures (
    lead_id, link_id, quote_id, offer_id, offer_name, signer_name, signature_png,
    agreement_text, quote_snapshot, lead_snapshot
  ) values (
    link.lead_id, link.id, q.id, offer ->> 'id', left(offer ->> 'name', 60), v_name, p_signature,
    v_text,
    jsonb_build_object(
      'runs', q.runs,
      'offers', shown,
      'price_per_ft', q.price_per_ft,
      'box_price', q.box_price,
      'box_count', q.box_count,
      'adders', q.adders,
      'discounts', q.discounts,
      'colour_timing', q.colour_timing,
      'rush_fee', q.rush_fee,
      'upper_access_fee', q.upper_access_fee,
      'upper_gable_access_fee', q.upper_gable_access_fee,
      'min_job_total', q.min_job_total,
      'gst_enabled', q.gst_enabled,
      'gst_rate', q.gst_rate,
      'gst_number', coalesce(q.gst_number, s.gst_number),
      'track_colour_name', q.track_colour_name,
      'track_custom', q.track_custom,
      'valid_until', q.valid_until,
      'company', s.company,
      'warranty', s.warranty_text
    ),
    jsonb_build_object(
      'first_name', v_lead.first_name,
      'last_name', v_lead.last_name,
      'address', v_lead.address_line,
      'city', v_lead.city
    )
  )
  returning id into v_id;

  -- Their name and the option's name on the timeline, never a price.
  insert into public.lead_events (lead_id, actor_id, type, payload)
  values (link.lead_id, null, 'agreement_signed', jsonb_build_object('option', left(offer ->> 'name', 60), 'signer', v_name));

  -- The option they signed for is booked, as Book my install does.
  perform public.quote_link_book_offer(p_token, offer ->> 'id');

  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'sealed', p.sealed)), '[]'::jsonb)
    into v_targets
    from public.push_subscriptions p
   where p.profile_id = link.created_by
     and p.removed_at is null;

  return jsonb_build_object(
    'ok', true,
    'id', v_id,
    'option', offer ->> 'name',
    'name', btrim(v_lead.first_name || ' ' || coalesce(v_lead.last_name, '')),
    'lead_id', link.lead_id,
    'targets', v_targets
  );
end;
$$;

-- The signing on this link, for the customer's own signed copy.
create or replace function public.quote_link_signed_copy(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  link public.quote_links;
  sig public.agreement_signatures;
begin
  link := public.quote_link_live(p_token);
  if link.id is null then
    return null;
  end if;
  select * into sig from public.agreement_signatures a where a.link_id = link.id order by a.signed_at desc limit 1;
  if sig.id is null then
    return null;
  end if;
  return jsonb_build_object(
    'id', sig.id,
    'signer_name', sig.signer_name,
    'signed_at', sig.signed_at,
    'offer_id', sig.offer_id,
    'offer_name', sig.offer_name,
    'signature_png', sig.signature_png,
    'agreement_text', sig.agreement_text,
    'quote', sig.quote_snapshot,
    'lead', sig.lead_snapshot
  );
end;
$$;

revoke execute on function public.quote_link_documents(text) from public;
revoke execute on function public.quote_document_signable(text) from public;
revoke execute on function public.quote_link_agreement(text) from public;
revoke execute on function public.quote_link_sign_agreement(text, text, text, text) from public;
revoke execute on function public.quote_link_signed_copy(text) from public;
grant execute on function public.quote_link_documents(text) to anon, authenticated, service_role;
grant execute on function public.quote_document_signable(text) to anon, authenticated, service_role;
grant execute on function public.quote_link_agreement(text) to anon, authenticated, service_role;
grant execute on function public.quote_link_sign_agreement(text, text, text, text) to anon, authenticated, service_role;
grant execute on function public.quote_link_signed_copy(text) to anon, authenticated, service_role;
