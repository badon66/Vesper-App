# Vesper App: V1 product spec (sales)

Written Oct 25, 2026. V1 is the sales side of the business. Jobs, crews, timesheets and customer-facing pages are V2 and V3 and are listed at the end so the data model and navigation leave room for them.

## Who uses it

| Role | Who | Device | Uses the app for |
|---|---|---|---|
| Owner (Admin in the app) | Keenan, and only Keenan | Phone in the field, iPad at meetings, desktop at home | Everything: tonight's meetings, running the meeting, quotes, pipeline, dashboard, settings, people |
| Sales (Sales associate in the app) | Two friends to start, more later | Phone | Logging doors, capturing leads, booking meetings, seeing the team's leads and bookings, seeing their own numbers and their own pay |
| Crew | Installers | Phone | V2: job sheets, timesheets |
| Customer | Homeowners | Their phone or email | V2: quote link, confirmation page. No login, ever |

## The day this app has to fit

- 4:00 to 6:00 pm: setters (and Keenan) knock doors in one or two target neighbourhoods. Solid leads get booked into that night's or a later night's meeting slots.
- 6:00 to 9:00 pm: Keenan drives to the booked meetings, in order, ideally clustered in the same area. He presents on the iPad, prices the house, and closes. The customer signs on paper for now.
- Later that night or next morning: Keenan updates outcomes, sold jobs move toward scheduling, follow-ups get a reminder.
- Install days (V2): crews get a job sheet, log hours, upload photos, Keenan sees progress.

The scheduling has to make Keenan's evening make sense: no double bookings, no two meetings 25 minutes apart across the city, and no booked meeting without a phone number to confirm it.

## What a solid lead is

Setters book meetings only for solid leads. A lead is solid when all of these are true:

1. They own the home (or are the decision maker for it).
2. They want a price, not just a chat.
3. Everyone who decides on the house can be there for the meeting.
4. The address and a working phone number are captured.
5. The roofline is something we can do (if the setter is unsure, they note it and book anyway; Keenan decides).

Anything else is `new` or `follow_up`, with a follow-up day and a note about why.

## The door process

A setter's visit is a short conversation with a structure, not a single yes or no: open, find out, photos, book. The app follows it with the booking sheet's three steps (At the door, After the door, Book), a short note for each step that Keenan writes, seven one-tap Find out questions and four guided photos. Nothing in it is required to save a lead, so a quick follow-up lead stays quick. Booking requires some of it: see Before you book.

## Sales users

Setters are a team. Each setter has their own profile, their own leads and their own numbers, but every sales user can see everyone's leads, bookings and knock sessions. That is so two setters do not knock the same street twice, and so a setter can book into an evening that already has meetings nearby. A setter can edit only their own leads. Sales users never see quotes, sale prices, revenue, the owner dashboard, settings or anyone else's pay.

### Setter pay

Setters earn two ways. Both rates live in settings. A rate change applies to new earnings only, and each earning stores the rate it was calculated at.

- Booking pay: a flat amount per qualified booking, starting at $20. After each meeting slot Keenan marks the booking Qualified, Not qualified, No-show or Cancelled. Only Qualified earns the fee. One booking fee per lead, maximum: a no-show or cancelled lead can be rebooked, and if that meeting is held and marked Qualified the fee is paid then. The fee goes to the setter whose lead it is: the lead's assigned setter, recorded on the meeting when it is booked, whoever picked the time. If Keenan books a setter's lead himself, that setter still earns the fee when it is marked Qualified. Keenan can correct an outcome until the fee is paid, and the fee follows: it is voided when a booking stops being Qualified and restored when it becomes Qualified again.
- Commission: a percentage of the sale, starting at 5%, calculated on the accepted quote total as actually priced (after any per-quote price changes), before GST. It is created when the quote is accepted and becomes payable when the lead is marked installed, since no customer pays until the install is complete. If the sale falls through before install, the commission is voided. Earlier no-shows on the same lead do not affect it. Like the booking fee, it goes to the lead's assigned setter.

Keenan marks earnings paid in batches. Only sales users earn; leads assigned to Keenan create no earnings. No money moves through the app. It records what is owed and what has been paid, and the e-transfer happens outside it.

## Navigation

The app is built around the evening schedule, not a list of people.

