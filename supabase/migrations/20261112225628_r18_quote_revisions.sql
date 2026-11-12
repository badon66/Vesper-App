-- Round 18 part 6 (Keenan, 2026-11-12): Keenan can change a quote after a
-- yes. An accepted quote stays editable by him; a save updates the quote
-- and the customer's link at once. The lead's timeline records each change
-- with the old and new totals, on his side only: quote_revisions is owner
-- only, since totals never go where setters read (lead_events). The signed
-- agreement keeps its own copy and never changes. Commission follows the
-- new numbers until it is paid; a paid commission is left alone and the
-- Pay page shows him the difference.
--
-- Only quote_revise changes an accepted quote's numbers: it switches
-- vesper.quote_revise on for its own transaction, which the two guards let
-- through (the quote's numbers, and a pending commission's amount and
-- base). Everything else about both guards is as it was.

create table public.quote_revisions (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes (id),
  lead_id uuid not null references public.leads (id),
  revised_by uuid references public.profiles (id),
  revised_at timestamptz not null default now(),
  total_before numeric(10,2) not null,
  total_after numeric(10,2) not null,
  changes jsonb not null default '[]'::jsonb check (jsonb_typeof(changes) = 'array')
);

comment on table public.quote_revisions is
  'Changes Keenan made to a quote after it was accepted (round 18): the totals before and after (before GST) and what changed, in the customer''s words. Owner only.';

create index quote_revisions_quote on public.quote_revisions (quote_id, revised_at);
create index quote_revisions_lead on public.quote_revisions (lead_id, revised_at);

alter table public.quote_revisions enable row level security;

create policy quote_revisions_owner_read on public.quote_revisions
  for select to authenticated
  using (public.is_owner());

revoke all on public.quote_revisions from anon;
revoke insert, update on public.quote_revisions from authenticated;
grant select on public.quote_revisions to authenticated;

-- ---------------------------------------------------------------- the quote's guard

create or replace function public.quotes_outcome_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  outcomes public.quote_status[] := array['accepted', 'declined', 'cancelled']::public.quote_status[];
  free_keys text[] := array[
    'status', 'accepted_at', 'accepted_by', 'accepted_runs', 'lead_status_before',
    'decline_reason', 'cancel_reason', 'cancelled_at', 'declined_at', 'outcome_note',
    'notes', 'pdf_path', 'presented_at', 'updated_at'
  ];
begin
  if coalesce(current_setting('vesper.quote_outcome', true), '') <> 'on' then
    if (tg_op = 'INSERT' and new.status = any (outcomes))
       or (tg_op = 'UPDATE' and new.status is distinct from old.status
           and (new.status = any (outcomes) or old.status = any (outcomes))) then
      raise exception 'A quote''s outcome is marked from the lead page'
        using errcode = '42501', hint = 'outcome_only';
    end if;
  end if;

  -- One quote stands for a sale: no new quote while one is accepted.
  if tg_op = 'INSERT'
     and exists (select 1 from public.quotes x where x.lead_id = new.lead_id and x.status = 'accepted') then
    raise exception 'This lead''s quote is accepted. Undo the acceptance on the lead page to change it'
      using errcode = '42501', hint = 'quote_locked';
  end if;

  -- Round 18: quote_revise may change an accepted quote's numbers.
  if tg_op = 'UPDATE' and old.status = 'accepted' and new.status = 'accepted'
     and coalesce(current_setting('vesper.quote_revise', true), '') <> 'on'
     and (to_jsonb(new) - free_keys) is distinct from (to_jsonb(old) - free_keys) then
    raise exception 'An accepted quote''s numbers are changed from the lead page''s quote editor'
      using errcode = '42501', hint = 'quote_locked';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------- the earnings guard

