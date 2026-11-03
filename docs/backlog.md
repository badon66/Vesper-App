# Backlog

Ideas and removed features that are not in the current milestone. Say which version they might belong to. Nothing here gets built without Keenan's say so.

**Parked (Keenan, 2026-11-02).** The whole backlog is parked, along with M4, M6 and M7: the work now is the three fundamentals (setter sessions, sales meetings and the shareable quote link). Nothing here is started or planned until Keenan says otherwise.

## Removed from V1 on 2026-10-25

- **Customer confirmation text.** A prefilled Messages link from the setter's phone using a template in settings, with a "mark sent" stamp on the meeting. Needs the CASL consent checkbox first. V1.5, alongside automated texts through Twilio.
- **Inventory and feet tracking.** Feet on hand, adjustments, feet available to sell, low stock warning. Not needed while stock is small enough to count by hand. V2 or later, with purchase orders.

## Ideas

- Continuous integration: run lint, tests and build on every pull request.
- Setters cancelling or rescheduling their own bookings from the phone, instead of asking Keenan.
- A line on the setter's pay screen showing how booking pay and commission are calculated, in plain words.
- View as history: a record of when the owner viewed the app as whom.
- Follow-up reminders as notifications. The follow-up date and the Home list cover it inside the app for now. V1.5, with notifications.
- Notify Keenan on his phone when a booking for today is made, moved or cancelled (Keenan, 2026-11-01). V1.5, with notifications.
- Supabase Realtime instead of polling for the schedule board, if the few-second poll ever feels slow or costly.
- Paging on Leads. The list shows the newest 200 and says so; search reaches older ones. Add "Show more" once the team has that many.

From the M3.5 design critiques (2026-11-02), not built:
- The booking sheet on an iPad: a homeowner's half, with the held time large, instead of the phone layout centred.
- Schedule: a one-line confirmation with Undo after a day change; a mark on the evening strip for evenings with their own times or blocks; photos on Keenan's cards for evenings other than tonight.
- The distance warning when the time is picked, not only at Book, so "pick another time" can happen while the homeowner is still at the door.
- "This lead already has a meeting booked" offering Move directly.
- Light theme: a 2 px border on open times (gold on white is 2.9:1; the word "Open" carries the state today).
- A screen reader announcement when a focused time is held or booked by someone else.

## Infrastructure

- **A second Supabase project, a test copy.** Someday, and only when Keenan asks; not recommended for now. The app stays ready for it: every database change is a migration, nothing hard-codes the project, and `docs/05-supabase-setup.md` has the dashboard settings and the setup steps, owner account included.
- **Edit my name and phone.** A small self-service screen for the signed-in person. Until then the admin sets names when creating logins.
- **Live walk-through in Safari's engine.** The walk-through runs in Chromium at iPhone size because only Chromium is installed in the cloud environment. Adding WebKit to the environment's setup would let it run as Safari does on an iPhone.
- **Orphaned lead photos.** Photos uploaded from a New lead form that was never saved stay in storage unlinked, and so does a first try replaced by a retake before the form is saved. A scheduled cleanup can delete files older than a day with no `lead_photos` row.
- **Faster row security at scale.** Supabase's performance advisor (2026-11-01) suggests writing `(select auth.uid())` instead of `auth.uid()` in seven policies, and merging the owner's and the setters' policies where a table has two for the same action. Harmless at today's size; worth one additive migration before the lead count reaches the thousands.
- **Meeting mode, take 2 design list** (from the take-1 reviews, 2026-11-02, final score 28/40): chevrons and arrow keys step through the gallery photos before turning the page, with a larger counter; pinch and double tap zoom around the fingers, not the image centre; on Your price, Save and its status move to the builder side, the total sits above the lines, the toggle chips get ticks ("Offer financing"), "+ Run" buttons lose their borders so fields stand apart from actions, and removing a run can be undone; one caption plate for title and words over photos, larger Night/Day labels, no half-visible plate behind the dots; text pages a size larger and a little lower; the colour chooser designed for the table (Save bottom right, no repeated legend) and a quiet "Initial again" after tonight's confirmation; a short "how the deck moves" note on the lead card (double tap, tap the line, swipe the gallery, open from the home-screen app); failed-save messages away from the customer's side of the bill; whether changing the colour should also clear the old colour's initials in the database; replacement lines Keenan can take for the seeded "colour matched" wording ("in a colour chosen for your soffit").
- **Owner pages check the role themselves** (found by the Meetings page review, 2026-11-02). The owner group's layout swaps in "Not for your role" for anyone else, but a Next.js page still runs and sends its data alongside. Meetings now checks in the page too; People, Settings and Pay still rely on the layout and on RLS (which keeps what they read to what the person may read anyway). One line per page.
- **New lead says "no signal" instead of failing the screen.** With no signal, submitting New lead (and before the fix, Start a meeting's new person) shows "This page couldn't load" and loses what was typed; Start a meeting now catches it and keeps the form. New lead's form needs the same catch.
- **Empty the meeting caches on sign-out (M5 take 2).** The service worker keeps the last copy of a meeting page and its photos for weak signal, keyed by URL on that device. Harmless on Keenan's own iPad, but signing out should clear the `vesper-pages` and `vesper-images` caches so a shared or handed-over device keeps nothing (detector note, 2026-11-02).
