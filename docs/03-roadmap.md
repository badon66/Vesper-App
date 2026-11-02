# Roadmap and acceptance criteria

One milestone per build session. A milestone is done when every criterion passes in the full automated suite, including the live walk-through on a phone-sized screen against the real database. Anything the suite cannot reach is named in the report. Keep the current milestone marked.

**Current milestone: M5 take 1** (Keenan, 2026-11-02): Meeting mode's first working version, on a preview link by 9 am Calgary time on 2026-11-03, ahead of his first meeting that evening. M5 moved ahead of M4 at Keenan's direction; M4 follows M5.

## M0: Foundation
Repo, Next.js App Router with TypeScript, Tailwind, shadcn/ui, Supabase client and server helpers, environment setup, PWA manifest and icons, base layout with the brand, light and dark themes, a protected `/app` route group with a working email and password login (accounts are created by the owner in the Supabase dashboard until M1), Vercel preview deploy.
- [x] `npm run dev`, `npm run build`, `npm run lint`, `npm test` all pass on a clean clone
- [x] `.env.example` lists every variable with a comment
- [x] The app installs to an iPhone home screen with the Vesper icon and opens full screen
- [x] Light and dark themes both readable; brand colours applied through CSS variables
- [x] Unauthenticated users are redirected to `/login`
- [x] Owner can sign in with email and password, land on `/app`, and sign out
- [x] Deployed to a Vercel preview URL

## M1: Auth, roles, settings, people
Supabase Auth (email plus password, no public sign-up), `profiles` with the trigger, `settings` seeded with the defaults from the data model, People and Settings screens for the owner (shown as Admin in the app).
- [ ] Admin adds a Vesper member in People (name, email, phone, role picker offering only Sales associate) and gets a generated password shown once (three words and four digits) to text them; the member signs in with it and lands on the phone home with no password change step
- [ ] Reset password on a member generates a new password, shows it once, and ends that member's open sessions; the sign-in screen says "Forgot your password? Ask Keenan." and offers no self-service reset
- [x] Dark theme is the default on a fresh device; light is available from the toggle and remembered
- [ ] People lists current members first (name, role, status, Reset password, Deactivate or Reactivate) with "Add a Vesper member" at the bottom
- [x] Role is enforced: a `sales` user hitting `/app/dashboard` or `/app/settings` gets a clear "not for your role" page on the server, and the RLS test proves the data is not readable either
- [ ] Settings screen edits pricing, GST toggle and GST number, booking pay, commission rate, warranty text, slot template, lost reasons and company details, and lets the owner change his own password
- [x] Deactivating a setter blocks login and hides them from pickers

The four unticked items need the owner's own screens. Only the owner adds members, and the owner's test session stays view only, so they are ticked when Keenan says so.

## M2: Leads and knock sessions (phone)
New lead, my leads, lead detail, notes, status changes, photos, knock session counters.
- [x] New lead on a phone in under 30 seconds: address autocomplete fills address, neighbourhood and lat/lng; photo from camera uploads and shows; save returns to my leads
- [x] A typed address saves without autocomplete, for example on preview sites or without signal; that lead has no map position until its address is picked from the suggestions
- [x] Phone numbers normalize to E.164, treating a number typed without a country code as Canadian (+1), and show formatted
- [x] My leads groups the setter's own leads by status, newest first, with a search box and an "everyone" switch that shows all leads read only
- [x] Every status change and note writes a `lead_events` row visible in the lead timeline with who and when
- [x] Setters change status only between New, Follow up and Lost, and Lost needs a reason from settings; the RLS test proves a setter cannot set Meeting booked or any later status
- [x] Picking an address that already has a lead shows who has it, with a link to that lead
- [x] A setter can open another setter's lead read only; the RLS test proves an update is rejected
- [x] Knock session: start with a neighbourhood, two counters that update instantly, end the session; leads created during a session link to it
- [x] Works one-handed in daylight; tap targets at least 44 px

All ten proved on 2026-10-28 by the RLS suite and the live walk-through (Chromium at iPhone 14 size, real Google suggestions). What automation cannot reach is in `decisions.md` under that date.

