-- Round 12 (Keenan, 2026-11-11): the meeting carries the real answer to
-- "everyone who decides will be there". Since round 2 every booking wrote
-- meetings.everyone_deciding_present = true, and its check needs true, so
-- a No, or a booking made before the question was asked (book now, finish
-- later), was recorded as a yes. Keenan approved relaxing that rule; the
-- rule can't be removed additively, so it stays as it is, the old column
-- keeps saying true and nothing reads it, and the answer lives in a new
-- column, filled by a trigger from the lead's own answer at booking and
-- kept in step when the lead's answer changes before the meeting starts.
-- No data is removed. Booking is still not blocked by it, and neither
-- booking pay nor Qualified reads it: Keenan decides those himself.

alter table public.meetings
  add column everyone_deciding text default 'not_asked'
    check (everyone_deciding in ('yes', 'no', 'not_asked'));

comment on column public.meetings.everyone_deciding is
  'Round 12: the lead''s answer to "everyone who decides will be there" as the meeting carries it: yes, no or not_asked. The old everyone_deciding_present column always says true and is no longer read.';

-- The answer a lead has now, in the meeting's words.
create or replace function public.everyone_deciding_of(p_lead uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case l.both_decision_makers when true then 'yes' when false then 'no' else 'not_asked' end
    from public.leads l
   where l.id = p_lead;
$$;
revoke execute on function public.everyone_deciding_of(uuid) from public, anon, authenticated;

-- Every meeting made before this round takes the lead's answer as it is now.
update public.meetings m
   set everyone_deciding = public.everyone_deciding_of(m.lead_id)
 where m.everyone_deciding is null or m.everyone_deciding = 'not_asked';

-- A new meeting takes the lead's answer the moment it is booked (or moved),
-- without changing book_meeting or move_meeting.
create or replace function public.meetings_take_everyone_deciding()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.everyone_deciding := coalesce(public.everyone_deciding_of(new.lead_id), 'not_asked');
  return new;
end;
$$;
revoke execute on function public.meetings_take_everyone_deciding() from public, anon, authenticated;

create trigger meetings_take_everyone_deciding
  before insert on public.meetings
  for each row execute function public.meetings_take_everyone_deciding();

-- When the lead's answer changes (finished later, or corrected), the
-- meetings that haven't started yet follow it.
create or replace function public.leads_sync_everyone_deciding()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.both_decision_makers is distinct from old.both_decision_makers then
    update public.meetings
       set everyone_deciding = case new.both_decision_makers when true then 'yes' when false then 'no' else 'not_asked' end
     where lead_id = new.id
       and starts_at > now()
       and status not in ('moved', 'cancelled');
  end if;
  return new;
end;
$$;
revoke execute on function public.leads_sync_everyone_deciding() from public, anon, authenticated;

create trigger leads_sync_everyone_deciding
  after update of both_decision_makers on public.leads
  for each row execute function public.leads_sync_everyone_deciding();
