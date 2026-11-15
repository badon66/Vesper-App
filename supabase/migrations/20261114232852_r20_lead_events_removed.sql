-- Round 20 (Keenan, 2026-11-14): deleting a lead shows on its timeline, and
-- so does bringing it back. Two new event kinds, added on their own so the
-- next migration can use them.
alter type public.event_type add value if not exists 'lead_deleted';
alter type public.event_type add value if not exists 'lead_restored';
