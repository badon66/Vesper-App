-- Round 7 review, part 3, piece 3 of 5 (gallery.bungalow): the example shots'
-- notes and order, finished (see part 1 for what changes and why). Only
-- rows still exactly as seeded change; nothing else is touched.

-- gallery.bungalow: Astoria Lighting Co. first, Gemstone Lights second
-- The first example trades places with its backup through the spare rank 0,
-- because (slot, rank) is unique, and only while both rows are still as
-- seeded and rank 0 is free.
update public.presentation_references set rank = 0
  where slot = 'gallery.bungalow' and rank = 1
    and md5(concat_ws('|', coalesce(image_url, ''), page_url, site, why, shot)) = 'b5bc683adbaee88dd37d688a9b98dfb9'
    and exists (select 1 from public.presentation_references r
                 where r.slot = 'gallery.bungalow' and r.rank = 2
                   and md5(concat_ws('|', coalesce(r.image_url, ''), r.page_url, r.site, r.why, r.shot)) = 'bded57e25c8383b941cfa7a097126f09')
    and not exists (select 1 from public.presentation_references r
                     where r.slot = 'gallery.bungalow' and r.rank = 0);

update public.presentation_references set
    rank = 1,
    site = 'Astoria Lighting Co.',
    why = 'A single-storey home at blue hour, every run lit as separate white points, with the wash falling on the garage door. Copy the deep blue sky and the even lights; stand a little to one side so a side return shows, and leave out the yard signs.',
    shot = 'Shoot at blue hour, 15 to 30 minutes after sunset while the sky is still deep blue, with steady warm white. Choose a bungalow with a low hip roof. Stand across the street about 20 degrees off straight on, so the front eave and one side return both show, and use 1x on a tripod. Show the whole front eave and garage line lit, with the house sitting low in the frame and some blue sky above. Expose so the sky stays blue and the soffit wash keeps its detail. Keep signs, bins and the house number out of frame.'
  where slot = 'gallery.bungalow' and rank = 2
    and md5(concat_ws('|', coalesce(image_url, ''), page_url, site, why, shot)) = 'bded57e25c8383b941cfa7a097126f09'
    and exists (select 1 from public.presentation_references r
                 where r.slot = 'gallery.bungalow' and r.rank = 0
                   and md5(concat_ws('|', coalesce(r.image_url, ''), r.page_url, r.site, r.why, r.shot)) = 'b5bc683adbaee88dd37d688a9b98dfb9');

update public.presentation_references set
    rank = 2,
    site = 'Gemstone Lights',
    why = 'Copy the angle, not the light: a bungalow from a little off straight on, but shot by day in a cooler white. How low it sits in the frame, with sky above, is the useful part.',
    shot = 'Same as the Astoria example: blue hour, warm white, about 20 degrees off straight on from across the street, 1x, the whole front eave and garage lit.'
  where slot = 'gallery.bungalow' and rank = 0
    and md5(concat_ws('|', coalesce(image_url, ''), page_url, site, why, shot)) = 'b5bc683adbaee88dd37d688a9b98dfb9';
