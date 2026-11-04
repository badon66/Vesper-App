-- Contact privacy (Keenan, 2026-11-04). A setter sees a lead's phone number
-- and email only on their own leads (created or assigned to them). On other
-- setters' leads and Keenan's they still see the name, address, status and
-- bookings, so nobody knocks the same door twice, but never the phone or
-- email. Enforced here, not only on screen:
--   1. phone_saved says whether a number is saved, without the number, so
--      "6 of 8 collected" and Before you book read right on any lead.
--   2. Signed-in people read leads column by column: every column except
--      phone and email, granted by name. A column added later needs its own
--      grant (docs/02-data-model.md).
--   3. lead_contacts hands out the phone and email of the leads the signed-in
--      person may contact: every lead for Keenan, their own for a setter.
--      It runs with its owner's rights behind a security barrier, so its own
--      filter applies before anything a caller adds.
-- Writes are unchanged: setters still add and edit the phone and email of
-- their own leads. Additive: no data moves and nothing is removed.

alter table public.leads
  add column phone_saved boolean generated always as (phone is not null) stored;

comment on column public.leads.phone_saved is
  'Whether a phone number is saved, readable by anyone who reads the lead; the number itself only through lead_contacts (2026-11-04).';

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

create view public.lead_contacts
with (security_barrier = true)
as
select l.id as lead_id, l.phone, l.email, l.created_by, l.assigned_to
from public.leads l
where public.is_owner()
   or (public.is_sales_side() and (l.created_by = auth.uid() or l.assigned_to = auth.uid()));

comment on view public.lead_contacts is
  'The phone and email of the leads the signed-in person may contact: every lead for the owner, their own leads for a setter (contact privacy, 2026-11-04).';

revoke all on public.lead_contacts from public, anon;
grant select on public.lead_contacts to authenticated;
