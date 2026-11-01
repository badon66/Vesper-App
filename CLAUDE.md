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

- `owner`: everything. Home (which is the dashboard), schedule, pipeline, all leads, all meetings, quotes, and Admin (people, settings, pay).
- `sales`: capture leads and edit their own. Sales users work as a team: every sales user can see every lead, booking and knock session (read only unless it is theirs) so they can cluster meetings and avoid knocking the same doors twice. They book meetings for their own leads, see their own activity stats, and see their own pay (what they are owed and what they have been paid). Never quotes, never sale prices or revenue, never the owner dashboard, never settings, never anyone else's pay.
- Customers never log in. Anything customer facing is a public link with an unguessable token (V2).

Enforce this in RLS first, then in the UI. The UI hides what a role cannot see, but the database is the actual gate. Never ship a table without RLS policies. Never bypass RLS with the service role key in a code path a non-owner can trigger.

View as: in Admin > People the owner can open the app exactly as an active non-owner member sees it. A gold bar across the top reads "Viewing as [name]. Read only. Exit." It is strictly read only: every control is disabled and the server refuses every write while it is on, so nothing is ever written as that person. It is checked on the server on every request: only the owner's own signed-in session can use it, and no session or password of the viewed person is ever used. It shows only what that person's role can see: no pricing, revenue, settings or anyone else's pay. Every new non-owner screen must support View as:
- render from `requireProfile()`, which returns the viewed person while View as is on;
- scope every query to what that role may see instead of relying on RLS alone, because View as reads with the owner's session;
- never write while rendering;
- be added to the View as comparison test, which checks the screen against what a real test setter sees.

## Device rules

Design each screen for the device it will actually be used on, then make it tolerable elsewhere.

- Phone first: lead capture, my leads, tonight's schedule and booking, knock session counters, my pay. Big tap targets, one-handed, works in bright daylight and at dusk. Fast.
- iPad first (landscape): meeting mode (presentation plus quote builder), pipeline board, lead detail with photos.
- Desktop and iPad: dashboard, settings, people.
- Navigation: a bottom tab bar on phone and iPad; on screens 1024 px and wider, a slim left side rail with the same items. No top tabs anywhere. Owner tabs: Home, Schedule (from M3), New lead (the prominent centre button), Leads, Admin (People, Settings, and Pay from M3). Sales tabs: Home, Schedule (from M3), New lead, Leads, My pay (from M3). The owner's Home is the dashboard; there is no separate Dashboard tab. The tab bar lives in the shared app layout so it never reloads, tab links are prefetched, and every tab has a loading screen so a tap responds at once.
- Forms: after an error, a form keeps everything the person typed except passwords.
- Theme: dark by default, with a light theme the user can switch to, remembered per device. Anything printed or exported as a PDF is always white. Keep both themes readable. Brand colours: navy `#132E3F`, gold `#B99257`, white, minimal black. Clean and premium, not flashy. No emoji in the UI. No gradients or glassy effects.

## Business rules the code must respect