- Phone and iPad: a bottom tab bar. Screens 1024 px and wider: a slim left side rail with the same items. No top tabs anywhere.
- Keenan's tabs: Home, Schedule, Meetings, New lead (the prominent gold button), Leads. Admin, holding People, Settings and Pay, is a gear in the header, because six items crowd a phone's tab bar (Keenan, 2026-11-02). There is no separate Dashboard tab: Keenan's Home is the dashboard.
- Setter tabs: Home, Schedule, New lead, Leads, My pay.
- A tab that belongs to a later milestone does not show until that milestone is built.
- A tap on a tab answers at once with a loading screen, and the screen fills in as its data arrives.

## V1 screens

### Phone (setters and Keenan in the field)

**Home (setter).** Built for the door, top to bottom:
1. Tonight's open times, big and easy to read at dusk, with the holder's initials on any time someone is booking. Tapping an open time holds it and opens the booking sheet over Home, the same as on Schedule. If tonight has nothing left, it says so and shows the next evening's open times.
2. My bookings: tonight and upcoming, each with Move and Cancel until it starts, and the outcome once Keenan marks it.
3. The knock session.
4. Follow-ups due: their Follow up leads whose date is today or earlier, the oldest date first, each saying how late it is, with a tap through to the lead.

The greeting has no role line under it.

**Home (Keenan).** The dashboard. For now it shows today across the team: one row per person who knocked or logged a lead today, showing whether their knock session is open now, the neighbourhood, doors, conversations and leads logged today, with team totals. Below that, Keenan's own knock session, since he knocks too, and the list of today's leads. Every number says what it counts and that it covers today in Calgary time. Tonight's meetings sit at the top (see Tonight). M6 adds the sales dashboard below.

**Knock session.** Start a session with the neighbourhood name. Two big counters: doors knocked and conversations. Leads created during the session attach to it automatically. End the session. This is what feeds the funnel on the dashboard, so it has to be effortless or nobody will do it.

**New lead.** The centre tab. One screen, under 30 seconds, for a lead that isn't booking tonight, like a quick follow-up. A "?" at the top shows the step notes, then address with Google Places autocomplete (saves lat/lng), first name, last name, phone, the Find out questions, the guided photos, house type (bungalow, bi-level, two storey, other), notes, email (optional) and the source (door, referral, neighbour card, website, other). Status defaults to `new`. If Google is unavailable, for example on preview sites or without signal, the address field takes typed text and the lead saves without a map position; picking the address from the suggestions later adds it. When a picked address already has a lead, the form shows who has it and links to it, so two setters don't knock the same door. Phone numbers are Canadian by default: a number typed without a country code is saved as +1, and a number typed with + and a country code is kept as typed. At the bottom, "Save lead" saves it, and "Save and book" saves it and opens the booking sheet for it on the times, skipping every screen already filled in. Booking a customer at the door starts from Schedule or Home instead: tap the time they pick and the sheet does the rest.

**Step notes.** One short note for each step of the booking sheet: At the door, After the door and Book. They tell the setter what to talk about at that step. The "?" in the sheet's top corner shows the current step's note; on New lead, the "?" shows all three. Keenan edits them in Settings; setters read them the same way they read the lost reasons. They replace the single Door guide, whose old text stays in the database, unused. They start as:

- At the door: who you are, that you're with Vesper Lighting, and why you're on their street. Then find out, as a conversation, not a survey: is it their home? Do they put up Christmas lights now, and how? Have they looked into permanent lights before, or is it new to them? Which parts of the house, and when? Who else decides on the house, and can they be at the meeting?
- After the door: "Mind if I grab a few quick photos? Our lighting specialist will show you a mockup of your house with the lights on." Then, on the sidewalk: pick the address, check the soffit colour, and take the photos.
- Book: a half-hour meeting with our lighting specialist, tonight or this week: a free mockup and a clear price, no obligation. Tell them the time is theirs. If it's not the right time, let the time go and set a follow-up day.

**Find out.** Seven optional one-tap questions, in the booking sheet and on New lead and Edit lead:

