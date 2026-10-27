# Decisions

Judgment calls and spec changes, newest at the bottom. Each entry says what changed, why, and what it touches.

## 2026-10-25

**Supabase region stays us-west-2.** The Vesper-App project was created in Oregon rather than Canada. Keenan's call: it is the closest region to Calgary with the best connection. Customer data is therefore stored in the United States. Revisit only if a customer or regulator asks.

**Docs live in `docs/`.** The four spec files were uploaded to the repo root. Moved them into `docs/` so the paths in CLAUDE.md and the session prompts are correct.

**Working login ships in M0.** The roadmap puts auth in M1 but M0 needs a protected `/app` route. M0 includes a plain email and password sign-in and sign-out against Supabase Auth. Accounts are created by the owner in the Supabase dashboard until M1 adds the People screen. There is no public sign-up and never will be.

**Service worker waits for M7.** M0 ships the manifest and icons only. iPhone home screen install does not need a service worker. M7 adds shell caching and the offline banner.

**Public views bypass RLS.** `settings_public` runs with the view owner's privileges, which is how sales users read it. It is safe only while it exposes nothing but the safe columns. Flagged in the data model and to be re-checked in M1 and M3.

**`installed` is set by hand in V1.** Jobs and crews are V2. Until then the owner moves a lead to `installed` from lead detail or the pipeline. The dashboard's installed counts and the commission payable date depend on this.

**Dropped `leads.storeys`.** `house_type` already carries bungalow, bi-level, two storey and other.

**A. Sales users collaborate.** Setters can read every lead, meeting and knock session and edit only their own. Reason: avoid knocking the same doors twice and let setters cluster bookings. Consequences: the `meeting_slots_public` view is gone (sales read `meetings` directly); the booking screen shows time, neighbourhood and setter for every booked slot; My leads gains an "everyone" switch; the RLS summary changed for leads, lead_photos, lead_events, knock_sessions and meetings. Because sales can read those tables, no dollar amount may ever be stored in them. Prices live in `quotes` and `earnings` only.

**B. Setter pay.** New `earnings` table and two settings: `booking_pay` (default $20) and `commission_rate` (default 5%). Booking pay is created when the owner marks a held meeting qualified (new `qualified`, `qualified_reason`, `qualified_at` columns on `meetings`). Commission is created when a quote is accepted, on `quotes.subtotal` (the total before GST), and becomes payable when the lead is marked installed. Each earning stores its rate. Judgment calls inside this change:
- Status is `pending | paid | void` plus a `payable_at` timestamp, rather than only pending and paid. `payable_at` models "becomes payable at install" without a fourth status, and `void` covers a sale that falls through before install so history is kept instead of deleted.
- Booking pay goes to `meetings.booked_by`; commission goes to `leads.assigned_to` at the moment of acceptance. If that profile is the owner, no earning is created.
- Partial unique indexes make each meeting and each quote earn at most once.
- Roadmap placement: the earnings table, qualified bookings, booking pay, My pay (setter) and Pay (owner) are in M3, because setters start earning booking pay in the first week of knocking, before quotes exist. Commission on acceptance, payable on install, void on lost is in M5. The dashboard tiles for pay owed and upcoming jobs are in M6. If M3 runs long, the two pay screens can slip to M4 without changing the schema.

**C. Customer confirmation text removed from V1.** No template in settings, no "Text the customer" button, no `confirmation_sent_at`. Setters confirm the time at the door. Moved to `docs/backlog.md` and V1.5.

**D. Inventory removed.** No feet on hand, no feet available to sell, no warning threshold, no `inventory_adjustments` table, no inventory settings. The owner dashboard is a sales dashboard: funnel by week, month and setter, sold count and dollars, average ticket, lead sources, setter pay owed, and an upcoming jobs list of sold leads not yet installed.

**TypeScript stays on 5.9 for now.** TypeScript 7 is the new native compiler. Pinning 5.9 until Next.js and ESLint tooling are known to work with 7. Revisit in a later milestone.

**Playwright pinned to 1.63.** Matches the browser preinstalled in the cloud build environment, so end to end tests run without a separate browser download.

**Cache Components stays off.** `create-next-app` for Next.js 16.4 turns on `cacheComponents` and `partialPrefetching`. With them on, every page that reads cookies needs a Suspense boundary or a `use cache` directive above it, which adds friction to an app where every screen is per user and dynamic. Both flags are removed from `next.config.ts` for V1. Next.js says they become mandatory in the next major, so revisit before upgrading to 17.

**shadcn components are written by hand.** The shadcn registry host is blocked from the cloud build environment, so `components/ui` holds hand-written components in the standard shadcn style on Radix primitives: button, input, label, card. `components.json` is present so `npx shadcn add` works on a normal machine. Default button height is 44 px and inputs use 16 px text, for thumbs and to stop iOS zooming in on focus.

**Theme toggle is one button.** Light by default, dark on tap, remembered per device by next-themes. The system preference is ignored so the app looks the same everywhere until the user chooses. The toggle also updates the `theme-color` meta so the browser chrome follows.

