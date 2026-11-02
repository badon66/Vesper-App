# Vesper App

Internal sales and operations app for Vesper Lighting, Inc. (Calgary). Read this file and `docs/` before doing anything. The docs are the source of truth. If a request conflicts with them, say so and ask.

## What this app is

Vesper installs permanent exterior roofline lighting (24V RGBW nodes in an aluminum track under the soffit, app controlled, 10-year warranty). Sales are door to door. Appointment setters knock doors in the late afternoon and book evening meetings for the owner (Keenan), who meets the homeowner at dusk, presents on an iPad, prices the job, and closes. Installs are done by small crews. The app is the system of record for leads, meetings, quotes, and (later) jobs, crews and timesheets.

V1 is the sales side only. See `docs/01-product-spec.md` for scope, `docs/02-data-model.md` for the schema, `docs/03-roadmap.md` for milestones and acceptance criteria, `docs/04-session-prompts.md` for how each build session is run, and `docs/05-supabase-setup.md` for the Supabase settings that live outside the code and how to set up a second project.

## Stack

- Next.js (App Router, TypeScript), Tailwind CSS, shadcn/ui components
- Supabase: Postgres, Auth, Storage (photos), Row Level Security on every table
- Vercel hosting, installable PWA (manifest, icons, service worker for caching only, no offline writes in V1). Functions run in `pdx1` (Portland), next to the Supabase database in us-west-2, set by `regions` in `vercel.json`
- Google Places Autocomplete for addresses (lat/lng saved on every lead)
- `@react-pdf/renderer` for quote PDFs
- Zod for validation, Vitest for unit tests (pricing and scheduling logic), Playwright for a smoke test of the main flows
- Server Actions for writes, Supabase client for reads. No separate API layer unless a route is public (the website lead form).

## Roles and who sees what

Three roles in `profiles.role`: `owner`, `sales`, `crew`. V1 uses `owner` and `sales`. `crew` exists in the schema but has no screens yet. In the UI they are called Admin, Sales associate and Crew. There is exactly one owner, info@vesperlighting.ca, enforced in the database; the People screen can never assign the owner role. Logins and passwords are created by the owner, and only the owner. The app generates every non-owner password (three common words and four digits, like maple-river-stone-4821), shows it once, and the owner texts it; it is permanent until the owner resets it from People, which also ends that person's open sessions. There is no sign-up, no invite email, no email of any kind, and no self-service password change or reset for non-owners; the sign-in screen says to ask Keenan. The owner changes his own password from Settings.

