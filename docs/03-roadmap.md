# Roadmap and acceptance criteria

One milestone per build session. A milestone is done when every criterion passes in the full automated suite, including the live walk-through on a phone-sized screen against the real database. Anything the suite cannot reach is named in the report. Keep the current milestone marked.

**Focus (Keenan, 2026-11-02).** The app's fundamentals are three things: the setter sessions (knocking, leads and booking), the sales meetings (meeting mode on the iPad), and the shareable quote links for customers. Everything else is parked until Keenan says otherwise: M4 (pipeline board), M6 (sales dashboard), M7 (website lead form and daily email) and the backlog ideas. Parked milestones are not started or planned.

**Current milestone: round 17, the customer's link before the Christmas push** (Keenan, 2026-11-12; under Customer quote link below). Before it, from 2026-11-10 to 2026-11-12: rounds 9 to 13 (under M5 below), the real logo and the deck's photo frame and rounds 15 and 16 (in `decisions.md`), and quote link take 3 and the link on a laptop (under Customer quote link below). Before them: **round 8, quote outcomes and setter commission** (Keenan, 2026-11-09, approved): internal only (Keenan and setters), so it merges on green outside the knocking window; nothing on the customer's quote page or in meeting mode changes. Before it: **round 7** (Keenan, 2026-11-08, approved): Branch A, the Meetings page's prep list (owner only, merges on green), and Branch B, meeting mode deeper (customer facing, waits for the preview). Before it: **round 6, Part 1: Leads, the questions and private notes** (live on 2026-11-08, merge `5aba252`). Before it: **round 5, Session and the booking sheet from the field** (live on 2026-11-07, merge `42fb9c5`). Before it: **round 4, tap to jump and sessions** (Keenan, 2026-11-06, live, merge `ad701b8`). Before it: **booking sheet round 3** (Keenan, 2026-11-05, approved, merges on green after 9:30 pm Calgary). Before it: **the Session tab and the new Homes, both live on 2026-11-05** (Keenan; approved, each merged on green straight to live, nothing customer facing). Built from main, so nothing from the unreviewed quote page goes live. The quote link rework (take 1's second pass) waits on a preview for Keenan's "push the changes". Setter side round 2 was released on 2026-11-03; the setter side and the customer quote link's take 1 the same day (merges `372ee85`, `947a3fd`); M5 take 1 on 2026-11-02 (merge `b075554`), and the Meetings page the same day (merge `13b737d`).

## Round 8: quote outcomes and setter commission (Keenan, 2026-11-09; internal only, merges on green outside the knocking window, approved)
Additive schema changes approved up front. Accepting a quote and the commission move here from M5 take 2, onto the lead page.
- [x] The quote's outcome, Keenan only, on the lead page under the Quote card: Accepted (asks for the track colour when the lead has none, the option, the install date if he has one; the lead moves to Sold and the quote's numbers lock), Declined with a one-tap reason (price, timing, partner said no, went with someone else, other with a note; the lead moves to Lost, "Lost: price"), Cancelled (a yes taken back, inside the 10-day window or after; Lost, "Lost: cancelled, timing"), Installed with the date, and Undo acceptance; Accept again after a no or a cancel
- [x] Only the database moves a quote to accepted, declined or cancelled, through owner-only functions; an accepted quote's numbers can't change; a setter can't set the install date, the sold date or the installed date
- [x] Every change on the timeline with who and when, never with an amount or a typed note; the Other note stays on the quote
- [x] Commission: 5% (`settings.commission_rate`) of the lights and control boxes after discounts, worked out in the database from the stored quote; rush colour, upper access, other extra work and any top-up to the minimum left out; a Start smaller acceptance counts only its runs; unit tests cover the mirror in `lib/pay/commission.ts`, its amount and rounding
- [x] It goes to the lead's setter (the same person as the booking pay); leads assigned to Keenan earn nothing; coming on acceptance, payable once installed, marked paid in Pay like booking pay; voided with the reason when undone or cancelled before it is paid; a paid one never changes; a safety net voids it if the lead leaves Sold any other way
- [x] Setters see their own in My pay (Owed now, Coming once installed, Paid, and the Commission list) and on Home's How mine went ("Sold. $142 commission once it's installed."), never anyone else's; View as shows exactly the same
- [x] Pay lists commission coming per setter, owed commission in Mark paid, and recent voided lines with their reason
- [x] The owner's status menu no longer offers Sold or Installed
- [x] Declining or cancelling closes the customer's link (the existing closed page with call and text); accepted keeps it working; no customer page code changes

## Round 7, Branch B: meeting mode, deeper (Keenan, 2026-11-08; customer facing, waits for the preview, approved)
Additive schema changes approved up front. Merges only when Keenan says "push the changes".
- [ ] A five-seat debate (homeowner, Keenan closing, brand designer, iPad specialist, plain-language editor) settles the page order, content, depth, the light picker's looks and the motion; recorded in decisions.md
- [ ] Every page deeper: one idea, a strong picture, a few words, more one tap away; Run it from your phone added
- [ ] The light picker: the roofline traced in prep (item 6), dusk, five lights a metre, looks and effects in Settings, offline, skipped until traced
- [ ] Photo slots with scenarios and researched references (links only), a shot list in Settings with Upload my photo, and the rehearsal view with "Example to copy"; customers never see references
- [ ] Your colours shows both soffit colours for a split soffit
- [ ] Impeccable critique and polish with scores, the five seats review iPad screenshots, the full suite passes, and the preview goes to Keenan