| Question | Answers |
|---|---|
| Owns the home | Yes / No |
| Wants a price | Yes / Not yet |
| Soffit colour | White / Off-white or cream / Other (with a note) / Not sure |
| Christmas lights now | Hires someone / Does it themselves / None |
| Looked into it before | Got quotes / Thought about it / New to them |
| Which areas | Front only / Front and sides / Full wrap / Not sure |
| Timing | Before Christmas / New year / No rush |

Tapping a chosen answer again clears it. Each answer is stored in its own column, empty until answered, so M3 and the dashboard can use them. Answers show on the lead page and in View as, and a change shows in the timeline like any other edit. White is the only stock track colour, and a recent install found an off-white soffit too late, which is why the soffit question separates white from off-white.

**Guided photos.** Four labelled slots instead of a single photo button:
- Front: straight on, whole house in frame.
- Left corner and Right corner: angled so each side's roofline shows.
- Soffit close-up.

Each slot opens the camera, shows the photo once taken and allows a retake. More photos takes any extras. Under the slots: "Hold the phone sideways and get the whole roofline in. At night, hold still while night mode finishes." Photos are resized, stripped of metadata and uploaded in the background as before, and each one records its slot. The lead page shows the same slots. Retaking a slot there keeps the earlier photo as an extra, because only Keenan deletes photos.

**Track colour.** On the lead page, Keenan sets the track colour after checking it in person against his RAL K7 colour book. There are two kinds of choice:
- one of the active colours from the Track colours list in Settings;
- Custom, where he types a four-digit RAL Classic code and the app shows that colour's name from the RAL Classic list.

Only names show, never an on-screen swatch, because screen colours aren't accurate. Only Keenan can set it, and the database enforces that. Setters see it on the lead page and in View as but cannot change it; their soffit question at the door stays as it is. White is the only stock track colour; a Custom colour needs powder coating.

**Leads.** Opens to Active: New, Follow up and Meeting booked, ordered by what needs attention first. Follow-ups due today or overdue come first (oldest date first), then New leads (oldest first), then follow-ups for later days (soonest first), then booked meetings (soonest first, from M3). An All switch shows every lead, lost and closed ones included, grouped by status, newest first. Search always covers every status. Mine and Everyone stay: Everyone shows all leads read only, so a setter can check an address before knocking. Tap to open. Edit anything on your own lead. Add a note. Change status within what a setter can do: `new`, `follow_up` and `lost`. Choosing Follow up asks when: Tomorrow, In 3 days, Next week, or a date, and the date can be moved later. `meeting_booked` is set by booking a meeting, never by hand.

**Picking a time.** On Schedule, on setter Home and inside the booking sheet. The times open on tonight. If tonight has no open time left, it says so ("No meetings tonight" when tonight never had any) and opens the next evening with an opening. Any evening in the 14-day booking window stays one tap away, and the evening on screen is the board's heading. Open times are the brightest thing on the board. Booked times go quiet and show the neighbourhood first, then who booked it, so setters can cluster. Times past the cutoff show as closed. Inside the sheet, Pick another time and Move open on the evening of the time being changed.

**The booking sheet (Keenan, 2026-11-02).** The only way to book. It is built for one moment: at the door, the homeowner is getting serious, the setter shows them the open times on the phone or iPad, they pick one together, and the setter finishes the details as part of the conversation and right after leaving the door.
- Tapping an open time holds it and opens a full-screen sheet over the schedule. Letting go closes it and returns to the schedule.
- It assumes a new person and starts straight into the steps. A small "Existing lead instead" link lists the person's New and Follow up leads (every one, for Keenan); picking one skips every screen already filled in.
- A progress bar with the step names sits at the top: At the door, After the door, Book. It fills screen by screen within a step, and a step's name jumps to that step. The held time shows at the top left, and a "?" in the top corner shows that step's note. With an existing lead, "Booking [name]" sits above each screen's question.
- The bottom bar is always there: Back, and Next as the primary button at the bottom right, in thumb reach, with "Let go" (left, above Back) and "Pick another time" (right) as smaller, quieter buttons. Nothing important sits at the top centre. Let go asks first, and says whether the person is already saved; "Keep holding" is the primary button there. It also offers "Let go and open their lead to set a follow-up day" for a saved lead, or "Add the address to save them first".
- One step per screen, one-tap answers, and no scrolling on a phone where it can be avoided.
- An answer that rules out booking (Owns the home: No, Wants a price: Not yet) says so under the question at once, and at Book it shows as that answer with "Change answer", not as a missing item.

