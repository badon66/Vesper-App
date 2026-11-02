-- M5: meeting mode's timeline events come from the database (2026-11-02).
--
-- Why: the quote draft and the colour initials each wrote their timeline
-- event from the app, but lead_events only accepts notes from people;
-- every other event is written by a trigger. Those inserts were refused,
-- so a confirmed colour left no event. Two triggers now write them, the
-- way every other event is written, and the app no longer tries.
--
-- What: quote_created when a quote is added (its id only: dollar amounts
-- never reach the timeline, which sales users read), and colour_confirmed
-- each time the customer initials the colour, with the initials and the
-- colour by name as it stood at that moment. Additive: two functions and
-- two triggers; nothing is replaced or removed.

create or replace function public.quotes_log_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.lead_events (lead_id, actor_id, type, payload)
  values (new.lead_id, auth.uid(), 'quote_created', jsonb_build_object('quote_id', new.id));
  return null;
end;
$$;

create trigger quotes_log_created
  after insert on public.quotes
  for each row execute function public.quotes_log_created();

create or replace function public.leads_log_colour_confirmed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  colour text;
begin
  if new.track_colour_id is not null then
    select c.name into colour from public.track_colours c where c.id = new.track_colour_id;
  elsif new.track_ral_code is not null then
    select 'RAL ' || r.code || ' ' || r.name into colour
      from public.ral_classic_colours r where r.code = new.track_ral_code;
    colour := coalesce(colour, 'RAL ' || new.track_ral_code);
  end if;
  insert into public.lead_events (lead_id, actor_id, type, payload)
  values (
    new.id, auth.uid(), 'colour_confirmed',
    jsonb_build_object('initials', new.track_colour_initials, 'colour', colour)
  );
  return null;
end;
$$;

create trigger leads_log_colour_confirmed
  after update of track_colour_initials, track_colour_initialled_at on public.leads
  for each row
  when (
    new.track_colour_initials is not null
    and new.track_colour_initialled_at is distinct from old.track_colour_initialled_at
  )
  execute function public.leads_log_colour_confirmed();

-- Trigger functions only: nobody calls them directly.
revoke execute on function public.quotes_log_created() from public, anon, authenticated;
revoke execute on function public.leads_log_colour_confirmed() from public, anon, authenticated;