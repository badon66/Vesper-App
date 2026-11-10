-- Round 7 review, part 2 of 3: the example shots' notes, continued (see
-- part 1 for what changes and why). Updates only, on rows still as seeded.

-- what_vesper_is.more, example 1: Trimlight
update public.presentation_references set
    why = 'Trimlight''s page on how its lights sit in the channel under the eave. Its main photo is a whole house by day, so use it for the idea and follow the shot below for the close, low angle along the run.',
    shot = 'At dusk, warm white, steady, full brightness. Stand on the driveway about 2 m out, just below one front eave corner. iPhone at 1x (2x if the gutter corner pushes in), tilted up about 45 degrees and aimed along the run so the track leads away diagonally from the near corner. Frame only soffit, fascia edge and track with 6 to 8 lights showing, and no downspout. Tap and hold on the nearest light to lock focus and exposure, then drag exposure down until the lights are crisp separate dots, not blobs, and the soffit wash stays soft.'
  where slot = 'what_vesper_is.more' and rank = 1
    and md5(concat_ws('|', coalesce(image_url, ''), page_url, site, why, shot)) = '5b31486c64ab49f6eb127af810ab7feb';

-- what_vesper_is.more, example 2: Reviewed
update public.presentation_references set
    site = 'Reviewed',
    why = 'A review with photos of the lights under a real roof eave, taken from below. Copy the angle and the framing, not the hardware: these are clip-on lights, not a track.',
    shot = 'Same as the main shot: 2 m out below a front eave corner, 1x, about 45 degrees up along the run. Show soffit, fascia and Vesper''s track with 6 to 8 lit warm white lights, exposed on the nearest light.'
  where slot = 'what_vesper_is.more' and rank = 2
    and md5(concat_ws('|', coalesce(image_url, ''), page_url, site, why, shot)) = '976f3cf47a85be8be1a315645e44d2cc';

-- hidden_by_day.more, example 1: Trimlight
update public.presentation_references set
    why = 'Trimlight''s answer to what the track looks like by day. Its picture is a whole house, split day and night in colour, so follow the shot below for the close, eye-height view of the track under the soffit.'
  where slot = 'hidden_by_day.more' and rank = 1
    and md5(concat_ws('|', coalesce(image_url, ''), page_url, site, why, shot)) = 'f10fab6a69cfd412f76d169fc836eb46';

-- hidden_by_day.more, example 2: Trimlight
update public.presentation_references set
    why = 'The same page as the day and night examples. Its photo of a house by day shows how little of the lights shows from the street; stand closer, on the front walk, so the track reads against the soffit.'
  where slot = 'hidden_by_day.more' and rank = 2
    and md5(concat_ws('|', coalesce(image_url, ''), page_url, site, why, shot)) = 'ae6ea380163a2da6b0d338e067298282';

-- whites_first.cool, example 1: JellyFish Lighting
update public.presentation_references set
    why = 'JellyFish''s page on its range of whites. Look there for one house shown in more than one white: the pair only works when nothing but the light changes between the two frames.',
    shot = 'Keep the tripod and framing from the warm white shot, with focus and exposure locked (AE/AF Lock). In the app, switch to cool white at the same brightness and shoot within 30 seconds. Shoot both frames in a camera app that locks white balance (for example Lightroom or Halide); the iPhone''s own Camera app pulls cool white back toward neutral and hides the difference. Change nothing else.'
  where slot = 'whites_first.cool' and rank = 1
    and md5(concat_ws('|', coalesce(image_url, ''), page_url, site, why, shot)) = 'e0086e581c7632405b6574a6af0dba08';

-- gallery.two_storey, example 1: Gemstone Lights
update public.presentation_references set
    site = 'Gemstone Lights',
    why = 'Gemstone''s gallery has ordinary two-storey homes with front garages lit warm white at blue hour, like the whole-house example for page 2. Pick one shot straight on and copy its level framing and deep blue sky.'
  where slot = 'gallery.two_storey' and rank = 1
    and md5(concat_ws('|', coalesce(image_url, ''), page_url, site, why, shot)) = '234ef9972cf649244406ae1c0bbf9554';

-- gallery.snow, example 1: Gemstone Lights
update public.presentation_references set
    site = 'Gemstone Lights',
    why = 'Gemstone''s page for a snowy mountain town. Look through its photos for a roofline with snow on it; the shot below says the rest.',
    shot = 'The evening after fresh snow, before it is walked on or plowed, 15 to 30 minutes after sunset, warm white steady. Tripod across the street, 1x, level. Snow on the roof edge above the track and an untouched strip of lawn snow in the lower third. Check first that no snow or icicles hide the lights. Expose for the lights, then bring exposure down until the snow is blue-grey, not blown white.'
  where slot = 'gallery.snow' and rank = 1
    and md5(concat_ws('|', coalesce(image_url, ''), page_url, site, why, shot)) = '38a3fc573afd32cdaea767503ae6d3be';

-- gallery.snow, example 2: Gemstone Lights
update public.presentation_references set
    site = 'Gemstone Lights',
    why = 'Gemstone''s winter lighting guide, for ideas on lights with snow. Its photos are holiday colours and bright white rather than snow, so follow the shot below.'
  where slot = 'gallery.snow' and rank = 2
    and md5(concat_ws('|', coalesce(image_url, ''), page_url, site, why, shot)) = 'c30909a48b02a1dd89a25db64bd14423';

-- install_day.hero, example 1: Trimlight Calgary
update public.presentation_references set
    site = 'Trimlight Calgary',
    why = 'A local installer''s page about its crew. Use it for how a crew at work can look; the shot below gives the angle.'
  where slot = 'install_day.hero' and rank = 1
    and md5(concat_ws('|', coalesce(image_url, ''), page_url, site, why, shot)) = '9c368e7506761921ccf913e3d1c5dc1b';

-- install_day.hero, example 2: Outdoor Lighting Perspectives
update public.presentation_references set
    site = 'Outdoor Lighting Perspectives',
    why = 'An installer''s page on roofline lighting. Use it only if its crew photo shows the ground-level angle the shot below describes.'
  where slot = 'install_day.hero' and rank = 2
    and md5(concat_ws('|', coalesce(image_url, ''), page_url, site, why, shot)) = 'b55abd3db23f904453f7cda3d0d59795';

-- hidden_by_day.day, example 1: Trimlight
update public.presentation_references set
    site = 'Trimlight',
    why = 'The same house and tripod spot as the night example, so the slider shows only the light changing. Copy the locked tripod and the soft, even daylight, but stand straight on rather than at this corner.'
  where slot = 'hidden_by_day.day' and rank = 1
    and md5(concat_ws('|', coalesce(image_url, ''), page_url, site, why, shot)) = '4188a0676078f41b9a25d239f84736d3';

-- hidden_by_day.day, example 2: Oelo
update public.presentation_references set
    site = 'Oelo',
    why = 'Backup: a level, straight-on day frame of a large house from the back lawn. Oelo''s night frame of it is lit red with every window bright, so copy only the framing.',
    shot = 'Same as the Trimlight day example. Lock the tripod and keep zoom and framing identical between the day frame and the dusk frame, so the two line up exactly and nothing moves when one fades into the other.'
  where slot = 'hidden_by_day.day' and rank = 2
    and md5(concat_ws('|', coalesce(image_url, ''), page_url, site, why, shot)) = '28e6e71ef2e4f4022a2c16e7d7584624';
