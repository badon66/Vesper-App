// Every leads column a signed-in person may read straight from the table:
// all of them but phone and email (contact privacy, 2026-11-04), and the
// notes (round 6, 2026-11-07). The phone and email come only from
// lead_contacts (lib/leads/contacts.ts), the notes only from lead_notes
// (lib/leads/notes.ts). A column added to leads later goes here and gets a
// read grant in its migration.
export const LEAD_FIELDS =
  "id, created_by, assigned_to, knock_session_id, status, source, first_name, last_name, address_line, city, postal_code, neighbourhood, lat, lng, place_id, house_type, soffit_colour, soffit_note, est_feet, both_decision_makers, consent_text, lost_reason, lost_at, sold_at, installed_at, created_at, updated_at, follow_up_on, owns_home, wants_price, christmas_lights_now, areas_wanted, install_timing, track_colour_id, track_ral_code, position_source, position_accuracy_m, looked_into_before, track_colour_initials, track_colour_initialled_at, not_collected, save_key, phone_saved, setter_read, hot_buttons, confirm_by, soffit_colour_2, soffit_ral_code, soffit_ral_code_2, name_to_come, address_to_come";
