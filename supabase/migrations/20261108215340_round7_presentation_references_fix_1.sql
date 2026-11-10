-- Round 7 review (Keenan, 2026-11-08): the example shots to copy, made fit
-- for Keenan to shoot from. The seeded notes (supabase/migrations/
-- 20261108082553_round7_presentation_references_seed.sql, applied, left as
-- it is) read like a research log, and several first examples showed the
-- opposite of their slot once the images loaded. Every example image was
-- looked at by eye for this migration.
--
-- What changes:
--   - every row's why: one or two plain sentences on what to copy (angle,
--     time of day, framing, which lights are on), with no research notes;
--     where nothing fits the slot, it starts with a plain line such as
--     "Copy the angle, not the colour.";
--   - every row's site: the site's name only;
--   - the shots: "light", never "node", and no white balance step the
--     iPhone's own Camera app can't do;
--   - first examples that contradicted their slot trade places with the
--     backup that fits: Warm white at an angle, Phone in hand, the bungalow,
--     the control box and the warranty's winter corner;
--   - Night, same spot: Trimlight's own night frame of the same house as the
--     Day example (it was Oelo's red-lit frame of a different house), so the
--     rehearsal's slider pairs one house from one tripod spot;
--   - App screens: the same listing's looks list (it was the sign-in splash).
--
-- Only rows still exactly as seeded change. Each is matched on a fingerprint
-- of its seeded links and words, md5(concat_ws('|', image_url or '',
-- page_url, site, why, shot)), so a row Keenan has edited in Settings is left
-- as he wrote it. Two rows trade places only when both are still as seeded,
-- through the spare rank 0, because (slot, rank) is unique. Updates only.

-- what_vesper_is.hero, example 1: Gemstone Lights
update public.presentation_references set
    site = 'Gemstone Lights',
    why = 'An ordinary two-storey with a front garage, every run lit warm white as separate points against a deep blue sky. Copy the colour, the sky and the evenly spaced lights, but shoot it straight on from across the street rather than up from the driveway, with the house number out of frame.',
    shot = 'Tripod on the far sidewalk across the street at chest height, levelled, 1x lens, straight on, 15 to 30 minutes after that day''s sunset while the sky is deep blue. Warm white steady on every run: eaves, front gable and the garage line. Frame the house across the middle 70% of the width, keep the whole roofline inside the middle 60% of the height, leave a strip of sky above the peak and the empty driveway at the bottom. Porch light off, at most one or two lamps on inside, garage closed, no house number or plates in frame. Hold AE/AF lock on the eave lights and pull exposure down (about -1 to -2 EV) until every light is its own point, not a line. Landscape, at least 2732 px wide.'
  where slot = 'what_vesper_is.hero' and rank = 1
    and md5(concat_ws('|', coalesce(image_url, ''), page_url, site, why, shot)) = 'e6063ab5193be4abd543d10098d2503f';

-- what_vesper_is.hero, example 2: Astoria Lighting Co.
update public.presentation_references set
    site = 'Astoria Lighting Co.',
    why = 'Backup for the sky only: a deep blue dusk with a little cloud. Its lights are pot lights washing the wall, with the windows and garden lit and the house number showing, so copy the timing, not the lighting.'
  where slot = 'what_vesper_is.hero' and rank = 2
    and md5(concat_ws('|', coalesce(image_url, ''), page_url, site, why, shot)) = 'e7d1743548d403b14aea1c13a9a1b7bb';

-- hidden_by_day.night, example 1: Trimlight
update public.presentation_references set
    image_url = 'https://trimlight.com/hubfs/Night-shot-home-after.jpg',
    page_url = 'https://trimlight.com/day-night',
    site = 'Trimlight',
    why = 'The night half of Trimlight''s pair: the same house, from the same tripod spot as the day example. Copy the locked framing; ours is warm white, with the exposure lower so each light stays a point instead of a starburst, and the windows and garden lights dark.',
    shot = 'Leave the tripod, framing, zoom and focus exactly as they were for the day frame. Shoot 15 to 30 minutes after sunset with warm white steady on every run. Press and hold on the eave lights for AE/AF Lock and pull exposure down until each light is a point. Porch light off. Same resolution and orientation as the day frame so the two line up to the pixel in the slider.'
  where slot = 'hidden_by_day.night' and rank = 1
    and md5(concat_ws('|', coalesce(image_url, ''), page_url, site, why, shot)) = 'e9d3aa1273aae0cd053fd0b21dfe9f44';

-- hidden_by_day.night, example 2: Gemstone Lights
update public.presentation_references set
    site = 'Gemstone Lights',
    why = 'Backup, and the closest to the look we want: an ordinary two-storey with a front garage, every run lit as separate points against a deep blue sky. Its pair on the page is the same house at night with the lights off, not by day, so it can''t stand in for the day frame.'
  where slot = 'hidden_by_day.night' and rank = 2
    and md5(concat_ws('|', coalesce(image_url, ''), page_url, site, why, shot)) = 'dc1e20cf36cd582984c00dcbbd8beaf3';

-- whites_first.warm, example 1: Gemstone Lights
update public.presentation_references set
    site = 'Gemstone Lights',
    why = 'Copy the framing, not the sky or the house number. A close, straight-on view of a gable and its window in warm white shows the points, the soffit glow and the wall colour, where warm and cool can be compared; ours is shot later, against a deep blue sky, with the lamp inside off and no number in frame.',
    shot = 'Tripod straight on to one front corner and a window at about 6 m, 1x, 15 to 30 minutes after sunset, warm white steady. Before shooting, set white balance to daylight in a camera app that can lock it (for example Lightroom or Halide; the iPhone''s own Camera app can''t), then press and hold on the lights for AE/AF Lock. Shoot the warm frame. Then, without touching the phone or tripod, switch the lights to cool white and shoot the matching frame, so the pair differs only in the colour of the light.'
  where slot = 'whites_first.warm' and rank = 1
    and md5(concat_ws('|', coalesce(image_url, ''), page_url, site, why, shot)) = '85a5aa343242228b4c26e8f91b53acdf';

-- phone_control.screens, example 1: JellyFish Lighting
update public.presentation_references set
    image_url = 'https://is1-ssl.mzstatic.com/image/thumb/PurpleSource221/v4/ee/98/c2/ee98c294-44c9-e1c1-e475-b87e09c42808/Simulator_Screenshot_-_iPhone_16_Pro_Max_-_2025-04-21_at_12.46.42.png/460x998bb-60.jpg',
    site = 'JellyFish Lighting',
    why = 'A straight screenshot of an app''s list of looks: the full screen, no device frame, nothing personal on it. Ours comes from the real app on your phone, with its brand name cropped out.',
    shot = 'Take two or three screenshots on your own phone (side button and volume up together): the looks list, the lights on, and the lights off or the on and off control. Turn on Do Not Disturb first, clear notifications, and keep anything personal or from other apps off screen. Use the screenshots as they are, with no phone frame or mockup added.'
  where slot = 'phone_control.screens' and rank = 1
    and md5(concat_ws('|', coalesce(image_url, ''), page_url, site, why, shot)) = 'ab074d219b0bca9ed6fb2e4a33141370';

-- gallery.bi_level, example 1: Gemstone Lights
update public.presentation_references set
    site = 'Gemstone Lights',
    why = 'No bi-level to copy, so copy the light: warm white points on every run at blue hour, framed around the entry. The windows here are all lit; keep the lamps inside off so only our lights show.',
    shot = 'Blue hour, warm white steady, from the public sidewalk about 15 to 30 degrees off straight-on toward the entry side so the split entry (door, landing and steps between the two levels) reads clearly, 1x. Whole front lit: upper eaves, gable and any lower or garage run. Porch light off, no house number or plates, exposure held down so each light stays a point.'
  where slot = 'gallery.bi_level' and rank = 1
    and md5(concat_ws('|', coalesce(image_url, ''), page_url, site, why, shot)) = '5a6bddc333d7ec456c8188079bccf7c9';

-- gallery.bi_level, example 2: Gemstone Lights
update public.presentation_references set
    site = 'Gemstone Lights',
    why = 'Backup for shape only: a wide, low house that reads like a bi-level from the street. It is shot by day in a cooler white, so copy how much ground and sky it leaves, not the light.'
  where slot = 'gallery.bi_level' and rank = 2
    and md5(concat_ws('|', coalesce(image_url, ''), page_url, site, why, shot)) = 'cf4c9c3de7d0e7f7ac9c823283ea46a8';

-- gallery.holiday, example 1: Gemstone Lights
update public.presentation_references set
    site = 'Gemstone Lights',
    why = 'Christmas in blocks of red and green on an ordinary two-storey, straight on, with the house still easy to read. Copy the framing and the clean, separate points; shoot it later, when the sky is deep blue rather than sunset pink.'
  where slot = 'gallery.holiday' and rank = 1
    and md5(concat_ws('|', coalesce(image_url, ''), page_url, site, why, shot)) = '19db429c4a10b00e87e12e49a37b92d9';

-- gallery.holiday, example 2: Trimlight
update public.presentation_references set
    site = 'Trimlight',
    why = 'Backup for Game night: two colours on one house at blue hour. Copy the deep blue sky and the whole front in frame, and leave out the house number.'
  where slot = 'gallery.holiday' and rank = 2
    and md5(concat_ws('|', coalesce(image_url, ''), page_url, site, why, shot)) = 'e90e18be7bfb644ac3e0b62b1079cce2';

-- warranty.hero: Gemstone Lights first, JellyFish Lighting second
do $$
begin
  if (select count(*) from public.presentation_references
        where slot = 'warranty.hero'
          and ((rank = 1 and md5(concat_ws('|', coalesce(image_url, ''), page_url, site, why, shot)) = 'cd2aa4e5c6f96899c4782d22a53f1795')
            or (rank = 2 and md5(concat_ws('|', coalesce(image_url, ''), page_url, site, why, shot)) = '6acc92596c4a170ac2922b28af138a2e'))) = 2
     and not exists (select 1 from public.presentation_references where slot = 'warranty.hero' and rank = 0) then
    update public.presentation_references set rank = 0 where slot = 'warranty.hero' and rank = 1;
    update public.presentation_references set
      rank = 1,
      site = 'Gemstone Lights',
      why = 'No snow in this one: copy the eave corner crossing the frame on a diagonal, with the warm white lights clean and even under the soffit. Ours is shot after fresh snow, later, when the sky is deep blue rather than pink.',
      shot = 'A clear evening after fresh snow, warm white steady, 15 to 30 minutes after sunset so the snow reads blue and the lights read warm. Stand in the driveway 3 to 4 m back, 1x or 2x, with an outside corner of the eave crossing the frame on a slight diagonal, as in this example: the snow line along the roof edge above, a clean, even row of lights under the soffit below. Keep the corner inside the middle 50% of the width for the tall crop. Press and hold on the lights for AE/AF Lock. A camera app that can lock white balance to daylight (for example Lightroom or Halide) keeps the snow blue and the lights warm. Porch light off, no house number.'
      where slot = 'warranty.hero' and rank = 2;
    update public.presentation_references set
      rank = 2,
      site = 'JellyFish Lighting',
      why = 'Copy the mood, not the colour: snow on the roof edge above the lights. It is small and lit blue, with yard decorations and bright windows, all of which ours leaves out.',
      shot = 'Same as the Gemstone example.'
      where slot = 'warranty.hero' and rank = 0;
  end if;
end $$;
