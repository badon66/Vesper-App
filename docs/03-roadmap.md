# Roadmap and acceptance criteria

One milestone per build session. A milestone is done when every criterion passes in the full automated suite, including the live walk-through on a phone-sized screen against the real database. Anything the suite cannot reach is named in the report. Keep the current milestone marked.

**Focus (Keenan, 2026-11-02).** The app's fundamentals are three things: the setter sessions (knocking, leads and booking), the sales meetings (meeting mode on the iPad), and the shareable quote links for customers. Everything else is parked until Keenan says otherwise: M4 (pipeline board), M6 (sales dashboard), M7 (website lead form and daily email) and the backlog ideas. Parked milestones are not started or planned.

**Current milestone: round 5, Session and the booking sheet from the field** (Keenan, 2026-11-06, approved, merges on green after 9:30 pm Calgary). Before it: **round 4, tap to jump and sessions** (Keenan, 2026-11-06, live, merge `ad701b8`). Before it: **booking sheet round 3** (Keenan, 2026-11-05, approved, merges on green after 9:30 pm Calgary). Before it: **the Session tab and the new Homes, both live on 2026-11-05** (Keenan; approved, each merged on green straight to live, nothing customer facing). Built from main, so nothing from the unreviewed quote page goes live. The quote link rework (take 1's second pass) waits on a preview for Keenan's "push the changes". Setter side round 2 was released on 2026-11-03; the setter side and the customer quote link's take 1 the same day (merges `372ee85`, `947a3fd`); M5 take 1 on 2026-11-02 (merge `b075554`), and the Meetings page the same day (merge `13b737d`).

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

### Take 2: after Keenan's first meetings
- [ ] The leave-behind folder: a branded, always-white PDF through AirPrint and a share sheet: the personal quote (runs, feet, track colour, line-by-line prices, valid until), the mockup full page, a one-page overview, the warranty summary, the FAQ from Settings, and the company contact ((403) 895-9915, info@vesperlighting.ca, 448 Strathcona Drive SW, Calgary, AB T3H 1M3, never a unit number)
- [ ] Mark presented, accepted or declined; each writes a lead event and moves the lead to `quoted` or `sold`; accepting creates one pending `commission` earning for the lead's assigned setter (none when assigned to the owner) at the commission rate on the total as actually priced before GST; `installed` makes it payable; `lost` voids it; unit tests cover the amount and rounding
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
- [x] After Book my install, a thank-you screen: Keenan will be in touch within a day to set the date and go through the agreement; no signing, no payment
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

### Take 2 (after the first links go out, with M5 take 2)
- [ ] Your documents: Quote, Warranty, What you get, FAQ, Install day and Agreement preview, each a phone page with Download PDF, built once together with M5 take 2's leave-behind folder
- [ ] Which documents were opened
- [ ] Quote version history

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
