-- Round 19 (Keenan, 2026-11-13): setting a site visit, and marking it done,
-- each add a line to the lead's timeline. Written by the database whenever
-- lead_site_visits changes, so nothing that sets a visit can skip it. The
-- payload says what changed and the day, never anything else: change is
-- set (a day set or moved), cleared (the day taken off), done or not_done
-- (Done undone). The lead's own setter reads it on the timeline like any
-- other entry; the site visit table itself stays Keenan's alone.

create or replace function public.lead_site_visits_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' and new.visit_on is not null)
     or (tg_op = 'UPDATE' and new.visit_on is distinct from old.visit_on) then
    insert into public.lead_events (lead_id, actor_id, type, payload)
    values (new.lead_id, auth.uid(), 'site_visit',
            jsonb_build_object('change', case when new.visit_on is null then 'cleared' else 'set' end, 'visit_on', new.visit_on));
  end if;
  if (tg_op = 'INSERT' and new.done_at is not null)
     or (tg_op = 'UPDATE' and new.done_at is distinct from old.done_at) then
    insert into public.lead_events (lead_id, actor_id, type, payload)
    values (new.lead_id, auth.uid(), 'site_visit',
            jsonb_build_object('change', case when new.done_at is null then 'not_done' else 'done' end, 'visit_on', new.visit_on));
  end if;
  return new;
end;
$$;

revoke execute on function public.lead_site_visits_log() from public, anon, authenticated;

create trigger lead_site_visits_log
  after insert or update on public.lead_site_visits
  for each row execute function public.lead_site_visits_log();