## Round 7, Branch A: the Meetings page's prep list (Keenan, 2026-11-08; owner only, merges on green, approved)
An additive schema change and the ready-made confirmation text approved up front.
- [x] Quick pick under tonight: the next few days' meetings and the newest leads, each one tap to its prep list or Start; search stays in Start a meeting
- [x] Each meeting says Ready or "Prepare for the meeting" with what's left; the prep list does each item right there: mockup, track colour, quote drafted, time confirmed (Text with the ready-made text, Call, then Confirmed), missing answers
- [x] The setter's read, hot buttons and the lead's notes at the top of the prep list
- [x] Home's meeting cards show Ready or how many are left; a confirmed time has a tick on Schedule, Meetings and Home; the text's wording is in Settings
- [x] Setters never confirm meetings or see the prep list, enforced in the database

## Round 6, Part 1: Leads, the questions and private notes (Keenan, 2026-11-07; merge on green after 9:30 pm Calgary, approved)
Nothing customer facing. Additive schema changes and the step note edits approved up front. Part 2 (the AI note taker) waits on Keenan's keys.
- [x] Leads: Active, Later, Met and Closed in one compact row; Keenan opens on Everyone (Setters, Mine), setters on Mine (Everyone); Met and Closed show their outcome; search covers everything; Phone call as a source, shown on Keenan's cards
- [x] The questions: Call or text gone everywhere ("Keenan confirms the meeting with them."); Which areas and Timing no longer asked, "N of 6 collected", saved answers kept; step notes and door guide updated; Christmas lights now and Looked into it before take two answers together; a split soffit takes two colours and a note; a Note on every required question, all notes together on the lead page
- [x] Notes are for the lead's setter and Keenan only, in the database and in View as
- [x] Session's knocking view fits one screen at 390 again

## Round 5: Session and the booking sheet from the field (Keenan, 2026-11-06; merge on green after 9:30 pm Calgary, approved)
Nothing customer facing, no schema change. Tested the new way (CLAUDE.md rule 11): unit, lint, types, build, the Session, booking sheet and View as walk-throughs, and the race tests.
- [x] Delete an unfinished booking: a tap gives Pick up where you left off or Delete; Delete needs a second tap ("Tap again to delete"), removes the draft from the phone and lets go of any time it holds; a person already saved stays in Leads, and the confirm says so
- [x] Other evenings from Session: a row of days (Tonight, then the booking window) in Session's open times in place of All evenings; tapping a day shows its times in the same spot; tapping a time holds it and opens the booking sheet over Session; a day with nothing open says so quietly
- [x] The phone as a slim one-line footer on every step, above Back and Next, staying put between steps, opening the number pad and kept above the keyboard; Call or text and the phone's Not collected on Book; still required to book

## Round 4: tap to jump and sessions (Keenan, 2026-11-06; merge on green before 3:00 pm Calgary, approved)
Nothing customer facing. A small additive schema change approved up front. Live on 2026-11-06: merged at 2:17 am Calgary (merge `ad701b8`) and checked on the live site. Tonight's three sessions were closed by the midnight job: Keenan's Springbank at its last tap (6:50 pm), Jaxon's and Jax's Cortina at their start (5:07 pm, nothing tapped). Skew protection is off on the live site (no request carries the deployment ID); Keenan turns it on in Vercel.
- [x] Tap to jump: each step on the booking sheet's progress bar jumps straight to it, so Book is one tap from the door; thumb-sized targets (44 px tall, about 54 px wide at 390) with no mis-taps; "Mark the rest Not collected" stays on the door step
- [x] Sessions left open: a session still open at midnight Calgary time ends itself, at its last tap if it has one, otherwise at its start, and its summary says it ended automatically; tonight's three (Keenan's Springbank, Jaxon's and Jax's Cortina) closed the same way
- [x] A nudge for new setters: 15 minutes into a session with no tap, a quiet line on Session reminds them to tap the counters, in the counters' own words; it goes at the first tap
- [x] Neighbourhood names: matched without caring about capital letters, the team's recent ones suggested as they type, the first spelling kept; tonight's "cortina" is "Cortina"
- [x] Skew protection checked on the live site after the deploy and reported plainly
- [x] The full suite passes, the branch merges on green, and it's checked on the live site

