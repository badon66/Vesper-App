-- Round 8, part 4: fixes from the review of quote outcomes (Keenan,
-- 2026-11-09; reviewed 2026-11-10).
--
-- What:
--   - quotes_outcome_guard: a lead whose quote is accepted can't start a
--     new quote until Keenan undoes the acceptance, so a later draft can
--     never stand in for the sale on the customer's link or the outcome
--     card. Everything else is as part 2 had it;
--   - leads_log_events: the planned install day joins the fields the
--     timeline names when they change ("Changed the planned install
--     day."), with who and when. Not when the status changes in the same
--     update: the outcome's own event already says it. Field names only,
--     never a value, as before;
--   - quote_decline and quote_cancel: they also turn the customer's link
--     off (revoke_quote_link, which writes its own timeline line), so the
--     page reads as expired even when an older quote is still open.
--     Sending again makes a new link;
--   - quote_undo_acceptance: a lead that was Meeting booked when the yes
--     came, and has no booked meeting left, goes back to Met rather than
--     Meeting booked;
--   - lead_undo_installed: Keenan's "Not installed yet" for a wrong tap or
--     a wrong day. The lead goes back to Sold, its install date is cleared
--     (leads_guard), and an unpaid commission waits for the install again
--     (leads_commission_sync). A paid one stays paid.
-- Why: the review found a sold and installed job had no way back on the
-- lead page, and a few smaller gaps. Additive: functions re-created with
-- the same signatures, plus one new function.

-- ---------------------------------------------------------------- quotes

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

  -- One quote stands for a sale: no new quote while one is accepted.
  if tg_op = 'INSERT'
     and exists (select 1 from public.quotes x where x.lead_id = new.lead_id and x.status = 'accepted') then
    raise exception 'This lead''s quote is accepted. Undo the acceptance on the lead page to change it'
      using errcode = '42501', hint = 'quote_locked';
  end if;

  if tg_op = 'UPDATE' and old.status = 'accepted' and new.status = 'accepted'
     and (to_jsonb(new) - free_keys) is distinct from (to_jsonb(old) - free_keys) then
    raise exception 'An accepted quote''s numbers are locked. Undo the acceptance to change them'
      using errcode = '42501', hint = 'quote_locked';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------- timeline

-- Same function as the soffit colour code's (2026-11-09), with install_on
-- added to its list and left out when the status changes in the same
-- update, as follow_up_on is.
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
           'soffit_colour_2', 'soffit_ral_code', 'soffit_ral_code_2', 'install_on'
         ])
     and n.value is distinct from (to_jsonb(old) -> n.key)
     -- A status change already records the date it sets or clears.
     and not (n.key in ('follow_up_on', 'install_on') and new.status is distinct from old.status);

  if cardinality(changed) > 0 then
    insert into public.lead_events (lead_id, actor_id, type, payload)
    values (new.id, auth.uid(), 'edited', jsonb_build_object('fields', to_jsonb(changed)));
  end if;

  return null;
end;
$$;

-- ---------------------------------------------------------------- decline

