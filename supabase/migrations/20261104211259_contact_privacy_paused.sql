-- Contact privacy, paused until the app that reads lead_contacts is live
-- (2026-11-04). The previous migration took table-wide read access on leads
-- away from signed-in people, but the app deployed at that moment still asks
-- for whole lead rows (select *) and for the phone on Schedule's meetings, so
-- its lead pages and schedules failed. This gives table-wide read access back
-- for now. The column grants, phone_saved and lead_contacts stay in place;
-- the next migration takes table-wide read access away again once the app
-- that no longer needs it is deployed.
grant select on public.leads to authenticated;
