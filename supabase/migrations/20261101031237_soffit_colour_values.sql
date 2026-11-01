-- Soffit colour gains the two answers the door process asks for (Keenan,
-- 2026-11-01): Off-white or cream, and Not sure. Additive only: black and
-- brown stay in the type, unused, and the app never offers them. Kept on its
-- own so the new values are committed before anything uses them.
alter type public.soffit_colour add value if not exists 'off_white' after 'white';
alter type public.soffit_colour add value if not exists 'not_sure' after 'other';
