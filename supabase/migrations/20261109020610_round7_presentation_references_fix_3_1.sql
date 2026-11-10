-- Round 7 review, part 3, piece 1 of 5 (whites_first.hero): the example shots'
-- notes and order, finished (see part 1 for what changes and why). Only
-- rows still exactly as seeded change; nothing else is touched.

-- whites_first.hero: Gemstone Lights first, Astoria Lighting Co. second
-- The first example trades places with its backup through the spare rank 0,
-- because (slot, rank) is unique, and only while both rows are still as
-- seeded and rank 0 is free.
update public.presentation_references set rank = 0
  where slot = 'whites_first.hero' and rank = 1
    and md5(concat_ws('|', coalesce(image_url, ''), page_url, site, why, shot)) = 'b1f30b5e92e260756b53ff543fb5efbe'
    and exists (select 1 from public.presentation_references r
                 where r.slot = 'whites_first.hero' and r.rank = 2
                   and md5(concat_ws('|', coalesce(r.image_url, ''), r.page_url, r.site, r.why, r.shot)) = 'dff66bf9c88190f52eedd16b46ac2f08')
    and not exists (select 1 from public.presentation_references r
                     where r.slot = 'whites_first.hero' and r.rank = 0);

update public.presentation_references set
    rank = 1,
    site = 'Gemstone Lights',
    why = 'Warm white only, at blue hour, from a three-quarter angle that takes in the entry and the garage, with the light washing down the brick. Copy the angle and the warm wash; ours is a bungalow or bi-level, a little closer, with the porch and wall lights off.',
    shot = 'Shoot 15 to 30 minutes after sunset. Every light on steady warm white, no colour mixed in, porch light off, front door closed. Stand at the end of the driveway at a three-quarter angle, so the garage eave runs away from you toward the front entry. Use 2x and let the garage eave and entry fill the frame. Tap the lit siding under the eave and lower the exposure until the wash on the siding or stone keeps its texture and each light stays a crisp point. Brace the phone or use a small tripod, and turn Night mode off if it blurs the points.'
  where slot = 'whites_first.hero' and rank = 2
    and md5(concat_ws('|', coalesce(image_url, ''), page_url, site, why, shot)) = 'dff66bf9c88190f52eedd16b46ac2f08'
    and exists (select 1 from public.presentation_references r
                 where r.slot = 'whites_first.hero' and r.rank = 0
                   and md5(concat_ws('|', coalesce(r.image_url, ''), r.page_url, r.site, r.why, r.shot)) = 'b1f30b5e92e260756b53ff543fb5efbe');

update public.presentation_references set
    rank = 2,
    site = 'Astoria Lighting Co.',
    why = 'Copy the angle, not the colour. It is lit pink and purple against a black sky; the low three-quarter view along the porch and garage is the useful part.',
    shot = 'Same as the Gemstone example: warm white only, porch light off, a three-quarter angle from the end of the driveway, 2x, exposed for the lit wall.'
  where slot = 'whites_first.hero' and rank = 0
    and md5(concat_ws('|', coalesce(image_url, ''), page_url, site, why, shot)) = 'b1f30b5e92e260756b53ff543fb5efbe';