The steps:
1. **At the door:** first and last name and phone; then the Find out answers as one-tap choices: Owns the home, Wants a price, Christmas lights now, Looked into it before, Which areas and Timing; then the confirmation that everyone who decides on the house will be at the meeting.
2. **After the door, on the sidewalk:** the address, picked from the suggestions or with "Use where I'm standing"; the soffit colour, a quick look; and the guided photos (Front, Left corner, Right corner, Soffit close-up, which is optional), each one tap, with the photo skip option.
3. **Book:** "Ready to book?", the person's name, address and phone, every Before you book item ticked or linked to the screen that is missing it, any distance warning, and the Book button, which names the time ("Book 7:30 p.m."). Then a done screen: "Booked for 7:30 p.m. tonight." (or "tomorrow", or the date).

Saving and holding:
- The lead is saved the moment it has a first name and an address, when the setter leaves the address screen. After that, each screen saves as the setter goes, and photos attach as they upload. Letting go keeps a saved lead as New.
- Until then, what was entered lives on the phone. If the app reloads while the sheet is open, the sheet comes back on the same screen with what was typed. If the hold let go meanwhile, it says so, as a lapse would.
- The time stays held through every step, so the setter can tell the customer it's theirs, and the screen stays on while it is held (where the phone's browser allows it). If the hold lapses, the sheet says so quietly and offers to hold it again when the time is still free.
- New lead's "Save and book", the lead page's "Book a meeting" and Move open the same sheet, prefilled, on the times first.

**Holds: no double booking.** This is a hard rule (Keenan, 2026-11-01): two people can never take the same time, and a time is claimed the moment someone starts booking it, not at the end.
- Tapping an open time holds it for as long as the person stays in that booking. The hold ends when they book, back out or pick another time.
- While it is held, everyone else sees a small icon with the holder's initials on that time and cannot pick it. Tapping it says "[Name] is booking this time." Once booked, the time is greyed out and off the board. Both show on other phones within a few seconds, without a refresh.
- The holder's screen checks in to keep the hold alive. If it stops checking in (app closed, phone locked, no signal, or the camera open for photos), the hold lets go after the grace period in Settings, 2 minutes to start.
- One hold per person at a time.
- Booking takes the person's own hold or a free time, never a time someone else is holding.
- The database enforces all of it, under the same lock as booking.

**Cutoff and window.** Setters can hold, book or move into a time until 30 minutes before it starts (in Settings); Keenan until it starts. Bookings open 14 days ahead: tonight and the next 14 evenings.

**Move and cancel.** Setters can move their own upcoming bookings to another open time, or cancel them, until the time starts. Keenan can move or cancel any booking. Move opens the booking sheet on the times; picking the new time places a hold, the same as booking, and Move confirms it. Cancelling sends the lead to Follow up for the next day, the same as the Cancelled outcome. Both are logged in the lead's timeline and show on Schedule and Tonight. After the time starts, outcomes are Keenan's alone.

**Before you book.** Booking is possible only when all of these hold:
- a phone number is saved;
- Owns the home is Yes;
- Wants a price is Yes;
- Soffit colour is answered (Not sure is fine);
- the Front, Left corner and Right corner photos exist, or the setter picks a skip reason (Homeowner said no, or Other with a note), which Keenan sees on Schedule;
- the setter confirms that everyone who decides on the house will be at the meeting, stored on the booking;
- the lead has a map position: an address picked from the suggestions or, for a brand-new street Google doesn't have yet, the phone's own position taken at the door with "Use where I'm standing", accurate to 50 m or better. Keenan sees which kind it is on the lead and on Schedule, and the app warns when another lead is within 25 m.

Until then the book button stays disabled, with each missing item listed. If the address is more than 10 km in a straight line from the meeting before or after it, show a warning with the distance and let them choose. The setter confirms the time with the customer at the door. The app does not send or prefill texts in V1.

