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
3. Both decision makers can be there for the meeting.
4. The address and a working phone number are captured.
5. The roofline is something we can do (if the setter is unsure, they note it and book anyway; Keenan decides).

Anything else is `new` or `follow_up`, with a note about when to come back.

## Sales users

Setters are a team. Each setter has their own profile, their own leads and their own numbers, but every sales user can see everyone's leads, bookings and knock sessions. That is so two setters do not knock the same street twice, and so a setter can book into an evening that already has meetings nearby. A setter can edit only their own leads. Sales users never see quotes, sale prices, revenue, the owner dashboard, settings or anyone else's pay.

### Setter pay

Setters earn two ways. Both rates live in settings. A rate change applies to new earnings only, and each earning stores the rate it was calculated at.

- Booking pay: a flat amount per qualified booking, starting at $20. After each meeting slot Keenan marks the booking Qualified, Not qualified, No-show or Cancelled. Only Qualified earns the fee. One booking fee per lead, maximum: a no-show or cancelled lead can be rebooked, and if that meeting is held and marked Qualified the fee is paid then.
- Commission: a percentage of the sale, starting at 5%, calculated on the accepted quote total as actually priced (after any per-quote price changes), before GST. It is created when the quote is accepted and becomes payable when the lead is marked installed, since no customer pays until the install is complete. If the sale falls through before install, the commission is voided. Earlier no-shows on the same lead do not affect it.

Keenan marks earnings paid in batches. Only sales users earn; leads Keenan knocks himself create no earnings. No money moves through the app. It records what is owed and what has been paid, and the e-transfer happens outside it.

## Navigation

The app is built around the evening schedule, not a list of people.

- Phone and iPad: a bottom tab bar. Screens 1024 px and wider: a slim left side rail with the same items. No top tabs anywhere.
- Keenan's tabs: Home, Schedule (from M3), New lead (the prominent centre button), Leads, Admin. Admin holds People and Settings, and Pay from M3. There is no separate Dashboard tab: Keenan's Home is the dashboard.
- Setter tabs: Home, Schedule (from M3), New lead, Leads, My pay (from M3).
- A tab that belongs to a later milestone does not show until that milestone is built.
- A tap on a tab answers at once with a loading screen, and the screen fills in as its data arrives.

## V1 screens

### Phone (setters and Keenan in the field)

**Home (setter).** Their knock session (start, the two counters, end) and their follow-ups due: their Follow up leads whose date is today or earlier, the oldest date first, each saying how late it is, with a tap through to the lead.

**Home (Keenan).** The dashboard. For now it shows today across the team: one row per person who knocked or logged a lead today, showing whether their knock session is open now, the neighbourhood, doors, conversations and leads logged today, with team totals. Below that, Keenan's own knock session, since he knocks too, and the list of today's leads. Every number says what it counts and that it covers today in Calgary time. M3 adds tonight's meetings at the top. M6 adds the sales dashboard below.

**Knock session.** Start a session with the neighbourhood name. Two big counters: doors knocked and conversations. Leads created during the session attach to it automatically. End the session. This is what feeds the funnel on the dashboard, so it has to be effortless or nobody will do it.

**New lead.** The centre tab. One screen, under 30 seconds. Address with Google Places autocomplete (saves lat/lng), first name, last name, phone, email (optional), house type (bungalow, bi-level, two storey, other), soffit colour (white, black, brown, other with a note), one or more photos from the camera, notes, and the source (door, referral, neighbour card, website, other). Status defaults to `new`. If Google is unavailable, for example on preview sites or without signal, the address field takes typed text and the lead saves without a map position; picking the address from the suggestions later adds it. When a picked address already has a lead, the form shows who has it and links to it, so two setters don't knock the same door. Phone numbers are Canadian by default: a number typed without a country code is saved as +1, and a number typed with + and a country code is kept as typed. From M3, a "book a meeting" button sits at the bottom and goes straight into booking with this lead. It stays hidden until booking exists.

**Leads.** Opens to Active: New, Follow up and Meeting booked, ordered by what needs attention first. Follow-ups due today or overdue come first (oldest date first), then New leads (oldest first), then follow-ups for later days (soonest first), then booked meetings (soonest first, from M3). An All switch shows every lead, lost and closed ones included, grouped by status, newest first. Search always covers every status. Mine and Everyone stay: Everyone shows all leads read only, so a setter can check an address before knocking. Tap to open. Edit anything on your own lead. Add a note. Change status within what a setter can do: `new`, `follow_up` and `lost`. Choosing Follow up asks when: Tomorrow, In 3 days, Next week, or a date, and the date can be moved later. `meeting_booked` is set by booking a meeting, never by hand.

**Book a meeting.** In the Schedule tab, and from New lead and the lead page. Pick a day, see the open slots for that evening. Booked slots show the time, the neighbourhood and who booked it so the setter can cluster. Pick a slot, confirm "both decision makers will be there," confirm the phone number, book. If the address is more than 10 km from the neighbouring meeting, show a warning with the distance and let them choose. The setter confirms the time with the customer at the door. The app does not send or prefill texts in V1.

