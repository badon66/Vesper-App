-- Round 7 review, part 3, piece 4 of 5 (gallery.garage): the example shots'
-- notes and order, finished (see part 1 for what changes and why). Only
-- rows still exactly as seeded change; nothing else is touched.

-- gallery.garage, example 1: Astoria Lighting Co.
update public.presentation_references set
    site = 'Astoria Lighting Co.',
    why = 'A tight garage shot at blue hour: each light a separate point under the soffit, and the wash falling down the garage doors. Copy that, with the wall lights beside the doors off.'
  where slot = 'gallery.garage' and rank = 1
    and md5(concat_ws('|', coalesce(image_url, ''), page_url, site, why, shot)) = '7a385bd6ff89c66581212ef1b4f6fefd';

-- gallery.garage, example 2: Gemstone Lights
update public.presentation_references set
    site = 'Gemstone Lights',
    why = 'Backup for scale only: how close to stand before each light reads on its own. It is an eave corner at a pink sunset, not a garage, so follow the main example for the rest.',
    shot = 'Same as the Astoria garage entry above. If the points blur together, step closer or go to 2x until the space between lights is visible along the eave.'
  where slot = 'gallery.garage' and rank = 2
    and md5(concat_ws('|', coalesce(image_url, ''), page_url, site, why, shot)) = '6dbe736cb1710c4730f02d362b2e0fc9';