create or replace function public.quote_decline(p_quote uuid, p_reason text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  q public.quotes;
  l public.leads;
  v_note text := nullif(btrim(p_note), '');
begin
  if not public.acts_as_owner() then
    raise exception 'Only Keenan marks a quote''s outcome' using errcode = '42501', hint = 'not_allowed';
  end if;

  select * into q from public.quotes where id = p_quote;
  if not found then
    raise exception 'That quote was not found' using errcode = 'P0001', hint = 'not_open';
  end if;
  select * into l from public.leads where id = q.lead_id for update;
  select * into q from public.quotes where id = p_quote for update;

  if q.status not in ('draft', 'presented') then
    raise exception 'Only an open quote can be declined' using errcode = 'P0001', hint = 'not_open';
  end if;
  -- A sale stands on the accepted quote: declining another one must not
  -- send the lead to Lost.
  if exists (select 1 from public.quotes x where x.lead_id = l.id and x.status = 'accepted') then
    raise exception 'Another quote on this lead is already accepted' using errcode = 'P0001', hint = 'already_accepted';
  end if;
  if p_reason is null
     or p_reason not in ('price', 'timing', 'partner said no', 'went with someone else', 'other') then
    raise exception 'Pick a reason from the list' using errcode = 'P0001', hint = 'bad_reason';
  end if;
  if v_note is not null and (p_reason <> 'other' or char_length(v_note) > 300) then
    raise exception 'A note goes with Other only, in 300 characters or fewer' using errcode = 'P0001', hint = 'bad_note';
  end if;

  perform set_config('vesper.quote_outcome', 'on', true);
  update public.quotes
     set status = 'declined',
         declined_at = now(),
         decline_reason = p_reason,
         cancelled_at = null,
         cancel_reason = null,
         outcome_note = v_note
   where id = q.id;
  update public.leads set status = 'lost', lost_reason = p_reason, install_on = null where id = l.id;

  insert into public.lead_events (lead_id, actor_id, type, payload)
  values (l.id, actor, 'quote_declined', jsonb_build_object('quote_id', q.id, 'reason', p_reason));

  -- The customer's link closes with the no.
  perform public.revoke_quote_link(l.id);

  perform set_config('vesper.quote_outcome', 'off', true);
end;
$$;

-- ---------------------------------------------------------------- cancel

create or replace function public.quote_cancel(p_quote uuid, p_reason text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  q public.quotes;
  l public.leads;
  v_note text := nullif(btrim(p_note), '');
begin
  if not public.acts_as_owner() then
    raise exception 'Only Keenan marks a quote''s outcome' using errcode = '42501', hint = 'not_allowed';
  end if;

  select * into q from public.quotes where id = p_quote;
  if not found then
    raise exception 'That quote was not found' using errcode = 'P0001', hint = 'not_accepted';
  end if;
  select * into l from public.leads where id = q.lead_id for update;
  select * into q from public.quotes where id = p_quote for update;

  if q.status <> 'accepted' then
    raise exception 'Only an accepted quote can be cancelled' using errcode = 'P0001', hint = 'not_accepted';
  end if;
  if p_reason is null
     or p_reason not in ('price', 'timing', 'partner said no', 'went with someone else', 'other') then
    raise exception 'Pick a reason from the list' using errcode = 'P0001', hint = 'bad_reason';
  end if;
  if v_note is not null and (p_reason <> 'other' or char_length(v_note) > 300) then
    raise exception 'A note goes with Other only, in 300 characters or fewer' using errcode = 'P0001', hint = 'bad_note';
  end if;

  -- An unpaid commission is voided with the reason and lets go of the
  -- quote; a paid one stays paid. Done before the lead moves, so the
  -- safety net finds nothing left to void.
  update public.earnings
     set status = 'void', note = 'Cancelled: ' || p_reason, quote_id = null
   where lead_id = l.id and type = 'commission' and status = 'pending';

  perform set_config('vesper.quote_outcome', 'on', true);
  update public.quotes
     set status = 'cancelled',
         cancelled_at = now(),
         cancel_reason = p_reason,
         outcome_note = v_note
   where id = q.id;
  update public.leads
     set status = 'lost', lost_reason = 'cancelled, ' || p_reason, install_on = null
   where id = l.id;

  insert into public.lead_events (lead_id, actor_id, type, payload)
  values (l.id, actor, 'quote_cancelled', jsonb_build_object(
    'quote_id', q.id,
    'reason', p_reason,
    'inside_window', coalesce(q.accepted_at > now() - interval '10 days', false)));

  -- The customer's link closes with the cancellation.
  perform public.revoke_quote_link(l.id);

  perform set_config('vesper.quote_outcome', 'off', true);
end;
$$;

-- ---------------------------------------------------------------- undo

create or replace function public.quote_undo_acceptance(p_quote uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  q public.quotes;
  l public.leads;
  v_back public.lead_status;
begin
  if not public.acts_as_owner() then
    raise exception 'Only Keenan marks a quote''s outcome' using errcode = '42501', hint = 'not_allowed';
  end if;

  select * into q from public.quotes where id = p_quote;
  if not found then
    raise exception 'That quote was not found' using errcode = 'P0001', hint = 'not_undoable';
  end if;
  select * into l from public.leads where id = q.lead_id for update;
  select * into q from public.quotes where id = p_quote for update;

  if q.status <> 'accepted' or l.status <> 'sold' then
    raise exception 'Only an accepted quote on a sold lead can be undone' using errcode = 'P0001', hint = 'not_undoable';
  end if;

  update public.earnings
     set status = 'void', note = 'Acceptance undone', quote_id = null
   where lead_id = l.id and type = 'commission' and status = 'pending';

  perform set_config('vesper.quote_outcome', 'on', true);
  update public.quotes
     set status = 'draft',
         accepted_at = null,
         accepted_by = null,
         accepted_runs = null,
         lead_status_before = null
   where id = q.id;

  -- Back to where the lead was. Follow up needs its day, so it comes back
  -- due tomorrow, as a cancelled booking does. Meeting booked needs a
  -- meeting still booked; once it has happened the lead was met.
  v_back := coalesce(q.lead_status_before, 'met');
  if v_back in ('sold', 'installed', 'lost') then
    v_back := 'met';
  end if;
  if v_back = 'meeting_booked'
     and not exists (select 1 from public.meetings m
                      where m.lead_id = l.id and m.status in ('booked', 'confirmed')) then
    v_back := 'met';
  end if;
  update public.leads
     set status = v_back,
         install_on = null,
         follow_up_on = case when v_back = 'follow_up' then public.calgary_tomorrow() end
   where id = l.id;

  insert into public.lead_events (lead_id, actor_id, type, payload)
  values (l.id, actor, 'quote_acceptance_undone', jsonb_build_object('quote_id', q.id));

  perform set_config('vesper.quote_outcome', 'off', true);
end;
$$;

-- ---------------------------------------------------------------- not installed yet

create or replace function public.lead_undo_installed(p_lead uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.leads;
begin
  if not public.acts_as_owner() then
    raise exception 'Only Keenan marks a job installed' using errcode = '42501', hint = 'not_allowed';
  end if;

  select * into l from public.leads where id = p_lead for update;
  if not found
     or l.status <> 'installed'
     or not exists (select 1 from public.quotes x where x.lead_id = l.id and x.status = 'accepted') then
    raise exception 'Only an installed lead with an accepted quote can go back to Sold'
      using errcode = 'P0001', hint = 'not_installed';
  end if;

  -- The status change logs itself on the timeline; leads_guard clears the
  -- install date and the safety net makes an unpaid commission wait for
  -- the install again.
  update public.leads set status = 'sold' where id = l.id;
end;
$$;

revoke execute on function public.lead_undo_installed(uuid) from public, anon;
grant execute on function public.lead_undo_installed(uuid) to authenticated, service_role;
