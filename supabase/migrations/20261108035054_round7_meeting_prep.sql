-- Round 7, Branch A (Keenan, 2026-11-08), additive and approved up front:
-- Keenan confirms each meeting himself (setters never do). He texts or
-- calls from the prep list, then taps Confirmed, which records when; the
-- meeting shows a tick on Schedule and his Home. The ready-made text's
-- wording lives in Settings: {first_name}, {day} and {time} are filled in.

alter table public.meetings add column confirmed_at timestamptz;
comment on column public.meetings.confirmed_at is
  'Round 7: when Keenan confirmed the time with the customer (his text or call), set from the prep list; null until then. Owner only, through confirm_meeting.';

alter table public.settings
  add column confirm_text text not null
  default 'Hi {first_name}, it''s Keenan with Vesper Lighting. Just confirming {day} at {time}. See you then!'
  constraint settings_confirm_text_length check (char_length(confirm_text) between 1 and 400);
comment on column public.settings.confirm_text is
  'Round 7: the ready-made confirmation text Keenan sends from the prep list. {first_name}, {day} (tonight, tomorrow or the weekday) and {time} are filled in.';

-- Confirmed, or taken back, by the owner only, on a meeting still booked.
create or replace function public.confirm_meeting(p_meeting uuid, p_confirmed boolean default true)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_at timestamptz;
begin
  if not public.is_owner() then
    raise exception 'Only Keenan confirms meetings.' using errcode = '42501';
  end if;
  update public.meetings
     set confirmed_at = case when p_confirmed then now() else null end
   where id = p_meeting
     and status in ('booked', 'confirmed')
  returning confirmed_at into v_at;
  if not found then
    raise exception 'That meeting isn''t booked any more.' using errcode = 'P0001';
  end if;
  return v_at;
end;
$$;

revoke all on function public.confirm_meeting(uuid, boolean) from public, anon;
grant execute on function public.confirm_meeting(uuid, boolean) to authenticated;
