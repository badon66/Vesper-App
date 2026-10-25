# Vesper App: V1 product spec (sales)

Written Oct 25, 2026. V1 is the sales side of the business. Jobs, crews, timesheets and customer-facing pages are V2 and V3 and are listed at the end so the data model and navigation leave room for them.

## Who uses it

| Role | Who | Device | Uses the app for |
|---|---|---|---|
| Owner | Keenan | Phone in the field, iPad at meetings, desktop at home | Everything: tonight's meetings, running the meeting, quotes, pipeline, dashboard, settings, people |
| Sales (setter) | Two friends to start, more later | Phone | Logging doors, capturing leads, booking meetings, seeing their own numbers |
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

## V1 screens

### Phone (setters and Keenan in the field)

**Knock session.** Start a session with the neighbourhood name. Two big counters: doors knocked and conversations. Leads created during the session attach to it automatically. End the session. This is what feeds the funnel on the dashboard, so it has to be effortless or nobody will do it.

**New lead.** One screen, under 30 seconds. Address with Google Places autocomplete (saves lat/lng), first name, last name, phone, email (optional), house type (bungalow, bi-level, two storey, other), soffit colour (white, black, brown, other with a note), a photo from the camera, notes, and the source (door, referral, neighbour card, website, other). Status defaults to `new`. A "book a meeting" button sits at the bottom and goes straight into booking with this lead.

**My leads.** The setter's own leads, newest first, grouped by status. Tap to open. Edit anything. Add a note. Change status (within what a setter can do: `new`, `follow_up`, `meeting_booked`, `lost`).

**Book a meeting.** Pick a day, see the open slots for that evening. Booked slots show only the time and the neighbourhood so the setter can cluster. Pick a slot, confirm "both decision makers will be there," confirm the phone number, book. If the address is more than 10 km from the neighbouring meeting, show a warning with the distance and let them choose. After booking, a "Text the customer" button opens their Messages app with a prewritten confirmation (see copy below). The setter marks it sent.

**Tonight (Keenan).** The evening's meetings in order with the drive between them, each with the lead's name, address, phone, notes, photos and a "navigate" link. Tap into a meeting to mark the outcome: held, no-show, rescheduled, cancelled. From a held meeting, open Meeting mode on the iPad (same lead, picks up where the phone left off).

**My numbers (setter).** This week: doors, conversations, leads, meetings booked, meetings that happened. Nothing about money or other people.

### iPad (Keenan at the meeting)

**Meeting mode.** Landscape. Left side: a short presentation the customer looks at. Right side (or a swipe away): the quote builder. Presentation pages, in order:
1. Vesper, what we do, an investment in the home, not Christmas lights.
2. The product: 24V RGBW nodes, hat track tight under the soffit, barely visible by day, true whites from a dedicated white LED, colour matched track.
3. Scenes: warm white every night, Christmas, Halloween, game day. Real photos of finished houses.
4. How install day works and what the box is (plugs into a standard outlet, indoors or outdoors, zones).
5. The warranty, in the exact words from settings.
6. The price breakdown for this house (live from the quote builder).
7. Financing available, and "no payment until your install is complete."
8. The neighbour discount and the referral credit.
Pages are plain, large type, navy and white with gold accents, no animations beyond a simple page transition. Content is editable in settings so Keenan can change wording without a deploy.

**Quote builder.** Runs: name (front eave, left gable, garage, etc.), feet, level (lower, upper). Boxes (default 1). Adders: height, complexity, custom, each with a label and amount. Discounts: neighbour, referral, custom. Financing offered: yes or no. The breakdown updates live. Save as draft, mark presented, mark accepted or declined. Export a PDF with the breakdown, the warranty text, the "no payment until complete" line, and the company contact. Email it to the customer from the app (V1: generate the PDF and open a share sheet; email sending is V1.5).

**Pipeline board.** Columns by status, cards with name, address, neighbourhood, setter, feet (if quoted), total (if quoted), and age. Drag between columns on iPad and desktop. Tap to open lead detail.

**Lead detail.** Everything about the lead: contact, address with a small map, photos, notes, the timeline of events (who did what, when), the meetings, the quotes. Owner can edit anything and change to any status. `lost` asks for a reason (price, went with another company, not now, could not reach, other).

### Desktop and iPad (Keenan)

**Dashboard.** Owner only. Keep it small and honest in V1 because there is not much data yet:
- This week and this month: doors, conversations, leads, meetings booked, meetings held, show rate, quotes, sold, installed. Totals and per setter.
- Sold: count, total dollars, average ticket, total feet.
- Inventory: feet on hand (from settings and adjustments) minus feet sold but not installed = feet available to sell. A warning when it drops under a threshold.
- Lead sources this month.
- Every number shows its date range and what it counts. Empty states explain what will show up.

**Settings.** Pricing defaults, GST on or off, warranty text, presentation text, meeting slot template (days, start, slot length, count) and blocked times, inventory feet on hand, the confirmation text template, the lost reasons list.

**People.** Owner invites a setter by email, sets their role, deactivates them. No self sign-up.

## Customer confirmation text (default template)

Hi {first_name}, it's {setter_name} from Vesper Lighting. You're booked with Keenan on {day} at {time} at {address}. He'll walk you through the lights and give you a clear price for your house. If anything changes, text this number. Thanks!

Rules: plain language, no em dashes. Editable in settings. Sent from the setter's own phone through a prefilled Messages link in V1. Automated texting (Twilio) is V1.5 and needs the CASL consent checkbox on the lead first.

## Design

- Brand: navy `#132E3F`, gold `#B99257`, white, minimal black. Gold is for emphasis and primary actions only.
- Type: one clean sans for the app (Manrope or similar), large sizes on phone, generous spacing. The presentation can use the website's heading face for consistency.
- Light theme by default with a dark theme available. Setters knock at dusk and Keenan meets in the evening, so the dark theme matters.
- Premium and calm. No emoji, no gradients, no glass, no icon grids, no filler. Empty space is fine. Empty states are written, not decorated.
- Phone screens are one task per screen. iPad screens can show two panes.

## Out of scope for V1 (do not build)

- Payments, deposits, e-signature, invoices (waiting on the prepaid contracting licence, planned for January).
- Jobs, crews, job sheets, timesheets, driver authorization, certifications (V2).
- Customer-facing pages and public quote links (V2).
- Automated SMS and email (V1.5, after CASL consent is in the lead form).
- Maps of knocked houses, territory management, route optimization beyond the distance warning.
- Offline writes. V1 needs signal. Keep writes small and fast. Queueing offline writes is V1.5 if it turns out to be a problem.
- Integrations with accounting, calendars or the website beyond the lead form endpoint.
- Advanced reporting, filters, exports.

## V2 (November, after the first installs)

Jobs created from sold leads: install date, crew, materials (feet, boxes, track colour), job sheet the crew sees on their phone (address, runs, zones, box location, customer notes, no prices), before and after photos, completion checklist, warranty record. Crew profiles with role, pay rate, height authorization, driver authorization, test results. Timesheets with clock in and out per job. Crew schedule. Dashboard additions: installed revenue, feet installed, hours per job, cost per job.

## V3 (January onward)

Customer-facing: public quote link, booking page from the website, confirmation page, e-signature, deposits and payments once licensed, warranty claim form, referral tracking. Automated reminders. Inventory with purchase orders.
