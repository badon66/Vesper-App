-- Quote link take 3 (Keenan, 2026-11-11): a timeline event for the
-- customer signing the agreement on their link. On its own, so the new
-- value is committed before any function uses it. Additive.
alter type public.event_type add value if not exists 'agreement_signed';
