-- Round 4 follow-up (2026-11-06, from the review before merge): the
-- first-spelling rule applies when a session gets a neighbourhood (a new
-- session, or one moved to a different place). An update that only changes
-- the capital letters or spaces of the same place keeps what was given, so a
-- spelling can always be corrected by hand in a migration.

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
  if tg_op = 'UPDATE' and lower(new.neighbourhood) = lower(btrim(regexp_replace(old.neighbourhood, '\s+', ' ', 'g'))) then
    return new;
  end if;
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