## Booking sheet round 3 (Keenan, 2026-11-05, after using it; merge on green, approved)
Live for the shift of 2026-11-06. Nothing customer facing. Merged at 6:35 pm Calgary on 2026-11-05 because Keenan said to push it.
- [x] Move freely: Next and swiping always move on with answers missing; a step left with something missing is marked on the progress bar and the counter says what's left; Book lists everything missing, each with a tap to its step, and stays off until it's all answered, with the same Before you book rules
- [x] The phone comes last: on Book, right above the Book button, still required to book; the first step keeps the name; a line in the Book step note asks for the best number to confirm the meeting
- [x] Use where I'm standing works in the field: "Finding where you are..." at once, up to 15 seconds for a reading within 50 m, a clear result or a clear reason with the iPhone steps, and the nearest street address filled in to confirm
- [x] Optional answers, one tap each, never required or counted: house type (house step), setter's read and hot buttons (learned step), call or text (beside the phone on Book); on New lead, the lead page and View as; the read and hot buttons on Keenan's Meetings and Home cards
- [x] The full suite passes, including a walk-through that books with the steps done out of order and the phone entered last; merged (at Keenan's say-so, before 9:30 pm) and checked on the live site

## The Session tab (Keenan, 2026-11-05; merge on green, approved)
Setters are out the afternoon of 2026-11-05, so it aims to be live before 3:00 pm Calgary. Nothing customer facing.
- [x] The gold button is Session instead of New lead. Setters: Home, Schedule, Session, Leads, My pay. Keenan: Home, Schedule, Meetings, Session, Leads
- [x] Not knocking: the neighbourhood (the last one filled in, with recent ones to tap) and Start knocking; below it, who else is out today: name, neighbourhood, since when, doors and conversations
- [x] Knocking: the neighbourhood and start time at the top with the time out so far, and a way to fix the start time for a late start; the doors and conversations counters, smaller than before but easy to hit with a thumb; tonight's open times, the same as Schedule (tap a time, it holds, the booking sheet opens); a smaller New lead button; Unfinished bookings, moved from Home; End knocking with a short summary: time out, doors, conversations, leads and bookings
- [x] Saving a lead or a booking during a session comes back to Session with "Lead saved. On to the next door."
- [x] The knocking view fits one screen at 430 wide; tested at 390 and 430
- [x] The knock card leaves Home (Keenan's included); Leads gets a New lead button at the top; Schedule stays as it is
- [x] View as shows Session exactly as each person sees it, and acts out every write
- [x] Design: impeccable shape, then critique and polish at both phone sizes; plain copy, no em dashes
- [x] The full suite passes, the branch merges on green, and production is verified

## The new Homes (Keenan, 2026-11-05; merge on green, approved)
Replaces the setter Home with open times on top that is live now. Nothing customer facing.
- [x] Keenan: today's meetings with a switch to tomorrow, each with the flags the Meetings page already shows; who's out knocking right now; Start knocking, or a bar for his live session that opens Session
- [x] Setters: the team's schedule for today with a switch to tomorrow (every meeting, its time, area and who booked it, never other setters' customers' phone or email); then "How mine went" (their own bookings and how each meeting went); then follow-ups due as now; plus Start knocking, or a bar for their live session
- [x] Tested at 390 and 430; View as shows everything exactly as each person sees it
- [x] Design: impeccable shape, then critique and polish; plain copy, no em dashes
- [x] The full suite passes, the branch merges on green, and production is verified

## Later: the Meetings tab as Keenan's prep list (recorded 2026-11-05, not built)
Keenan asked to record this for later. Not started or planned until he says so.
- Each meeting says Ready, or "Prepare for the meeting" with what's left: the mockup uploaded; the track colour set; the quote drafted ahead (runs measured from the photos, so meeting mode opens ready); the time confirmed (Call and Text buttons with no prewritten text, then a Confirmed tap that records who and when; setters can confirm their own bookings); missing answers filled
- Keenan's Home then shows how ready each meeting is

## M5: Meeting mode (iPad), in two takes
Keenan's first meeting is the evening of 2026-11-03, so take 1 ships on a preview link by 9 am Calgary that day. Keenan approved take 1's direction, pricing and schema up front; the short plan is in `decisions.md`. Meeting mode is customer-facing the whole time: full screen, no tabs, and nothing internal on screen, ever: no costs, margins, setter names, pipeline or other customers.

### Take 1: present, price, save a draft
- [x] Meeting mode opens full screen from Tonight and from the lead page (owner only, enforced on the server), with a small, discreet exit
- [x] The presentation is swipeable, one idea per screen, big type, navy and gold: What Vesper is, Hidden by day (day and night photos of the same house with a drag slider), The whites first, How install day works, The warranty (the exact wording from `settings.warranty_text`), and a gallery of real install photos
- [x] Presentation text and images come from Settings, not from code; a page with no content yet is skipped, never shown empty; the seeds are plain drafts (no invented stats, reviews or install counts, no em dashes) and only Vesper's own photos ever appear
- [x] This house: the customer's mockup image full screen with pinch to zoom (skipped until uploaded), and the colour screen: their soffit colour, the matched track colour by name (no swatches), and the customer's initials confirming the colour, saved on the lead with a timeline event, at every meeting
- [x] Uploads: presentation images (day, night, gallery) in Settings; the mockup on the lead page; both work the morning of the meeting
- [x] Live quote builder: runs by name with feet and level, boxes, adders, neighbour and custom discounts, financing flag, "No payment until your install is complete."; every price editable for that quote only; the quote stores the prices it used; totals update live from `lib/pricing.ts` with unit tests (plain house, adders and discounts, per-quote price changes, GST on and off, rounding)
- [x] Track colour pricing: stocked colours included; a non-stock colour included if they wait for the factory order (spring install); this season adds the rush colour fee per foot from Settings; when the rush fee or the service call fee is not set, that line is hidden, never blank
- [x] On screen, totals read like "$3,450 + GST" with no GST dollar figure; with GST off nothing mentions GST
- [x] Every quote has a valid-until date, default `settings.quote_valid_days` (14) days out
- [x] Offline: meeting mode opened once with signal keeps working without it: presentation content and images are cached on the iPad, the quote math runs on the iPad, and the draft stays on the iPad until it is saved; saving needs signal and says so plainly
- [x] The warranty wording, rush colour fee, service call fee, FAQ text and quote valid days live in Settings; the exact warranty wording Keenan gave is seeded
- [x] Quotes are owner-only in RLS; sales users can never read them; no dollar amount is written to leads, lead_events or meetings
- [x] Design: one impeccable shape before building, one critique and polish pass before the preview, scores in the report; deeper rounds wait for take 2

### The Meetings page (Keenan, 2026-11-02; merge on green, approved)
- [x] Meetings sits in the owner's side rail and bottom bar right after Schedule; setters never see it, and the page refuses them (and View as) on the server
- [x] If six items crowd the phone's tab bar, Admin becomes a gear in the header instead, and the rail and the bar keep the same items
- [x] Tonight's meetings in time order: time, customer name, address, a big Start that opens meeting mode; a meeting with no mockup or no track colour is flagged, with the way to fix it
- [x] Upcoming meetings below, the same way
- [x] Start a meeting: search existing leads, or add a new person (name and address) and go straight into meeting mode
- [x] Get tonight ready saves every one of tonight's meetings on the iPad, photos included, so each opens without signal, and shows which ones are saved
- [x] The full suite passes, including a walk-through that saves tonight with Get tonight ready, stops the server, and opens a meeting that was never opened before

### Round 9: the meeting as one story, offers, and book now, finish later (Keenan, 2026-11-10; shipped inside the knocking window on Keenan's call, no preview)
- [x] The deck tells one story: the Vesper pages, then their house once, then What happens next, with "Next: {page}" beside the forward arrow
- [x] Offers: the house's runs once, each offer picking its runs (and its own box count); the quote editor on the lead page with quick starts; the price page biggest first with Choose; the customer's link opens on the booked, chosen or biggest option and Book my install records the offer; Accepted asks which option and commission follows it
- [x] Book now, finish later: a booking needs only a time plus a name or an address; the reminder bar, the address under the name, To be completed
- [x] The polish pass was stopped to ship: in were the breakdown fitting, a fixed drawing slot and the 48 px Next button; left were the editor drawing's labels at 390, the editor's Close and Save changes pair, 48 px editor chips, en-CA dates in the editor, the Accepted sheet's footer padding and What happens next's worst case (the drawing ones are moot since round 10 removed the drawing)
- [x] `meetings.everyone_deciding_present` is always true (found in round 9): fixed in round 12 with `meetings.everyone_deciding`

### Round 10: their own house (Keenan, 2026-11-10 and 11; live at 4:41 pm, the rest at 6:15 pm, both on Keenan's call)
- [x] Mockups per house on the lead page: as many as Keenan likes, each named and marked Main, Day, Night, a phone scene or an offer's picture; the old mockup carried over as the Main; Keenan's alone, in the database and in storage
- [x] The deck in order: Cover, Up once there all year, Hidden by day, Run it from your phone, Our 10-year warranty (a timeline), Your price, What happens next; a page missing its mockup is skipped; no house drawing anywhere
- [x] Your price: the offer's own mockup or the Main, totals with coverage in words, the breakdown one tap away, the colour as one line, initials on a yes; quick starts Full wrap, Front and Front lower
- [x] Keenan's talking points per page in Settings, shown only while he presses and holds the mark
- [x] The customer's page shows each option's own mockup or the Main
- [x] Black Friday: a deal in Settings (percent or dollars), the button on Your price, prices struck through, saved as one "Black Friday" line; a percent follows each option on the link; the minimum still holds; commission reads the line
- [x] No light picker: Try it on your house left the deck for good and the roofline tracing is hidden; saved traces untouched
- [x] Catch-up (2026-11-11): the skipped walk-throughs and the RLS suite, mockup privacy proven in storage too, the stored quote numbers are the chosen option's, the editor's percent line reads "15% off", unreadable uploads say so, Black Friday end to end on marked test records

### Round 11: quoting by area (Keenan, 2026-11-11; merge outside the knocking window, no preview)
- [x] The Black Friday test records removed first, listed before, nothing else touched
- [x] Measuring on two views, front and back, plus the sides and Other: each area a line with its feet; garage and porch count as Front lower; an area with no feet is never stored; no house drawing anywhere
- [x] Presets: Front lower only, Full front, Front upper, Full wrap, Front plus back, Full back, Custom; only those the measurements can fill; names editable; every measured gable its own tick on each offer
- [x] A photo spot on every offer: one of the lead's mockups or an upload; the Main shows when none is picked
- [x] Every area at the quote's price a foot, or Keenan's own price a foot for it, or a flat price; upper access automatic with the amount shown on each offer and typed over, 0 included; the breakdown names the feet at each rate and a flat area by name, never "level"
- [x] Commission stays 5% of lights and box after discounts, the lights being each area at what it is priced at; upper access out
- [x] Old quotes keep their exact prices and open; old runs mapped onto areas where obvious, the rest Other
- [x] Pricing unit tests, the quote-link, meeting and quote-outcomes walk-throughs one after another, with a custom per-foot area, a flat area, an edited upper access, a gable ticked off and an old quote; test records cleaned up
- [x] The views drawn (2026-11-11): Front and Back house outlines with tappable lines, the Sides as two lines, an offer's lines lit from its card; the update notice, "Vesper updated. Reopen to get the latest.", never over a booking or in a meeting

### Round 12: tidy up (Keenan, 2026-11-11; no new features; merge outside the knocking window, no preview)
- [x] The full suite once at the start (the first round of the day), then only what changed
- [x] Everyone who decides: the meeting carries the real answer (`meetings.everyone_deciding`: yes, no or not asked), filled from the lead at booking and when moved, following the lead until the meeting starts; the old always-true column retired, nothing removed; the prep page, the Meetings page and Home's meeting cards say plainly when someone who decides won't be there or it hasn't been asked; booking not blocked; booking pay and Qualified untouched (neither reads it)
- [x] The polish that was cut: one pass at iPad and phone sizes over the quote editor (Close and Save changes, 48 px chips, Canadian dates), the Accepted sheet and What happens next at its fullest, the seven deck pages, Your price with one and four offers, a long offer name, an offer with no photo of its own, a house with no back, the drawn views measured and almost empty, the customer's link with four options; judgement calls listed for Keenan
- [x] One full rehearsal, twice (no deal, then dollars off, then the deal back to None) on marked test records, every record removed afterwards; what felt slow, awkward or confusing reported in plain words
- [x] The Black Friday walk-through removes its test records at the end (it runs in the daily suite); the rehearsal script stays out of the daily suite

### Round 13: Keenan's calls from the round 12 report (Keenan, 2026-11-11; merge outside the knocking window, no preview; live before Saturday's meetings)
- [x] Show to customer on every offer, on to start; a hidden offer stays in the editor marked Hidden and shows nowhere the customer looks (Your price, the link, the Accepted sheet); the link follows the switch; at least one offer always shown; an accepted offer can't be hidden; all of it held in the database
- [x] The Accepted sheet opens on the option the customer booked on their link, with the table's choice beside it; otherwise on the table's choice
- [x] See it on your house on the customer's link: one picture, a Looks row (the phone scenes by name) and an Options row (the shown offers); tapping an option picks it in the price and picking in the price swaps the picture; no scenes, no Looks row; an offer with no picture shows the Main
- [x] An offer's picture is set in one place, the photo spot on its card; the Mockups section marks Main, Day, Night or a phone scene only and says which offers use each picture; pictures already set carried over
- [x] iPad: the prep list starts with the quote and the time to confirm, the soffit colour code tucked into its item; the lead page starts with Quote, Customer's link and Outcome once there is a quote
- [x] Small things: "Already at our lowest price." under a deal option at the minimum; Save quote until saved once, then Save changes; a roofline takes the tap where a gable's foot meets it, on every line that meets a gable; meeting mode at phone widths left as it is
- [x] Speed: the lead page in two rounds of reads instead of about eleven one after another; mockups go up together; an offer's picture in one call; Mark accepted says what it is doing; before and after times in the report

### Take 2: after Keenan's first meetings
- [ ] The leave-behind folder: a branded, always-white PDF through AirPrint and a share sheet: the personal quote (runs, feet, track colour, line-by-line prices, valid until), the mockup full page, a one-page overview, the warranty summary, the FAQ from Settings, and the company contact ((403) 895-9915, info@vesperlighting.ca, 448 Strathcona Drive SW, Calgary, AB T3H 1M3, never a unit number)
- [ ] Mark presented; it writes a lead event and moves the lead to `quoted`. Accepted, declined, cancelled, installed and the commission are no longer part of take 2: round 8 built them on the lead page (Keenan, 2026-11-09)
- [ ] A quote can't be marked ready until the lead's track colour is set; the quote stores the colour name and RAL code it used and prints them, and a Custom colour shows as needing powder coating
- [ ] A deeper impeccable pass with before and after scores, and whatever the first meetings show needs changing

## Setter side, round 2, and View as (Keenan, 2026-11-03; merge on green, approved)
No pay rules change.

View as you can click through:
- [x] Keenan can tap everything while viewing as someone: screens, sheets, menus and every step of the booking sheet, exactly as they would; the gold bar stays
- [x] Nothing is ever saved: every write is refused on the server; steps that need a write to continue (holding a time, a photo, a count) are acted out on screen only, and a final save shows "View as: nothing was saved."
- [x] The comparison test still matches, and a click-through test proves nothing is written

The questions:
- [x] Phone, owns the home, wants a price, everyone who decides, Christmas lights now, looked into it before, which areas and timing each have "Not collected"
- [x] A step can't be finished, and a lead can't be saved (New lead included), until every question on it has an answer, Not collected included; "Mark the rest Not collected" does it in one tap; questions in any order
- [x] Before you book is unchanged: Not collected for the phone, owns the home, wants a price or everyone who decides blocks booking, with a clear note on what's missing
- [x] "N of 8 collected" on Keenan's Tonight, Schedule, the Meetings page and the lead page, and on the setter's own bookings; information only

Photos:
- [x] Each slot keeps the big Take photo button and adds a smaller Upload button, with a simple line drawing showing the angle to shoot

The booking sheet:
- [x] Header: the wordmark on the left, the held time on the right with a countdown; tapping it opens a small menu at once: Add 5 minutes, Change time, Let go
- [x] A hold lasts 5 minutes (a setting) and Add 5 minutes extends it; the timer replaces the check-in grace period; a hold still ends at once on book, let go, another time or leaving the sheet
- [x] Under a minute left, the time says so and offers Add 5 minutes; when it runs out the sheet says so and offers to hold it again if it's still free
- [x] The steps follow the visit: At the door (name, phone, owns the home, wants a price, everyone who decides), After the door (the rest of what they learned, then the address, the soffit colour and the photos), then Book
- [x] Swipe left and right between steps, as well as Back and Next; a counter by the progress bar ("Step 3 of 6, 3 left")
- [x] Designed and tested at 430 x 932 and at 390 wide: bigger type and targets, related items grouped, fewer steps
- [x] Leaving keeps a draft on that phone; an Unfinished list on Home reopens it where they left off and asks for a time; wiped after 24 hours
- [x] No double booking stays a hard rule: the race tests cover the timer and extensions (only the holder extends; an expired hold can't be extended once someone else has the time; two setters racing still get exactly one)

- [x] Design: impeccable shape, then critique and polish at both phone sizes; plain copy, no em dashes; everything new works in View as (28/40 before polish, 31/40 after, then the re-score's P1 and smaller findings worked)
- [x] The full suite passes, the branch merges on green, and production is verified (2026-11-03)

## Setter side (Keenan, 2026-11-03; merge on green, approved)
It changes no pay or booking rules.
- [x] An impeccable critique as a setter at phone size of Home, Leads, the lead page, New lead and My pay; what it finds fixed with adapt, clarify and polish; before and after scores in the report
- [x] The first time a setter signs in, a short welcome in three steps, each skippable and never shown again once done: add Vesper to the home screen (with the iPhone steps), allow location (for "Use where I'm standing"), turn on notifications; then a one-screen tour of the door flow: the knock session, picking a time, the booking sheet
- [x] Keenan can reset the welcome for a setter from People
- [x] Setters get a push when Keenan marks one of their bookings Qualified ("Your booking on [street] was qualified. $20 added to My pay."), and a short note with the reason when he marks it Not qualified, No-show or Cancelled, or moves or cancels it
- [x] A notice never carries another setter's details, a customer's name, a house number or a phone number, since it shows on a lock screen
- [x] Setters turn their notifications on or off from a Notifications card they can reach, without Keenan's Settings
- [x] Everything new works in View as; plain copy, no em dashes
- [x] The full suite passes, the branch merges on green, and production is verified

## Customer quote link
After a meeting, Keenan sends the homeowner a private link to their quote: a public page with no login, opened by an unguessable token, reading the same lead, runs, prices and mockup as meeting mode. One source of truth.

### Take 1 (now; Keenan, 2026-11-02)
The customer's page, phone first:
- [x] Vesper branding, their name and address, and the valid-until date
- [x] Their mockup, if one is uploaded, full width, tap to zoom
- [x] The Recommended package first: their runs with feet and level, and the breakdown: lights at the per-foot price, the control box, any extra work, any discount, the total; "No payment until your install is complete." and "Financing is available. Just ask." always visible
- [x] Start smaller: switch individual runs on or off and watch the total update live; prices, footage and discounts can't be changed; the control box is always included; extra work marked "only with upper runs" drops off when no upper run is on; below the minimum job total (Settings, empty by default) the total rises to the minimum with a line saying so
- [x] The warranty in the exact wording from Settings
- [x] A big Book my install button, plus call, text and email buttons for (403) 895-9915 and info@vesperlighting.ca
- [x] After Book my install, a thank-you screen: Keenan will be in touch within a day (within one business day since 2026-11-05) to set the date and go through the agreement; no signing, no payment
- [x] After the valid-until date, or once revoked: "This quote has expired" with the call and text buttons and no prices

Keenan's side:
- [x] Send quote link on the quote: copy the link, the share sheet, and an editable prewritten text; nothing sends automatically
- [x] On the lead: the link's status, how many times it was opened, the last visit, the option they picked, and Book my install; the timeline records them without dollar amounts
- [x] Revoke the link; sending again issues a new one; updating the quote updates what the same link shows
- [x] A push notification to his phone and iPad when they tap Book my install, with their name and the option they picked; Send a test notification in Settings; built so the backlog's booking alerts can use the same push later

Rules:
- [x] The token has at least 128 bits of randomness, lives only in an owner-only table, one live link per lead
- [x] The page reads through one database function that returns only customer-safe fields; no anonymous access to any table; the mockup through a short-lived signed URL; writes through token-scoped functions that change nothing else
- [x] Database tests prove an anonymous caller can't read quotes, leads or anyone else's data, and that a token only ever returns its own quote
- [x] Never shown to the customer: costs, setter names, notes, the timeline, statuses or other customers
- [x] `lib/pricing.ts` runs on the page and on the server; the server recomputes every total from the stored runs and the selected runs; unit tests cover every rule
- [x] Visits and the last visit, with no IP addresses or device fingerprints stored; a signed-in member's own visits don't count
- [x] Book my install saves the option and notifies Keenan; it never accepts the quote or creates commission
- [x] Quote pages answer on any host, links come from `QUOTE_BASE_URL`, on quote.vesperlighting.ca only quote routes answer, and quote pages are noindex, no-referrer and not cached
- [x] Plain, human copy, no em dashes, no invented reviews or stats; the address is 448 Strathcona Drive SW, Calgary, AB T3H 1M3, no unit number
- [x] Design: an impeccable shape before building, one critique and polish pass before the preview, phone size first, scores in the report
- [x] The full suite passes, including a live walk-through of the customer's page at phone size; the branch is pushed with a preview link; Keenan reviews it on Todd Dean's real quote and says "push the changes" before it merges

### The rework (Keenan, 2026-11-04; waits for the preview)
- [x] Prices: $24 a foot, the $2,500 minimum, prices held 120 days, the $200 service call fee, a flat $350 rush colour fee (Settings and each quote), upper access added on its own ($200 with upper runs, $400 with an upper gable, none without an upper run), following the runs that are on in meeting mode, on the link and on the server; quotes already made get no new lines
- [x] Todd Dean's quote: "Family & Friends Discount", prices held 120 days from the day it was made, and the $2,500 minimum
- [x] Each run has a part of the house beside its level, guessed from its name in the quote builder, which Keenan can change
- [x] A debate between five agents (homeowner, closer, designer, mobile UX, plain-language editor) settles the open choices, written into decisions.md; no plan to Keenan
- [x] The page, top to bottom: their house and price, the Christmas banner (Settings, September 1 to November 30), six product points (Settings), their lights on an original house diagram with "What do these mean?", Start smaller with the total counting, track colour, Warranty, How install day works and See our work behind taps, and a bar with Book my install, Call and Text
- [x] Keenan's minimum lines at the total; the price held, then "Prices may have changed since [date]" after it, with Book my install still working; links stay live until revoked, and a revoked link shows the closed page with Call and Text
- [x] Quiet motion that respects reduce motion; tested at 390 and 430; the same agents review the screenshots and their fixes are made
- [x] Commission recorded: 5% of the lights and control box after discounts, rush colour and upper access left out (built with M5 take 2)
- [ ] Keenan opens the preview and says "push the changes"

### Take 2 (after the first links go out, with M5 take 2)
- [ ] Your documents: Quote, Warranty, What you get, FAQ, Install day and Agreement preview, each a phone page with Download PDF, built once together with M5 take 2's leave-behind folder (take 3 put Keenan's own uploaded documents and the signed agreement on the link; pages the app writes itself are still to come)
- [ ] Which documents were opened
- [ ] Quote version history

### Take 3 (Keenan, 2026-11-11; merged outside the knocking window, no preview)
- [x] Track types: Hat (the quote's price a foot), Double and J track with their own price a foot in Settings, Pricing; any measured area can be set to one in the quote editor; Keenan's own rate or a flat price on the area still wins; the breakdown names the track where it isn't Hat track; the commission counts it as lights
- [x] About your track on the link: each track type the options use, in Keenan's words from Settings, with a simple drawing
- [x] Build your own on the link, after Keenan's offers: starts from the offer on screen, ticks the measured areas of the offers he shows, the price updating with the minimum, Black Friday and GST as everywhere else; Book my install saves it as "Custom quote (from the customer)", the newest replacing their last, never Keenan's; he accepts it like any other
- [x] Documents: Settings, Documents holds the standard set, each with a name; on the lead Keenan ticks which ones the link shows and uploads files for that customer only; the link shows a Documents section only when there is something to show, each opening on the phone and saving
- [x] The agreement to sign: only when ticked on the lead and written in Settings (greyed with "Add the agreement text in Settings first." until then); they read it, type their name, sign with a finger and tap Sign; the signed copy is a PDF with the date, time, the quote and the option, on the lead and on their link; Keenan gets the alert
- [x] Pricing unit tests, database tests for the new tables, the token functions and the commission, and the quote-link, quote-link-extras, meeting and quote-outcomes walk-throughs, one after another

### The link on a laptop (Keenan, 2026-11-12; merged, then fixed the same day)
- [x] From 1024 px wide the customer's link is laid out for the screen, not stretched: a top section with their house picture (its Looks and Options) beside the greeting, the price and the offers, the picture in view only while the offers scroll; everything below in one centred reading column in the phone's order; the picture never covers text (the same day's fix split the page in two); the accepted page the same; full screen and signing with a mouse or trackpad; phones unchanged

### Round 17: the customer's link before the Christmas push (Keenan, 2026-11-12; customer facing, but merges on green outside the knocking window with no preview, on Keenan's word)
Eight parts, built one at a time on the `round17` branch. Additive schema changes in six migrations (`supabase/migrations/20261112*_r17_*.sql`). Keenan: "Merge when green, outside the knocking window, no preview." So it goes straight to live once the tests pass.
- [x] The Christmas banner by Keenan's dates: Book by for white track (2026-12-15), Book by for a colour-matched track (2026-12-08) and Season ends (2026-12-24) in Settings, Pricing, and its five lines in Settings, Customer quote page; each link shows only the date for its own track colour (no colour yet: the white date and the no-colour note) with the days left, then the after line until the season ends, then nothing; pine green at the very top, full width, with twinkling lights that hold still with reduce motion and the count in deep red; on a live link after booking, never on the accepted page; meeting mode's Your price shows the same date as one quiet line while it is ahead; the September 1 to November 30 window and the old heading and words retired, their columns kept
- [x] The rush fee is Keenan's choice, off by default: for a made-to-order colour, Install this season (first, chosen by default) and Install in spring, both included; Charge a rush fee in the quote editor fills in Settings' $350, editable per quote; with it off nothing on the link or in the meeting mentions a rush fee; saved quotes keep exactly what they have; commission still leaves the rush fee out
- [x] Lead with this one: a star on each offer card in the quote editor, one per quote, never a hidden offer or the customer's own build; the starred offer listed first in the editor, on Your price and on the link, and the link opens on it unless the customer booked something; with no star, biggest first
- [x] A description per offer, at most 400 characters, under its name on the link and inside the breakdown at the table; Polish sends only Keenan's notes and the offer's own facts to Claude Haiku from the server and returns one to three short sentences in his voice; a suggestion that adds a number, dollar amount, percent, date or promise that isn't in his notes or the offer's facts is never shown; Use, Edit or Dismiss, nothing saves on its own; at most 100 a day; owner only, refused under View as; greyed with "Add the AI key to switch this on" until `ANTHROPIC_API_KEY` is set in Vercel; the build refuses an Anthropic key in a `NEXT_PUBLIC_` variable, and `.env.example` lists the key
- [x] Each offer on the link a card: name and price, description, feet, then See the breakdown inside the card (every area on its own line, then the rest and the total, GST as before), closed to start, only the picked offer's open, opening another picks it; the link and its signed agreement copy one line per area, named as the quote editor labels them or as Keenan typed them; meeting mode keeps its grouped lines
- [x] Where you're at: four steps as lights along a roofline (Meeting, Choose your option or Choose and sign, Site visit, Install day) under the banner (full width on a laptop) and on the accepted page, with "You pay nothing until it's installed and you're happy with it."; done steps lit warm, the current one glowing gently (still with reduce motion), later ones dim; a tap reads a step; the words in Settings, Presentation, What happens next; it replaces the old four steps, and What we'll need moved into More about your install
- [x] The site visit: a Site visit row on the lead's Outcome card (a day, Done, Not done yet), owner only in `lead_site_visits`, shown while the quote is open or accepted, read only once Installed or on a Lost lead whose quote is still open, never on a declined or cancelled quote's lead; the link reads it through `quote_for_customer`'s `progress`
- [x] Meeting mode's What happens next shows the same four steps in the same words, step 2 lit once they say yes at the table, with Pick a day, the recap, the closing line and thanks; Keenan's pay line takes the place of the old Paying row; the price page and the signed agreement's PDF keep "No payment until your install is complete."; the old step words retired from Settings and never block a save
- [x] Their house in every look: See it on your house right under the price on a phone, the house shown once; a house with scenes but no Main or option picture opens on its first look, the accepted page included (Looks only there); full screen keeps the looks along the bottom, the page follows, and their pictures load as it opens
- [x] On a laptop the bottom bar's middle names the option on screen and its price ("Full wrap, $5,136"), following what they pick, Build your own and a Black Friday price included; phones keep their bar; the accepted page checked at laptop size on a marked test lead assigned to Keenan (so no commission was made), removed afterwards
- [x] Unit tests (the banner, Where you're at, the star and description, the polish's check, one line per area, Settings, the build's key check), database tests for the site visit, the polish count and what the link is handed (`tests/rls/round17.test.ts`), and the quote-link, laptop, extras, meeting, Black Friday and quote-outcomes walk-throughs

## M4: Pipeline board and lead detail (iPad and desktop)
**Parked (Keenan, 2026-11-02).** Not started or planned until Keenan says otherwise.
- [ ] The board is a Board view inside Leads for the owner on iPad and desktop; phones keep the list
- [ ] Board columns match the status enum, cards show name, address, neighbourhood, setter, feet and total when quoted, and age
- [ ] Drag between columns on iPad and desktop writes a status change event; `lost` prompts for a reason
- [ ] Lead detail shows contact, map pin, photos, timeline, meetings, quotes and earnings; owner can edit everything, including marking `installed` by hand
- [ ] Board stays usable with 200 leads (pagination or virtualization)

## M6: Dashboard on the owner's Home (desktop and iPad)
**Parked (Keenan, 2026-11-02).** Not started or planned until Keenan says otherwise.
- [ ] The tiles sit on the owner's Home, below tonight's meetings and today's team; there is no separate dashboard page or tab
- [ ] Funnel, week and month, totals and per setter: doors, conversations, leads, meetings booked, meetings held, show rate, quotes, sold, installed
- [ ] Sold: count, dollars, average ticket
- [ ] Setter pay: owed now and pending install, per setter, matching the Pay screen
- [ ] Lead sources this month
- [ ] Upcoming jobs: sold leads not yet installed, oldest first, with sold date and feet
- [ ] Every tile shows its date range and what it counts; empty states explain what will appear
- [ ] Home still loads in under two seconds with a month of data

## M7: Website lead endpoint and polish
**Parked (Keenan, 2026-11-02).** Not started or planned until Keenan says otherwise.
- [ ] `POST /api/leads/website` with a shared secret creates a `website` lead and emails info@vesperlighting.ca; rate limited; validated with Zod
- [ ] Daily 7 am email to the owner: yesterday's numbers and tonight's meetings
- [ ] PWA caches the shell so the app opens instantly; a clear banner shows when offline
- [ ] Accessibility pass: labels, focus states, contrast in both themes
- [ ] Playwright smoke test: login, create lead, book meeting, mark held, create quote

## V1.5 (after launch, as needed)
Customer confirmation texts (first a prefilled Messages link from the setter's phone, then automated through Twilio; both need the CASL consent checkbox on the lead), email sending for quotes, offline queue for lead capture, map of knocked addresses.

## V2 (November)
Jobs, crews, job sheets, timesheets, crew profiles with authorizations, crew schedule, dashboard additions. Spec to be written after the first installs.
