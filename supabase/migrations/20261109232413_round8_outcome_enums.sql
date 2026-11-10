-- Round 8, part 1 of 3: quote outcomes and setter commission, the new enum
-- values (Keenan, 2026-11-09).
--
-- What: a quote can now be Cancelled (a yes taken back later, inside the
-- 10-day window or after), and the lead's timeline gets two events for it:
-- quote_cancelled and quote_acceptance_undone. quote_accepted and
-- quote_declined already exist and are used from round 8 on.
-- Why: in a migration of their own because Postgres needs a new enum value
-- committed before anything uses it, the same as every earlier event type.
-- Additive: three enum values; nothing else changes.

alter type public.quote_status add value if not exists 'cancelled';
alter type public.event_type add value if not exists 'quote_cancelled';
alter type public.event_type add value if not exists 'quote_acceptance_undone';