create or replace function public.earnings_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'paid' then
    raise exception 'A paid earning never changes' using errcode = '42501';
  end if;
  -- Round 18: a pending commission follows its quote's new numbers when
  -- quote_revise changes them: its amount and base, nothing else.
  if coalesce(current_setting('vesper.quote_revise', true), '') = 'on'
     and old.type = 'commission' and old.status = 'pending' and new.status = 'pending'
     and new.profile_id = old.profile_id and new.lead_id = old.lead_id and new.type = old.type
     and new.rate = old.rate and new.quote_id is not distinct from old.quote_id then
    return new;
  end if;
  if new.profile_id <> old.profile_id or new.lead_id <> old.lead_id or new.type <> old.type
     or new.rate <> old.rate or new.amount <> old.amount
     or new.base_amount is distinct from old.base_amount
     or (new.quote_id is distinct from old.quote_id
         and not (new.quote_id is null and new.status = 'void')) then
    raise exception 'An earning''s amount, rate, type, setter and lead never change' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------- quote_revise

-- Keenan saves an accepted quote (lib/quotes/revise.ts works out what
-- changed, from the option they said yes to, before and after). Under one
-- lock: the quote's numbers from p_fields (the columns a draft's save
-- writes; never its status, outcome, track colour or the table's choice),
-- the accepted option's runs and boxes from the new offers (the option
-- must still be on the quote, shown), a pending commission at its own rate
-- on the new numbers, and the record of what changed. A paid commission is
-- left alone: the result says so, and the Pay page shows the difference.
create or replace function public.quote_revise(
  p_quote uuid,
  p_fields jsonb,
  p_changes jsonb,
  p_total_before numeric,
  p_total_after numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  q public.quotes;
  l public.leads;
  n public.quotes;
  offer jsonb;
  run_count int;
  v_runs int[];
  v_boxes int;
  pending public.earnings;
  v_base numeric(10,2);
  v_amount numeric(10,2);
  v_commission jsonb := null;
  v_paid boolean := false;
  v_changes jsonb := case when jsonb_typeof(p_changes) = 'array' then p_changes else '[]'::jsonb end;
  v_updated timestamptz;
begin
  if not public.acts_as_owner() then
    raise exception 'Only Keenan changes a quote' using errcode = '42501', hint = 'not_allowed';
  end if;
  if jsonb_typeof(p_fields) is distinct from 'object' then
    raise exception 'Nothing to save' using errcode = 'P0001', hint = 'bad_input';
  end if;

  select * into q from public.quotes where id = p_quote;
  if not found or q.status <> 'accepted' then
    raise exception 'This quote isn''t accepted' using errcode = 'P0001', hint = 'not_accepted';
  end if;
  select * into l from public.leads where id = q.lead_id for update;
  select * into q from public.quotes where id = p_quote for update;

  perform set_config('vesper.quote_revise', 'on', true);
  update public.quotes
     set runs = case when jsonb_typeof(p_fields -> 'runs') = 'array' then p_fields -> 'runs' else runs end,
         offers = case when jsonb_typeof(p_fields -> 'offers') = 'array' then p_fields -> 'offers' else offers end,
         adders = case when jsonb_typeof(p_fields -> 'adders') = 'array' then p_fields -> 'adders' else adders end,
         discounts = case when jsonb_typeof(p_fields -> 'discounts') = 'array' then p_fields -> 'discounts' else discounts end,
         box_count = coalesce((p_fields ->> 'box_count')::int, box_count),
         price_per_ft = coalesce((p_fields ->> 'price_per_ft')::numeric, price_per_ft),
         box_price = coalesce((p_fields ->> 'box_price')::numeric, box_price),
         total_feet = coalesce(round((p_fields ->> 'total_feet')::numeric)::int, total_feet),
         colour_timing = case when p_fields ? 'colour_timing' then p_fields ->> 'colour_timing' else colour_timing end,
         rush_fee = case when p_fields ? 'rush_fee' then (p_fields ->> 'rush_fee')::numeric else rush_fee end,
         upper_access_fee = case when p_fields ? 'upper_access_fee' then (p_fields ->> 'upper_access_fee')::numeric else upper_access_fee end,
         upper_gable_access_fee = case when p_fields ? 'upper_gable_access_fee' then (p_fields ->> 'upper_gable_access_fee')::numeric else upper_gable_access_fee end,
         min_job_total = case when p_fields ? 'min_job_total' then (p_fields ->> 'min_job_total')::numeric else min_job_total end,
         financing_offered = coalesce((p_fields ->> 'financing_offered')::boolean, financing_offered),
         valid_until = case when p_fields ? 'valid_until' then (p_fields ->> 'valid_until')::date else valid_until end,
         subtotal = coalesce((p_fields ->> 'subtotal')::numeric, subtotal),
         gst = coalesce((p_fields ->> 'gst')::numeric, gst),
         total = coalesce((p_fields ->> 'total')::numeric, total)
   where id = q.id
   returning * into n;

  -- The option they said yes to: still on the quote, shown, covering a run.
  if n.accepted_offer is not null then
    select o.value into offer
      from jsonb_array_elements(public.quote_offers_clean(n)) as o (value)
     where o.value ->> 'id' = n.accepted_offer
     limit 1;
    if offer is null or offer -> 'hidden' = 'true'::jsonb then
      raise exception 'The option they said yes to has to stay on the quote, shown to them'
        using errcode = 'P0001', hint = 'bad_offer';
    end if;
    select coalesce(array_agg((p.value)::int order by (p.value)::int), array[]::int[]) into v_runs
      from jsonb_array_elements_text(offer -> 'runs') as p (value);
    if cardinality(v_runs) = 0 then
      raise exception 'The option they said yes to needs a measured area'
        using errcode = 'P0001', hint = 'bad_offer';
    end if;
    run_count := case when jsonb_typeof(n.runs) = 'array' then jsonb_array_length(n.runs) else 0 end;
    if cardinality(v_runs) = run_count then
      v_runs := null;
    end if;
    v_boxes := coalesce((offer ->> 'boxes')::int, n.box_count);
    update public.quotes set accepted_runs = v_runs, accepted_boxes = v_boxes where id = n.id;
  else
    v_runs := n.accepted_runs;
    v_boxes := coalesce(n.accepted_boxes, n.box_count);
  end if;

  -- The commission follows the new numbers until it is paid.
  select * into pending
    from public.earnings e
   where e.quote_id = n.id and e.type = 'commission' and e.status = 'pending'
   order by e.created_at desc
   limit 1;
  if found then
    v_base := coalesce(public.quote_commission_base_boxes(n.id, v_runs, v_boxes), 0);
    v_amount := round(v_base * pending.rate, 2);
    if v_amount is distinct from pending.amount or v_base is distinct from pending.base_amount then
      update public.earnings set amount = v_amount, base_amount = v_base where id = pending.id;
    end if;
    v_commission := jsonb_build_object('before', pending.amount, 'after', v_amount);
  else
    v_paid := exists (
      select 1 from public.earnings e
       where e.quote_id = n.id and e.type = 'commission' and e.status = 'paid');
  end if;

  if jsonb_array_length(v_changes) > 0 or round(coalesce(p_total_before, 0), 2) <> round(coalesce(p_total_after, 0), 2) then
    insert into public.quote_revisions (quote_id, lead_id, revised_by, total_before, total_after, changes)
    values (n.id, n.lead_id, auth.uid(), round(coalesce(p_total_before, 0), 2), round(coalesce(p_total_after, 0), 2), v_changes);
  end if;

  perform set_config('vesper.quote_revise', 'off', true);
  select x.updated_at into v_updated from public.quotes x where x.id = n.id;
  return jsonb_build_object('ok', true, 'updated_at', v_updated, 'commission', v_commission, 'paid', v_paid);
end;
$$;

revoke execute on function public.quote_revise(uuid, jsonb, jsonb, numeric, numeric) from public, anon;
grant execute on function public.quote_revise(uuid, jsonb, jsonb, numeric, numeric) to authenticated, service_role;
