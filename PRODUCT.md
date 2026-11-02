# Product

<!-- impeccable:product-schema 1 -->

Written by the impeccable skill's init step on 2026-11-02 from CLAUDE.md and docs/ (the product spec, data model, roadmap and decisions), as Keenan asked, instead of an interview. Those files stay the source of truth; where this file and CLAUDE.md differ, CLAUDE.md wins.

## Platform

web

## Users

- **Appointment setters** (Sales associates in the app). They knock doors in Calgary neighbourhoods from about 4:00 to 6:00 pm, phone in one hand, in bright daylight and at dusk, often with the homeowner standing in the doorway. Their job: find out whether this is a solid lead, hold an evening meeting time the homeowner agrees to, finish the details during the conversation and right after leaving the door, and later see what they are owed. They work as a team: every setter can see every lead, booking and knock session, so they cluster meetings and don't knock the same door twice.
- **Keenan, the owner** (Admin in the app). He knocks too, then runs every evening meeting from about 6:00 to 9:00 pm on an iPad: presents, prices the house and closes. Later that night he marks outcomes, and on desktop or iPad he manages people, settings and setter pay. There is exactly one owner.
- **Homeowners** never log in. At the door they look at the setter's phone or iPad to pick a meeting time with them. Anything customer facing later is a public link with an unguessable token (V2).
- **Crews** exist in the schema but have no screens until V2.

## Product Purpose

Vesper Lighting, Inc. (Calgary) sells and installs permanent exterior roofline lighting: 24V RGBW nodes in an aluminum track under the soffit, app controlled, with a 10-year warranty. Sales are door to door. This app is the system of record for leads, meetings, quotes, and later jobs, crews and timesheets.

V1 is the sales side. It is done when a setter can install the app on their phone, log in, capture a lead at a door in under 30 seconds with a photo and a geocoded address, book that lead into one of tonight's open times without double booking, and see what they are owed; and Keenan can see tonight's meetings on his phone, mark bookings qualified, run a meeting on his iPad with the presentation and a quote that prints to a clean PDF, move leads through the pipeline, mark setters paid, and see a dashboard that answers the week's questions honestly.

## Positioning

It is built around Vesper's own sales day, not a generic list of contacts: the evening schedule is the centre. A time is claimed the moment someone starts booking it, so two people can never take the same time; every booked meeting is a solid lead (phone, owner of the home, wants a price, everyone who decides will be there, photos, a map position); and the booking flow follows the conversation at the door, step by step.

## Operating Context

- **The day.** 4:00 to 6:00 pm: knocking in one or two neighbourhoods. 6:00 to 9:00 pm: Keenan drives to the booked meetings, ideally clustered, and presents on the iPad. Later that night or next morning: outcomes, follow-ups, pay.
- **The door process.** Open, find out, photos, book. The booking sheet follows it in three steps: At the door, After the door (on the sidewalk) and Book, with a short note per step that Keenan writes.
- **Devices.** Phone first for lead capture, my leads, tonight's schedule and booking, knock session counters and my pay. iPad first, in landscape, for meeting mode, the pipeline board and lead detail with photos. Desktop and iPad for the dashboard, settings and people. The app is an installable PWA.
- **Conditions.** Weak signal, phones that lock, the camera that sometimes reloads the app, bright sun and dusk. Times are always Calgary time (Alberta Time, UTC-6 since 2026-11-01).
- **Paper.** Customers sign on paper for now. Anything printed or exported as a PDF is always white.

## Capabilities and Constraints

- Roles: `owner` and `sales` in V1 (`crew` later). Setters never see quotes, sale prices, revenue, the owner dashboard, settings or anyone else's pay. Row Level Security is the real gate; the UI only hides what a role cannot see.
- View as lets the owner open the app exactly as a non-owner sees it, strictly read only, under a gold bar.
- No sign-up and no email of any kind. The owner creates every login; the app generates every non-owner password.
- Booking rules: holds and no double booking, the booking cutoff and window, Before you book, move and cancel, outcomes and booking pay are fixed by the spec and enforced in the database.
- Pricing defaults live in settings; GST shows only when it is turned on. No payments are taken in the app.
- Track colours are names and RAL codes only; there are no on-screen colour swatches anywhere, because screen colours aren't accurate.
- Forms keep everything typed after an error, except passwords.
- Terminology on screen: Admin, Sales associate, Crew; New, Follow up, Meeting booked, Met, Quoted, Sold, Installed, Lost.

## Brand Commitments

- Navy `#132E3F`, gold `#B99257`, white, minimal black. Gold is for emphasis and primary actions only.
- Clean and premium, calm, not flashy. Dark theme by default, with a light theme each device remembers.
- No emoji, no gradients, no glassy effects, no icon grids, no filler. Empty space is fine; empty states are written, not decorated.
- One clean sans for the app (Manrope), large sizes on the phone.
- Customer-facing words are plain language with no em dashes, no buzzwords and no promises the business can't keep, and use the exact warranty wording from settings.

## Evidence on Hand

- The brand colours and the company details in settings.
- Presentation text in settings. The warranty text is not set yet and must not be invented.
- No real customer leads, testimonials, install photos, prices of past jobs or case studies exist in the app yet. None may be fabricated.

## Product Principles

1. The database is the gate. Rules about who may see or book what live in the database first and the screens follow.
2. Fit the moment and the device: one-handed on a phone at a door at dusk; an iPad at a kitchen table; a desk for admin.
3. Quick at the door. Nothing is required to save a lead; booking asks only for what makes a meeting worth Keenan's drive.
4. Honest numbers. Every number says what it counts and the date range, and nothing is invented.
5. Calm and premium. Restraint over decoration.

## Accessibility & Inclusion

- Tap targets of at least 44 px, one-handed reach on a phone, and the next step's button at the bottom right.
- Readable in bright daylight and at dusk, in both themes.
- Never rely on colour alone, track colours included: they are shown by name.