**Schedule.** Everyone sees the times for the 14-day window, with holds, bookings and blocked times on the board itself. Keenan also sees each evening's bookings in full (see Tonight), and two small buttons at the right of the Schedule header, on phone and iPad; setters never see them:
- **Block time** opens a pop-up to block one open time or the whole evening, with an optional reason. The whole evening blocks every open time; booked times stay booked and a held time stays its holder's. The button says what it blocks ("Block 4 open times"). Blocked times show on the board, and Keenan taps one to unblock it. A booked time is tappable for Keenan too: it takes him to that booking.
- **The pencil** opens a pop-up to change that evening: start time, meeting length and number of meetings. It says whether the evening uses the usual times or its own, and shows the evening as setters will see it after saving, with a one-line summary by the buttons. Saving offers "Just this day", or "All days", which updates the defaults in Settings and always asks first. Both stay off until something changes and the bookings have been checked, and Cancel leaves everything as it was. An evening with its own times can go back to the usual ones, and a day schedule can open an evening that isn't a usual meeting day.
- On an iPad in landscape, the board and the evening's bookings sit side by side.
- A day change never moves or cancels a booking. If a booked meeting no longer lines up with the new times, it stays where it is and shows there on the board, times that overlap it can't be booked, and the pop-up warns about it before saving. A hold on a time that disappears lets go, and the pop-up warns about that too.
- Open times, holds and booking read the evening's own schedule when it has one, otherwise the defaults.

**Tonight (Keenan).** At the top of Keenan's Home and in Schedule. The evening's meetings in order, each with the straight-line distance from the one before, the lead's name, address, phone, notes and photos, any photo skip, how the map position was set, and a Navigate link. Moved and cancelled bookings stay listed, muted, with who changed them and when. After each slot, mark the booking Qualified, Not qualified, No-show or Cancelled. Not qualified needs a reason from the list in settings (Not the homeowner, Decision maker missing, Didn't want a price, Roofline we can't do, Other with text). No-show and Cancelled take an optional note. Only Qualified creates the booking fee, for the lead's setter, and never a second one for the same lead. Qualified and Not qualified move the lead to Met. No-show and Cancelled move it back to Follow up with the next day as its follow-up date, and it can be rebooked into a later time. An outcome can be corrected until the fee is paid; the fee is voided or restored to match. From a held meeting, open Meeting mode on the iPad (same lead, picks up where the phone left off).

**My numbers (setter).** This week: doors, conversations, leads, meetings booked, meetings that happened. Nothing about money or other people.

**My pay (setter).** Its own tab. Three totals: owed now, pending install (commission, from M5), paid. Under them, every booking on their leads with its date, lead, outcome (and, when not qualified, the reason) and its fee or "No fee", then each commission from M5, each with its amount and status. Nothing about other people.

### iPad (Keenan at the meeting)

**Meeting mode (Keenan, 2026-11-02).** Landscape iPad at the kitchen table, customer-facing the whole time. Full screen with no tabs, and nothing internal ever on screen: no costs, margins, setter names, pipeline, other customers or app chrome. Keenan talks over the screens, so the customer never has to read paragraphs: one idea per screen, big type, navy and gold, calm and premium. It opens from Tonight (Home and Schedule) and from the lead page, owner only, enforced on the server, and exits with a small, discreet control. Meeting mode is always dark navy, whatever theme the device uses.

Built in two takes. Take 1 is the presentation, This house and the live quote builder, with drafts saved. Take 2 adds the leave-behind folder, accepting with the commission, and the quote-ready rule; Keenan brings printed materials until then.

**The presentation.** Swipeable screens, in order, all content editable in Settings. A page with no content yet is skipped, never shown empty.
1. **What Vesper is.** A permanent fixture and an investment in the home, not Christmas lights.
2. **Hidden by day.** Day and night photos of the same house with a drag slider between them. Needs both photos uploaded.
3. **The whites first.** Warm white every night, then colour for the nights that matter.
4. **How install day works.** A few plain steps.
5. **The warranty.** The exact wording from `settings.warranty_text`. When the service call fee is set in Settings, it shows with the years 6 to 10 line; when it is not set, nothing about an amount shows.
6. **Gallery.** Real install photos, whatever Keenan has uploaded. Only Vesper's own photos, never stand-ins from other companies.

