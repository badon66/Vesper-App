-- Round 7 review, part 3, piece 5 of 5 (install_day.more): the example shots'
-- notes and order, finished (see part 1 for what changes and why). Only
-- rows still exactly as seeded change; nothing else is touched.

-- install_day.more: The Gadgeteer first, JellyFish Lighting second
-- The first example trades places with its backup through the spare rank 0,
-- because (slot, rank) is unique, and only while both rows are still as
-- seeded and rank 0 is free.
update public.presentation_references set rank = 0
  where slot = 'install_day.more' and rank = 1
    and md5(concat_ws('|', coalesce(image_url, ''), page_url, site, why, shot)) = '6145a86495e251d221c4613474a3f794'
    and exists (select 1 from public.presentation_references r
                 where r.slot = 'install_day.more' and r.rank = 2
                   and md5(concat_ws('|', coalesce(r.image_url, ''), r.page_url, r.site, r.why, r.shot)) = '2e235c1faafab667d9da126394256f22')
    and not exists (select 1 from public.presentation_references r
                     where r.slot = 'install_day.more' and r.rank = 0);

update public.presentation_references set
    rank = 1,
    site = 'The Gadgeteer',
    why = 'A real control box mounted with its cord running to power, from a homeowner''s own install. Copy the idea of box, cord and outlet in one frame; ours is straight on and tidier, with the cord clipped straight and nothing else on the wall.',
    shot = 'Shoot by daylight, with the garage lights on and the door open for even light, and no flash. Stand straight on about 1 m back with the phone at the box''s height, 1x, level. Frame the control box and the outlet it plugs into, with the cord clipped neatly along the wall between them, and the box, the plug and the cord all in view. Move shelves, bikes and tools so nothing else is on that wall in frame. Clean the box, close its cover and square it to the frame edges.'
  where slot = 'install_day.more' and rank = 2
    and md5(concat_ws('|', coalesce(image_url, ''), page_url, site, why, shot)) = '2e235c1faafab667d9da126394256f22'
    and exists (select 1 from public.presentation_references r
                 where r.slot = 'install_day.more' and r.rank = 0
                   and md5(concat_ws('|', coalesce(r.image_url, ''), r.page_url, r.site, r.why, r.shot)) = '6145a86495e251d221c4613474a3f794');

update public.presentation_references set
    rank = 2,
    site = 'JellyFish Lighting',
    why = 'Not the shot: a controller open on a bench with numbered labels, from an installation manual. Use it only to see the parts; ours is closed, on the wall, beside its outlet.',
    shot = 'Same as The Gadgeteer example.'
  where slot = 'install_day.more' and rank = 0
    and md5(concat_ws('|', coalesce(image_url, ''), page_url, site, why, shot)) = '6145a86495e251d221c4613474a3f794';
