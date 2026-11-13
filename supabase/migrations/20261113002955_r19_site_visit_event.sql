-- Round 19 (Keenan, 2026-11-13): a timeline entry for the site visit. A new
-- event kind, added on its own so the next migration can use it.
alter type public.event_type add value if not exists 'site_visit';