**Gold never carries small text on white.** Measured contrast: navy on gold 4.9:1 (passes), white on gold 2.9:1 (fails), gold on white 2.9:1 (fails). So primary buttons are gold with navy text, and gold is otherwise used for accents and large type only. In dark mode gold on the navy background is 6.1:1.

**The cloud build environment cannot reach Supabase.** Its network policy denies `ajnopydosoewftfwmiog.supabase.co`, so sign-in could not be exercised end to end from the build session; the form, redirects, themes and PWA assets were verified, and the sign-in itself is on Keenan's phone checklist. Before M1, add `*.supabase.co` to the environment's allowed domains so the RLS test script can run in later sessions.

## 2026-10-26

**Logins are created with a temporary password, not an invite email.** Supabase's built-in email service only delivers to members of the Supabase organization, so invite links to setters would fail without a custom SMTP provider. Email arrives in M7. The admin creates the login in People, gets a one-time temporary password (three groups of four readable characters) and texts it. The account carries `must_set_password` in its auth user metadata; proxy.ts holds it on `/set-password` until the person chooses a password of at least 10 characters, then the session token is refreshed so the flag clears at once.

**Exactly one owner, by email.** The sign-up trigger gives `owner` to info@vesperlighting.ca and `sales` to everyone else. A partial unique index on profiles allows at most one owner row, and a trigger refuses to demote or deactivate it, whoever is asking. People never offers the owner role. In the UI the roles read Admin, Sales associate and Crew; the enum values are unchanged. Public sign-up is turned off in the Supabase dashboard, which matters because any new auth user gets a sales profile from the trigger.

**Deactivation bans the auth user.** Setting someone inactive applies a long ban through the Auth admin API so Supabase refuses their sign-in, and flags the profile so an existing session is signed out on its next request through `/auth/signout`. Reactivating lifts both. The owner row cannot be deactivated at all.

**Service role key, owner only.** `lib/supabase/admin.ts` is used solely for Auth admin calls inside server actions that first verify the caller is the active owner. It never reads or writes app tables for a request. The key lives in Vercel and the cloud environment's secrets as `SUPABASE_SERVICE_ROLE_KEY`.

**Role checks in RLS use SECURITY DEFINER helpers.** `is_owner()` and `current_user_role()` read the caller's own profile without recursing into the profiles policies. Signed-in users can execute them, which the Supabase advisor reports; that is required for the policies to run and accepted. Trigger functions had their EXECUTE grants taken away in a follow-up migration after the same advisor flagged them.

**Two public views.** `settings_public` (slot template and distance warning) and `profiles_public` (id, name, role of active people) run with the view owner's privileges and bypass RLS on purpose. The advisor reports them; accepted. They must never gain a column without checking the RLS table in the data model.

**Small schema deviations from the data model.** The enum type is named `user_role`, because `role` is a SQL keyword. `profiles` gains `email`, copied by the trigger and kept in step on change, so People can list emails without the admin API. The settings `presentation` is seeded with the eight page titles and draft bodies from the spec; its editor waits for M5 where images arrive. Placeholder warranty text and blank company phone and address are seeded for the admin to fill in through Settings.

**No role picker in People for V1.** Sales associate is the only assignable role until Crew screens arrive in V2, so the form shows the role as text instead of a one-option select. The server action accepts only roles in `ASSIGNABLE_ROLES`.

**RLS tests are a separate script.** `npm run test:rls` runs against the live Supabase project with throwaway users it creates and deletes, and needs the service role key, so it stays out of `npm test`. Every milestone adds its cases there.

**Two Vercel fixes on production (Keenan).** Production returned "page does not exist" because the Vercel project's Framework Preset was "Other", so Vercel deployed the repo as static files; set to Next.js. The sign-in page then failed because the publishable key variable in Vercel was named `NEXT_PUBLIC_SUPABASE_ANON_KEY`; renamed to `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and the Supabase URL corrected. Variable names in Vercel must match `.env.example` exactly. Production is https://vesper-app-mocha.vercel.app.

**Server action redirects do not pass back through proxy.ts.** Found during the M1 walk-through: after a sign-in action redirected to `/app`, the client followed it straight to the page, and the proxy's hold on `/set-password` only applied to the next full navigation. The sign-in action now sends a first-time account to `/set-password` itself, and proxy.ts stays as the backstop for every later request. Rule for later milestones: anything the proxy enforces must also be enforced where a server action chooses its redirect.

**Running the app against Supabase from the cloud build environment needs `NODE_USE_ENV_PROXY=1`.** Node's built-in fetch, used by supabase-js and the Next.js server, ignores the egress proxy variables unless that flag is set. curl works without it, which is why the first checks were misleading. The RLS script and the production server are started with the flag in build sessions; Vercel needs nothing.

## 2026-10-26, M1 follow-ups

