# Roadmap and acceptance criteria

One milestone per build session. A milestone is done only when every criterion passes and the owner has tried it on the real device. Keep the current milestone marked.

**Current milestone: M0**

## M0: Foundation
Repo, Next.js App Router with TypeScript, Tailwind, shadcn/ui, Supabase client and server helpers, environment setup, PWA manifest and icons, base layout with the brand, light and dark themes, a protected `/app` route group, Vercel preview deploy.
- [ ] `npm run dev`, `npm run build`, `npm run lint`, `npm test` all pass on a clean clone
- [ ] `.env.example` lists every variable with a comment
- [ ] The app installs to an iPhone home screen with the Vesper icon and opens full screen
- [ ] Light and dark themes both readable; brand colours applied through CSS variables
- [ ] Unauthenticated users are redirected to `/login`
- [ ] Deployed to a Vercel preview URL

## M1: Auth, roles, settings, people
Supabase Auth (email plus password, invite only), `profiles` with the trigger, `settings` seeded with the defaults from the data model, People screen for the owner.
- [ ] Owner can invite a setter by email; the setter sets a password and lands on the phone home
- [ ] Role is enforced: a `sales` user hitting `/app/dashboard` or `/app/settings` gets a clear "not for your role" page, and the RLS test proves the data is not readable either
- [ ] Settings screen edits pricing, GST toggle, warranty text, confirmation text, slot template, inventory on hand
- [ ] Deactivating a setter blocks login and hides them from pickers

## M2: Leads and knock sessions (phone)
New lead, my leads, lead detail, notes, status changes, photos, knock session counters.
- [ ] New lead on a phone in under 30 seconds: address autocomplete fills address, neighbourhood and lat/lng; photo from camera uploads and shows; save returns to my leads
- [ ] Phone numbers normalize to E.164 and show formatted
- [ ] My leads groups by status, newest first, with a search box
- [ ] Every status change and note writes a `lead_events` row visible in the lead timeline with who and when
- [ ] A setter cannot see or open another setter's lead (RLS test)
- [ ] Knock session: start with a neighbourhood, two counters that update instantly, end the session; leads created during a session link to it
- [ ] Works one-handed in daylight; tap targets at least 44 px

## M3: Scheduling (phone)
Open slots from the template, time blocks, booking, distance warning, tonight view, outcomes, confirmation text.
- [ ] Open slots for any day come from settings minus meetings minus time blocks, in Calgary time, DST safe
- [ ] Booking requires phone, geocoded address and the decision makers checkbox; otherwise the button is disabled with the reason shown
- [ ] Two setters booking the same slot at the same moment: exactly one succeeds, the other sees "that slot was just taken" and the refreshed list
- [ ] Distance warning appears when the address is more than the configured km from the previous or next meeting, with the distance shown, and booking can still proceed
- [ ] Booked slots show time and neighbourhood only to setters who do not own the lead
- [ ] "Text the customer" opens Messages with the filled template; marking it sent stamps `confirmation_sent_at`
- [ ] Tonight view lists the owner's meetings in order with address, phone, navigate link, photos and notes; outcomes update lead status (`held` sets `met`, `no_show` and `cancelled` set `follow_up` with a note, `rescheduled` links the new meeting)
- [ ] Owner can add and remove time blocks
- [ ] Unit tests cover slot generation, DST, and the distance check

## M4: Pipeline board and lead detail (iPad and desktop)
- [ ] Board columns match the status enum, cards show name, address, neighbourhood, setter, feet and total when quoted, and age
- [ ] Drag between columns on iPad and desktop writes a status change event; `lost` prompts for a reason
- [ ] Lead detail shows contact, map pin, photos, timeline, meetings and quotes; owner can edit everything
- [ ] Board stays usable with 200 leads (pagination or virtualization)

## M5: Meeting mode and quotes (iPad)
- [ ] Landscape iPad layout: presentation pages on the left, quote builder on the right, or swipe between them on narrower screens
- [ ] Presentation content and images come from settings, not from code
- [ ] Quote builder: runs, boxes, adders, discounts, financing flag; totals update live and match `lib/pricing.ts`; unit tests cover a plain house, a house with adders and discounts, GST on and off, rounding
- [ ] Save draft, mark presented, accepted or declined; each writes a lead event and moves the lead status to `quoted` or `sold`
- [ ] PDF export: breakdown, warranty text, "No payment until your install is complete," company contact, no em dashes anywhere; opens in a share sheet on iPad
- [ ] Accepted quotes reduce feet available to sell

## M6: Dashboard (owner, desktop and iPad)
- [ ] Week and month views with totals and per setter: doors, conversations, leads, meetings booked, meetings held, show rate, quotes, sold, installed
- [ ] Sold: count, dollars, average ticket, feet
- [ ] Feet available to sell with the warning threshold from settings
- [ ] Lead sources this month
- [ ] Every tile shows its date range and what it counts; empty states explain what will appear
- [ ] Loads in under two seconds with a month of data

## M7: Website lead endpoint and polish
- [ ] `POST /api/leads/website` with a shared secret creates a `website` lead and emails info@vesperlighting.ca; rate limited; validated with Zod
- [ ] Daily 7 am email to the owner: yesterday's numbers and tonight's meetings
- [ ] PWA caches the shell so the app opens instantly; a clear banner shows when offline
- [ ] Accessibility pass: labels, focus states, contrast in both themes
- [ ] Playwright smoke test: login, create lead, book meeting, mark held, create quote

## V1.5 (after launch, as needed)
Automated SMS confirmations and reminders through Twilio (requires the CASL consent checkbox on the lead), email sending for quotes, offline queue for lead capture, map of knocked addresses.

## V2 (November)
Jobs, crews, job sheets, timesheets, crew profiles with authorizations, crew schedule, dashboard additions. Spec to be written after the first installs.
