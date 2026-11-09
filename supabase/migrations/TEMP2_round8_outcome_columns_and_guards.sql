-- Round 8, part 2 of 3: quote outcomes and setter commission, the columns
-- and the guards (Keenan, 2026-11-09).
--
-- What:
--   - quotes: the runs that were accepted (null = every run), who accepted
--     it, the lead's status before it was accepted (for Undo), the decline
--     and cancel reasons from the fixed list, when it was cancelled, and
--     Keenan's note for Other. Owner only, like every quote column;
--   - one accepted quote per lead, kept by a unique index;
--   - leads.install_on: the planned install date. The whole sales side
--     reads it; only Keenan sets it, and the same now goes for sold_at and
--     installed_at (leads_owner_dates);
--   - earnings.source_quote_id: the quote a commission came from, kept when
--     a voided commission lets go of quote_id, so the same quote can be
--     accepted again at new numbers and carry a new commission;
--   - earnings_guard: the same rules as before, plus that one allowance
--     (quote_id may become null on an unpaid row that is being voided);
--   - quotes_outcome_guard: only the outcome functions move a quote into or
--     out of accepted, declined or cancelled, and an accepted quote's
--     numbers are locked until Keenan undoes the acceptance;
--   - leads_commission_sync: a safety net that keeps commission in step when
--     a lead's status changes by any other path (leaving Sold voids an
--     unpaid commission; Installed makes it payable; back to Sold waits for
--     the install again).
-- Why: Keenan marks a quote Accepted, Declined, Cancelled or Installed on
-- the lead page, and the lead's setter earns a share of the lights and
-- control boxes after discounts. Dollar amounts stay in quotes and
-- earnings; nothing here puts one anywhere a setter reads.
-- Additive: new columns, two indexes, new functions and triggers; the
-- earnings guard is re-created with one more allowance.

-- ---------------------------------------------------------------- quotes

alter table public.quotes
  add column accepted_runs int[]
    check (accepted_runs is null or cardinality(accepted_runs) > 0),
  add column accepted_by uuid references public.profiles (id),
  add column lead_status_before public.lead_status,
  add column decline_reason text
    check (decline_reason is null
           or decline_reason in ('price', 'timing', 'partner said no', 'went with someone else', 'other')),
  add column cancel_reason text
    check (cancel_reason is null
           or cancel_reason in ('price', 'timing', 'partner said no', 'went with someone else', 'other')),
  add column cancelled_at timestamptz,
  add column outcome_note text
    check (outcome_note is null or char_length(outcome_note) between 1 and 300);

comment on column public.quotes.accepted_runs is
  'Positions (0-based) of the runs the customer accepted, when it was a smaller option. Null = every run.';
comment on column public.quotes.accepted_by is
  'Who marked the quote accepted (Keenan). Null when the test suite''s service role stood in for him.';
comment on column public.quotes.lead_status_before is
  'The lead''s status before the quote was accepted, so Undo can put it back. Never sold, installed or lost.';
comment on column public.quotes.decline_reason is
  'Why the customer said no: price, timing, partner said no, went with someone else or other.';
comment on column public.quotes.cancel_reason is
  'Why an accepted quote was cancelled later: the same five reasons.';
comment on column public.quotes.outcome_note is
  'Keenan''s note for Other. Owner only: it never goes in lost_reason, a timeline event or a commission note.';

create unique index quotes_one_accepted_per_lead on public.quotes (lead_id) where status = 'accepted';
create index quotes_accepted_by on public.quotes (accepted_by) where accepted_by is not null;

-- ---------------------------------------------------------------- leads

alter table public.leads
  add column install_on date;

comment on column public.leads.install_on is
  'The planned install date, set by Keenan when the quote is accepted. Optional. The actual date is installed_at.';

-- Leads are read column by column since contact privacy (2026-11-04), so a
-- new column needs its own read grant.
grant select (install_on) on public.leads to authenticated;

-- ---------------------------------------------------------------- earnings

alter table public.earnings
  add column source_quote_id uuid;