## M2.5: Navigation, View as, follow-up dates, speed
Asked for by Keenan on 2026-10-28, between M2 and M3.
- [x] A failed sign-in keeps the email and clears only the password; Settings and Add a Vesper member keep everything typed after an error
- [x] A bottom tab bar on phone and iPad and a slim left rail at 1024 px and wider, with the same items and no top tabs; owner tabs Home, New lead (the prominent centre button), Leads, Admin; setter tabs Home, New lead, Leads; Schedule and My pay stay hidden until M3
- [x] Admin holds People and Settings; the Dashboard tab is gone, and the old People, Settings and Dashboard links lead to their new places
- [x] The owner's Home shows today across the team (whose knock session is open, neighbourhood, doors, conversations, leads logged today, with team totals) and today's leads; every number says what it counts and that it covers today
- [x] The setter's Home shows their knock session and their follow-ups due
- [x] Choosing Follow up asks when (Tomorrow, In 3 days, Next week, or a date); the RLS test proves the database refuses a follow-up without a date and clears the date when the lead leaves Follow up
- [x] Leads opens to Active in attention order, with an All switch, search across every status, and Mine and Everyone
- [x] View as: owner only and checked on the server on every request, strictly read only with the server refusing every write, a gold bar with Exit, and only what that role can see; a test compares View as with what a real test setter sees on every setter screen
- [x] Functions run in pdx1 next to the database; every tab has a loading screen and prefetched links; tab-switch time is measured on production before and after

All nine proved on 2026-10-28 by the unit, RLS and live suites, the live ones also run against production, with View as compared screen by screen through the approved one-time owner session. Tab-switch numbers are in `decisions.md`.

## M2.6: The door process (phone)
Asked for by Keenan on 2026-10-31, between M2.5 and M3. Nothing here is required to save a lead.
- [x] A collapsible Door guide card at the top of New lead shows the text Keenan sets in Settings; setters read it through `settings_public`, as they read the lost reasons
- [x] Four labelled photo slots (Front, Left corner, Right corner, Soffit close-up): each opens the camera, shows the photo once taken and allows a retake; More photos takes extras; the hint shows under the slots; each photo stores its slot; resizing, metadata stripping and background upload work as before
- [x] Six optional one-tap Find out questions on New lead and Edit lead (Owns the home, Wants a price, Soffit colour, Christmas lights now, Which areas, Timing), each stored in its own column and empty until answered, shown on the lead page and in View as, with changes in the timeline
- [x] Soffit colour offers White, Off-white or cream, Other and Not sure; the database change is additive, with black and brown kept but unused
- [x] Settings has a Track colours list Keenan manages, each with a name and an optional RAL code: add, rename, reorder and retire, never delete; it starts with White, Off-white, Brown, Black and Grey
- [x] On the lead page only the owner can set the track colour, enforced in the database (the RLS test proves a setter cannot): one of the active colours, or Custom with a four-digit RAL Classic code shown by name from the RAL Classic list; names only, no swatch; setters see it
- [x] The M2 walk-through and the View as comparison cover the guide, the photo slots and the questions

All seven proved on 2026-11-01 by the unit, RLS and live suites on a phone-sized screen against the real database, with View as compared screen by screen through the approved one-time owner session. That session only looks, so two owner actions are proved up to the save but never saved from the screen: setting a lead's track colour, and adding, renaming, reordering or retiring a colour. Their database rules are proved by the RLS tests, with the service role standing in for the owner.

## M3: Scheduling, holds and booking pay (phone)
Approved by Keenan on 2026-11-01 with his answers and changes (see `decisions.md`). His top priority: two people can never take the same time.
- [x] No double booking, a hard rule: tapping an open time holds it; everyone else sees the holder's initials on it within a few seconds, without a refresh, and cannot pick it ("[Name] is booking this time."); the hold ends when the holder books, backs out or picks another time, and lets go after the grace period in Settings (2 minutes) when the holder's screen stops checking in; one hold per person; booking takes the caller's own hold or a free time, never someone else's; all of it enforced in the database under the same lock as booking
- [x] Database tests, with each race repeated many times per run: two setters grabbing the same time at the same instant, two booking it at the same instant, grabbing or booking a time someone else holds, a hold lapsing after the grace period, and one hold per person
- [x] Live test with two setters in two browsers: the second sees the first one's icon appear, cannot pick that time, sees it open again when the first backs out, and sees it grey out when the first books
- [x] The Schedule tab appears for the owner and setters, in the tab bar and the side rail. The time picker opens on tonight, or says tonight has nothing left and opens the next evening with an opening; every evening in the 14-day window is one tap away; booked times are greyed out with the neighbourhood and setter
- [x] Open times come from Settings minus live meetings, active holds and time blocks, in Calgary time and DST safe; setters can hold, book or move into a time until 30 minutes before it starts (in Settings), the owner until it starts
- [x] Before you book passes only when:
  - a phone number is saved;
  - Owns the home is Yes;
  - Wants a price is Yes;
  - Soffit colour is answered (Not sure is fine);
  - the Front, Left corner and Right corner photos exist, or the setter picks a skip reason (Homeowner said no, or Other with a note);
  - the setter confirms everyone who decides on the house will be at the meeting, stored on the booking;
  - the lead has a map position: an address picked from the suggestions, or the phone's GPS at the door ("Use where I'm standing"), accurate to 50 m or better.

  Otherwise the book button is disabled with each missing item shown. The owner's own leads follow the same rules.
