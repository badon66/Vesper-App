-- Customer quote link: the expired screen's contact (2026-11-02).
--
-- What: quote_for_customer's expired answer now carries Vesper's public
-- contact from settings (name, phone, email), so "This quote has expired"
-- can offer call and text buttons with Keenan's number as Settings has it.
-- Still no customer name, no address and no prices for anything but a live
-- token.
-- Why: an anonymous caller can't read settings, and the expired screen
-- must not hard-code a phone number Keenan can change in Settings.
-- Replaces the function with the same signature and grants; nothing else
-- changes.

create or replace function public.quote_for_customer(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  link public.quote_links;
  q public.quotes;
  v_lead public.leads;
  s public.settings;
  mockup text;
  fingerprint text;
begin
  select * into s from public.settings st where st.id = 1;
  link := public.quote_link_live(p_token);
  if link.id is null then
    return jsonb_build_object(
      'state', 'expired',
      'company', jsonb_build_object(
        'name', s.company ->> 'name',
        'phone', s.company ->> 'phone',
        'email', s.company ->> 'email'
      )
    );
  end if;
  q := public.quote_link_current_quote(link.lead_id);
  select * into v_lead from public.leads l where l.id = link.lead_id;
  select p.storage_path into mockup
    from public.lead_photos p
   where p.lead_id = link.lead_id and p.slot = 'mockup'
   limit 1;
  fingerprint := md5(q.runs::text);

  return jsonb_build_object(
    'state', 'live',
    'first_name', v_lead.first_name,
    'last_name', v_lead.last_name,
    'address', v_lead.address_line,
    'city', v_lead.city,
    'valid_until', q.valid_until,
    'quote', jsonb_build_object(
      'runs', q.runs,
      'runs_fingerprint', fingerprint,
      'price_per_ft', q.price_per_ft,
      'box_price', q.box_price,
      'box_count', q.box_count,
      'adders', q.adders,
      'discounts', q.discounts,
      'colour_timing', q.colour_timing,
      'rush_fee_per_ft', q.rush_fee_per_ft,
      'min_job_total', q.min_job_total,
      'gst_enabled', q.gst_enabled,
      'gst_rate', q.gst_rate
    ),
    'warranty', s.warranty_text,
    'company', jsonb_build_object(
      'name', s.company ->> 'name',
      'phone', s.company ->> 'phone',
      'email', s.company ->> 'email',
      'address', s.company ->> 'address'
    ),
    'mockup_path', mockup,
    'selection', case when link.selection_runs = fingerprint then to_jsonb(link.selection) else null end,
    'booked_at', link.booked_at,
    'booked_option', link.booked_option
  );
end;
$$;

grant execute on function public.quote_for_customer(text) to anon, authenticated, service_role;
