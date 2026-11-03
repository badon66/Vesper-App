-- Customer quote link, take 1 (Keenan, 2026-11-02): its four timeline events.
--
-- What: quote_link_created (Keenan made the link), quote_link_opened (the
-- customer's first visit), quote_link_revoked (Keenan turned it off) and
-- install_requested (the customer tapped Book my install; the payload holds
-- the option in words and the run names, never a price).
-- Why: the lead's timeline records the link without dollar amounts, since
-- sales users read it. In a migration of their own because a new enum value
-- can't be used in the transaction that adds it. Additive.

alter type public.event_type add value if not exists 'quote_link_created';
alter type public.event_type add value if not exists 'quote_link_opened';
alter type public.event_type add value if not exists 'quote_link_revoked';
alter type public.event_type add value if not exists 'install_requested';