**Tonight (Keenan).** At the top of Keenan's Home and in Schedule. The evening's meetings in order with the drive between them, each with the lead's name, address, phone, notes, photos and a "navigate" link. After each slot, mark the booking Qualified, Not qualified, No-show or Cancelled. Not qualified needs a reason from the list in settings (Not the homeowner, Decision maker missing, Didn't want a price, Roofline we can't do, Other with text). No-show and Cancelled take an optional note. Only Qualified creates the setter's booking pay, and never a second one for the same lead. No-show and Cancelled move the lead back to Follow up with the next day as its follow-up date. A no-show or cancelled lead can be rebooked into a later slot. From a held meeting, open Meeting mode on the iPad (same lead, picks up where the phone left off).

**My numbers (setter).** This week: doors, conversations, leads, meetings booked, meetings that happened. Nothing about money or other people.

**My pay (setter).** Its own tab. Three totals: owed now, pending install, paid. Under them, every line item with date, lead, type (booking or commission), amount and status, and for each booking its outcome and, when not qualified, the reason. Nothing about other people.

### iPad (Keenan at the meeting)

**Meeting mode.** Landscape. Left side: a short presentation the customer looks at. Right side (or a swipe away): the quote builder. Presentation pages, in order:
1. Vesper, what we do, an investment in the home, not Christmas lights.
2. The product: 24V RGBW nodes, hat track tight under the soffit, barely visible by day, true whites from a dedicated white LED, colour matched track.
3. Scenes: warm white every night, Christmas, Halloween, game day. Real photos of finished houses.
4. How install day works and what the box is (plugs into a standard outlet, indoors or outdoors, zones).
5. The warranty, in the exact words from settings.
6. The price breakdown for this house (live from the quote builder, shown as a total plus GST, never as a GST dollar figure).
7. Financing available, and "no payment until your install is complete."
8. The neighbour discount and the referral credit.
Pages are plain, large type, navy and white with gold accents, no animations beyond a simple page transition. Content is editable in settings so Keenan can change wording without a deploy.

**Quote builder.** Runs: name (front eave, left gable, garage, etc.), feet, level (lower, upper). Boxes (default 1). Adders: height, complexity, custom, each with a label and amount. Discounts: neighbour, referral, custom. Financing offered: yes or no. Settings supplies the defaults, and Keenan can change every price on the quote itself: price per foot, control box, each adder, each discount, and a custom line. Changes apply to that quote only, and the quote stores the prices it actually used, so later changes to Settings never alter it. The breakdown updates live. On screen the total reads "$3,450 + GST" with no GST dollar figure. Save as draft, mark presented, mark accepted or declined. Accepting creates the setter's commission earning on the total as actually priced, before GST. Export a PDF with the breakdown, subtotal, GST as a dollar amount, total and the GST number, the warranty text, the "no payment until complete" line, and the company contact. When GST is off, the PDF and every screen show the price alone with no mention of GST. The PDF is always white, whatever theme the app is in. Email it to the customer from the app (V1: generate the PDF and open a share sheet; email sending is V1.5).

**Pipeline board.** A Board view inside Leads for Keenan on iPad and desktop; phones keep the list. Columns by status, cards with name, address, neighbourhood, setter, feet (if quoted), total (if quoted), and age. Drag between columns on iPad and desktop. Tap to open lead detail.

**Lead detail.** Everything about the lead: contact, address with a small map, photos, notes, the timeline of events (who did what, when), the meetings, the quotes, the earnings. Owner can edit anything and change to any status. The owner marks `installed` by hand in V1 (jobs come in V2); that makes the commission payable. `lost` asks for a reason (price, went with another company, not now, could not reach, other).

### Desktop and iPad (Keenan)

**Dashboard.** Owner only, on Keenan's Home below tonight's meetings and today's team. A sales dashboard, kept small and honest because there is not much data yet:
- Funnel, this week and this month, totals and per setter: doors, conversations, leads, meetings booked, meetings held, show rate, quotes, sold, installed.
- Sold: count, total dollars, average ticket.
- Setter pay: what each setter is owed now and what is pending install.
- Lead sources this month.
- Upcoming jobs: sold leads not yet installed, oldest first, with sold date and total feet.
- Every number shows its date range and what it counts. Empty states explain what will show up.

**Settings.** In Admin. Pricing defaults, GST on or off and the GST number, booking pay and commission rate, warranty text, presentation text, meeting slot template (days, start, slot length, count) and blocked times, the lost reasons list.

**People.** In Admin. Current members are the main content: name, role, active or deactivated, with View as, Reset password and Deactivate or Reactivate on each row. View as, on active non-owner members, opens the app exactly as that person sees it, every screen included, under a gold bar across the top: "Viewing as [name]. Read only. Exit." Nothing can be changed while viewing, the server refuses every write, and it only ever shows what that person's role can see. At the bottom, a button labelled "Add a Vesper member" opens the form: name, email, phone and a role picker that offers only Sales associate for now and is built so a new role (Crew in V2) appears by adding it to the list, never by rebuilding the screen. Owner is never a choice. The app generates the password (three lowercase common words and four digits, like maple-river-stone-4821), shows it once in the gold box, and the admin texts it. That password is permanent until the admin resets it: Reset password generates a new one, shows it once, and ends the person's open sessions. Non-owners have no way to change or reset their own password and get no emails of any kind; the sign-in screen says "Forgot your password? Ask Keenan." A deactivated person cannot sign in and is hidden from pickers. There is exactly one admin and People cannot hand out that role.

**Pay.** Owner only, in Admin. Earnings grouped by setter: owed now, pending install, paid. Select the owed lines and mark them paid in one batch. Each line shows the lead, the type, the rate it was calculated at and the amount.

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
