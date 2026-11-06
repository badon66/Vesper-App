-- Booking sheet round 3 (Keenan, 2026-11-05, after a day of using it).
--
-- What:
-- 1. Three optional answers a setter can note about a person, one tap each,
--    never required and not part of the "N of 8 collected" count:
--    - setter_read: the setter's read, Hot, Warm or Just curious;
--    - hot_buttons: what would make them say yes, any that apply (No more
--      ladders, Up for Christmas, Year-round curb appeal, Safety and
--      security), or Not sure on its own;
--    - confirm_by: whether to call or text to confirm the meeting.
--    House type already exists on leads; the booking sheet now asks it too.
-- 2. Read access: signed-in people read leads through column grants (contact
--    privacy, 20261104220841), so each new column gets its own read grant.
--    Writing is already granted on the table, under the row policies.
-- 3. The timeline notes the new answers like any other edit: the same
--    trigger function with the three fields added to its list.
--    (The Book step note's new line is its own migration, applied when the
--    app that asks for the phone on Book goes live.)
--
-- Why: setters get the number last, at the end of the conversation, and
-- Keenan wants to know before he walks in how warm the person is and what
-- would make them say yes. Additive only: new types, new nullable columns
-- (hot_buttons defaults to empty), a grant and a function body.

create type public.setter_read as enum ('hot', 'warm', 'just_curious');
create type public.hot_button as enum ('no_ladders', 'up_for_christmas', 'curb_appeal', 'safety_security', 'not_sure');
create type public.confirm_by as enum ('call', 'text');

alter table public.leads
  add column setter_read public.setter_read,
  add column hot_buttons public.hot_button[] not null default '{}',
  add column confirm_by public.confirm_by;

-- Not sure is an answer on its own, never beside a hot button; and there
-- are only four hot buttons to pick (the app sends each one once).
alter table public.leads
  add constraint leads_hot_buttons_not_sure_alone
    check (not ('not_sure' = any (hot_buttons)) or cardinality(hot_buttons) = 1),
  add constraint leads_hot_buttons_at_most_four
    check (cardinality(hot_buttons) <= 4);

grant select (setter_read, hot_buttons, confirm_by) on public.leads to authenticated;

create or replace function public.leads_log_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed text[];
begin
  if tg_op = 'INSERT' then
    insert into public.lead_events (lead_id, actor_id, type, to_status)
    values (new.id, auth.uid(), 'created', new.status);
    return null;
  end if;

  if new.status is distinct from old.status then
    insert into public.lead_events (lead_id, actor_id, type, from_status, to_status, payload)
    values (
      new.id, auth.uid(), 'status_change', old.status, new.status,
      case
        when new.status = 'lost' then jsonb_build_object('reason', new.lost_reason)
        when new.status = 'follow_up' then jsonb_build_object('follow_up_on', new.follow_up_on)
      end
    );
  end if;

  select coalesce(array_agg(n.key order by n.key), array[]::text[])
    into changed
    from jsonb_each(to_jsonb(new)) as n
   where n.key = any (array[
           'first_name', 'last_name', 'phone', 'email', 'address_line', 'city',
           'postal_code', 'neighbourhood', 'lat', 'lng', 'place_id', 'house_type',
           'soffit_colour', 'soffit_note', 'est_feet', 'notes', 'source', 'assigned_to',
           'follow_up_on', 'owns_home', 'wants_price', 'christmas_lights_now', 'areas_wanted',
           'install_timing', 'track_colour_id', 'track_ral_code', 'looked_into_before',
           'both_decision_makers', 'not_collected', 'setter_read', 'hot_buttons', 'confirm_by'
         ])
     and n.value is distinct from (to_jsonb(old) -> n.key)
     -- A status change already records the date it sets or clears.
     and not (n.key = 'follow_up_on' and new.status is distinct from old.status);

  if cardinality(changed) > 0 then
    insert into public.lead_events (lead_id, actor_id, type, payload)
    values (new.id, auth.uid(), 'edited', jsonb_build_object('fields', to_jsonb(changed)));
  end if;

  return null;
end;
$$;
