# Vesper App

Internal sales and operations app for Vesper Lighting, Inc. (Calgary). Read this file and `docs/` before doing anything. The docs are the source of truth. If a request conflicts with them, say so and ask.

## What this app is

Vesper installs permanent exterior roofline lighting (24V RGBW nodes in an aluminum track under the soffit, app controlled, 10-year warranty). Sales are door to door. Appointment setters knock doors in the late afternoon and book evening meetings for the owner (Keenan), who meets the homeowner at dusk, presents on an iPad, prices the job, and closes. Installs are done by small crews. The app is the system of record for leads, meetings, quotes, and (later) jobs, crews and timesheets.

V1 is the sales side only. See `docs/01-product-spec.md` for scope, `docs/02-data-model.md` for the schema, `docs/03-roadmap.md` for milestones and acceptance criteria, `docs/04-session-prompts.md` for how each build session is run.

## Stack

- Next.js (App Router, TypeScript), Tailwind CSS, shadcn/ui components
- Supabase: Postgres, Auth, Storage (photos), Row Level Security on every table
- Vercel hosting, installable PWA (manifest, icons, service worker for caching only, no offline writes in V1)
- Google Places Autocomplete for addresses (lat/lng saved on every lead)
- `@react-pdf/renderer` for quote PDFs
- Zod for validation, Vitest for unit tests (pricing and scheduling logic), Playwright for a smoke test of the main flows
- Server Actions for writes, Supabase client for reads. No separate API layer unless a route is public (the website lead form).

## Roles and who sees what

Three roles in `profiles.role`: `owner`, `sales`, `crew`. V1 uses `owner` and `sales`. `crew` exists in the schema but has no screens yet.

- `owner`: everything. Dashboard, pipeline, all leads, all meetings, quotes, settings, people.
- `sales`: capture leads, see and edit their own leads, see the meeting calendar (open slots, and for booked slots only the time and the neighbourhood, never the customer's details unless it is their own lead), book meetings for their own leads, see their own activity stats. Never revenue, never other people's leads, never quotes, never the dashboard.
- Customers never log in. Anything customer facing is a public link with an unguessable token (V2).

Enforce this in RLS first, then in the UI. The UI hides what a role cannot see, but the database is the actual gate. Never ship a table without RLS policies. Never bypass RLS with the service role key in a code path a non-owner can trigger.

## Device rules

Design each screen for the device it will actually be used on, then make it tolerable elsewhere.

- Phone first: lead capture, my leads, tonight's schedule and booking, knock session counters. Big tap targets, one-handed, works in bright daylight and at dusk. Fast.
- iPad first (landscape): meeting mode (presentation plus quote builder), pipeline board, lead detail with photos.
- Desktop and iPad: dashboard, settings, people.
- Theme: light by default, with a dark theme the user can switch to. Keep both themes readable. Brand colours: navy `#132E3F`, gold `#B99257`, white, minimal black. Clean and premium, not flashy. No emoji in the UI. No gradients or glassy effects.

## Business rules the code must respect

- Pricing defaults live in `settings`, never hardcoded: price per foot (list $23), control box price ($500), neighbour discount ($150), referral credit ($150), GST rate (5%), `gst_enabled` (false until the company is registered; quotes show "GST not applicable" until then).
- Quote total = (total feet x price per foot) + (boxes x box price) + adders - discounts, then GST if enabled. Show the breakdown line by line. Round to the cent. Unit tests cover this.
- No deposits or payments are taken in the app in V1. Quotes state "No payment until your install is complete." Do not build payment capture.
- Meetings: default slots 6:00, 6:45, 7:30 and 8:15 pm, Monday to Saturday, 45 minutes each, owner only. Configurable in settings. A slot can hold one meeting (database unique constraint). Booking requires a lead with a phone number, a geocoded address, and the "both decision makers will be there" checkbox. Warn (do not block) when the booked address is more than 10 km from the meeting before or after it.
- Lead statuses: `new`, `follow_up`, `meeting_booked`, `met`, `quoted`, `sold`, `installed`, `lost`. Every status change writes a `lead_events` row with who and when. `lost` requires a reason.
- Every customer facing string (quote PDF, confirmation texts, presentation) is written in plain language with no em dashes, no buzzwords, and no promises the business cannot keep. Use the exact warranty wording from `settings.warranty_text`.

## How to work in this repo

1. Start every session by reading this file, the current milestone in `docs/03-roadmap.md`, and the relevant parts of the spec and data model.
2. Plan before building. Post a short plan (files, schema changes, risks) and wait for approval on anything that touches the schema, RLS, auth, or pricing.
3. Small, complete slices. A milestone is done when every acceptance criterion in the roadmap passes, the app builds with no TypeScript errors, `npm run lint` and `npm test` pass, and the flow works on a phone-sized viewport.
4. Schema changes go in `supabase/migrations/` as SQL files with a short comment on what and why. Never edit a migration that has already been applied; add a new one. Regenerate types after schema changes.
5. Commit in small logical commits with plain messages. One branch per milestone, merged when done.
6. Never commit secrets. All keys go in `.env.local` and Vercel environment variables. `.env.example` lists every variable with a comment.
7. When something in the docs is unclear or wrong, stop and ask instead of guessing. When you make a judgment call, write it down in `docs/decisions.md` with the date.
8. Keep the dashboard honest: every number shows what it counts and the date range. No invented or placeholder numbers in production views. Empty states say what will appear and how to make it appear.
9. Do not add features that are not in the current milestone. Put ideas in `docs/backlog.md`.
10. Test on the real thing: after a milestone, give the owner a checklist of what to try on his phone and iPad.

## Definition of done for V1

An appointment setter can install the app on their phone, log in, capture a lead at a door in under 30 seconds with a photo and a geocoded address, book that lead into one of tonight's open slots without double booking, and text the customer a confirmation. The owner can see tonight's meetings on his phone, run a meeting on his iPad with the presentation and a quote that prints to a clean PDF, move leads through the pipeline, and see a dashboard that answers: how many doors, conversations, meetings, quotes and sales this week, by person, and how many feet are sold versus on hand.
