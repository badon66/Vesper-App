-- Contact privacy on (Keenan, 2026-11-04). The app that reads a lead's phone
-- and email only through lead_contacts is now live, so signed-in people lose
-- table-wide read access on leads again and keep the column grants from
-- 20261104100612: every column but phone and email. A query naming either
-- one, or asking for *, is refused for everyone, Keenan's session included.
revoke select on public.leads from authenticated;
grant select (
  id, created_by, assigned_to, knock_session_id, status, source, first_name, last_name,
  address_line, city, postal_code, neighbourhood, lat, lng, place_id, house_type,
  soffit_colour, soffit_note, est_feet, notes, both_decision_makers, consent_text,
  lost_reason, lost_at, sold_at, installed_at, created_at, updated_at, follow_up_on,
  owns_home, wants_price, christmas_lights_now, areas_wanted, install_timing,
  track_colour_id, track_ral_code, position_source, position_accuracy_m, looked_into_before,
  track_colour_initials, track_colour_initialled_at, not_collected, save_key, phone_saved
) on public.leads to authenticated;