- [x] The owner sees any photo skip, with its reason and note, and how the map position was set, on Schedule and Tonight
- [x] Setter Home, top to bottom: tonight's open times, big, with holders' initials (tapping one starts a booking; the next evening's times when tonight has nothing left); my bookings, tonight and upcoming, with outcomes; the knock session; follow-ups due. No role line under the greeting
- [x] New lead has "Hold a time" near the top; "Save and book" books the held time, or opens the time picker for the new lead when nothing is held. Booking also starts from Schedule, Home and the lead page
- [x] Move and cancel: setters move or cancel their own upcoming bookings until the time starts, the owner any booking; the new time is held first; cancelling sends the lead to Follow up for the next day; both are logged in the timeline and shown on Schedule and Tonight
- [x] Distance warning appears when the address is more than the configured km in a straight line from the meeting before or after it, with the distance shown, and booking can still go ahead
- [x] Tonight's meetings sit at the top of the owner's Home and in Schedule, in order with the straight-line distance from the one before, address, phone, a Navigate link, photos and notes. Outcomes: Qualified and Not qualified (a reason from Settings, or Other with text) set `met`; No-show and Cancelled (optional note) set `follow_up` with the next day as the follow-up date. A no-show or cancelled lead can be rebooked and the old meeting links to the new one. Outcomes can be corrected until the fee is paid
- [x] Booking pay: only Qualified creates a `booking` earning, for the setter whose lead it is (recorded on the meeting when it is booked, so a lead Keenan books for a setter still pays that setter), at the current booking pay, never a second one for the same lead; leads assigned to the owner earn nothing; a corrected outcome voids or restores the earning
- [x] The meeting host is its own column (Keenan for now), not tied to the owner role
- [x] Leads Active lists booked meetings after the follow-ups and new leads, soonest meeting first
- [x] The owner can add and remove time blocks
- [x] My pay tab (setter): owed now, pending install and paid totals, with every booking's outcome, reason and fee; the RLS test proves a setter cannot read another setter's earnings
- [x] Pay in Admin (owner): earnings grouped by setter; select owed lines and mark them paid in one batch, stamping `paid_at` and `paid_by`
- [x] Every new setter screen (Home, Schedule, booking, My pay) supports View as and is in the View as comparison test
- [x] Unit tests cover the distance check, the Before you book list, pay totals and the time picker's choice of evening; database tests cover slot times on both DST change days, the cutoff and window, and every booking rule

All proved on 2026-11-01 by the unit, RLS and live suites against the real database: the database race tests run 25 rounds each per run, the two-browser walk-through drives two test setters on phone-sized screens, and View as is compared screen by screen through the approved one-time owner session. That session only looks, so Keenan's outcome buttons, Mark paid, time blocks and a booking he makes for a setter's lead are walked up to the save and proved in the database tests, with the service role standing in.

## M3.5: The booking sheet and Schedule redesign (phone and iPad)
Asked for by Keenan on 2026-11-02, after trying M3: every rule is right, but the screens don't follow how a setter works at a door. The moment it is designed for: the homeowner is getting serious, the setter shows them the open times, they pick one together, and the setter finishes the details in the conversation and right after leaving the door. The rules don't change: holds, no double booking, Before you book and pay stay exactly as they are, and every existing test keeps passing.
- [x] Tapping an open time on Schedule or Home holds it and opens a full-screen booking sheet over the screen; letting go closes it and returns to where the person was. There are no page hops
- [x] The sheet assumes a new person and starts straight into the steps; a small "Existing lead instead" link lists the person's New and Follow up leads (all of them for the owner), and picking one skips every screen already filled in
- [x] A progress bar with the step names sits at the top: At the door, After the door, Book. A "?" in the top corner shows that step's note; Keenan edits the three notes in Settings, they replace the single Door guide wherever it showed, and the old setting stays, unused
- [x] The bottom bar is always there: Back, and Next as the primary button at the bottom right in thumb reach, with smaller "Pick another time" and "Let go" buttons. Nothing important sits at the top centre. One step per screen, one-tap answers, and no scrolling on a phone-sized screen (390 by 844) for any screen of At the door or After the door
- [x] At the door: name and phone, then one-tap Find out answers: Owns the home, Wants a price, Christmas lights now, Looked into it before (new: Got quotes, Thought about it, New to them), Which areas, Timing, and the confirmation that everyone who decides will be there
- [x] After the door: the address (picked from the suggestions, or "Use where I'm standing"), the soffit colour, and the guided photos (Front, Left corner, Right corner, Soffit close-up) with the photo skip option
- [x] Book: a short summary, every Before you book item ticked or linked to the screen that is missing it, and the Book button; then a done screen ("Booked for 7:30 pm tonight.")
- [x] The time stays held through every step and the sheet shows it; if the hold lapses, the sheet says so and offers to hold it again when the time is still free; a reload while the sheet is open brings it back on the same screen while the time is still the person's
- [x] New lead's "Save and book", the lead page's "Book a meeting" and Move open the same sheet, prefilled; it is the only booking experience
- [x] Schedule header, owner only, on phone and iPad: small "Block time" and pencil buttons at the right; setters never see them. Block time opens a pop-up to block one time or the whole evening, and blocked times show on the board itself, where Keenan can unblock them; the blocked-times section is gone
- [x] The pencil opens a pop-up to change that evening's start time, meeting length and number of meetings, saved as "Just this day" or "All days" (which updates the defaults in Settings). A day change never moves or cancels a booking: one that no longer lines up stays at its time, shows there on the board, and the pop-up warns about it before saving
- [x] Open times, holds and booking read the evening's own schedule when it has one, otherwise the defaults. The double-booking race tests and the slot checks cover day schedules
- [x] Everything new works in View as and is in the View as comparison test
- [x] The walk-through drives the sheet end to end, including two setters racing for the same time through it
- [x] The impeccable skill is installed, its critique scores for the booking flow and the Schedule page are recorded before and after, and screenshots of every step at phone and iPad sizes, as a setter and as Keenan, are reviewed before merging
- Proof (2026-11-02):
  - **Unit:** 211 tests.
  - **Database:** 113 tests, including:
    - 25-round races for holds and bookings on the default times and on an evening with its own times;
    - day schedules;
    - every booking staying on the board after a day change.
  - **Smoke:** 5 tests.
  - **Live walk-throughs:**
    - M1: 22 checks.
    - M2: 86 checks, including the step notes and Looked into it before.
    - M3: 88 checks, including three rounds of two setters racing for one time through the sheet, a reload mid-sheet, a lapsed hold held again, an existing lead, the distance warning, Move and Cancel, Save and book, and Keenan's tools, view only.
    - View as: 100 checks.
  - **Critique** (Nielsen, out of 40):
    - Booking flow: 23 before, 31 final.
    - Schedule: 26 before, 31 final.

## M5: Meeting mode (iPad), in two takes
Keenan's first meeting is the evening of 2026-11-03, so take 1 ships on a preview link by 9 am Calgary that day. Keenan approved take 1's direction, pricing and schema up front; the short plan is in `decisions.md`. Meeting mode is customer-facing the whole time: full screen, no tabs, and nothing internal on screen, ever: no costs, margins, setter names, pipeline or other customers.

### Take 1: present, price, save a draft
- [ ] Meeting mode opens full screen from Tonight and from the lead page (owner only, enforced on the server), with a small, discreet exit
- [ ] The presentation is swipeable, one idea per screen, big type, navy and gold: What Vesper is, Hidden by day (day and night photos of the same house with a drag slider), The whites first, How install day works, The warranty (the exact wording from `settings.warranty_text`), and a gallery of real install photos
- [ ] Presentation text and images come from Settings, not from code; a page with no content yet is skipped, never shown empty; the seeds are plain drafts (no invented stats, reviews or install counts, no em dashes) and only Vesper's own photos ever appear
- [ ] This house: the customer's mockup image full screen with pinch to zoom (skipped until uploaded), and the colour screen: their soffit colour, the matched track colour by name (no swatches), and the customer's initials confirming the colour, saved on the lead with a timeline event, at every meeting
- [ ] Uploads: presentation images (day, night, gallery) in Settings; the mockup on the lead page; both work the morning of the meeting
- [ ] Live quote builder: runs by name with feet and level, boxes, adders, neighbour and custom discounts, financing flag, "No payment until your install is complete."; every price editable for that quote only; the quote stores the prices it used; totals update live from `lib/pricing.ts` with unit tests (plain house, adders and discounts, per-quote price changes, GST on and off, rounding)
- [ ] Track colour pricing: stocked colours included; a non-stock colour included if they wait for the factory order (spring install); this season adds the rush colour fee per foot from Settings; when the rush fee or the service call fee is not set, that line is hidden, never blank
- [ ] On screen, totals read like "$3,450 + GST" with no GST dollar figure; with GST off nothing mentions GST
- [ ] Every quote has a valid-until date, default `settings.quote_valid_days` (14) days out
- [ ] Offline: meeting mode opened once with signal keeps working without it: presentation content and images are cached on the iPad, the quote math runs on the iPad, and the draft stays on the iPad until it is saved; saving needs signal and says so plainly
- [ ] The warranty wording, rush colour fee, service call fee, FAQ text and quote valid days live in Settings; the exact warranty wording Keenan gave is seeded
- [ ] Quotes are owner-only in RLS; sales users can never read them; no dollar amount is written to leads, lead_events or meetings
- [ ] Design: one impeccable shape before building, one critique and polish pass before the preview, scores in the report; deeper rounds wait for take 2

### Take 2: after Keenan's first meetings
- [ ] The leave-behind folder: a branded, always-white PDF through AirPrint and a share sheet: the personal quote (runs, feet, track colour, line-by-line prices, valid until), the mockup full page, a one-page overview, the warranty summary, the FAQ from Settings, and the company contact ((403) 895-9915, info@vesperlighting.ca, 448 Strathcona Drive SW, Calgary, AB T3H 1M3, never a unit number)
- [ ] Mark presented, accepted or declined; each writes a lead event and moves the lead to `quoted` or `sold`; accepting creates one pending `commission` earning for the lead's assigned setter (none when assigned to the owner) at the commission rate on the total as actually priced before GST; `installed` makes it payable; `lost` voids it; unit tests cover the amount and rounding
- [ ] A quote can't be marked ready until the lead's track colour is set; the quote stores the colour name and RAL code it used and prints them, and a Custom colour shows as needing powder coating
- [ ] A deeper impeccable pass with before and after scores, and whatever the first meetings show needs changing

## M4: Pipeline board and lead detail (iPad and desktop)
Follows M5 (Keenan, 2026-11-02: Meeting mode comes first, for his first meetings). Starts with a plan for Keenan's approval.
- [ ] The board is a Board view inside Leads for the owner on iPad and desktop; phones keep the list
- [ ] Board columns match the status enum, cards show name, address, neighbourhood, setter, feet and total when quoted, and age
- [ ] Drag between columns on iPad and desktop writes a status change event; `lost` prompts for a reason
- [ ] Lead detail shows contact, map pin, photos, timeline, meetings, quotes and earnings; owner can edit everything, including marking `installed` by hand
- [ ] Board stays usable with 200 leads (pagination or virtualization)

## M6: Dashboard on the owner's Home (desktop and iPad)
- [ ] The tiles sit on the owner's Home, below tonight's meetings and today's team; there is no separate dashboard page or tab
- [ ] Funnel, week and month, totals and per setter: doors, conversations, leads, meetings booked, meetings held, show rate, quotes, sold, installed
- [ ] Sold: count, dollars, average ticket
- [ ] Setter pay: owed now and pending install, per setter, matching the Pay screen
- [ ] Lead sources this month
- [ ] Upcoming jobs: sold leads not yet installed, oldest first, with sold date and feet
- [ ] Every tile shows its date range and what it counts; empty states explain what will appear
- [ ] Home still loads in under two seconds with a month of data

## M7: Website lead endpoint and polish
- [ ] `POST /api/leads/website` with a shared secret creates a `website` lead and emails info@vesperlighting.ca; rate limited; validated with Zod
- [ ] Daily 7 am email to the owner: yesterday's numbers and tonight's meetings
- [ ] PWA caches the shell so the app opens instantly; a clear banner shows when offline
- [ ] Accessibility pass: labels, focus states, contrast in both themes
- [ ] Playwright smoke test: login, create lead, book meeting, mark held, create quote

## V1.5 (after launch, as needed)
Customer confirmation texts (first a prefilled Messages link from the setter's phone, then automated through Twilio; both need the CASL consent checkbox on the lead), email sending for quotes, offline queue for lead capture, map of knocked addresses.

## V2 (November)
Jobs, crews, job sheets, timesheets, crew profiles with authorizations, crew schedule, dashboard additions. Spec to be written after the first installs.
