-- Follow-up date on leads (Keenan, 2026-10-28). Choosing Follow up asks when
-- to come back; the setter's Home lists the follow-ups that are due, and the
-- Active list on Leads is ordered by them.
--
-- follow_up_on is required while a lead is in follow_up and cleared when it
-- leaves. A signed-in person cannot set a date before today in Calgary; the
-- service role can, which lets tests seed overdue follow-ups. The status
-- change into follow_up records the date in its event payload, and moving
-- the date on a lead that stays in follow_up logs an edited event naming the
-- field. Both trigger functions are replaced whole; only the follow-up parts
-- are new.

alter table public.leads add column follow_up_on date;

alter table public.leads
  add constraint leads_follow_up_needs_date
  check (status <> 'follow_up' or follow_up_on is not null);

create index leads_follow_up_due on public.leads (follow_up_on) where status = 'follow_up';

create or replace function public.leads_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  is_admin boolean := public.is_owner();
  setter_statuses public.lead_status[] := array['new', 'follow_up', 'lost']::public.lead_status[];
begin
  if tg_op = 'INSERT' then
    if me is not null then
      new.created_by := me;
      if not is_admin then
        new.assigned_to := me;
        if not (new.status = any (setter_statuses)) then
          raise exception 'Setters can only add a lead as New, Follow up or Lost'
            using errcode = '42501';
        end if;
      end if;
    end if;
    new.assigned_to := coalesce(new.assigned_to, new.created_by);
  else
    if me is not null and not is_admin then
      if new.created_by is distinct from old.created_by
         or new.assigned_to is distinct from old.assigned_to then
        raise exception 'Only the admin can reassign a lead' using errcode = '42501';
      end if;
      if new.status is distinct from old.status
         and not (old.status = any (setter_statuses) and new.status = any (setter_statuses)) then
        raise exception 'Setters can only move a lead between New, Follow up and Lost'
          using errcode = '42501';
      end if;
    end if;
    new.created_at := old.created_at;
  end if;

  if new.knock_session_id is not null
     and (tg_op = 'INSERT' or new.knock_session_id is distinct from old.knock_session_id)
     and not exists (
       select 1 from public.knock_sessions s
       where s.id = new.knock_session_id and s.user_id = new.created_by
     ) then
    raise exception 'A lead can only link to a knock session of the person who added it'
      using errcode = '42501';
  end if;

  if new.status <> 'follow_up' then
    new.follow_up_on := null;
  elsif me is not null
     and (tg_op = 'INSERT' or new.follow_up_on is distinct from old.follow_up_on)
     and new.follow_up_on < (now() at time zone 'America/Edmonton')::date then
    raise exception 'A follow-up date cannot be before today' using errcode = '22023';
  end if;

  if tg_op = 'INSERT' or new.status is distinct from old.status then
    if new.status = 'lost' then
      new.lost_at := now();
    else
      new.lost_at := null;
      new.lost_reason := null;
    end if;
    if new.status in ('sold', 'installed') then
      new.sold_at := coalesce(new.sold_at, now());
    else
      new.sold_at := null;
    end if;
    if new.status = 'installed' then
      new.installed_at := coalesce(new.installed_at, now());
    else
      new.installed_at := null;
    end if;
  end if;

  return new;
end;
$$;

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
           'follow_up_on'
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
