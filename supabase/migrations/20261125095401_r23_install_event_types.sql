-- Round 23 (Keenan, 2026-11-17): install days the customer picks from
-- Keenan's calendar. The lead's timeline says when an install day was
-- picked, changed or taken off. New enum values go in their own migration,
-- before anything uses them.
alter type public.event_type add value if not exists 'install_day_picked';
alter type public.event_type add value if not exists 'install_day_changed';
alter type public.event_type add value if not exists 'install_day_cleared';