- `owner`: everything. Home (which is the dashboard), schedule, Meetings (meeting mode's home), pipeline, all leads, all meetings, quotes, and Admin (people, settings, pay).
- `sales`: capture leads and edit their own. Sales users work as a team: every sales user can see every lead, booking and knock session (read only unless it is theirs) so they can cluster meetings and avoid knocking the same doors twice. They book meetings for their own leads and can move or cancel those bookings until the time starts, see their own activity stats, and see their own pay (what they are owed and what they have been paid). Never quotes, never sale prices or revenue, never the owner dashboard, never settings, never anyone else's pay.
- Customers never log in. Anything customer facing is a public link with an unguessable token (V2).

Enforce this in RLS first, then in the UI. The UI hides what a role cannot see, but the database is the actual gate. Never ship a table without RLS policies. Never bypass RLS with the service role key in a code path a non-owner can trigger.

View as: in Admin > People the owner can open the app exactly as an active non-owner member sees it. A gold bar across the top reads "Viewing as [name]. Read only. Exit." It is strictly read only: every control is disabled and the server refuses every write while it is on, so nothing is ever written as that person. It is checked on the server on every request: only the owner's own signed-in session can use it, and no session or password of the viewed person is ever used. It shows only what that person's role can see: no pricing, revenue, settings or anyone else's pay. Every new non-owner screen must support View as:
- render from `requireProfile()`, which returns the viewed person while View as is on;
- scope every query to what that role may see instead of relying on RLS alone, because View as reads with the owner's session;
- never write while rendering: a hold, like any write, only ever comes from a tap;
- be added to the View as comparison test, which checks the screen against what a real test setter sees.

## Device rules

Design each screen for the device it will actually be used on, then make it tolerable elsewhere.

- Phone first: lead capture, my leads, tonight's schedule and booking, knock session counters, my pay. Big tap targets, one-handed, works in bright daylight and at dusk. Fast.
- iPad first (landscape): meeting mode (presentation plus quote builder), the Meetings page, pipeline board, lead detail with photos.
- Desktop and iPad: dashboard, settings, people.
- Navigation: a bottom tab bar on phone and iPad; on screens 1024 px and wider, a slim left side rail with the same items. No top tabs anywhere. Owner tabs: Home, Schedule, Meetings, New lead (the prominent gold button), Leads; Admin (People, Settings and Pay) is a gear in the header, because six items crowd a phone's tab bar (Keenan, 2026-11-02). Sales tabs: Home, Schedule, New lead, Leads, My pay. The owner's Home is the dashboard; there is no separate Dashboard tab. The tab bar lives in the shared app layout so it never reloads, tab links are prefetched, and every tab has a loading screen so a tap responds at once.
- Forms: after an error, a form keeps everything the person typed except passwords.
- Theme: dark by default, with a light theme the user can switch to, remembered per device. Anything printed or exported as a PDF is always white. Keep both themes readable. Brand colours: navy `#132E3F`, gold `#B99257`, white, minimal black. Clean and premium, not flashy. No emoji in the UI. No gradients or glassy effects.
- Design skill: the impeccable skill lives in `.claude/skills/impeccable` (Apache 2.0, no hooks), with its product and design context in `PRODUCT.md` and `DESIGN.md`. Every milestone with new or changed screens uses it (Keenan, 2026-11-02): shape before building, critique and polish before the preview, and the before and after scores in the report. These design rules win over anything it suggests: navy and gold, dark by default, no gradients, glassy effects or emoji, calm and premium, phone first for setters. Skip its overdrive, delight and heavy animation.

## Business rules the code must respect

- Pricing defaults live in `settings`, never hardcoded: price per foot (list $23), control box price ($500), neighbour discount ($150), referral credit ($150), GST rate (5%), GST number, `gst_enabled` (false until the company is registered; while it is off, prices show with no mention of GST at all). On a quote the owner can change every price for that quote only, including custom lines; each quote stores the prices it actually used, so later changes to settings never alter an existing quote.
- GST display: on screen (meeting mode, quote builder, any price) a total reads like "$3,450 + GST" with no GST dollar figure. Formal documents (the quote PDF the customer signs, later invoices) show subtotal, GST as a dollar amount, total, and the GST number from settings. When `gst_enabled` is off, show the price only and never mention GST.
- Quote total = (total feet x price per foot) + (boxes x box price) + adders - discounts, then GST if enabled. Show the breakdown line by line. Round to the cent. Unit tests cover this.
- Setter pay: two kinds of earnings, both with rates in `settings`. Booking pay is a flat amount (default $20) per qualified booking. After each meeting slot the owner marks the booking Qualified, Not qualified (reason from the list in settings), No-show or Cancelled (optional note); only Qualified earns. One booking fee per lead at most; a no-show or cancelled lead can be rebooked and earns when that later meeting is marked Qualified. The fee goes to the setter whose lead it is: the lead's assigned setter, recorded on the meeting when it is booked, whoever picked the time. The owner can correct an outcome until the fee is paid, and the fee is voided or restored to match. Commission is a percentage (default 5%) of the accepted quote total as actually priced, before GST, and earlier no-shows do not affect it; it is created when the quote is accepted and becomes payable when the lead is marked `installed`, because no customer pays before install. Each earning stores the rate it was calculated at, so a rate change applies to new earnings only. The owner marks earnings paid in batches. Only `sales` users earn: both kinds go to the lead's assigned setter, and leads assigned to the owner earn nothing. The app records pay, it never moves money.
- Dollar amounts live only in `quotes` (sales cannot read them) and `earnings` (sales read only their own). Never copy a price or a total into lead notes, `lead_events.payload` or meeting outcome notes, because sales users can read those.
- No deposits or payments are taken in the app in V1. Quotes state "No payment until your install is complete." Do not build payment capture.
- Meetings: default slots 6:00, 6:45, 7:30 and 8:15 pm, Monday to Saturday, 45 minutes each, the drive included. Configurable in settings; whatever Settings says is Keenan's choice, so never flag it. From Schedule, Keenan can give one evening its own start, meeting length and number of meetings ("Just this day"), or change them for all days (which updates Settings). Open times, holds and booking read the evening's own schedule when it has one, otherwise the defaults. A day change never moves or cancels a booking: one that no longer lines up stays at its time, and no time that overlaps it can be booked. Each meeting records its host in its own column (Keenan for now), not tied to the owner role. Bookings open 14 days ahead. Setters can hold, book or move into a time until 30 minutes before it starts (in settings); the owner until it starts. Setters can move or cancel their own upcoming bookings until the time starts, and the owner any booking; cancelling sends the lead to Follow up for the next day. After the time starts, outcomes are owner only. Warn (do not block) when the booked address is more than 10 km in a straight line from the meeting before or after it.
- No double booking is a hard rule (Keenan, 2026-11-01). Two people can never take the same time, and a time is claimed the moment someone starts booking it:
  - tapping an open time places a hold; everyone else sees the holder's initials on it within a few seconds and cannot pick it;
  - the hold ends when the holder books, backs out or picks another time, and lets go after the grace period in settings (2 minutes) if their screen stops checking in;
  - one hold per person; booking takes the caller's own hold or a free time, never a time someone else holds;
  - all of it is enforced in the database, under the same lock as booking.

  Any change touching slots, holds or bookings must keep these tests passing: the database race tests (two people grabbing or booking the same time at the same instant, repeated many times per run, on the default times and on an evening with its own schedule; grabbing or booking a held time; a lapsing hold; one hold per person), the slot checks, and the live walk-through with two setters racing for the same time through the booking sheet.
- The booking sheet is the only way to book (Keenan, 2026-11-02). Tapping an open time holds it and opens a full-screen sheet over the schedule, with three steps (At the door, After the door, Book), a progress bar at the top, a "?" with that step's note, and a bottom bar that is always there: Back and Next (primary, bottom right, in thumb reach), with smaller "Pick another time" and "Let go". One step per screen, one-tap answers, no scrolling on a phone where it can be avoided, and nothing important at the top centre. The time stays held through every step. New lead's "Save and book", the lead page's "Book a meeting" and Move open the same sheet, prefilled.
- Before you book (M3): a lead can be booked only when all of these hold:
  - a phone number is saved;
  - Owns the home is Yes;
  - Wants a price is Yes;
  - Soffit colour is answered (Not sure is fine);
  - the Front, Left corner and Right corner photos exist, or the setter picks a skip reason (Homeowner said no, or Other with a note), which the owner sees on Schedule;
  - the setter confirms everyone who decides on the house will be at the meeting, stored on the booking;
  - the lead has a map position: an address picked from the suggestions, or, for a brand-new street Google doesn't have yet, the phone's GPS position taken at the door ("Use where I'm standing"), accurate to 50 m or better (Keenan, 2026-11-01).

  The owner's own leads follow the same rules.
- The door process: a setter's visit is a short conversation with a structure: open, find out, photos, book. The app follows it with the booking sheet's steps, a short note per step that Keenan edits in Settings (they replaced the single Door guide), seven Find out questions and four guided photos. Nothing in it is required to save a lead, so a quick follow-up lead stays quick; only booking requires some of it.
- Lead statuses: `new`, `follow_up`, `meeting_booked`, `met`, `quoted`, `sold`, `installed`, `lost`. Every status change writes a `lead_events` row with who and when. `lost` requires a reason. `follow_up` requires a follow-up date, the day to come back, and leaving `follow_up` clears it; both are enforced in the database. Setters change status only between `new`, `follow_up` and `lost`; booking a meeting sets `meeting_booked`, and the owner sets everything after it. In V1 the owner sets `installed` by hand after the crew is done; jobs arrive in V2.
- Track colour: white is the only stock track colour.
  - Keenan manages the Track colours list in Settings: a name and an optional RAL code each. Colours can be added, renamed, reordered and retired, never deleted, so old leads keep theirs. It starts with White, Off-white, Brown, Black and Grey.
  - Only the owner sets a lead's track colour, enforced in the database: one of the active colours, or Custom with a RAL Classic code (the system in Keenan's RAL K7 colour book), checked against the RAL Classic list and shown by name.
  - No on-screen colour swatches anywhere, since screen colours aren't accurate.
  - Setters can see the track colour but not set it. Their soffit question at the door stays as it is.
  - A quote can't be marked ready until the track colour is set (M5). The quote stores the colour name and RAL code it used, and a Custom colour shows as needing powder coating.
