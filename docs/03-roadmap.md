# Roadmap and acceptance criteria

One milestone per build session. A milestone is done only when every criterion passes and the owner has tried it on the real device. Keep the current milestone marked.

**Current milestone: M1**

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
- [ ] Admin creates a sales associate's login in People and gets a one-time temporary password to text them; on first sign-in the associate must choose their own password, then lands on the phone home
- [x] Role is enforced: a `sales` user hitting `/app/dashboard` or `/app/settings` gets a clear "not for your role" page, and the RLS test proves the data is not readable either
- [ ] Settings screen edits pricing, GST toggle, booking pay, commission rate, warranty text, slot template, lost reasons and company details
- [x] Deactivating a setter blocks login and hides them from pickers

## M2: Leads and knock sessions (phone)
New lead, my leads, lead detail, notes, status changes, photos, knock session counters.
- [ ] New lead on a phone in under 30 seconds: address autocomplete fills address, neighbourhood and lat/lng; photo from camera uploads and shows; save returns to my leads
- [ ] Phone numbers normalize to E.164 and show formatted
- [ ] My leads groups the setter's own leads by status, newest first, with a search box and an "everyone" switch that shows all leads read only
- [ ] Every status change and note writes a `lead_events` row visible in the lead timeline with who and when
- [ ] A setter can open another setter's lead read only; the RLS test proves an update is rejected
- [ ] Knock session: start with a neighbourhood, two counters that update instantly, end the session; leads created during a session link to it
- [ ] Works one-handed in daylight; tap targets at least 44 px

## M3: Scheduling and booking pay (phone)
Open slots from the template, time blocks, booking, distance warning, tonight view, outcomes, qualified bookings, the `earnings` table, booking pay, My pay (setter) and Pay (owner).
- [ ] Open slots for any day come from settings minus meetings minus time blocks, in Calgary time, DST safe
- [ ] Booking requires phone, geocoded address and the decision makers checkbox; otherwise the button is disabled with the reason shown
- [ ] Two setters booking the same slot at the same moment: exactly one succeeds, the other sees "that slot was just taken" and the refreshed list
- [ ] Distance warning appears when the address is more than the configured km from the previous or next meeting, with the distance shown, and booking can still proceed
- [ ] Booked slots show time, neighbourhood and setter to every sales user
- [ ] Tonight view lists the owner's meetings in order with address, phone, navigate link, photos and notes; outcomes update lead status (`held` sets `met`, `no_show` and `cancelled` set `follow_up` with a note, `rescheduled` links the new meeting)
- [ ] Owner can add and remove time blocks
- [ ] Owner marks a held meeting's booking qualified or not qualified (reason required); qualified creates one `booking` earning for the setter who booked it, at the current booking pay, never twice for the same meeting
- [ ] My pay (setter): owed now, pending install and paid totals with line items; the RLS test proves a setter cannot read another setter's earnings
- [ ] Pay (owner): earnings grouped by setter, select owed lines and mark them paid in one batch, stamping `paid_at` and `paid_by`
- [ ] Unit tests cover slot generation, DST, the distance check and booking pay creation

## M4: Pipeline board and lead detail (iPad and desktop)
- [ ] Board columns match the status enum, cards show name, address, neighbourhood, setter, feet and total when quoted, and age
- [ ] Drag between columns on iPad and desktop writes a status change event; `lost` prompts for a reason
- [ ] Lead detail shows contact, map pin, photos, timeline, meetings, quotes and earnings; owner can edit everything, including marking `installed` by hand
- [ ] Board stays usable with 200 leads (pagination or virtualization)

## M5: Meeting mode and quotes (iPad)
- [ ] Landscape iPad layout: presentation pages on the left, quote builder on the right, or swipe between them on narrower screens
- [ ] Presentation content and images come from settings, not from code
- [ ] Quote builder: runs, boxes, adders, discounts, financing flag; totals update live and match `lib/pricing.ts`; unit tests cover a plain house, a house with adders and discounts, GST on and off, rounding
- [ ] Save draft, mark presented, accepted or declined; each writes a lead event and moves the lead status to `quoted` or `sold`
- [ ] PDF export: breakdown, warranty text, "No payment until your install is complete," company contact, no em dashes anywhere; opens in a share sheet on iPad
- [ ] Accepting a quote creates one pending `commission` earning for the lead's setter at the current commission rate on the total before GST; marking the lead `installed` makes it payable; marking it `lost` voids it; unit tests cover the amount and rounding

## M6: Dashboard (owner, desktop and iPad)
- [ ] Funnel, week and month, totals and per setter: doors, conversations, leads, meetings booked, meetings held, show rate, quotes, sold, installed
- [ ] Sold: count, dollars, average ticket
- [ ] Setter pay: owed now and pending install, per setter, matching the Pay screen
- [ ] Lead sources this month
- [ ] Upcoming jobs: sold leads not yet installed, oldest first, with sold date and feet
- [ ] Every tile shows its date range and what it counts; empty states explain what will appear
- [ ] Loads in under two seconds with a month of data

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
