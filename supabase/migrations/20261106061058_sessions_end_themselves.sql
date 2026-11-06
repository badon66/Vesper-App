-- Sessions left open, and one spelling per neighbourhood (Keenan,
-- 2026-11-05, after three sessions were never ended and "Cortina" came in
-- as "Cortina" and "cortina"). Additive, approved up front.
--
-- 1. A session still open at midnight Calgary time ends itself, at its last
--    tap if it has one, otherwise at its start, and says it ended
--    automatically. The last tap is now recorded; a scheduled job checks
--    every five minutes, and the per-person close the app already runs on
--    Session and at Start uses the same rule.
-- 2. A session's neighbourhood keeps the spelling of the first one entered,
--    whatever the capital letters, and tonight's "cortina" becomes
--    "Cortina", as Keenan asked.

-- ---------------------------------------------------------------- the last tap, and how it ended

alter table public.knock_sessions
  add column last_tap_at timestamptz,
  add column ended_automatically boolean not null default false;

comment on column public.knock_sessions.last_tap_at is
  'When a counter was last tapped (round 4). A session left open ends here, or at its start with no taps.';
comment on column public.knock_sessions.ended_automatically is
  'True when the session was still open at midnight Calgary time and ended itself (round 4).';

-- Sessions open now that have taps: their last change is the best record of
-- their last tap (judgment call, docs/decisions.md 2026-11-06).
update public.knock_sessions
   set last_tap_at = updated_at
 where ended_at is null
   and last_tap_at is null
   and (doors_knocked > 0 or conversations > 0);

-- Adds to the counters of the caller's own open session in one atomic
-- statement, never below zero, and records when it was tapped.
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
         conversations = greatest(0, conversations + greatest(-100, least(100, coalesce(p_conversations, 0)))),
         last_tap_at = now()
   where id = p_session
     and user_id = auth.uid()
     and ended_at is null
  returning *;
$$;

-- The caller's own sessions left open on an earlier Calgary day end at
-- their last tap, or at their start with no taps, marked as ended
-- automatically. Runs when the person opens Session and when they start.
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
     set ended_at = greatest(started_at, coalesce(last_tap_at, started_at)),
         ended_automatically = true
   where user_id = auth.uid()
     and ended_at is null
     and started_at < (date_trunc('day', now() at time zone 'America/Edmonton') at time zone 'America/Edmonton');
  get diagnostics closed = row_count;
  return closed;
end;
$$;

-- Everyone's sessions still open from an earlier Calgary day, the same way.
-- Run by the scheduled job below; nobody signed in can call it.
create or replace function public.end_open_knock_sessions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  closed integer;
begin
  update public.knock_sessions
     set ended_at = greatest(started_at, coalesce(last_tap_at, started_at)),
         ended_automatically = true
   where ended_at is null
     and started_at < (date_trunc('day', now() at time zone 'America/Edmonton') at time zone 'America/Edmonton');
  get diagnostics closed = row_count;
  return closed;
end;
$$;

revoke execute on function public.end_open_knock_sessions() from public, anon, authenticated;
grant execute on function public.end_open_knock_sessions() to service_role;

-- ---------------------------------------------------------------- one spelling per neighbourhood

-- A neighbourhood typed with different capital letters (or extra spaces)
-- takes the spelling of the first session that used it. Security definer
-- so it sees the whole team's sessions; it changes only the new row.
create or replace function public.knock_sessions_neighbourhood_spelling()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  first_spelling text;
begin
  new.neighbourhood := btrim(regexp_replace(new.neighbourhood, '\s+', ' ', 'g'));
  select k.neighbourhood
    into first_spelling
    from public.knock_sessions k
   where lower(k.neighbourhood) = lower(new.neighbourhood)
     and k.id is distinct from new.id
   order by k.created_at, k.id
   limit 1;
  if first_spelling is not null then
    new.neighbourhood := first_spelling;
  end if;
  return new;
end;
$$;

revoke execute on function public.knock_sessions_neighbourhood_spelling() from public, anon, authenticated;

create trigger knock_sessions_neighbourhood_spelling
  before insert or update of neighbourhood on public.knock_sessions
  for each row execute function public.knock_sessions_neighbourhood_spelling();

create index if not exists knock_sessions_neighbourhood_key on public.knock_sessions (lower(neighbourhood));

-- Tonight's "cortina" (2026-11-05), as Keenan asked.
update public.knock_sessions
   set neighbourhood = 'Cortina'
 where neighbourhood = 'cortina';

-- ---------------------------------------------------------------- the scheduled job

-- Every five minutes, so a session open at midnight ends within minutes,
-- whatever the clocks do; each run only touches sessions from an earlier day.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;

select cron.schedule(
  'end-open-knock-sessions',
  '*/5 * * * *',
  $job$select public.end_open_knock_sessions()$job$
);
