-- M3 (Keenan, 2026-11-01): two new timeline event types for bookings that
-- are moved or cancelled. Postgres needs new enum values committed before
-- they are used, so they come in their own migration, ahead of the booking
-- functions that write them. Additive only.
alter type public.event_type add value if not exists 'meeting_moved';
alter type public.event_type add value if not exists 'meeting_cancelled';
