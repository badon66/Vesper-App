-- Soffit colour code (Keenan, 2026-11-09). Each lead can carry the soffit's
-- own number from the RAL colour book, one for each soffit colour when the
-- soffit is split, and a photo of the colour book held up to each soffit
-- colour. Either or both; never needed to save or book, never counted in the
-- six questions. The lead's setter and Keenan add them (the existing lead and
-- lead photo policies already allow exactly that); everyone on the sales side
-- reads them, like the soffit colour itself. Keenan's "Use for the track"
-- writes the track colour through the existing owner-only path, so nothing
-- here changes who sets the track colour. Additive only.

alter table public.leads
  add column soffit_ral_code text references public.ral_classic_colours (code),
  add column soffit_ral_code_2 text references public.ral_classic_colours (code);

comment on column public.leads.soffit_ral_code is
  'The soffit''s RAL Classic code from the colour book (the first soffit colour when split). Optional.';
comment on column public.leads.soffit_ral_code_2 is
  'The second soffit colour''s RAL Classic code, only while the soffit is split. Optional.';

-- Leads are read column by column since contact privacy (2026-11-04), so a
-- new column needs its own read grant.
grant select (soffit_ral_code, soffit_ral_code_2) on public.leads to authenticated;

-- The colour book held up to the soffit, one photo for each soffit colour.
-- A new photo takes the slot and the earlier one stays as an extra, as for
-- every slot.
alter type public.photo_slot add value if not exists 'soffit_book';
alter type public.photo_slot add value if not exists 'soffit_book_2';

-- A second code only means something while the soffit has a second colour:
-- when the soffit stops being split, its second code goes with it.
create or replace function public.leads_soffit_code_tidy()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.soffit_colour_2 is null then
    new.soffit_ral_code_2 := null;
  end if;
  return new;
end;
$$;

revoke execute on function public.leads_soffit_code_tidy() from public, anon, authenticated;

create trigger leads_soffit_code_tidy
  before insert or update of soffit_colour_2, soffit_ral_code_2 on public.leads
  for each row execute function public.leads_soffit_code_tidy();

-- The timeline names the soffit codes (and the second soffit colour) when
-- they change, like every other answer. Same function as round 3's, with
-- three fields added to its list.
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
           'both_decision_makers', 'not_collected', 'setter_read', 'hot_buttons', 'confirm_by',
           'soffit_colour_2', 'soffit_ral_code', 'soffit_ral_code_2'
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
