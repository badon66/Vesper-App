-- Round 19 (Keenan, 2026-11-13): the timeline names the lines of a booking
-- the way the quote editor names them ("Front lower, Front upper gable").
-- Book my install's timeline entry (install_requested) also keeps the
-- booked option's positions into the quote's runs, so the lead page can
-- name each line from the quote; positions only, never a price. Everything
-- else is exactly as round 13 left it.

create or replace function public.quote_link_book_offer(p_token text, p_offer text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  link public.quote_links;
  q public.quotes;
  v_lead public.leads;
  offer jsonb;
  chosen int[];
  run_count int;
  v_names text[];
  v_option text;
  v_notify boolean;
  v_targets jsonb := '[]'::jsonb;
begin
  link := public.quote_link_live(p_token);
  if link.id is null then
    return jsonb_build_object('ok', false, 'state', 'expired');
  end if;
  q := public.quote_link_current_quote(link.lead_id);
  select o.value into offer from jsonb_array_elements(public.quote_offers_shown(q)) as o (value) where o.value ->> 'id' = p_offer limit 1;
  if offer is null then
    return jsonb_build_object('ok', false, 'state', 'no_offer');
  end if;
  select coalesce(array_agg((p.value)::int order by (p.value)::int), array[]::int[]) into chosen
    from jsonb_array_elements_text(offer -> 'runs') as p (value);
  if cardinality(chosen) = 0 then
    return jsonb_build_object('ok', false, 'state', 'no_runs');
  end if;
  run_count := coalesce(jsonb_array_length(q.runs), 0);

  select array_agg(public.quote_link_run_name(q.runs -> p, p) order by p) into v_names from unnest(chosen) as p;
  v_option := offer ->> 'name';
  v_notify := link.notified_option is distinct from v_option;

  update public.quote_links
     set booked_at = now(),
         booked_option = left(v_option, 400),
         booked_offer = offer ->> 'id',
         booked_selection = chosen,
         selection = case when cardinality(chosen) = run_count then null else chosen end,
         selection_offer = offer ->> 'id',
         selection_runs = md5(q.runs::text),
         selection_at = now(),
         notified_option = case when v_notify then v_option else notified_option end
   where id = link.id;

  if v_notify then
    insert into public.lead_events (lead_id, actor_id, type, payload)
    values (link.lead_id, null, 'install_requested', jsonb_build_object('option', v_option, 'runs', to_jsonb(v_names), 'positions', to_jsonb(chosen)));
    select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'sealed', p.sealed)), '[]'::jsonb)
      into v_targets
      from public.push_subscriptions p
     where p.profile_id = link.created_by
       and p.removed_at is null;
  end if;

  select * into v_lead from public.leads l where l.id = link.lead_id;
  return jsonb_build_object(
    'ok', true,
    'option', v_option,
    'name', btrim(v_lead.first_name || ' ' || coalesce(v_lead.last_name, '')),
    'lead_id', link.lead_id,
    'notify', v_notify,
    'targets', v_targets
  );
end;
$$;