comment on column public.earnings.source_quote_id is
  'The quote a commission came from. Kept when a voided commission lets go of quote_id (Undo or Cancel), so the quote can carry a new one.';

create index earnings_source_quote on public.earnings (source_quote_id) where source_quote_id is not null;

-- The same rules as M3, plus one allowance: an unpaid commission being
-- voided may let go of its quote, so that quote can be accepted again at
-- new numbers (one commission per quote is kept by a unique index).
create or replace function public.earnings_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'paid' then
    raise exception 'A paid earning never changes' using errcode = '42501';
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

-- ---------------------------------------------------------------- quote outcomes

-- Only the outcome functions (quote_accept, quote_decline, quote_cancel and
-- quote_undo_acceptance) move a quote into or out of accepted, declined or
-- cancelled; they switch vesper.quote_outcome on for their own transaction.
-- An accepted quote's numbers are locked: any change but its outcome
-- fields, notes, PDF and presented time is refused until the acceptance is
-- undone. The columns are compared as a whole, so columns added later are
-- locked too without being named here.
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

  if tg_op = 'UPDATE' and old.status = 'accepted' and new.status = 'accepted'
     and (to_jsonb(new) - free_keys) is distinct from (to_jsonb(old) - free_keys) then
    raise exception 'An accepted quote''s numbers are locked. Undo the acceptance to change them'
      using errcode = '42501', hint = 'quote_locked';
  end if;

  return new;
end;
$$;

create trigger quotes_outcome_guard
  before insert or update on public.quotes
  for each row execute function public.quotes_outcome_guard();

-- ---------------------------------------------------------------- owner-only lead dates

-- The planned install date, the sale date and the install date are Keenan's
-- to set. leads_guard runs first (triggers run in name order) and itself
-- sets or clears sold_at and installed_at when the status changes, so this
-- compares what it left: a setter's own moves between New, Follow up and
-- Lost never touch those dates and still work.
create or replace function public.leads_owner_dates()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or public.is_owner() then
    return new;
  end if;
  if (tg_op = 'INSERT'
      and (new.install_on is not null or new.sold_at is not null or new.installed_at is not null))
     or (tg_op = 'UPDATE'
         and (new.install_on is distinct from old.install_on
              or new.sold_at is distinct from old.sold_at
              or new.installed_at is distinct from old.installed_at)) then
    raise exception 'Only the admin sets the install and sale dates'
      using errcode = '42501', hint = 'not_allowed';
  end if;
  return new;
end;
$$;

create trigger leads_owner_dates
  before insert or update on public.leads
  for each row execute function public.leads_owner_dates();

-- ---------------------------------------------------------------- commission safety net

-- The outcome functions keep commission in step themselves. This catches a
-- lead's status changing by any other path: leaving Sold or Installed for
-- anything else voids every unpaid commission on the lead (and lets go of
-- its quote); Installed makes them payable; Installed back to Sold makes
-- them wait for the install again. A paid commission is never touched.
create or replace function public.leads_commission_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status in ('sold', 'installed') and new.status not in ('sold', 'installed') then
    update public.earnings
       set status = 'void', note = 'The lead left Sold', quote_id = null
     where lead_id = new.id and type = 'commission' and status = 'pending';
  elsif new.status = 'installed' then
    update public.earnings
       set payable_at = coalesce(payable_at, now())
     where lead_id = new.id and type = 'commission' and status = 'pending';
  elsif old.status = 'installed' and new.status = 'sold' then
    update public.earnings
       set payable_at = null
     where lead_id = new.id and type = 'commission' and status = 'pending';
  end if;
  return null;
end;
$$;

create trigger leads_commission_sync
  after update of status on public.leads
  for each row
  when (old.status is distinct from new.status)
  execute function public.leads_commission_sync();

-- Trigger functions only: nobody calls them directly.
revoke execute on function public.earnings_guard() from public, anon, authenticated;
revoke execute on function public.quotes_outcome_guard() from public, anon, authenticated;
revoke execute on function public.leads_owner_dates() from public, anon, authenticated;
revoke execute on function public.leads_commission_sync() from public, anon, authenticated;
