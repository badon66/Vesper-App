-- Round 7 review, part 3, piece 2 of 5 (phone_control.hero): the example shots'
-- notes and order, finished (see part 1 for what changes and why). Only
-- rows still exactly as seeded change; nothing else is touched.

-- phone_control.hero: Gemstone Lights first, Govee second
-- The first example trades places with its backup through the spare rank 0,
-- because (slot, rank) is unique, and only while both rows are still as
-- seeded and rank 0 is free.
update public.presentation_references set rank = 0
  where slot = 'phone_control.hero' and rank = 1
    and md5(concat_ws('|', coalesce(image_url, ''), page_url, site, why, shot)) = '8b785d22245e2367201c67d5d28dfedf'
    and exists (select 1 from public.presentation_references r
                 where r.slot = 'phone_control.hero' and r.rank = 2
                   and md5(concat_ws('|', coalesce(r.image_url, ''), r.page_url, r.site, r.why, r.shot)) = '457caf0e55d75af84fd2c7674d31b387')
    and not exists (select 1 from public.presentation_references r
                     where r.slot = 'phone_control.hero' and r.rank = 0);

update public.presentation_references set
    rank = 1,
    site = 'Gemstone Lights',
    why = 'A real hand holding the phone with its screen toward the camera, shot over the shoulder. Copy the hold and the screen angle; ours is outside at blue hour with the lit house softly behind, which this one doesn''t have.',
    shot = 'Shoot 15 to 30 minutes after sunset, with the house on steady warm white. Stand on the front walk about 8 m back and use 2x. Hold the phone in the lower right third, screen toward the camera, with the app''s looks screen open and readable, at about half brightness so it doesn''t glare. Tap to focus on the screen, so the house behind goes soft and its roofline crosses the upper third. Over the shoulder works too: stand just behind the person holding the phone, with their shoulder soft in the lower right corner. Turn on Do Not Disturb, keep rings and a watch out of the shot, keep the app''s name out of frame if it shows, and keep the house number out of frame.'
  where slot = 'phone_control.hero' and rank = 2
    and md5(concat_ws('|', coalesce(image_url, ''), page_url, site, why, shot)) = '457caf0e55d75af84fd2c7674d31b387'
    and exists (select 1 from public.presentation_references r
                 where r.slot = 'phone_control.hero' and r.rank = 0
                   and md5(concat_ws('|', coalesce(r.image_url, ''), r.page_url, r.site, r.why, r.shot)) = '8b785d22245e2367201c67d5d28dfedf');

update public.presentation_references set
    rank = 2,
    site = 'Govee',
    why = 'Copy the layout, not the colour or the app: the phone in the lower corner with its screen readable, and the lit house filling the rest. It is a rainbow-lit advertisement with Govee''s own app on screen.',
    shot = 'Same as the Gemstone example, in warm white, with the app''s name out of frame.'
  where slot = 'phone_control.hero' and rank = 0
    and md5(concat_ws('|', coalesce(image_url, ''), page_url, site, why, shot)) = '8b785d22245e2367201c67d5d28dfedf';
