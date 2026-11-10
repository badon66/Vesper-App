# The meeting as one story: build spec (round 9, Branch B)

Settled 2026-11-10 from the five seats' final positions. Seats: **H** homeowner, **C** closer, **D** designer, **I** iPad, **E** editor.
How it was settled: where seats split, the majority carries. Where a wording had no majority, its parts were settled one at a time, each part going the way most seats wrote it, and this is noted. A tie goes to Keenan's own wording or order in the brief, and where the brief says nothing, to what is built today. Keenan's six points and CLAUDE.md are fixed.

Customers read **option**. **Offer** is only used in Keenan's editor ("+ Offer"). The Accepted sheet says "option" (4 to 1: H, C, D, I; E wanted "offer").

---

## 0. The order at a glance

| # | Page (headline) | Key | Chapter | Tonight |
|---|---|---|---|---|
| 1 | Cover | `cover` | Vesper | shown |
| 2 | Up once, there all year | `what_vesper_is` | Vesper | shown |
| 3 | Hidden by day | `hidden_by_day` | Vesper | shown |
| 4 | Run it from your phone | `phone_control` | Vesper | shown |
| 5 | Homes we've lit | `gallery` | Vesper | skipped while it has no photos |
| 6 | Our 10-year warranty | `warranty` | Vesper | shown |
| 7 | Your house | `your_house` (new) | Their house | shown |
| 8 | Try it on your house | `light_picker` | Their house | shown when the roofline is traced |
| 9 | Your track colour | `colour` | Their house | shown |
| 10 | Your price | `quote` | Their house | shown |
| 11 | What happens next | `next_steps` (new) | After the yes | shown at every meeting, never skipped |

That's 11 pages, and 10 tonight while the gallery is empty. All the Vesper pages come first, then the story turns once to their house and never comes back to Vesper. All five seats agreed on this order in their final round (D gave way on the warranty, and H and E moved the phone page up).

Stand-ins that are not in the order: `whites_first` (Warm white) and `mockup` (Your house, lit). See page 7.
Gone from the order: How install day works (`install_day`) and Where your lights would go (as a page).

