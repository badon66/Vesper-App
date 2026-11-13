-- Round 19 (Keenan, 2026-11-13): Keenan approved changing "control box" to
-- "smart controller" in the five places his saved deck words still say it
-- (round 18 renamed the line itself). Only those words change; the rest of
-- each sentence stays exactly as he wrote it, and a place that no longer
-- says "control box" is left alone.

update public.settings
   set deck = jsonb_set(deck, '{lines,price_includes}', to_jsonb(replace(deck #>> '{lines,price_includes}', 'control box', 'smart controller')))
 where id = 1 and deck #>> '{lines,price_includes}' like '%control box%';

update public.settings
   set deck = jsonb_set(deck, '{pages,install_day,words}', to_jsonb(replace(deck #>> '{pages,install_day,words}', 'control box', 'smart controller')))
 where id = 1 and deck #>> '{pages,install_day,words}' like '%control box%';

update public.settings
   set deck = jsonb_set(deck, '{pages,install_day,more_text}', to_jsonb(replace(deck #>> '{pages,install_day,more_text}', 'control box', 'smart controller')))
 where id = 1 and deck #>> '{pages,install_day,more_text}' like '%control box%';

update public.settings
   set deck = jsonb_set(deck, '{pages,next_steps,more_text}', to_jsonb(replace(deck #>> '{pages,next_steps,more_text}', 'control box', 'smart controller')))
 where id = 1 and deck #>> '{pages,next_steps,more_text}' like '%control box%';

update public.settings
   set deck = jsonb_set(deck, '{pages,what_vesper_is,more_text}', to_jsonb(replace(replace(deck #>> '{pages,what_vesper_is,more_text}', 'A control box', 'A smart controller'), 'control box', 'smart controller')))
 where id = 1 and deck #>> '{pages,what_vesper_is,more_text}' ilike '%control box%';