**This house.**
- The customer's own mockup image (made outside the app, lights on), uploaded on the lead page and attached to the lead. Full screen, pinch to zoom. Skipped until uploaded.
- The colour screen: their soffit colour, the matched track colour by name and RAL code (no swatches on screen, ever), and a field for the customer's initials confirming the colour. Confirmed and initialled at every meeting; the initials and the moment are saved on the lead and the timeline records each confirmation. This exists because white track once went on an off-white soffit.

**Live quote builder.** Runs by name (front upper, left gable, garage, and so on), feet each, lower or upper level. Boxes (default 1). Adders for height or complexity with a label and amount. Neighbour discount and a custom discount. Financing available as a flag only, explained in person, with "No payment until your install is complete." on screen. Settings supplies the defaults ($23 per foot, $500 per box, $150 neighbour) and Keenan can change every price for that quote only; the quote stores the prices it actually used, so later Settings changes never alter it. Totals update live from `lib/pricing.ts`, covered by unit tests, and read like "$3,450 + GST" with no GST dollar figure; with GST off nothing mentions GST. Every quote has a valid-until date, default `settings.quote_valid_days` days out (14).

**Track colour pricing.** A stocked colour (the Track colours list) is included. A non-stock colour is included if the customer waits for the factory order (spring install). If they want it this season, the rush colour fee per foot from Settings is added for every foot. When the rush fee is not set, the this-season choice is hidden, never blank.

**Meetings (Keenan, 2026-11-02).** Meeting mode's home, owner only; setters never see it. Tonight's meetings in time order, each with the time, the customer's name and address, and a big Start that opens meeting mode, flagged when the mockup isn't uploaded or the track colour isn't set, so it can be fixed before he leaves. Upcoming meetings below, the same way. Start a meeting, for someone not booked through the schedule: search existing leads, or add a new person with a name and an address and go straight into meeting mode. Get tonight ready saves every one of tonight's meetings on the iPad, photos included, so each opens without signal, and shows which are saved and when.

**Offline.** Houses have weak signal. Meeting mode opened once with signal keeps working without it: the presentation content and images are cached on the iPad, the quote math runs on the iPad, and the quote draft stays on the iPad (and survives a reload) until it is saved. Saving the quote or the initials needs signal, and the screen says so plainly instead of losing anything.

**Take 2: the leave-behind folder.** A branded PDF, always white, printable through AirPrint and shareable from the iPad: the personal quote (runs, feet, track colour, line-by-line prices, valid until), the mockup full page, a one-page overview of what they get, the warranty summary, the FAQ from Settings (running cost as an estimate not a promise, snow and ice, Wi-Fi and the app, moving house, HOAs), and the company contact: (403) 895-9915, info@vesperlighting.ca, 448 Strathcona Drive SW, Calgary, AB T3H 1M3. Never a unit number. Take 2 also brings mark presented, accepted or declined with the lead events and statuses, the commission on accept, and the quote-ready rule (no quote marked ready until the track colour is set; the quote prints the colour and RAL code it used, and a Custom colour shows as needing powder coating).

**Pipeline board.** A Board view inside Leads for Keenan on iPad and desktop; phones keep the list. Columns by status, cards with name, address, neighbourhood, setter, feet (if quoted), total (if quoted), and age. Drag between columns on iPad and desktop. Tap to open lead detail.

**Lead detail.** Everything about the lead: contact, address with a small map, photos by slot, the Find out answers, notes, the timeline of events (who did what, when), the meetings, the quotes, the earnings. Owner can edit anything and change to any status. The owner marks `installed` by hand in V1 (jobs come in V2); that makes the commission payable. `lost` asks for a reason (price, went with another company, not now, could not reach, other).

### Desktop and iPad (Keenan)

**Dashboard.** Owner only, on Keenan's Home below tonight's meetings and today's team. A sales dashboard, kept small and honest because there is not much data yet:
- Funnel, this week and this month, totals and per setter: doors, conversations, leads, meetings booked, meetings held, show rate, quotes, sold, installed.
- Sold: count, total dollars, average ticket.
- Setter pay: what each setter is owed now and what is pending install.
- Lead sources this month.
- Upcoming jobs: sold leads not yet installed, oldest first, with sold date and total feet.
- Every number shows its date range and what it counts. Empty states explain what will show up.