- Meeting mode (M5) is customer-facing the whole time: full screen on the iPad, no tabs, and nothing internal ever on screen: no costs, margins, setter names, pipeline or other customers. Owner only, enforced on the server. The track colour is confirmed and initialled by the customer at every meeting, stored on the lead with a timeline event. Presentation content and images come from Settings, never from code; a page with no content is skipped, never shown empty; only Vesper's own photos appear in anything a customer sees. Opened once with signal, meeting mode keeps working without it: content and images cached on the iPad, quote math on the iPad, the draft on the iPad until saved; saving needs signal and says so. Track colour pricing: stocked included; non-stock included on the factory order (spring); this season adds the rush colour fee per foot from Settings. A fee that is not set (rush colour, service call) hides its line instead of showing a blank. Every quote has a valid-until date, default `settings.quote_valid_days` days out.
- Every customer facing string (quote PDF, presentation) is written in plain language with no em dashes, no buzzwords, and no promises the business cannot keep. Use the exact warranty wording from `settings.warranty_text`.

## How to work in this repo

1. Start every session by reading this file, the current milestone in `docs/03-roadmap.md`, and the relevant parts of the spec and data model.
2. Plan before building. Post a short plan (files, schema changes, risks) and wait for approval on anything that touches the schema, RLS, auth, or pricing.
3. Small, complete slices. A milestone is done when every acceptance criterion in the roadmap passes, the app builds with no TypeScript errors, `npm run lint` and `npm test` pass, and the flow works on a phone-sized viewport.
4. Every database change goes in a migration file in `supabase/migrations/`, with a short comment on what and why:
    - this covers tables, policies, functions, triggers, views, grants, seed rows and storage buckets alike;
    - never make a database change by hand in the Supabase dashboard or with ad hoc SQL;
    - never edit a migration that has already been applied; add a new one;
    - prefer additive changes: add columns, enum values and tables rather than replacing or removing them. An unused enum value is fine;
    - never put destructive SQL text (drop, delete, truncate) in a Supabase connector call, not even quoted inside a read-only query: the connector waits for a human to confirm and times out. If a migration truly has to drop or delete something, stop before applying it and tell Keenan, so he can be at the screen to approve it;
    - name each file `<version>_<name>.sql` with the version the database recorded for it. The Supabase connector picks the version when it applies a file, so rename the file to match `supabase_migrations.schema_migrations`. A fresh, empty Supabase project then reaches the same schema by running the files in order;
    - regenerate types after schema changes.

    Settings that can only live in the dashboard are listed in `docs/05-supabase-setup.md`; update that list whenever one of them changes.