**Owner-set passwords, no self-service.** The forced first-sign-in password change is removed along with its `must_set_password` flag, the `/set-password` screen and the proxy rule; a migration strips the flag from any account. The app generates every non-owner password as three lowercase common words and four digits (about 37 bits from a 200-word list, acceptable for owner-controlled accounts behind Supabase's sign-in rate limits), shows it once, and the owner texts it. Reset password in People generates a new one, shows it once, and ends the person's open sessions. Accounts are created with the email already confirmed. Non-owners get no password change, no reset and no emails; the sign-in screen says "Forgot your password? Ask Keenan." The owner changes his own password from a card in Settings.

**Ending sessions.** Supabase has no admin call to sign a user out of every session without that user's token, so `end_user_sessions(uuid)` deletes the user's `auth.sessions` and `auth.refresh_tokens` rows. It is SECURITY DEFINER, refuses the owner, and only the service role can execute it. To make that take effect at once, the app layout now verifies the session with the Auth server (`getUser`) instead of only decoding the token; a token whose session is gone is signed out with a "signed out" notice. The proxy still decodes locally for speed. Deactivation also ends sessions.

**Blocking a non-owner from changing their own password through the Auth API directly.** Not cleanly possible: Supabase Auth has no per-user permission on the update-user endpoint and no hook that runs before a password update, and a database trigger cannot tell an admin reset from a self-service change because both arrive as the same role. The UI offers no path, and the owner can always reset. No workaround built, as instructed.

**Dark theme is the default.** The theme provider defaults to dark, the manifest and theme colour follow, and light remains a tap away, remembered per device. Printed and exported output is always white; the M5 PDF spec says so.

**People screen layout.** Members are the main content, with Reset password and Deactivate or Reactivate per row. "Add a Vesper member" at the bottom opens the form. The role picker is driven by `ASSIGNABLE_ROLES` in `lib/roles.ts` and the sign-up trigger honours a non-owner role in user metadata, so Crew appears by adding one entry. Owner is never offered and the database would refuse a second one anyway.

**GST number.** `settings.gst_number` added for formal documents. `gst_enabled` stays off.

**Owner-only pages check the role on the server.** Confirmed: the `(owner)` route group layout runs `requireProfile` and renders "Not for your role" for non-owners before any page code, and every owner action calls `requireOwnerForAction`. The proxy only handles signed-in versus signed-out.

**Workflow rule added to CLAUDE.md.** Branches stop at ready to merge with a checklist; merges happen after Keenan confirms on the Vercel preview; small fixes fully covered by the automated walk-through may merge on green tests.

**Spec only, placed in their milestones.** M5: per-quote price overrides and a custom line, quotes store the prices used, commission on the total as actually priced; GST display rules on screen versus formal documents, and nothing mentions GST while it is off; PDFs always white. M3: booking outcomes Qualified, Not qualified (reason list in settings, Other with text), No-show, Cancelled; one booking fee per lead at most, rebooking allowed; meeting status enum reshaped accordingly; outcomes and reasons visible on My pay.

**Backlog.** A separate test Supabase project for the RLS suite and walk-throughs, to be set up before real leads exist.

**Workflow replaced (CLAUDE.md rules 11 to 14).** Every branch runs the full automated suite including the live walk-through; a failure stops the work and is reported; a green branch is pushed and reported with its Vercel preview link first; merges happen only when Keenan says "push the changes", after which production is redeployed and its link reported. Keenan no longer runs checklists; anything only the owner can check is listed under "worth a look".

**Role comes from app_metadata, and no role means no access.** The sign-up trigger previously read the role from `user_metadata`, which a signed-in user can edit about themselves. It now reads `app_metadata`, which only the service role can write, and the People action sets it there. An account created with no role or an unknown role gets no profile row: no policy matches it, `profiles_public` and `settings_public` return nothing to it, and the app signs it out as not set up. The owner is still decided by email alone.

**Live walk-through lives in the repository.** `tests/live` holds the walk-through and `npm run test:live` builds nothing itself but starts the production server, runs it, and stops it. It needs the three Supabase variables and, in the cloud environment, `NODE_USE_ENV_PROXY=1`. It creates and deletes only accounts whose email starts with a test prefix; real accounts are never touched.

**Profile creation waits for app_metadata.** The Auth server inserts a new user and writes custom `app_metadata` in a separate update afterwards, so an insert trigger alone never sees the role and every new member would have had no access. A second trigger on updates to `app_metadata` runs the same function, which creates the profile once and does nothing after that. The People action now requires the role field explicitly instead of falling back to Sales associate. Caught by the RLS suite before anything was pushed; a unit test now pins the action to `app_metadata`.

## 2026-10-27

**Canada is the default country for phone numbers (Keenan).** A lead's phone typed without a country code is treated as Canadian and saved as +1 in E.164. A number typed with + and a country code is kept as typed. Applies from M2, where phone capture is built.

**M1 follow-ups merged, M2 current.** `m1-followups` was merged into main on Keenan's "push the changes". Four M1 criteria that need the owner screens stay unticked until Keenan confirms them. M2 is the current milestone and has not been started.
