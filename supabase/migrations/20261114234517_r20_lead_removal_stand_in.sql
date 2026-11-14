-- Round 20 (Keenan, 2026-11-14): the functions that take a lead out, bring it back and list Deleted
-- take Keenan's own session or the database tests' secret key standing in
-- for him (acts_as_owner), like quote_accept and the other owner-only
-- functions, so the tests can prove them without signing in as Keenan.
-- Everything else is exactly as r20_lead_removal left it.

-- What deleting this lead would do, for the confirm: refused (an accepted
-- quote, or pay that isn't void), or the upcoming meetings it would cancel.
create or replace function public.lead_delete_check(p_lead uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  l public.leads;
  v_meetings jsonb;
begin
  if not public.acts_as_owner() then
    raise exception 'Only Keenan deletes a lead' using errcode = '42501', hint = 'not_allowed';
  end if;
  select * into l from public.leads where id = p_lead;
  if not found or l.deleted_at is not null then
    return jsonb_build_object('ok', false, 'state', 'not_found');
  end if;
  if exists (select 1 from public.quotes q where q.lead_id = l.id and q.status = 'accepted') then
    return jsonb_build_object('ok', false, 'state', 'accepted', 'status', l.status);
  end if;
  if exists (select 1 from public.earnings e where e.lead_id = l.id and e.status <> 'void') then
    return jsonb_build_object('ok', false, 'state', 'pay', 'status', l.status);
  end if;
  select coalesce(jsonb_agg(m.starts_at order by m.starts_at), '[]'::jsonb) into v_meetings
    from public.meetings m
   where m.lead_id = l.id and m.status in ('booked', 'confirmed') and m.starts_at > now();
  return jsonb_build_object('ok', true, 'meetings', v_meetings);
end;
$$;

create or replace function public.lead_soft_delete(p_lead uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  l public.leads;
  m public.meetings;
  v_cancelled jsonb := '[]'::jsonb;
begin
  if not public.acts_as_owner() then
    raise exception 'Only Keenan deletes a lead' using errcode = '42501', hint = 'not_allowed';
  end if;
  -- The evenings first, in the order booking takes its locks.
  for m in
    select * from public.meetings x
     where x.lead_id = p_lead and x.status in ('booked', 'confirmed') and x.starts_at > now()
     order by x.starts_at
  loop
    perform public.lock_evening(m.host_id, m.starts_at);
  end loop;
  select * into l from public.leads where id = p_lead for update;
  if not found or l.deleted_at is not null then
    raise exception 'That lead was not found' using errcode = 'P0001', hint = 'not_found';
  end if;
  if exists (select 1 from public.quotes q where q.lead_id = l.id and q.status = 'accepted') then
    raise exception 'A lead with an accepted quote can''t be deleted' using errcode = 'P0001', hint = 'accepted_quote';
  end if;
  if exists (select 1 from public.earnings e where e.lead_id = l.id and e.status <> 'void') then
    raise exception 'A lead with booking pay or commission can''t be deleted' using errcode = 'P0001', hint = 'has_pay';
  end if;

  for m in
    select * from public.meetings x
     where x.lead_id = l.id and x.status in ('booked', 'confirmed') and x.starts_at > now()
     order by x.starts_at
     for update
  loop
    update public.meetings
       set status = 'cancelled', outcome_note = 'The lead was deleted.', outcome_at = now(), outcome_by = me
     where id = m.id;
    insert into public.lead_events (lead_id, actor_id, type, payload)
    values (l.id, me, 'meeting_cancelled', jsonb_build_object('meeting_id', m.id, 'starts_at', m.starts_at));
    v_cancelled := v_cancelled || jsonb_build_array(m.id);
  end loop;
  -- As cancelling a booking does: the lead goes to Follow up, for tomorrow.
  update public.leads set status = 'follow_up', follow_up_on = public.calgary_tomorrow()
   where id = l.id and status = 'meeting_booked';

  update public.leads set deleted_at = now(), deleted_by = me where id = l.id;
  insert into public.lead_events (lead_id, actor_id, type, payload)
  values (l.id, me, 'lead_deleted', '{}'::jsonb);
  return jsonb_build_object('ok', true, 'cancelled', v_cancelled);
end;
$$;

create or replace function public.lead_restore(p_lead uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  l public.leads;
begin
  if not public.acts_as_owner() then
    raise exception 'Only Keenan restores a lead' using errcode = '42501', hint = 'not_allowed';
  end if;
  select * into l from public.leads where id = p_lead for update;
  if not found or l.deleted_at is null then
    raise exception 'That lead isn''t in Deleted' using errcode = 'P0001', hint = 'not_deleted';
  end if;
  update public.leads set deleted_at = null, deleted_by = null where id = l.id;
  insert into public.lead_events (lead_id, actor_id, type, payload)
  values (l.id, me, 'lead_restored', '{}'::jsonb);
  return jsonb_build_object('ok', true);
end;
$$;

-- Admin, Deleted: newest first, with the day each is removed for good.
create or replace function public.deleted_leads()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.acts_as_owner() then
    raise exception 'Only Keenan sees Deleted' using errcode = '42501', hint = 'not_allowed';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', l.id,
             'first_name', l.first_name,
             'last_name', l.last_name,
             'address_line', l.address_line,
             'city', l.city,
             'deleted_at', l.deleted_at,
             'gone_after', l.deleted_at + interval '30 days') order by l.deleted_at desc), '[]'::jsonb)
      from public.leads l
     where l.deleted_at is not null
  );
end;
$$;

