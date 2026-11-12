-- Round 17 part 4 (Keenan, 2026-11-12): the Polish button on an offer's
-- description sends his rough notes and the offer's own facts (never the
-- customer's name, address or phone) to Claude Haiku from the server, at
-- most 100 times a day (Calgary's day). This table counts the polishes:
-- one row each, who and when, nothing else (no notes, no text). Owner only;
-- rows are added only through ai_polish_take, which holds the count and the
-- cap under one lock so two taps at once can't pass it.

create table if not exists public.ai_polishes (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references public.profiles (id)
);

alter table public.ai_polishes enable row level security;

create policy "owner reads the polish count"
  on public.ai_polishes for select
  to authenticated
  using (public.is_owner());

revoke all on public.ai_polishes from anon;
revoke all on public.ai_polishes from authenticated;
grant select on public.ai_polishes to authenticated;

create or replace function public.ai_polish_take()
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  cap constant integer := 100;
  day_start timestamptz := ((now() at time zone 'America/Edmonton')::date)::timestamp at time zone 'America/Edmonton';
  used integer;
begin
  if not public.is_owner() then
    return jsonb_build_object('ok', false, 'state', 'not_owner');
  end if;
  perform pg_advisory_xact_lock(hashtext('public.ai_polish_take'));
  select count(*) into used from public.ai_polishes p where p.created_at >= day_start;
  if used >= cap then
    return jsonb_build_object('ok', false, 'state', 'cap', 'used', used, 'cap', cap);
  end if;
  insert into public.ai_polishes (created_by) values (auth.uid());
  return jsonb_build_object('ok', true, 'used', used + 1, 'cap', cap);
end;
$function$;

revoke all on function public.ai_polish_take() from public;
revoke all on function public.ai_polish_take() from anon;
grant execute on function public.ai_polish_take() to authenticated;
