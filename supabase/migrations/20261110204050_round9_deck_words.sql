-- Round 9, the meeting as one story (the five seats, 2026-11-10): the
-- deck's words for the new page order, in settings.deck. Each page's words
-- change only where they still read exactly as round 7 seeded them
-- (20261108080527_round7_deck_words_and_looks.sql), so nothing Keenan has
-- edited in Settings is overwritten; the new pages and the built pages'
-- lines are added only where the deck has none yet. Plain updates only.
--
-- Meeting mode reads these through lib/deck.ts (parseDeckWords), which has
-- the same words as its defaults for a deck that has none. Round 7's How
-- install day works stays in the deck as it is: the customer's link reads
-- it until its own function moves to What happens next, and Settings keeps
-- it on every save.

-- What's in it: the app line comes off, because Run it from your phone says it.
update public.settings
   set deck = jsonb_set(deck, '{pages,what_vesper_is,more_text}', to_jsonb($new$The lights sit in a slim aluminum track, about 8 inches apart, tucked under the soffit, the underside of your roof's edge.
Each light has red, green and blue, plus its own white.
A control box plugs into a standard outlet.$new$::text))
 where id = 1
   and deck #>> '{pages,what_vesper_is,more_text}' = $old$The lights sit in a slim aluminum track, about 8 inches apart, tucked under the soffit, the underside of your roof's edge.
Each light has red, green and blue, plus its own white.
A control box plugs into a standard outlet.
You run it from an app on your phone, over your home Wi-Fi.$old$;

-- Up close: the colour sentences come off; colour is said once, on the colour page.
update public.settings
   set deck = jsonb_set(deck, '{pages,hidden_by_day,more_text}', to_jsonb($new$The track tucks under the soffit, where it's hard to spot by day. If your community has guidelines, we're happy to answer questions.$new$::text))
 where id = 1
   and deck #>> '{pages,hidden_by_day,more_text}' = $old$The track tucks under the soffit, where it's hard to spot by day. White track is in stock. Other colours are made to order. If your community has guidelines, we're happy to answer questions.$old$;

-- Run it from your phone: app set-up is said once, on What happens next.
update public.settings
   set deck = jsonb_set(deck, '{pages,phone_control,words}', to_jsonb($new$Pick a look in the app and your house changes. On or off, warm white or colour.$new$::text))
 where id = 1
   and deck #>> '{pages,phone_control,words}' = $old$Pick a look in the app and your house changes. We set up the app with you on install day.$old$;

-- Try it on your house: it opens on Warm white and now says so (Warm white, most
-- nights only stands in for it when there is no trace).
update public.settings
   set deck = jsonb_set(deck, '{pages,light_picker,words}', to_jsonb($new$A preview drawn on our photo of your house. Most nights, warm white. Tap a look.$new$::text))
 where id = 1
   and deck #>> '{pages,light_picker,words}' = $old$A preview drawn on our photo of your house. Tap a look.$old$;

-- Where your lights would go becomes the stand-in for Your house: Your house, lit.
update public.settings
   set deck = jsonb_set(deck, '{pages,mockup,headline}', to_jsonb($new$Your house, lit$new$::text))
 where id = 1
   and deck #>> '{pages,mockup,headline}' = $old$Where your lights would go$old$;

-- Its line under the title (round 7 had none).
update public.settings
   set deck = jsonb_set(deck, '{pages,mockup,words}', to_jsonb($new$Our drawing of your lights on your photo.$new$::text))
 where id = 1
   and deck #>> '{pages,mockup,words}' = $old$$old$;

-- Your house: their house by day, measured, before the light picker.
update public.settings
   set deck = jsonb_set(deck, '{pages,your_house}', $page${"headline": "Your house", "words": "We measured {feet} ft of roofline.", "more_label": "What we measured", "more_text": "Upper is the second storey. Lower is the main floor."}$page$::jsonb)
 where id = 1
   and deck -> 'pages' is not null
   and deck #> '{pages,your_house}' is null;

-- What happens next: the last page. What we'll need comes over from How
-- install day works as it stands, Keenan's edits included.
update public.settings
   set deck = jsonb_set(deck, '{pages,next_steps}', jsonb_build_object(
         'headline', 'What happens next',
         'words', '',
         'more_label', coalesce(nullif(deck #>> '{pages,install_day,more_label}', ''), $t$What we'll need$t$),
         'more_text', coalesce(nullif(deck #>> '{pages,install_day,more_text}', ''), $t$An outlet near where the control box will go, in the garage or outside.
Your Wi-Fi name and password, so we can set up the app with you.$t$)))
 where id = 1
   and deck -> 'pages' is not null
   and deck #> '{pages,next_steps}' is null;

-- The built pages' lines: the cover, the Next label, the colour page, the
-- price, What happens next and the customer's link (lib/deck.ts
-- DECK_LINE_DEFAULTS, word for word).
update public.settings
   set deck = jsonb_set(deck, '{lines}', $lines${
  "cover_line": "What it is, your house lit up, and your price.",
  "next_prefix": "Next: {page}",
  "house_drawing_caption": "Our drawing of your roofline.",
  "colour_headline": "Your track colour",
  "colour_opener": "By day you see the track, so you choose its colour.",
  "colour_one": "One track colour for the whole house.",
  "colour_stock": "White is in stock and included.",
  "colour_made": "{colour} is made to order.",
  "colour_spring_label": "Install in spring",
  "colour_spring_value": "Included",
  "colour_season_label": "Install this season",
  "colour_season_value": "{fee} rush colour fee",
  "colour_book": "Screens can't show colour exactly, so we choose it from the colour book together.",
  "initials_prompt": "Your initials confirm the colour on your quote.",
  "initials_done": "Confirmed with your initials.",
  "price_headline": "Your price",
  "price_sub_many": "{Count} options, all with {colour} track.",
  "price_sub_one": "With {colour} track.",
  "price_includes": "Every option includes the control box, install by our own crew and our 10-year warranty.",
  "price_held": "Price held until {date}.",
  "financing": "Financing is available. Just ask.",
  "price_empty": "Your options show here once we've measured.",
  "whats_in": "What's in {name}",
  "choose": "Choose {name}",
  "your_choice": "Your choice",
  "recap": "Your choice: {name}, {total}",
  "step_colour_label": "Your colour",
  "step_colour_done": "{colour}, confirmed with your initials.",
  "step_colour_todo": "We confirm it with you from the colour book.",
  "step_day_label": "Your install day",
  "step_day_none": "We pick the day together.",
  "step_day_button": "Pick a day",
  "step_on_day_label": "On the day",
  "step_on_day": "A small crew fits the track and plugs in the control box. We clean up and set up the app with you.",
  "step_pay_label": "Paying",
  "closing": "We'll text you a link to this quote, with every option.",
  "link_mockup_caption": "Our mockup shows every run lit.",
  "link_drawing_caption": "Gold marks the lights in {name}.",
  "link_meeting_tag": "Your choice at the meeting",
  "link_something_else": "Want something different? Call or text Keenan.",
  "link_colour_done": "{colour}, confirmed with your initials at the meeting."
}$lines$::jsonb)
 where id = 1
   and deck -> 'lines' is null;