5. Commit in small logical commits with plain messages. One branch per milestone, merged when done.
6. Never commit secrets. All keys go in `.env.local` and Vercel environment variables. `.env.example` lists every variable with a comment. Nothing in the app, the tests or the scripts hard-codes a Supabase project's URL, ref or keys; they come from environment variables, so pointing anything at another project is a configuration change. Never put a secret key in a `NEXT_PUBLIC_` variable (Keenan, 2026-11-02):
    - anything in a `NEXT_PUBLIC_` variable is copied into the JavaScript every visitor downloads;
    - the publishable key (`sb_publishable_...`, or the legacy anon key) is the only Supabase key that goes in one;
    - the secret key (`sb_secret_...`, or the legacy service_role key) goes only in `SUPABASE_SERVICE_ROLE_KEY`;
    - the build refuses to run if any `NEXT_PUBLIC_` value is a Supabase secret key (`lib/public-env-guard.ts`, run from `next.config.ts`). Keep that check, and never work around it.
7. When something in the docs is unclear or wrong, stop and ask instead of guessing. When you make a judgment call, write it down in `docs/decisions.md` with the date.
8. Keep the dashboard honest: every number shows what it counts and the date range. No invented or placeholder numbers in production views. Empty states say what will appear and how to make it appear.
9. Do not add features that are not in the current milestone. Put ideas in `docs/backlog.md`.
10. Test on the real thing: the live walk-through drives the app in a phone-sized browser against the real database. No second Supabase project for now, and don't recommend one (Keenan): tests create test-prefixed accounts and data on production and clean up after themselves. The app stays ready to add a second project whenever Keenan asks: migrations only (rule 4), no hard-coded project details (rule 6), and the setup steps in `docs/05-supabase-setup.md`. The View as test signs in as the owner through a one-time server-side session (approved by Keenan on 2026-10-28). It follows these rules:
    - no password is used or changed, and no email is sent;
    - it only views; it never creates, changes or deletes anything, members included, since only the owner adds members;
    - forms it submits are refused before anything saves;
    - it ends that session afterwards.

    Anything the walk-through cannot reach is named in the report.
11. After building, run the full automated suite: unit, RLS, smoke, build, and the live walk-through with test-prefixed accounts, deleted after, plus the owner's one-time session for View as. Keenan does not run checklists or review preview links.
12. If anything fails, do not merge. Stop and report what failed.
13. If everything is green, push the branch and report; never merge on green alone (Keenan, 2026-11-02, replacing merge on green). The report's first line is a clickable Vercel preview link for the branch, which Keenan opens on his iPad (previews have no login wall), followed by a short list of what changed, where to see it, and anything he needs to upload or set first. Keenan looks and gives feedback; only when he says "push the changes" is the branch merged into main, with production verified after the deploy and the production link reported. No test checklists for Keenan, ever.

## Definition of done for V1

An appointment setter can install the app on their phone, log in, capture a lead at a door in under 30 seconds with a photo and a geocoded address, book that lead into one of tonight's open slots without double booking, and see what they are owed. The owner can see tonight's meetings on his phone, mark bookings qualified, run a meeting on his iPad with the presentation and a quote that prints to a clean PDF, move leads through the pipeline, mark setters paid, and see a dashboard that answers: how many doors, conversations, meetings, quotes and sales this week, by person, what each setter is owed, and which sold jobs are waiting to be installed.
