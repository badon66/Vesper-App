# Backlog

Ideas and removed features that are not in the current milestone. Say which version they might belong to. Nothing here gets built without Keenan's say so.

## Removed from V1 on 2026-10-25

- **Customer confirmation text.** A prefilled Messages link from the setter's phone using a template in settings, with a "mark sent" stamp on the meeting. Needs the CASL consent checkbox first. V1.5, alongside automated texts through Twilio.
- **Inventory and feet tracking.** Feet on hand, adjustments, feet available to sell, low stock warning. Not needed while stock is small enough to count by hand. V2 or later, with purchase orders.

## Ideas

- Continuous integration: run lint, tests and build on every pull request.
- Setters cancelling or rescheduling their own bookings from the phone, instead of asking Keenan.
- A line on the setter's pay screen showing how booking pay and commission are calculated, in plain words.
- Paging on Leads. The list shows the newest 200 and says so; search reaches older ones. Add "Show more" once the team has that many.

## Infrastructure

- **Separate test Supabase project.** Run the RLS suite and the live walk-throughs against a test project instead of production. Deferred by Keenan on 2026-10-27; revisit before setters log real leads. It would also give the walk-through a test owner account, so the owner screens could be checked automatically. Needs its own URL and keys in the cloud environment and a way to apply the same migrations to both.
- **Edit my name and phone.** A small self-service screen for the signed-in person. Until then the admin sets names when creating logins.
- **Migration file names and applied versions differ.** Migrations are applied through the Supabase connector, which records its own timestamp as the version (for example `20261028075646` for the file `20261028000100_m2_leads_knock_sessions.sql`). Nothing depends on this today, but the Supabase command-line tool matches by version and would try to apply every file again. Align them with `supabase migration repair` before anyone uses the CLI against this project or sets up the test project.
- **Live walk-through in Safari's engine.** The walk-through runs in Chromium at iPhone size because only Chromium is installed in the cloud environment. Adding WebKit to the environment's setup would let it run as Safari does on an iPhone.
- **Orphaned lead photos.** Photos uploaded from a New lead form that was never saved stay in storage unlinked. A scheduled cleanup can delete files older than a day with no `lead_photos` row.

## Known issues

- **Some forms clear what was typed after an error.** React 19 empties a form's fields after a form action returns, even with an error. Confirmed on 2026-10-28 for the sign-in form: after a wrong password, both email and password are empty, so a setter has to retype their email. Settings and Add a Vesper member use the same pattern and very likely do the same (not verified, since tests cannot sign in as the owner); Start knocking does too, but only errors in rare cases. The fix is small: return the typed values with the error, or submit the way the lead forms do. Sign-in is auth, so this waits for Keenan's go-ahead.