- Pricing defaults live in `settings`, never hardcoded: price per foot (list $23), control box price ($500), neighbour discount ($150), referral credit ($150), GST rate (5%), GST number, `gst_enabled` (false until the company is registered; while it is off, prices show with no mention of GST at all). On a quote the owner can change every price for that quote only, including custom lines; each quote stores the prices it actually used, so later changes to settings never alter an existing quote.
- GST display: on screen (meeting mode, quote builder, any price) a total reads like "$3,450 + GST" with no GST dollar figure. Formal documents (the quote PDF the customer signs, later invoices) show subtotal, GST as a dollar amount, total, and the GST number from settings. When `gst_enabled` is off, show the price only and never mention GST.
- Quote total = (total feet x price per foot) + (boxes x box price) + adders - discounts, then GST if enabled. Show the breakdown line by line. Round to the cent. Unit tests cover this.
- Setter pay: two kinds of earnings, both with rates in `settings`. Booking pay is a flat amount (default $20) per qualified booking. After each meeting slot the owner marks the booking Qualified, Not qualified (reason from the list in settings), No-show or Cancelled (optional note); only Qualified earns. One booking fee per lead at most; a no-show or cancelled lead can be rebooked and earns when that later meeting is marked Qualified. Commission is a percentage (default 5%) of the accepted quote total as actually priced, before GST, and earlier no-shows do not affect it; it is created when the quote is accepted and becomes payable when the lead is marked `installed`, because no customer pays before install. Each earning stores the rate it was calculated at, so a rate change applies to new earnings only. The owner marks earnings paid in batches. Only `sales` users earn; the owner's own leads create no earnings. The app records pay, it never moves money.
- Dollar amounts live only in `quotes` (sales cannot read them) and `earnings` (sales read only their own). Never copy a price or a total into lead notes, `lead_events.payload` or meeting outcome notes, because sales users can read those.
- No deposits or payments are taken in the app in V1. Quotes state "No payment until your install is complete." Do not build payment capture.
- Meetings: default slots 6:00, 6:45, 7:30 and 8:15 pm, Monday to Saturday, 45 minutes each, owner only. Configurable in settings. A slot can hold one meeting (database unique constraint). Warn (do not block) when the booked address is more than 10 km from the meeting before or after it.
- Before you book (M3): a lead can be booked only when all of these hold:
  - a phone number is saved;
  - Owns the home is Yes;
  - Wants a price is Yes;
  - Soffit colour is answered (Not sure is fine);
  - the Front, Left corner and Right corner photos exist, or the setter picks a skip reason (Homeowner said no, or Other with a note), which the owner sees on Schedule;
  - the setter confirms everyone who decides on the house will be at the meeting, stored on the booking;
  - the lead has a map position: an address picked from the suggestions, or, for a brand-new street Google doesn't have yet, the fallback in the M3 plan (Keenan, 2026-11-01).
- The door process: a setter's visit is a short conversation with a structure: open, find out, photos, book. The app follows it with the Door guide, six Find out questions and four guided photos. Nothing in it is required to save a lead, so a quick follow-up lead stays quick; only booking requires some of it.
- Lead statuses: `new`, `follow_up`, `meeting_booked`, `met`, `quoted`, `sold`, `installed`, `lost`. Every status change writes a `lead_events` row with who and when. `lost` requires a reason. `follow_up` requires a follow-up date, the day to come back, and leaving `follow_up` clears it; both are enforced in the database. Setters change status only between `new`, `follow_up` and `lost`; booking a meeting sets `meeting_booked`, and the owner sets everything after it. In V1 the owner sets `installed` by hand after the crew is done; jobs arrive in V2.
- Track colour: white is the only stock track colour.
  - Keenan manages the Track colours list in Settings: a name and an optional RAL code each. Colours can be added, renamed, reordered and retired, never deleted, so old leads keep theirs. It starts with White, Off-white, Brown, Black and Grey.
  - Only the owner sets a lead's track colour, enforced in the database: one of the active colours, or Custom with a RAL Classic code (the system in Keenan's RAL K7 colour book), checked against the RAL Classic list and shown by name.
  - No on-screen colour swatches anywhere, since screen colours aren't accurate.
  - Setters can see the track colour but not set it. Their soffit question at the door stays as it is.
  - A quote can't be marked ready until the track colour is set (M5). The quote stores the colour name and RAL code it used, and a Custom colour shows as needing powder coating.
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
6. Never commit secrets. All keys go in `.env.local` and Vercel environment variables. `.env.example` lists every variable with a comment. Nothing in the app, the tests or the scripts hard-codes a Supabase project's URL, ref or keys; they come from environment variables, so pointing anything at another project is a configuration change.
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
13. If everything is green, merge the branch into main, push, wait for production to redeploy, and verify it. The report's first line is the production link, followed by a short list of what changed and where to see it.

## Definition of done for V1

An appointment setter can install the app on their phone, log in, capture a lead at a door in under 30 seconds with a photo and a geocoded address, book that lead into one of tonight's open slots without double booking, and see what they are owed. The owner can see tonight's meetings on his phone, mark bookings qualified, run a meeting on his iPad with the presentation and a quote that prints to a clean PDF, move leads through the pipeline, mark setters paid, and see a dashboard that answers: how many doors, conversations, meetings, quotes and sales this week, by person, what each setter is owed, and which sold jobs are waiting to be installed.
