# Backlog

Ideas and removed features that are not in the current milestone. Say which version they might belong to. Nothing here gets built without Keenan's say so.

## Removed from V1 on 2026-10-25

- **Customer confirmation text.** A prefilled Messages link from the setter's phone using a template in settings, with a "mark sent" stamp on the meeting. Needs the CASL consent checkbox first. V1.5, alongside automated texts through Twilio.
- **Inventory and feet tracking.** Feet on hand, adjustments, feet available to sell, low stock warning. Not needed while stock is small enough to count by hand. V2 or later, with purchase orders.

## Ideas

- Continuous integration: run lint, tests and build on every pull request.
- Setters cancelling or rescheduling their own bookings from the phone, instead of asking Keenan.
- A line on the setter's pay screen showing how booking pay and commission are calculated, in plain words.

## Infrastructure

- **Separate test Supabase project.** Run the RLS suite and the live walk-throughs against a test project instead of production. Deferred by Keenan on 2026-10-27; revisit before setters log real leads. It would also give the walk-through a test owner account, so the owner screens could be checked automatically. Needs its own URL and keys in the cloud environment and a way to apply the same migrations to both.
- **Edit my name and phone.** A small self-service screen for the signed-in person. Until then the admin sets names when creating logins.
- **Orphaned lead photos.** Photos uploaded from a New lead form that was never saved stay in storage unlinked. A scheduled cleanup can delete files older than a day with no `lead_photos` row.