**Settings.** In Admin. The three step notes (At the door, After the door, Book); the Track colours list (each with a name and an optional RAL code, added, renamed, reordered and retired, never deleted, starting with White, Off-white, Brown, Black and Grey); pricing defaults, GST on or off and the GST number, booking pay and commission rate, the rush colour fee per foot and the service call fee (both may be unset; unset hides their lines everywhere), quote valid days (14), the warranty text (the exact wording meeting mode and the folder use), the FAQ text for the folder, the presentation pages (each page's title and text, the day and night photos for Hidden by day, and the gallery uploads; the seeded text is a draft for Keenan to make his own), meeting slot template (days, start, slot length, count), the booking cutoff (30 minutes), the hold grace period (2 minutes) and the booking window (14 days), the lost reasons and Not qualified reasons lists. Blocked times and one evening's own times are set on Schedule; "All days" there updates the template here.

**People.** In Admin. Current members are the main content: name, role, active or deactivated, with View as, Reset password and Deactivate or Reactivate on each row. View as, on active non-owner members, opens the app exactly as that person sees it, every screen included, under a gold bar across the top: "Viewing as [name]. Read only. Exit." Nothing can be changed while viewing, the server refuses every write, and it only ever shows what that person's role can see. At the bottom, a button labelled "Add a Vesper member" opens the form: name, email, phone and a role picker that offers only Sales associate for now and is built so a new role (Crew in V2) appears by adding it to the list, never by rebuilding the screen. Owner is never a choice. The app generates the password (three lowercase common words and four digits, like maple-river-stone-4821), shows it once in the gold box, and the admin texts it. That password is permanent until the admin resets it: Reset password generates a new one, shows it once, and ends the person's open sessions. Non-owners have no way to change or reset their own password and get no emails of any kind; the sign-in screen says "Forgot your password? Ask Keenan." A deactivated person cannot sign in and is hidden from pickers. There is exactly one admin and People cannot hand out that role.

**Pay.** Owner only, in Admin. Earnings grouped by setter: owed now, pending install, paid. Select the owed lines and mark them paid in one batch, which stamps when and by whom. Each line shows the lead, the type, the rate it was calculated at and the amount. Paid lines never change.

## Design

- Brand: navy `#132E3F`, gold `#B99257`, white, minimal black. Gold is for emphasis and primary actions only.
- Type: one clean sans for the app (Manrope or similar), large sizes on phone, generous spacing. The presentation can use the website's heading face for consistency.
- Dark theme by default with a light theme available, remembered per device. Setters knock at dusk and Keenan meets in the evening. Anything printed or exported as a PDF is always white.
- Premium and calm. No emoji, no gradients, no glass, no icon grids, no filler. Empty space is fine. Empty states are written, not decorated.
- Phone screens are one task per screen. iPad screens can show two panes.
- After an error, a form keeps everything the person typed except passwords.

## Out of scope for V1 (do not build)

- Payments, deposits, e-signature, invoices (waiting on the prepaid contracting licence, planned for January).
- Jobs, crews, job sheets, timesheets, driver authorization, certifications (V2).
- Customer-facing pages and public quote links (V2).
- Any texting or emailing of customers from the app, including the prefilled confirmation text (see `docs/backlog.md`). Automated SMS and email are V1.5, after CASL consent is in the lead form.
- Inventory and feet tracking.
- Paying setters from the app. The app records earnings and payments; the money moves outside it.
- Maps of knocked houses, territory management, route optimization beyond the distance warning.
- Offline writes. V1 needs signal. Keep writes small and fast. Queueing offline writes is V1.5 if it turns out to be a problem.
- Integrations with accounting, calendars or the website beyond the lead form endpoint.
- Advanced reporting, filters, exports.

## V2 (November, after the first installs)

Jobs created from sold leads: install date, crew, materials (feet, boxes, track colour), job sheet the crew sees on their phone (address, runs, zones, box location, customer notes, no prices), before and after photos, completion checklist, warranty record. Crew profiles with role, pay rate, height authorization, driver authorization, test results. Timesheets with clock in and out per job. Crew schedule. Dashboard additions: installed revenue, feet installed, hours per job, cost per job.

## V3 (January onward)

Customer-facing: public quote link, booking page from the website, confirmation page, e-signature, deposits and payments once licensed, warranty claim form, referral tracking. Automated reminders. Inventory with purchase orders.
