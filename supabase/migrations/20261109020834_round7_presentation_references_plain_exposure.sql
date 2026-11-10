-- Round 7 review (2026-11-09): the whole-house example's shot said "(about -1
-- to -2 EV)", camera jargon Keenan shouldn't need. Plain words instead, only
-- on the row still worded as part 1 left it.
update public.presentation_references
   set shot = replace(shot, 'pull exposure down (about -1 to -2 EV) until every light is its own point', 'drag the exposure slider down until every light is its own point')
 where slot = 'what_vesper_is.hero' and rank = 1
   and shot like '%pull exposure down (about -1 to -2 EV) until every light is its own point%';