### Across every page
- **"Next:" label** (3 to 2: C, I, E for; H and D wanted a labelled chapter strip instead). A quiet `Next: {headline of the next shown page}` sits beside the forward chevron on every page except the last, at 20 px in Night Muted Text, so it can be read from about 1.2 m. It is built from the page headlines in settings.deck, so it always names the page that actually comes next (skipped pages are left out). The dots stay as built. There is no chapter strip tonight. This replaces round 7's rule that "the bridges are Keenan's to say": update docs/01-product-spec.md and docs/decisions.md.
- **Settings labels:** Settings > Presentation lists each page by its current headline: "Up once, there all year" (not "What Vesper is"), "Our 10-year warranty" (not "The warranty"), "Your house", "What happens next", "Warm white (stand-in)" and "Your house, lit (stand-in)".
- **Sizes:** nothing customer facing under 20 px at 1180 x 820. Tap targets are 48 px or more, and buttons 56 px.
- **Holding plan** (Keenan's behaviour, not a build item; C and I): the iPad sits on its stand facing the homeowners for pages 1 to 7, with Keenan at the corner of the table. He hands it over once dusk falls on the picker ("Try a look."). The customer keeps it through the colour and the initials, then it goes back on the stand for Your price and What happens next.
- **Every new or changed word** goes into settings.deck by migration. Built pages' strings go in a new flat map, `settings.deck.lines` (key to string), which has code defaults and the same word checks (no dashes, no exclamation marks, word limits). A seed migration changes a page's words only where they still match the round 7 seed, so nothing Keenan has edited is overwritten (E, the way round 3 handled the step notes). Write it as plain `update ... set deck = jsonb_set(...) where deck #>> '{pages,x,words}' = '<seeded text>'` statements, with no `do` blocks.
- **Fixed by CLAUDE.md, not editable:** "No payment until your install is complete." and the warranty from settings.warranty_text, word for word.

---

## 1. The meeting, page by page

### 1. Cover (`cover`): keep
- **Purpose:** whose meeting this is and what's coming, including the price, so they listen to the product pages instead of waiting for the number.
- **On screen:** navy, the VESPER wordmark, their address as built, and one new line under the address (`lines.cover_line`). Then `Next: Up once, there all year`.
- **Behind a tap:** nothing.
- **Bridge:** the line names the three parts, and the Next label names the first.
- **Words:** `lines.cover_line` = "What it is, your house lit up, and your price."
- **Contested:** 3 seats wanted a map line (C, E, I) and 2 a product line, "Permanent roofline lighting, installed by our own crew." (H, D). H and D tied their line to a chapter strip, which lost 3 to 2. On the wording, C and E chose "your house lit up, and your price", against I's "your house, and your options".

### 2. Up once, there all year (`what_vesper_is`): keep
- **Purpose:** what it is: a track with the lights built in, and nothing to hang.
- **On screen:** as built. The lit two-storey drawing (or Keenan's hero photo), the headline and the words. It's the same drawing the price page lights later.
- **Behind a tap:** What's in it, without the app line, because page 4 says it (5 to 0).
- **Bridge:** "Nothing to hang every fall." raises the question of how it looks the rest of the year, and the next headline answers it.
- **Words:** headline and words unchanged. `more_text` changes to:
  "The lights sit in a slim aluminum track, about 8 inches apart, tucked under the soffit, the underside of your roof's edge.\nEach light has red, green and blue, plus its own white.\nA control box plugs into a standard outlet."
  (This cuts "You run it from an app on your phone, over your home Wi-Fi.") E also wanted the soffit clause out, 4 to 1 to keep it.
- **Contested:** C's round 1 merge with Hidden by day was withdrawn. Every seat keeps both pages.

### 3. Hidden by day (`hidden_by_day`): keep
- **Purpose:** the first worry, whether it looks like junk by day. The slider answers it without Keenan talking.
- **On screen:** the day and night slider as built.
- **Behind a tap:** Up close, with the colour sentences taken out (5 to 0). Colour is said once, on the colour page, where it's decided and priced.
- **Bridge:** the words end "By night you choose the light.", and the next page is how you choose it.
- **Words:** headline "Hidden by day" (4 to 1; H wanted "What you see by day", which stays Keenan's call in Settings). Words unchanged (3 to 2: C, D, I; H and E rewrote them). `more_text` = "The track tucks under the soffit, where it's hard to spot by day. If your community has guidelines, we're happy to answer questions." This is today's text without "White track is in stock. Other colours are made to order." C and I wrote it word for word. H, D and E each proposed a different rewording, and no two of them matched.

### 4. Run it from your phone (`phone_control`): move (from 6 to 4)
- **Purpose:** how they choose the light. It sets up the picker: the tap they learn here is the tap they make on their own house three pages later.
- **On screen:** as built. The lit house with the phone (or Keenan's phone photo).
- **Behind a tap:** What the app does, as built: "Turn the lights on or off and change the look from your phone. It works over your home Wi-Fi."
- **Bridge:** the Next label points at proof: "Next: Homes we've lit", or "Next: Our 10-year warranty" while the gallery is empty.
- **Words:** `words` = "Pick a look in the app and your house changes. On or off, warm white or colour." (H, C and D wrote this. I's version carried warm white here, and E's read "On, off, white or colour."). "We set up the app with you on install day." is cut, because it's said once, on What happens next (5 to 0).
- **Contested:** placed before the house, 5 to 0 in the final round (H and E moved it from after the picker, and C dropped his cut).

### 5. Homes we've lit (`gallery`): move (from 7 to 5)
- **Purpose:** proof that real houses have it, inside the Vesper chapter. It's skipped while empty, as today, so it won't show tonight.
- **On screen:** as built. **Behind a tap:** See all. **Words:** unchanged (3 to 2; H and E proposed "Real installs, in our own photos.").
- **Bridge:** "Next: Our 10-year warranty".

### 6. Our 10-year warranty (`warranty`): move (from 9 to 6)
- **Purpose:** closes the Vesper chapter. After it, the story turns to their house once.
- **On screen:** as built. The first three lines of settings.warranty_text word for word, the company and phone, and the winter photo slot.
- **Behind a tap:** The full warranty, word for word, with the service call fee.
- **Bridge:** "Next: Your house". The next page opens on their own photo, so the turn needs no words.
- **Contested:** placed before the house, 4 to 1 (D wanted it after the price and gave way). The price page carries one line that brings the warranty back at the moment of deciding.

### 7. Your house (`your_house`): new (replaces Where your lights would go)
- **Purpose:** their own house by day, measured, with nothing lit and no money. The customer recognises it for as long as Keenan stays on the page, and the forward swipe is the reveal. A separate page won 4 to 1 (H, D, I, E). C wanted one page with a "See it at dusk" button.
- **On screen:** their Front photo by day, unlit, in exactly the picker's own layout and crop (LitPhoto in its day state, lights off, `pickerFrom` framing), so nothing moves on the turn. In the band or tray: the headline, then one line built from the quote's runs. The line is hidden while the quote has no runs. The runs are not listed on screen (4 to 1; H wanted the drawing beside the photo).
- **Behind a tap ("What we measured"):** the deck's house drawing with every measured run lit in warm white, each named with its feet ("Front 64 ft"), captioned "Our drawing of your roofline." Under it: "Upper is the second storey. Lower is the main floor." (H and E). There are no prices. This teaches the drawing and the run names the price page uses.
- **Bridge:** the page turn itself. The turn from Your house to Try it on your house cross-fades instead of sliding, so the photo stays put, then dusk falls and the lights come on. The picker keeps its 500 ms day hold as built. If the cross-fade costs more than an hour, keep the slide: a hold on the photo they just looked at still reads (I).
- **Words:** `pages.your_house` = headline "Your house", words "We measured {feet} ft of roofline." (H and D; E's was close, I's said "from your photos"), more_label "What we measured", more_text "Upper is the second storey. Lower is the main floor."
- **What shows when something is missing** (settled from H, D, I and E; the one 2 to 2 split, photo or drawing when there's a Front photo but no trace and no mockup, goes to "their house" in Keenan's order):

| The lead has | Your house shows | Try it on your house | Warm white stand-in |
|---|---|---|---|
| a trace (on the Front photo) | the Front photo by day, picker crop | shown | no |
| no trace, a mockup | the mockup, with headline "Your house, lit" and words "Our drawing of your lights on your photo." (pages.mockup) | skipped | no |
| no trace, no mockup, a Front photo | the Front photo by day, in its own crop | skipped | shown after Your house |
| no photo, runs on the quote | the drawing with every measured run lit | skipped | shown |
| none of these | skipped | skipped | shown |

  The Warm white stand-in shows only when there's neither a trace nor a mockup (3 to 1: H, C and D; E wanted it whenever the picker is skipped, and I wanted it cut). It shows as today, with its words and its Warm or cool layer, because with no picker on screen nothing repeats.

### 8. Try it on your house (`light_picker`): keep (takes in Warm white's message)
- **Purpose:** their lights on their house. It opens on Warm white, Steady, so "most nights, warm white" is shown on their own house instead of being said on a separate page.
- **On screen:** as built: dusk 1.2 s, lights up, Warm white first, the looks, then Steady, Twinkle, Chase and Off.
- **Behind a tap:** nothing. The controls are the page.
- **Bridge:** the colour page opens with "By day you see the track, so you choose its colour."
- **Words:** `words` = "A preview drawn on our photo of your house. Most nights, warm white. Tap a look." No full wording had a majority, so each part was settled on its own. "A preview drawn on our photo of your house." was in 4 seats' wordings (H, C, I, E). "Most nights, warm white." was in 4 (H, C, D, E). Ending on "Tap a look." without "the way you would in the app" was 3 to 2. This makes C's wording.

### 9. Your track colour (`colour`): keep (retitled from "Your colours")
- **Purpose:** the whole colour decision on one page: the colour and, for a made-to-order colour, when and what it costs, plus the initials. It comes before the price because it can change the price.
- **On screen** (split layout: the labelled eave drawing, Fascia, Track and Soffit, on the left 56%; the right 44% holds the rest):
  1. Opener.
  2. "Your soffit" (two lines for a split soffit, as built).
  3. "Your track: {colour}" with Change the colour (as built).
  4. "One track colour for the whole house."
  5. For White, the stock line. For any other colour (Off-white, Brown, Black, Grey, Custom), the made-to-order line and two equal one-tap buttons in the picker's two-line style (an outline, and Night Text fill with a tick when chosen). "Install this season" is hidden when the quote has no rush fee. The choice sets the quote's colour timing, so every option arrives on the price page already priced.
  6. The colour book line.
  7. The initials field and Confirm, top right above the keyboard, as built, with the existing message that saving needs signal.
- **Behind a tap:** Change the colour, the chooser layer as built.
- **Bridge:** the stock or fee line points at the price, and the price page's sub-line names the colour again ("all with White track").
- **Words** (`lines.*`):
  - `colour_headline` "Your track colour"
  - `colour_opener` "By day you see the track, so you choose its colour." (5 to 0)
  - `colour_one` "One track colour for the whole house."
  - `colour_stock` "White is in stock and included." (4 to 1 against I's "so it adds nothing to your price")
  - `colour_made` "{colour} is made to order." (4 to 1)
  - `colour_spring_label` "Install in spring" / `colour_spring_value` "Included" (H, C and D chose the label; 4 seats chose "Included")
  - `colour_season_label` "Install this season" / `colour_season_value` "{fee} rush colour fee" (H, C and D chose the label; 4 seats chose the fee wording)
  - `colour_book` "Screens can't show colour exactly, so we choose it from the colour book together."
  - `initials_prompt` "Your initials confirm the colour on your quote." (4 to 1 against D's "the colour you chose"). This replaces "the track colour we'll order", which assumed a sale.
  - `initials_done` "Confirmed with your initials."
- **Contested:**
  - **Initials on this page**, 3 to 2: C, D and I for. H and E wanted them on What happens next, after the price. What happens next reads them back as step 1, and if they were skipped here the initials box appears there instead, so every meeting still gets them. This keeps CLAUDE.md's "initialled at every meeting" without a rule change. See the open questions.
  - **Rush fee amount on the button**, 5 to 0 in the final round. C and D gave way, and round 7's "no dollar figure before the price" gives way here only.
- **Code fix (I and E found it, and all five want one rule):** `defaultQuoteState` in lib/meeting/state.ts treats every list colour as `stock`. Only a list colour named White (case-insensitive) is stock. Any other list colour, and Custom, defaults to `factory_order` (spring). CLAUDE.md says white is the only stock colour. There is no stock flag in Settings tonight.

### 10. Your price (`quote`): keep (rebuilt from a form into a presentation)
- **Purpose:** every option's price at once, biggest first so Keenan walks them down from the full wrap, with the one on screen lit on the house and its own breakdown, and the customer's pick marked. See section 3.5 for the layout.
- **Behind a tap:** Keenan's small outlined "Edit" at the bottom left opens the quote editor (section 3.7) as a full-screen layer. Inputs, Save and the signal note appear only there.
- **Bridge:** "Next: What happens next". The arrow goes there whether or not an option is chosen.
- **Words:** headline "Your price" (4 to 1 against I's "Your options"). For the sub-line and the rest, see section 3.5.

### 11. What happens next (`next_steps`): new (takes in How install day works)
- **Purpose:** what happens after a yes, in one place after the price: colour confirmed, install day, what the day looks like, and no payment until it's done. Every meeting reaches it. With no pick it reads as "here's how it goes when you're ready". See section 4.
- **Bridge:** the end. The closing line hands over to the link Keenan texts, which carries the same options and the same four steps.

---

## 2. Cut or merged, and why

| Today | Decision | Why |
|---|---|---|
| Warm white, most nights (page 4) | cut from the order; stand-in only | Its Warm or cool layer repeated the picker's first two looks word for word one page later. The picker opening on Warm white, Steady, plus "Most nights, warm white." in its words, says it better on their own house. It stays as the picker's stand-in when there's neither a trace nor a mockup, so the message always lands (H, C and D). |
| Where your lights would go (page 10) | merged into Your house | Their house was lit twice, five pages apart, with Vesper pages between. A still mockup after the live picker is a step down (5 to 0). The mockup is now Your house's picture when there's no trace, and it stays the hero on the link. |
| How install day works (page 8) | merged into What happens next | It told life after the sale before any price. Its step "We confirm the plan and the colours with you." contradicted the initials taken at the table, so that step is cut (5 to 0). What we'll need moves with it. |
| Your price, the builder (page 12) | replaced by the presentation | Typing feet and prices in front of the customer stalled the close and invited haggling over the rate. Building moves to the lead page's quote editor, and at the table it's behind Edit. |
| The app line in What's in it; "We set up the app with you on install day." on the phone page | cut | App set-up is said once, in What happens next's "On the day". |
| The colour sentences in Up close; the price page's Track colour row | cut | Colour is said once, on the colour page, where it's chosen and priced. The price sub-line names it. |
| "Financing available. We will walk through the options together." | replaced | It used "options" for financing on the page where options now means choices. One wording everywhere: "Financing is available. Just ask." |
| "Valid until" (iPad) | replaced | One wording everywhere: "Price held until {date}." |
| The link's Your lights list and Start smaller | replaced by Your options | The runs were listed twice, and Start smaller let customers book combinations Keenan never offered. |

---

## 3. The offers

### 3.1 Data shape
This is already built on branch meeting-story in commit 6234655 (`lib/quotes/offers.ts`, migration `20261110101844_round9_offers.sql`). Build on it, with the changes marked **change**.

- `quotes.runs` holds the house's measured runs, once: name, feet, level (`lower` or `upper`) and part.
- `quotes.offers` jsonb: `[{ id, name, runs, boxes }]`.
  - `id`: short text, unique on the quote and never reused (`newOfferId`).
  - `name`: what customers read.
  - `runs`: positions into `quotes.runs`, sorted, without repeats.
  - **change, `boxes`**: a whole number from 1 to 9, or null, where null means the quote's `box_count`. Each option has its own box count, defaulting to the quote's (4 to 1: H, C, D, I). Add a new migration that re-creates `quote_offers_clean` with the same signature so it keeps `boxes` (whole number 1 to 9, otherwise null). Add `boxes` to `QuoteOffer`, `parseOffers`, `offersForSave` and `priceOffer`, which prices with `boxCount: offer.boxes ?? quote.box_count`.
  - An empty list still means one "Full wrap" covering every run (built).
- **change, limits:** at most **4** options (5 to 0; set `OFFERS_MAX = 4` in the app, and the database's cap of 6 can stay). The editor caps names at **20 characters** so an iPad button never wraps at 3 options (5 to 0). The database's 60-character cap and the `$` strip stay as a backstop.
- **Prices are set for the whole quote:** one price per foot, one box price, the two upper access amounts, the rush fee and the colour timing, the minimum, the price held until date, financing, discounts (each with a plain name) and extra work (with the existing "only with upper runs" rule). Every option is priced by `lib/pricing.ts` from those and its own runs and boxes.
- **New columns (additive, one small migration each, with plain statements):**
  - `quotes.meeting_offer` text null: the option chosen at the table.
  - `quotes.meeting_install_on` date null: the day picked at the table.
  - `quotes.accepted_offer` text null and `quotes.accepted_boxes` smallint null: what the Accepted sheet records, beside round 8's `accepted_runs`.
  - `quote_links.selection_offer`, `booked_offer`, `booked_option` (name snapshot) and `booked_selection` (runs snapshot) are already built.

### 3.2 Quick starts
"+ Offer" opens four choices:

| Quick start | Runs | Default name | Notes |
|---|---|---|---|
| Full wrap | every run | "Full wrap" | |
| Lower level | every lower run | **"Main floor"** | The button keeps Keenan's word, "Lower level", but the option it makes is called "Main floor", because customers read "lower level" as the basement (5 to 0, and the link debate's 5 to 0). Hidden when the house has no upper run, since it would match Full wrap. It's an open question for Keenan. |
| Front only | none ticked | "Front only" | The card says "Tap the runs it covers." |
| Blank | none ticked | empty, with the name field focused and placeholder "Name it" | Saved as "Offer" if left empty. |

Full wrap and Main floor keep following their rule as runs are added, including at the table through Edit, until Keenan changes their runs by hand (H, C, D, I). The built `addRunToOffers` already does this by matching positions. `removeRunFromOffers` is built too.

### 3.3 Sort
Biggest first: by total before GST, then by more feet, then by the order Keenan made them (built in `pricedOffers`). An option with no runs is never shown to a customer: not on the iPad, not on the link, and not in the Accepted sheet (`shownOffers`). In the editor, cards re-sort only when Keenan leaves a field, never while he's typing.

### 3.4 Each option's breakdown, coverage line and diagram
**Breakdown.** These rows come from `lib/pricing.ts` and use the same labels and order on the iPad, the link, the confirm sheet and the Accepted sheet:

1. **Track and lights**, "{feet} ft at {price} a foot". **change:** "/ft" becomes " a foot" in the shared detail (4 to 1).
2. **Control box**, "Always included". With more than one: **Control boxes ({n})**, "{n} at {price}".
3. **Upper roof access**, "For work up high: $200, or $400 with an upper gable". Only on an option with one of its own upper runs, hidden otherwise (4 to 1; H wanted "Not needed" shown).
4. **Rush colour fee**, only when "Install this season" was chosen. **change:** its detail reads "{colour} track, made to order this season" (it said "powder coated this season"), so it uses the same words as the colour page.
5. **Extra work**, shared by every option, by its own label. "Only with upper runs" lines drop off options without one (C, I and E). Lines tied to specific runs come later (see the open questions).
6. **Each discount by its plain name**, with a true minus, shared by every option.
7. **"To reach our $2,500 minimum"**, only when it applies (the amount from the quote), after a "Before the minimum" sum row (as on the link today). Under it is Keenan's sentence: "That's under our $2,500 minimum, so this option comes to $2,500."
8. **Total**, then "+ GST" when GST is on. On screen there's never a GST dollar figure, and with GST off there's no mention of it.

**Coverage line.** It's built from the option's runs, never typed: the run names joined with commas and a final "and", then the total feet. For example: "Front, Front upper, Garage and Left gable, 166 ft". It lists the names even when the option covers every run (4 to 1 against E's "Everything we measured"). No customer string says "the whole house" (E). Run names come from the same function the link uses (`quote_link_run_name`).

**Diagram.** It's one house everywhere: the same eight-run geometry as `lib/drawings/house.ts` and the link's `house-diagram`. Each run is in one of three states:

| State | iPad (navy) | Phone (white) |
|---|---|---|
| lit (in this option) | the deck's warm white points | gold nodes |
| dashed track (measured, not in this option) | dashed | dashed |
| plain outline (not measured) | outline | outline |

Switching options cross-fades the runs being dropped to dashed in about 300 ms, so walking down from the full wrap reads as runs going dark. The total never counts up (2 to 1: C and D against I). With Reduce Motion, the change is instant.

### 3.5 The price screen in meeting mode (iPad landscape, designed at 1180 x 820)
Layout, top to bottom:

- **Headline** "Your price" (52/60 px).
- **Sub-line** (27 px, Night Muted Text).
  - With 2 to 4 options: `lines.price_sub_many` = "{count} options, all with {colour} track.", with the count as a word ("Three options, all with White track."). No full wording had a majority, so each part was settled on its own. Naming the count was 3 to 2 (H, C, E). Naming the colour was 3 to 2 (H, I, E). Leaving out "the whole house" was 3 to 2 (D, I, E).
  - With 1 option: `lines.price_sub_one` = "With {colour} track."
  - With no track colour set, the colour part is dropped.
- **Option buttons:** one row, biggest total on the left, at most 4. Each button is at least 250 x 88 px and shows:
  - the name (24 px semibold; at 4 options it may wrap to two lines);
  - the total (28 px tabular, with a small "+ GST" when GST is on).

  Every total is visible at once and all are the same size (5 to 0 in the final round; C dropped one price at a time). The order does the walking down. There's no feet figure on the buttons (4 to 1).
- **Left column (56%):**
  - the drawing, lighting the option on screen;
  - its coverage line;
  - then the shared lines at 20 px, Night Muted Text:
    - `lines.price_includes` "Every option includes the control box, install by our own crew and our 10-year warranty." (H and D wrote this; E wanted a shorter line; C had it behind a tap; it matches the link's existing point "installed by our own crew")
    - "No payment until your install is complete."
    - `lines.price_held` "Price held until {date}."
    - `lines.financing` "Financing is available. Just ask." (only when financing is offered)
- **Right column (44%):**
  - `lines.whats_in` "What's in {name}";
  - the breakdown (section 3.4) at 22 px, or 20 px when there are more than 7 rows;
  - the total at 52 px in **Night Text, not gold** (today it's gold, which breaks the Porch Light Rule);
  - one 56 px **outlined** `lines.choose` "Choose {name}". This was a 2 to 2 tie: H and I wanted it outlined, C and D gold. The brief's "marks the one the customer picks" treats the pick as a mark, not a checkout, so the page the customer watches holds no gold at all.
- **Bottom row:** dots, chevrons and the Next label as built. "Edit" is small, outlined, at the bottom left, and Keenan's only. Keep it away from Choose and the forward chevron.

**What's on screen and what's picked** (DESIGN.md's Porch Light Rule; 5 to 0 that the two must never look alike):
- **Opening:** the full wrap is on screen with a 2 px Night Text outline. Nothing is picked and there's no tick.
- **Tapping an option button** puts it on screen: its runs light and its breakdown shows. Nothing is picked.
- **Choose {name}:**
  - that option's button turns light (Night Text fill, navy text) with a tick and a small `lines.your_choice` "Your choice";
  - the Choose button reads "Your choice" with a tick;
  - tapping it again clears the pick, and choosing another option moves it;
  - picking never reorders anything;
  - Choose shows even with one option (E; there's no special case).
- **None of these:** Recommended, Most popular or Best value badges, struck-through prices, tonight-only deals or countdowns.

**Edge cases:**
- No runs: `lines.price_empty` = "Your options show here once we've measured." This was a 2 to 2 tie with "We'll measure and price it together now." Neither wording is Keenan's, so this goes to the line that promises less.
- Runs but no offers saved: one Full wrap from every run (built).
- An accepted quote shows read only. Edit opens the editor with the locked words (section 3.7).

**Offline:** the payload cached when meeting mode opens carries the runs, the offers, the quote's prices, the drawing and `lib/pricing.ts`, so the page makes no network call. The pick lives in MeetingStored as `chosenOffer` and survives a reload or auto-lock. It saves with the quote (`quotes.meeting_offer`) when there's signal. Any unsaved state shows only in the Edit layer and on the exit, never on the customer's page.

### 3.6 The customer's phone link (390 to 430 wide, navy and gold on white)
**Options replace both "Your lights" and "Start smaller"**, so the runs appear once (5 to 0). Start smaller's switches, "At least one part stays in." and "Switch all back on" all go.

- **Hero (as built, with these changes):**
  - the mockup;
  - "{First name}, here's your quote";
  - the selected option's name as a small label above its total;
  - "Price held until {date}.";
  - "No payment until your install is complete.";
  - "Financing is available. Just ask." (when on).
  - When the selected option doesn't cover every run, the mockup gets a small caption, `lines.link_mockup_caption`: "Our mockup shows every run lit." (H; no seat against). Without it the customer could think they're getting lights they're not.
- **Which option it opens on:** the option they booked, if any. Otherwise the option chosen at the meeting (`quotes.meeting_offer`). Otherwise the biggest. Taps on a row save `selection_offer` (built).
- **Section "Your options"** ("Your price" when there's only one option, and then there's no list):
  1. One house diagram for the selected option (gold for its runs, dashed for measured runs it leaves out, plain outline otherwise), captioned `lines.link_drawing_caption` "Gold marks the lights in {name}." (C, D, I). "What do these mean?" stays under it.
  2. The options as radio rows, biggest first, each 72 to 88 px:
     - name and coverage line on the left;
     - the total on the right in tabular figures, with "+ GST" when on;
     - the selected row gets a 2 px navy border and a filled navy radio (gold stays Book my install's alone);
     - the meeting's choice carries a small navy tag, `lines.link_meeting_tag` "Your choice at the meeting".
  3. The diagram and three rows fit on one screen at 390, so the tap and the house changing are in view together. There are no mini drawings on the rows (5 to 0 in the final round).
  4. Tapping a row cross-fades the diagram and updates the hero total.
- **Under the rows:**
  - "What's in {name}": the breakdown in the same rows and words as the iPad, ending on one Total. Drop the separate big Total.
  - The minimum box where it applies, with Keenan's two sentences unchanged.
  - Then "Every option includes the control box, install by our own crew and our 10-year warranty." and `lines.link_something_else` "Want something different? Call or text Keenan." (H and C).
- **Book my install:** the label stays the same (4 to 1 against I's "Book Main floor").
  - The confirm sheet reads "Your choice: {name}" and "Total {total}" (with "+ GST" when on), plus the existing nothing-to-sign line. The thank-you keeps "Your choice: {name}".
  - It calls the built `quote_link_book_offer`, which records `booked_offer` (id) with `booked_option` (the name snapshot) and `booked_selection` (the runs snapshot), so optionName and choiceLabel survive a later edit.
  - The server recomputes that option's total from the stored quote and the offer id, never from a total the browser sends.
  - It notifies Keenan, and it never accepts the quote or creates commission.
- **"How install day works" becomes "What happens next"**, with the meeting's four steps in the same words (section 4). Step 1 on the link reads `lines.link_colour_done` "{colour}, confirmed with your initials at the meeting.", or `lines.step_colour_todo` "We confirm it with you from the colour book." when there are no initials. Step 2 shows the lead's planned install day if Keenan set one, otherwise the day picked at the meeting, otherwise "We pick the day together." What we'll need sits behind a disclosure. `quote_for_customer` hands the page these lines, in place of `install_day_deck` (re-create the function with the same signature).
- **One colour rule, the same as the iPad:** White is in stock and included. Every other colour is made to order: included in spring, or the rush fee this season, with the fee hidden when not set.
  - The track product point, "A slim aluminum track, colour matched to your soffit, so it blends into your roofline by day.", becomes "A slim aluminum track tucked under your roof edge, so it's hard to spot by day." (C and E). Use a plain `update` migration, only where the text still matches the seed.
  - `otherColoursLine` in lib/quote-link/view.ts:
    - in season: "Any other colour is made to order: nothing extra if it can wait for spring, or the {fee} rush colour fee to have it this season." (the fee clause drops when no fee is set);
    - after Dec 1 with rush priced: "...or the {fee} rush colour fee to have it sooner.";
    - otherwise: "Any other colour is made to order for a spring install, at no extra cost." This removes "colour matching".
- **After Keenan marks the quote Accepted** (3 to 0: H, D and I; C deferred it, E was silent):
  - the page shows only what was agreed: "Your choice: {name}" and its total, "Your track colour: {colour}", "Your install day: {date}" if set, and "No payment until your install is complete.";
  - the other options' prices, Your options and Book my install are hidden;
  - call and text stay;
  - no status word is shown.

### 3.7 Keenan's quote editor (lead page and meeting mode's Edit layer)
It's one component in two places, so it's literally the quote meeting mode opens with. A newer server save wins over an older iPad copy (`startingPoint` already does this). It's owner only, never rendered under View as, and never customer facing.

- **On the lead page:**
  - a "Quote" card with a summary, such as "Full wrap $4,959, Main floor $3,380, Front only $2,500. Price held until March 4.";
  - "Edit the quote" opens a full-screen sheet, designed iPad landscape first and usable on a phone, in the app's dark form style. The sheet is its own region, so Save is gold there;
  - footer: "Meeting mode opens with this quote." and "Saved 2:41 pm." plus the signal note.
- **Sections, in the order a quote is built:**
  1. **Measured runs:**
     - the house drawing at the top, lighting every run, so a gable on the wrong level shows before the customer sees it;
     - rows of name, feet (number pad), Lower or Upper (segmented), and part chips (Eave, Gable, Garage, Porch, Sides, Other);
     - "+ Run" and today's quick-add chips, and the total feet.
  2. **Offers:**
     - "+ Offer" opens the quick starts (section 3.2), at most 4 ("The meeting and the link show up to 4.").
     - Each card has:
       - the name inline, with the hint "Customers see this name.", 20 characters at most and the deck's word checks (no dashes, no exclamation marks);
       - one tap chip per run (Night Text fill and a tick when on);
       - a small drawing lighting its runs;
       - a box stepper, defaulting to the quote's count;
       - its live total;
       - an expandable breakdown exactly as the customer sees it.
     - Deleting a card takes a second tap ("Tap again to delete").
     - Under the cards: "Customers see these biggest first."
  3. **Prices for this quote** (collapsed by default, since Settings' values usually stand): per foot, per box, the two upper access amounts, the rush fee, the minimum, price held until, financing, discounts and extra work. Discounts are shared by every option and each needs a name ("Name this discount. Customers see it."). Extra work is shared, with "only with upper runs". The colour timing follows the colour page's choice and the lead's track colour.
- **Quiet warnings that never block** (DESIGN.md's neutral border with a bold first line):
  - "{A} covers the same runs as {B}."
  - "{A} and {B} both come to {amount}, our minimum." When it isn't the minimum: "{A} and {B} come to the same price."
  - "{A} costs more than {B}." (A has fewer feet but a higher total.)
  - "{A} has no runs yet, so customers won't see it."
  - "{A} is under our {minimum} minimum, so it comes to {minimum}."
  - If a name contains "level": "Customers may read "level" as the basement."
- **"See it as they will"** (H and D; lowest priority): opens meeting mode's rehearsal view on Your price, and the customer's link if a live one exists (owner visits don't count).
- **Prep's "Quote drafted ahead"** ticks once any offer covers at least one run with feet (`hasPricedOffer`, built).
- **An accepted quote is read only**, in plain words (C, D, I; 3 to 2):
  - on the lead page: "This quote is accepted, so its prices are locked. To change them, undo the acceptance under Outcome.";
  - in meeting mode's Edit layer and the meeting's draft save: the same, ending "...undo the acceptance under Outcome on the lead page." (E's point that the meeting has no Outcome section, added to the majority wording).
- **Events** carry an option's name only, never an amount.

### 3.8 Round 8's Accepted sheet and commission
- The sheet asks **"Which option did they say yes to?"** in place of the Start smaller choice (4 to 1 on "option").
  - One choice per shown option, biggest first, each with its name, coverage line and total (owner screen, so amounts are fine), plus the round 8 commission line per choice.
  - **Preselected** from the meeting's choice (`quotes.meeting_offer`), otherwise the option booked on the link (`booked_offer`), with a source line: "Chosen at the meeting: Main floor" or "Booked on their link: Main floor". When both exist and differ, both lines show and the meeting's choice stays preselected (4 to 1 on preselection; E's second line added). With neither, nothing is preselected, except that a single option is preselected.
  - A link booked before today with Start smaller and no offer id still shows as its own choice while its runs still match the quote (round 8 behaviour, kept for old links).
- The **install day** is prefilled from `quotes.meeting_install_on` when the lead has no `install_on` yet (I and E).
- The accept function takes the offer id and records `accepted_offer`, `accepted_runs` (that option's runs) and `accepted_boxes` (that option's box count).
- **Commission** = the rate × (that option's feet × price per foot + its boxes × box price − the quote's discounts, never below zero). It's worked out in the database. Round 8's other rules are unchanged (created on Accepted, payable at Installed, the rate stored, the lead's assigned setter only).
- The timeline event carries the option's name, never an amount.

---

## 4. After the yes: page 11, "What happens next"
It sits straight after the price at every meeting, and it's never skipped (that keeps the initials fallback reachable). Meeting mode never accepts the quote (5 to 0 in the final round; C gave way).

**Layout:** the deck's split layout. On the left 56%, the install day photo slot (`install_day.hero`, the words alone until Keenan has one). On the right, from top to bottom:

- **Headline:** `pages.next_steps.headline` "What happens next" (5 to 0 on the name).
- **Recap, only once an option is chosen:** `lines.recap` "Your choice: {name}, {total}" (+ GST when on), in Night Text.
- **Four numbered steps,** each a short label and one line at 27/30 px:
  1. `lines.step_colour_label` **"Your colour"** (3 to 2 against "Your track colour").
     - Initialled on the colour page: `lines.step_colour_done` "{colour}, confirmed with your initials." with a tick.
     - Not initialled: `lines.step_colour_todo` "We confirm it with you from the colour book.", with the initials field and Confirm right there, saved the same way as on the colour page. After Confirm it reads as done.
  2. `lines.step_day_label` **"Your install day"**.
     - The date once picked (for example "Saturday, November 21"), or `lines.step_day_none` "We pick the day together." (4 to 1).
     - A 56 px outlined `lines.step_day_button` "Pick a day", always shown (3 to 2: H, D and I; C and E showed it only after a pick). It opens a layer with one tap on a three-week grid of days starting tomorrow (C), plus "No day yet" to clear it.
     - The day is optional, and a missing date never stops a yes. It's kept in MeetingStored as `installOn`, saved with the quote as `quotes.meeting_install_on`, and it prefills the Accepted sheet. It's never written to the lead before Accepted.
  3. `lines.step_on_day_label` **"On the day"**: `lines.step_on_day` "A small crew fits the track and plugs in the control box. We clean up and set up the app with you." This is the only place app set-up is mentioned (5 to 0).
  4. `lines.step_pay_label` **"Paying"**: "No payment until your install is complete." in semibold, set apart (5 to 0).
- **Behind a tap:** `pages.next_steps.more_label` "What we'll need", with today's install_day more_text unchanged: "An outlet near where the control box will go, in the garage or outside.\nYour Wi-Fi name and password, so we can set up the app with you."
- **Closing line:** `lines.closing` "We'll text you a link to this quote, with every option." C wrote this word for word. The parts were settled one at a time: "with every option" was 4 to 1, "a link to this quote" 3 to 2, and leaving out "Want to think it over?" 3 to 2.
- **No** Book button, acceptance, commission, setter or notes here.

**Saving:** the pick, the initials and the install day save with the quote when there's signal. The initials save as today, on the lead with a timeline event. The iPad keeps them until then, and saving says it needs signal (in the Edit layer and on the exit only). Keenan marks Accepted on the lead page after he leaves, and the sheet is already filled in. MeetingStored resumes on the new page keys (`your_house`, `next_steps`) after a reload.

---

## 5. Every customer-facing string that changes (final wording)

**Meeting mode, settings.deck pages:**

| Where | Key | Final |
|---|---|---|
| Cover | `lines.cover_line` (new) | What it is, your house lit up, and your price. |
| Every page | `lines.next_prefix` (new) | Next: {headline of the next page} |
| Up once, What's in it | `pages.what_vesper_is.more_text` | The lights sit in a slim aluminum track, about 8 inches apart, tucked under the soffit, the underside of your roof's edge. / Each light has red, green and blue, plus its own white. / A control box plugs into a standard outlet. |
| Hidden by day, Up close | `pages.hidden_by_day.more_text` | The track tucks under the soffit, where it's hard to spot by day. If your community has guidelines, we're happy to answer questions. |
| Run it from your phone | `pages.phone_control.words` | Pick a look in the app and your house changes. On or off, warm white or colour. |
| Your house | `pages.your_house` (new) | headline: Your house / words: We measured {feet} ft of roofline. / more_label: What we measured / more_text: Upper is the second storey. Lower is the main floor. |
| What we measured caption | `lines.house_drawing_caption` (new) | Our drawing of your roofline. |
| Your house, lit (stand-in) | `pages.mockup` | headline: Your house, lit / words: Our drawing of your lights on your photo. |
| Try it on your house | `pages.light_picker.words` | A preview drawn on our photo of your house. Most nights, warm white. Tap a look. |
| What happens next | `pages.next_steps` (new) | headline: What happens next / more_label: What we'll need / more_text: (today's install_day more_text, unchanged) |

**Meeting mode, the colour page:**

| Key | Final |
|---|---|
| `lines.colour_headline` | Your track colour |
| `lines.colour_opener` | By day you see the track, so you choose its colour. |
| `lines.colour_one` | One track colour for the whole house. |
| `lines.colour_stock` | White is in stock and included. |
| `lines.colour_made` | {colour} is made to order. |
| `lines.colour_spring_label` / `_value` | Install in spring / Included |
| `lines.colour_season_label` / `_value` | Install this season / {fee} rush colour fee |
| `lines.colour_book` | Screens can't show colour exactly, so we choose it from the colour book together. |
| `lines.initials_prompt` | Your initials confirm the colour on your quote. |
| `lines.initials_done` | Confirmed with your initials. |

**Meeting mode, the price page:**

| Key | Final |
|---|---|
| `lines.price_headline` | Your price |
| `lines.price_sub_many` | {Count} options, all with {colour} track. |
| `lines.price_sub_one` | With {colour} track. |
| `lines.price_includes` | Every option includes the control box, install by our own crew and our 10-year warranty. |
| `lines.price_held` | Price held until {date}. (replaces "Valid until") |
| `lines.financing` | Financing is available. Just ask. (replaces "Financing available. We will walk through the options together.") |
| `lines.price_empty` | Your options show here once we've measured. (replaces "Adds up here as we measure.") |
| `lines.whats_in` | What's in {name} |
| `lines.choose` / `lines.your_choice` | Choose {name} / Your choice |

**Meeting mode, What happens next:**

| Key | Final |
|---|---|
| `lines.recap` | Your choice: {name}, {total} |
| `lines.step_colour_label` | Your colour |
| `lines.step_colour_done` | {colour}, confirmed with your initials. |
| `lines.step_colour_todo` | We confirm it with you from the colour book. |
| `lines.step_day_label` | Your install day |
| `lines.step_day_none` | We pick the day together. |
| `lines.step_day_button` | Pick a day |
| `lines.step_on_day_label` | On the day |
| `lines.step_on_day` | A small crew fits the track and plugs in the control box. We clean up and set up the app with you. |
| `lines.step_pay_label` | Paying |
| `lines.closing` | We'll text you a link to this quote, with every option. |

**Shared by meeting mode and the link (lib/pricing.ts):**

| Key | Final |
|---|---|
| Track and lights detail | {feet} ft at {price} a foot |
| Rush colour fee detail | {colour} track, made to order this season |

**The customer's link:**

| Where | Final |
|---|---|
| Section heading | Your options (one option: Your price) |
| Drawing caption | Gold marks the lights in {name}. |
| Meeting tag | Your choice at the meeting |
| Mockup caption | Our mockup shows every run lit. |
| Under the rows | Want something different? Call or text Keenan. |
| Confirm sheet | Your choice: {name} / Total {total} |
| Old section "How install day works" | What happens next (the four steps above) |
| Step 1 | {colour}, confirmed with your initials at the meeting. (none: We confirm it with you from the colour book.) |
| Track product point | A slim aluminum track tucked under your roof edge, so it's hard to spot by day. |
| Other colours, in season | Any other colour is made to order: nothing extra if it can wait for spring, or the {fee} rush colour fee to have it this season. |
| Other colours, after Dec 1 | Any other colour is made to order for a spring install, at no extra cost. (rush priced: ...to have it sooner.) |
| After Accepted | Your choice: {name} + total / Your track colour: {colour} / Your install day: {date} (if set) / No payment until your install is complete. |
| Removed | Start smaller, At least one part stays in., Switch all back on, Your lights, the December line's "colour matching", "colour matched to your soffit" |

None of these contain an em or en dash or an exclamation mark. The words are plain, with no buzzwords.

---

## 6. Open questions for Keenan (short)
1. **Initials:** they're taken on the colour page (3 to 2) and read back on What happens next, with the box shown there if they were skipped. If you'd rather ask only after a yes, it's a small change: the box moves to step 1.
2. **"Main floor"** as the name the Lower level quick start gives its option (all five seats), or "Lower level" as you wrote it?
3. **A day picked at the table** is saved as planned, shown to the customer as a date and prefilled on Accepted. Is that a date you can keep without a crew calendar? If not, step 2 shows only "We pick the day together."
4. **Colour words:** both screens now say "made to order" and "this season". Do you want your link words "powder coated" or "before Christmas" back?
5. **Settings calls, no build needed:** "Hidden by day" or "What you see by day" (a white track on a dark soffit shows), and plain words for the link's "RGBW" and "24V" points.

Later, not tonight: extra work lines tied to the runs they belong to (a garage corner only on options that include the garage), a stock flag on Settings' colour list, options drawn on their own traced photo, and printing the chosen option on the quote PDF.

---

## Appendix: build notes
- **If time runs short, cut in this order:** "See it as they will"; the link's after-Accepted view; the cross-fade on the Your house turn (keep the slide).
- **Files:**
  - lib/deck.ts (`DECK_PAGES` order, the new keys, `PAGE_NAMES`, `settings.deck.lines`);
  - lib/meeting/deck-pages.ts (`deckPages` and its stand-in rules, the Next label);
  - lib/meeting/state.ts (`defaultQuoteState` colour fix; MeetingStored `chosenOffer` and `installOn`);
  - lib/meeting/deck-payload.ts (offers in the payload);
  - lib/quotes/offers.ts (`boxes`, the limit of 4, the "Main floor" default, Blank);
  - lib/pricing.ts (the two detail strings);
  - components/meeting/* (Your house, the colour page, a new price presentation in place of quote-screen's form, What happens next, the Edit layer);
  - a new shared quote editor component;
  - the lead page Quote card;
  - components/quotes/quote-outcome.tsx and lib/quotes/outcome-card.ts;
  - lib/pay/commission.ts and the accept function;
  - lib/quote-link/view.ts and components/quote-link/customer-quote.tsx.
- **Migrations, additive and plain:**
  - `quote_offers_clean` keeps `boxes`;
  - the four quotes columns;
  - the accept function takes an offer id and computes commission;
  - `quote_for_customer` re-created with the same signature, adding the next steps lines and `meeting_offer`;
  - the settings.deck seed, where the text is unchanged;
  - the product point update.
- **Tests:**
  - unit: offers with boxes, the coverage line, sort and ties, the minimum per option, the colour default (only White is stock), the stand-in rules, the Next label skipping pages, and the strings' word checks;
  - database: accepting with an offer and its commission, link booking of an offer, and anonymous access still refused;
  - walk-throughs: the meeting in order on iPad 1180 x 820, and the link at 390 and 430;
  - the full suite before the preview (CLAUDE.md rule 11).
- **Docs:** a decisions.md entry for this settlement, the spec superseding round 7's "bridges are Keenan's to say", the data model's new columns, and CLAUDE.md's quote link paragraph ("Start smaller" becomes options).
