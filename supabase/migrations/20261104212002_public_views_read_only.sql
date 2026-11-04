-- The app's public views are read only (2026-11-04). profiles_public,
-- profile_names and settings_public are simple views that run with their
-- owner's rights, so Postgres lets a write through them reach profiles and
-- settings around their policies, and Supabase's default privileges had
-- given signed-in people insert, update and delete on them. The app only
-- ever reads them. Only select stays, as for lead_contacts.
revoke insert, update, delete, truncate, references, trigger on public.profiles_public from authenticated, anon, public;
revoke insert, update, delete, truncate, references, trigger on public.profile_names from authenticated, anon, public;
revoke insert, update, delete, truncate, references, trigger on public.settings_public from authenticated, anon, public;
grant select on public.profiles_public to authenticated;
grant select on public.profile_names to authenticated;
grant select on public.settings_public to authenticated;
