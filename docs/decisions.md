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

**No separate test Supabase project for now (Keenan).** The RLS suite and live walk-throughs keep running against the production project. They create and delete only test-prefixed accounts, plus the leads, photos and knock sessions those accounts make, all removed in the same run. Real accounts and real data are never touched. The test project stays in the backlog, to revisit before setters log real leads.

**Google Maps key (Keenan).** `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is set in Vercel for Production and Preview and in the cloud environment, restricted to the production site and localhost on ports 3000 and 3300. Preview sites therefore get no address autocomplete, which is accepted; a typed address must still save there, without a map position. A new M2 criterion records this. Environment changes reach only new sessions, so the session that planned M2 could not see the key.

**Logo files come later (Keenan).** They do not block M2.

**M2 session prompt corrected.** It still said the RLS test proves a setter cannot see another setter's lead, which predates the team-visibility change of 2026-10-25. It now says the test proves a setter can read another setter's lead but cannot change it.

## 2026-10-28

**Workflow replaced again (Keenan).** CLAUDE.md rules 11 to 13 now say: run the full automated suite after building; if anything fails, do not merge and report; if everything is green, merge into main, push, wait for production to redeploy, verify it, and report with the production link first, followed by a short list of what changed and where to see it. Keenan no longer says "push the changes" and no longer reviews preview links. Rule 10 was reworded to match, since it still asked for a device checklist.

**M2 approved with all four recommendations (Keenan).**
- No manual Meeting booked. Setters change status only between `new`, `follow_up` and `lost`, in both directions, enforced by the leads trigger and proved by an RLS test. M3's booking sets `meeting_booked` through the server, inside a database function the trigger trusts.
- The Book a meeting button stays hidden until M3 builds booking.
- `settings_public` gains `lost_reasons`, so setters can pick a lost reason. A new view `profile_names` exposes `id` and `full_name` of every profile, deactivated ones included, to callers with an active profile, so old leads and timelines still say who did what. Neither contains money.
- Duplicate address warning: when a picked address already has a lead, the form shows who has it and links to it. Matching is by Google place id; typed addresses are not matched.

**Walk-through test leads are named "TEST LEAD (automated)" (Keenan).** A real setter who sees one in Everyone during a run knows to ignore it. They are deleted at the end of the same run.

## 2026-10-28, M2 build

**Photos are shrunk on the phone before upload.** Longest edge 1600 px, JPEG at 82 percent quality, which also drops the camera's metadata, including GPS location. Up to six per form. Files go in the private `lead-photos` bucket under the uploader's own folder, images only, 10 MB cap. Pages show them through links that expire after an hour, and only the owner can delete files. A failed upload offers a retry.

**Knock counters save in the background.** A tap shows at once and is sent in order in small batches; a failed send retries every two seconds, and the card says "Saving" until every tap is stored. The database adds each batch atomically, caps a batch at 100 either way and never goes below zero. One open session per setter. A session left open on an earlier day is closed at its last tap the next time that setter opens the app, using Calgary's midnight.

**Neighbourhood on a new lead.** It is prefilled from the open knock session. A picked Google address replaces it only if the setter has not typed their own. Editing a lead keeps the stored one.

**Leads list.** It shows the newest 200 and says so when it reaches that. Search covers first and last name, address, neighbourhood and, from three digits, the phone. Characters other than letters, digits, spaces, apostrophes, #, / and - are dropped from a search, because some of them have special meaning to the database filter.

**The timeline records edits by field name only.** An edit writes which fields changed, for example "Changed the address, map position and postal code.", never the old or new values, so the timeline can never carry anything a setter should not read.

**Forms that must keep what was typed after an error submit directly.** React 19 empties a form's fields after a form action returns, even with an error. The new lead, edit lead, status and note forms therefore call their server actions directly. The sign-in form has the same problem, confirmed by a probe: after a wrong password both fields are empty. Fixing it touches auth, so it is in the backlog under Known issues and waits for Keenan.

**Settings copy corrected.** The GST card said "While off, quotes say GST not applicable", which contradicts the rule that nothing mentions GST while it is off. It now says "While off, prices show with no mention of GST."

**Roadmap header follows the new workflow.** It still said a milestone is done when the owner has tried it on the real device. It now says a milestone is done when every criterion passes in the full automated suite, including the live walk-through on a phone-sized screen, and anything the suite cannot reach is named in the report.

**What the automated suite cannot reach in M2.** The walk-through runs Chromium at iPhone 14 size; Safari is not installed in the test environment, so the iPhone's own camera sheet and the home screen app are not exercised. The photo goes through the same file input the camera fills. Human speed is not measured: the scripted new lead, with a photo upload, took about 4 seconds end to end. Daylight readability is covered by the contrast test (WCAG AA for every text pair in both themes, AAA for body text), not by eye.

**M2 complete, M3 current.** All ten M2 criteria passed in the full suite. M2 is merged into main and M3 is marked current. M3 has not been started.

## 2026-10-28, navigation, View as, follow-up dates and speed

**Four changes from Keenan, tracked as M2.5.**
- A failed sign-in keeps the email and clears only the password. Settings and Add a Vesper member keep everything typed after an error.
- View as for the owner.
- Navigation reordered around the evening schedule: bottom tabs on phone and iPad, a side rail from 1024 px, no top tabs. The owner's Home is the dashboard, and Admin holds People and Settings.
- Speed: functions next to the database, loading screens and prefetched tabs, with tab-switch time measured on production before and after.

M3 has not started.

**The View as test signs in as the owner (Keenan).** View as is owner only, and the database allows exactly one owner, so a test can compare View as with a real setter only by signing in as Keenan. Each run does the following:
- It creates a one-time server-side session for info@vesperlighting.ca through the Auth admin API: a magic link verified on the server, never emailed.
- It uses that session only to view screens and to submit forms that are refused before anything saves.
- It signs that one session out at the end.

No password is used or changed. The account shows a sign-in for each run.

**Follow-up date (Keenan).**
- Leads get `follow_up_on`. Choosing Follow up asks when: Tomorrow, In 3 days, Next week, or a date.
- The database requires the date while a lead is in Follow up and clears it when the lead leaves. It refuses a date before today, in Calgary time, from a signed-in person.
- Leads Active orders by attention: follow-ups due today or overdue (oldest date first), then New (oldest first), then later follow-ups (soonest first), then booked meetings (soonest first, from M3).
- The setter's Home lists their follow-ups due today or overdue.
- M3's No-show and Cancelled outcomes will set the next day as the date.

**How View as works.**
- **It is a setting on the owner's own session, not an impersonation.** Starting it from People, owner only, sets an HttpOnly cookie holding the owner's id and the viewed person's id, valid for two hours.
- **The server checks it on every request.** It honours the cookie only when the signed-in session belongs to the active owner and the viewed person is an active non-owner; otherwise the cookie is ignored.
- **Screens render as the viewed person.** While it is on, `requireProfile()` returns the viewed person, so every screen shows their tabs, their Home and their "Not for your role" pages.
- **Data is read with the owner's session.** No token is ever made for the viewed person. That is why every non-owner screen must scope its queries itself (CLAUDE.md).
- **Writes are refused three ways:**
  - `proxy.ts` rejects every request under /app other than GET or HEAD while the cookie is set, except Exit.
  - Every server action's guard checks the real signed-in profile and refuses while viewing.
  - The screen sits inside a disabled fieldset, so no button or field works. Navigation links still do.
- **Rendering never writes while viewing.** The one screen that writes while rendering, Home closing a stale knock session, skips that write.
- **Exit and sign-in.** Exit clears the cookie and returns to People. Signing in or out clears it too.
- **Rejected alternatives:**
  - Minting a token for the viewed person. It would carry their identity and could write as them.
  - Rewriting every RLS policy to follow a "view as" setting. That is a large, risky change to the real gate, for a viewer who may read everything anyway.

**View as only for active members.** A deactivated person cannot sign in and sees nothing, so their row offers no View as.

**Keenan keeps his own knock session on Home.** The spec has Keenan knocking too, and his Home is now the dashboard. His knock card sits below today's team.

**Tab bar details.**
- Until M3 adds Schedule, the owner has four tabs (Home, New lead, Leads, Admin), so New lead sits second; it is centred once Schedule arrives.
- On New lead and Edit lead the phone tab bar gives way to the form's own Cancel and Save bar, as in M2; the side rail stays on wide screens.
- The slim top bar keeps the wordmark, the theme switch and Sign out. It holds no tabs.

**Old addresses.** `/app/people`, `/app/settings` and `/app/dashboard` redirect to `/app/admin/people`, `/app/admin/settings` and `/app`, so bookmarks and home screen shortcuts keep working.

**Prefetching.** Tab links use Next.js's automatic prefetch. With a loading screen in each tab, that prefetches the shared layout and the loading screen, so a tap switches at once and the data streams in fresh. Full prefetching was not used: it would render every tab on the server on every page view and keep up to five minutes of stale data on the phone.

**Function region.** Functions ran in iad1 (Washington, D.C.) while Supabase is in us-west-2 (Oregon), so every database call crossed the continent, several times per screen. `vercel.json` now sets `regions` to `pdx1` (Portland). The result is checked after deploy from the `x-vercel-id` response header.

**Tab-switch time before the change.** Measured on production on 2026-10-28 with `tests/perf/tab-switch.mjs`. The run used a throwaway setter on an iPhone 14-sized screen: 10 rounds of Home to Leads and back, plus 5 of Home to New lead, from a test machine near Washington, D.C.

| What | Median | Slowest |
|---|---|---|
| Tap to the new screen's content | 943 ms | 1,656 ms |
| Tap to the first visible change | 936 ms | |
| Server sending the screen | 885 ms | |
| Leads to Home, the slowest switch | 1,065 ms | |

Nothing on screen changed until the new screen arrived.

**Forms keep what was typed.** Sign-in, Settings, Add a Vesper member and Start knocking now submit through their own handler instead of React's form action, which empties the form even after an error. Sign-in then clears only the password after a failure.

**Function region confirmed.** After the deploy, production responses carry `x-vercel-id: iad1::pdx1::...`: the request enters Vercel near the caller and the function runs in Portland. `regions` in `vercel.json` was enough, and nothing needs changing in the Vercel dashboard.

**Tab-switch time after the change.** Same script, same machine near Washington, D.C., same throwaway setter on an iPhone 14-sized screen, 25 switches.

| What | Before (median / slowest) | After (median / slowest) |
|---|---|---|
| Tap to the first visible change | 936 ms / 1,646 ms | 65 ms / 95 ms |
| Tap to the new screen's content | 943 ms / 1,656 ms | 411 ms / 898 ms |
| Server sending the screen | 885 ms / 1,457 ms | 344 ms / 841 ms |
| Leads to Home, the slowest switch before | 1,065 ms | 385 ms |

- **Content is now timed every animation frame from the tap.** Playwright's own waits check less and less often, and once the loading screen appears first they noticed the content hundreds of milliseconds late. Before the change, content arrived with the address change, so that number was already exact.
- **Keenan in Calgary should see better numbers than these.** The measuring machine is near Washington, D.C., so each request now crosses the continent once to reach Portland. From Calgary both the function and the database are close.

**Testing note.** A tap now changes the address before the content arrives, and while a page streams in it can briefly hold a hidden second copy of its content. The walk-throughs and the timing script therefore wait for the new screen's own visible content before checking anything.

**Real use has begun.** Production now holds one knock session of Keenan's (ended, no taps) and no real leads. The walk-throughs only read it, and the View as run checks that nothing of the owner's changed. The backlog's separate test database should be set up before setters log real leads.

**M2.5 complete, M3 current.** All nine M2.5 criteria pass. M3 has not been started.

## 2026-10-31

**No separate test database (Keenan).** Keenan has decided against it. The backlog item is removed and the app no longer recommends it. Tests keep using test-prefixed accounts and data on production and clean up after themselves.

**Only the owner adds members (Keenan).** The owner's test session stays view only. It never creates, changes or deletes anything, members included. The four M1 owner-screen items stay unticked until Keenan says to tick them, and they are no longer raised as open questions.

**Soffit and track colour on quotes (Keenan, for M5).** A quote can't be marked ready until Keenan has confirmed the soffit colour in person against the colour book and set the track colour; both print on the quote. The data model gains `quotes.soffit_colour_confirmed`, `soffit_confirmed_at` and `track_colour`. "Ready" is read as leaving draft: being presented, accepted or exported as a PDF. To confirm when M5 is planned.

**The door process (Keenan), built as M2.6.** A setter's visit is a short conversation with a structure: open, find out, photos, book. The app follows it with:
- a Door guide, its text owner-edited in Settings and read by setters through `settings_public`;
- four guided photo slots plus More photos, each photo storing its slot;
- six optional one-tap Find out questions, each in its own column.

Nothing in it is required to save a lead. Soffit colour becomes White, Off-white or cream, Other or Not sure, because white is the only stock track and a recent install found an off-white soffit too late.

**Before you book (Keenan, for M3).** Booking passes only when all of these hold:
- a phone number is saved;
- Owns the home is Yes;
- Wants a price is Yes;
- Soffit colour is answered (Not sure is fine);
- the Front, Left corner and Right corner photos exist, or the setter picks a skip reason (Homeowner said no, or Other with a note), which the owner sees on Schedule;
- the setter confirms everyone who decides on the house will be at the meeting, stored on the booking.

The list does not mention the map position that the earlier rule required for the distance warning and the navigate link. That stays open and is asked in the M3 plan; the docs say so where it matters.

**Door process build calls.**
- **Door guide display.** The guide starts closed, so New lead stays quick. Its text is plain text shown line by line, so Keenan edits it like any other setting.
- **Answers clear on a second tap.** Tapping a chosen Find out answer again clears it, since every question is optional and a mistaken tap needs undoing.
- **Column names.**
  - Booleans: `owns_home` (No is false) and `wants_price` (Not yet is false).
  - Enums: `christmas_lights_now` (hires, diy, none), `areas_wanted` (front, front_and_sides, full_wrap, not_sure) and `install_timing` (before_christmas, new_year, no_rush).
- **Soffit enum rebuilt.** The `soffit_colour` enum is recreated as white, off_white, other, not_sure. No lead used black or brown; the migration maps any to other. `soffit_note` stays for Other.
- **Retakes on the lead page.** A retake on the lead page makes the new photo the slot's photo and keeps the earlier one as an extra, because only the owner deletes photos. On New lead, a retake simply replaces the upload before saving.
- **Soffit slot hint.** The soffit slot's hint reads "Close enough to see its colour", in line with why the slot exists.
- **Form order.** On the form, Find out sits after the phone number and before the photos, in the order of the visit.

## 2026-11-01

**A second Supabase project: not now, but always possible (Keenan).** There is no second database for now, and nobody recommends one; tests keep using test-prefixed data on production and clean up after themselves. The app stays ready to add one whenever Keenan asks. The backlog has it again as a someday item, his call. "Ready" means:
- every database change is a migration in the repository;
- the migration history replays cleanly on a fresh project;
- the settings that live only in the dashboard are written down;
- nothing hard-codes this project.

`docs/05-supabase-setup.md` has the settings and the setup steps, owner account included.

**Every database change is a migration (Keenan).** Nothing is changed by hand in the Supabase dashboard or with ad hoc SQL. CLAUDE.md rule 4 now says so and adds the naming rule: a file carries the version the database recorded, so a fresh project reaches the same schema by running the files in order.

**Migration history fixed.** Six files carried versions picked by hand rather than the ones the database recorded. They are renamed, with their contents untouched:

| Old file name | Recorded version |
|---|---|
| `20261026000100_m1_profiles_settings` | `20261025235414` |
| `20261026000200_m1_function_privileges` | `20261026013558` |
| `20261027000100_m1_followups` | `20261026100819` |
| `20261027000200_m1_role_from_app_metadata` | `20261026105551` |
| `20261027000300_m1_profile_on_app_metadata` | `20261026110320` |
| `20261028000100_m2_leads_knock_sessions` | `20261028075646` |

`20261028103944_lead_follow_up_date` already matched.

Every file was then checked against the SQL the database actually ran:
- Two match exactly.
- Four carry only a note added after they were applied ("Applied through the Supabase connector..."). With the note removed, each is byte for byte what ran, by checksum.
- The M2 file gained explanatory comments afterwards. A line-by-line comparison shows every SQL line matches what ran.

Comments do not change what runs, so the files replay to the same schema.

**Dashboard settings written down.** `docs/05-supabase-setup.md` lists everything the app relies on that no migration can hold:
- the region;
- the email provider with sign-up off;
- the minimum password length of 10, tied to `PASSWORD_MIN_LENGTH`;
- password requirements that accept the generated passwords;
- leaked password protection, off on the current plan;
- the Site URL, JWT signing keys and the Data API;
- no SMTP.

Sign-up off and the length of 10 come from M1; the rest are Supabase defaults. Auth settings cannot be read from a build session, so they are checked by eye when a copy is set up.

**No hard-coded project.** A search of the app, the tests and the scripts found no project URL, ref or key. They read `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SERVICE_ROLE_KEY`. The only matches are placeholders: `.env.example`, the example in `lib/env.ts`'s error message, and a unit test's fake values. CLAUDE.md rule 6 now says so. The owner's email, info@vesperlighting.ca, is a business rule written into the profile trigger, not a project detail, so a second project's owner account uses the same email.

**The Supabase connector asks before risky-looking SQL.** It stops for a confirmation when the text of a query contains destructive statements, even inside a read-only check that only quotes them. A question nobody answers times out after about four minutes. Checks therefore compare checksums instead of quoting migration text, and anything that does change data waits until Keenan is there to confirm.

**Live database check: clean.** The live database was compared with everything the migration files create:
- 6 enum types, 6 tables and 3 views;
- 15 functions;
- 14 triggers, three of them on `auth.users`;
- 16 indexes;
- 19 policies, three of them on storage;
- 5 named constraints;
- every column of every table.

They match exactly, with nothing extra and nothing missing. Row Level Security is on for all six tables. The only extensions are Supabase's defaults. Keenan has never changed the database by hand, and the check agrees. `second-project-ready` is merged.

**Door process database change: additive (Keenan).** The soffit colour list gains `off_white` and `not_sure`; `black` and `brown` stay in the database unused, and the app never offers them. This replaces the 2026-10-31 build call to rebuild the type, which would have needed a drop.

**The organization is on the Pro plan (Keenan).** WorkBase has no project cap, and a second project would add roughly $10 USD a month; the setup doc no longer warns about a cap. Leaked password protection is available on Pro. Turning it on is Keenan's call, and the setup doc says what changes if he does.

**Additive database changes, and no destructive text through the connector (Keenan).** CLAUDE.md rule 4 now says:
- prefer additive changes; an unused enum value is fine;
- never put destructive SQL text (drop, delete, truncate) in a Supabase connector call, even quoted inside a read-only query;
- if a migration truly has to drop or delete something, stop before applying it and tell Keenan, so he can be at the screen.

**Track colours (Keenan), built with the door process.**
- **The list.** Settings gains a Track colours list, each with a name and an optional RAL code. Colours are added, renamed, reordered and retired, never deleted. It starts with White, Off-white, Brown, Black and Grey.
- **On the lead.** Only the owner sets a lead's track colour, enforced in the database: one of the active colours, or Custom with a four-digit RAL Classic code checked against the RAL Classic list and shown by name. There are no swatches, because screen colours aren't accurate. Setters see the colour; their soffit question at the door is unchanged.
- **The M5 rule.** A quote can't be marked ready until the track colour is set; the quote stores the colour name and RAL code it used, and a Custom colour shows as needing powder coating.
- **What it replaced.** The soffit confirmation fields planned for quotes on 2026-10-31 are replaced by `track_colour_name`, `track_ral_code` and `track_custom`.

**Track colour design calls.**
- **Two tables.**
  - `track_colours` gives each colour an id, so renaming one never breaks old leads.
  - `ral_classic_colours`, seeded by a migration and read only, lets the database itself refuse a code that isn't RAL Classic.
- **No delete path.** Nobody has a policy to delete a colour. Leads point at colours with a foreign key, so a colour in use could not go anyway.
- **Choosing a colour.** Only an active colour can be newly chosen for a lead; a lead keeps a colour that is retired later.
- **Owner-only enforcement.** It lives in the leads guard trigger, next to the other who-may-change-what rules.

**The RAL Classic list.** It has 216 colours and was cross-checked against an independent published list: the npm package `ral-colors` 1.0.1, which draws on Wikipedia.
- 214 codes and names are identical.
- 1021 uses RAL's current name, Colza yellow; older lists say Rape yellow.
- 6039 Fibrous green, added to RAL Classic in 2017, is included although that package predates it.

Keenan can check any name against his K7 book.

**Booking needs a map position (Keenan).** The Before you book check requires a map position: an address picked from the suggestions, or a fallback for brand-new streets Google doesn't have yet. The fallback is designed in the M3 plan.

## 2026-11-01: The door process, as built (M2.6)

Judgment calls made while building it, for Keenan to look over.

**New lead, top to bottom.** Door guide, address, neighbourhood, names, phone, Find out, Photos (the four slots, the hint, then More photos), house type, notes, email, source, with Save fixed at the bottom. Address and first name are still the only required fields. Soffit colour moved into Find out, since it is one of the six questions.

**The Door guide** is closed until tapped, so it never pushes the form down at the door. Its line breaks show as written. It is Keenan's text word for word; it says "a half-hour meeting" while slots are 45 minutes, which is his to change in Settings if he wants.

**Find out.**
- Every answer is one tap, and tapping it again clears it, since every question is optional.
- The lead page shows the six answers in their own card, with "Not answered" for an empty one.
- Edit lead has the same questions, already filled in.
- The timeline reads "Updated Find out: owns the home and timing." It names the questions that changed, never the answers, like every other edit.

**Guided photos.**
- Slot hints: Front "Straight on, whole house in frame"; Left corner "Angled so the left side's roofline shows"; Right corner "Angled so the right side's roofline shows"; Soffit close-up "Close enough to see its colour".
- Edit lead has no photo slots. Slots and retakes live on the lead page, where photos were added before, for anyone who may edit the lead.
- A retake takes the slot and the earlier photo stays as an extra under More photos, because only Keenan removes photos.
- The timeline says "Added the front photo." for a slot photo and "Added a photo." for an extra.

**Track colours.**
- Settings: each colour row has move up, move down, Edit (name and RAL code) and Retire or Restore, and saves on its own, apart from Save settings. A retired colour stays in the list, marked Retired, in its place. No control removes a colour.
- Typing a RAL number names the colour as soon as four digits are in, in Settings and on the lead, so a mistyped number is caught at once.
- The lead page has a Track colour card for everyone. It reads "Not set yet", a colour name (with its RAL code when the colour has one), or "Custom, RAL 7016 Anthracite grey" with "Needs powder coating." under it. Keenan asked for the powder coating note on the quote; it shows on the lead too, so it is seen before the quote.
- Setters read "Keenan sets the track colour." and get no controls. The owner picks from the active colours or Custom, and tapping the chosen colour again clears it.
- A lead whose colour was later retired shows it as retired. The owner's choices keep that colour on that lead only, so saving again never clears it by accident.
- The owner's screens load the whole RAL Classic list (216 names) for the as-you-type name; setters' screens load only the names they are shown.

**What the tests can't reach.** The owner test session only looks, so two owner actions are walked up to the save but never saved from the screen: setting a lead's track colour, and managing the colour list. The RLS tests prove the database side of both, with the service role standing in for the owner. One test-prefixed colour is added and removed by the RLS run to prove the retired-colour rule; Keenan's own five colours are only read.

## 2026-11-01: M3 approved (Keenan)

**His answers to the six plan questions.**
1. Map position fallback: the phone's GPS only ("Use where I'm standing").
2. Tonight shows straight-line km between meetings, plus a Navigate link.
3. Outcome corrections are allowed until the fee is paid; the earning is voided or restored automatically.
4. Bookings open 14 days ahead.
5. Keenan's own leads follow the same Before you book rules.
6. The owner test session stays view-only.

**His changes.**
- **No double booking is a hard rule**, his top priority for M3. A time is claimed the moment someone starts booking it: a hold, shown to everyone else with the holder's initials within a few seconds, that ends on book, back out or another pick, and lets go after a grace period (2 minutes, in Settings) when the holder's screen stops checking in. One hold per person. Booking takes the caller's own hold or a free time, never someone else's. Enforced in the database under the same lock as booking, tested hard, and written into CLAUDE.md.
- **Time picker** opens on tonight, or on the next evening with an opening when tonight is full; any evening in the window is one tap away.
- **Setter Home rebuilt for the door**: tonight's open times, my bookings, the knock session, follow-ups due; no role line under the greeting. The owner's Home keeps its greeting.
- **New lead**: "Hold a time" near the top, and "Save and book" books the held time.
- **The booking fee goes to the lead's assigned setter**, recorded on the meeting at booking, whoever picked the time. Leads assigned to the owner earn nothing. M5 commission follows the same rule.
- **Move and cancel**: setters on their own upcoming bookings until the time starts, the owner on any. Cancelling sends the lead to Follow up for the next day.
- **Cutoff**: setters can hold, book or move into a time until 30 minutes before it starts (in Settings); the owner until it starts.
- **Meeting host** is its own column, Keenan for now, not tied to the owner role.
- **Backlog**: notify Keenan on his phone when a booking for today is made, moved or cancelled.
- **Door guide wording stays.** The 45-minute slot includes the drive, so "a half-hour meeting" is right.

**Build design calls.**
- **The database is the single authority for times.** One SQL function computes the schedule board (every time in the window with its state: open, held, booked, blocked or closed), and the hold, book, move and cancel functions check the same rules again under the lock. The screens only display what it returns. Postgres's `America/Edmonton` rules handle daylight saving, and the tests check both change days.
- **Holds are rows stamped when they end** (`released_at` and a reason), never erased. Partial unique indexes on the active ones make "one hold per time" and "one hold per person" hard limits, and no migration or function needs destructive SQL.
- **The lock** is a transaction lock per host and Calgary evening, taken by every hold, booking, move and cancel; a move takes both evenings in a fixed order.
- **Live updates by polling.** Screens showing the board read it every 3 seconds while visible and at once when the phone wakes; the holder's screen checks in every 20 seconds. Supabase Realtime could replace the polling later (backlog).
- **Writes only through server actions, holds included**, so View as stays read only. The board is a read, straight from the database. Opening a page never places a hold; only a tap does.
- **A move creates a new meeting** at the new time and marks the old one Moved, linked by `rebooked_as`, so Schedule and Tonight can show what changed.
- **"Own bookings"** for move and cancel means bookings on leads the setter may edit, the same rule as booking.
- **The booking window** is tonight plus the next 14 evenings, kept in Settings next to the cutoff and the grace period.
- **Meeting host.** `settings.meeting_host_id` names the host (Keenan; empty means the owner), and `profiles.hosts_meetings` marks who may host. The database tests book against a throwaway test host of their own, so their races never touch Keenan's real evenings. The live walk-through has to use Keenan's board; it holds and books only on the last evening of the window, under test names, and cleans up.
- **GPS fallback.** `leads.position_source` (picked or device) and `position_accuracy_m`. A device position must be accurate to 50 m or better and inside the Calgary area. The app warns when another lead is within 25 m, so two setters don't add the same new house twice.
- **Not qualified reasons** use the spec's wording, with Other asking for text.
- **Meetings have no write policies.** Sales and the owner write them only through the booking functions, so Before you book and the hold rules cannot be skipped. This tightens the data model's earlier direct-insert rule.
- **Outcome corrections** change the lead's status only when the meeting is the lead's latest and the lead has not moved past Met. A restored fee keeps the rate it was first calculated at.
- **What the walk-through cannot reach.** The owner test session is view-only, so Keenan's outcome buttons, Mark paid, time blocks and a booking he makes for a setter's lead are walked up to the save and proven in the database tests, with the service role standing in for him.

## 2026-11-01: Alberta Time (UTC-6 all year)

**What changed.** Alberta stopped changing its clocks on November 1, 2026 at 2:00 am: it stays on UTC-6 year-round. It became law on June 18, 2026 and is in the IANA time zone data from release 2026c, where `America/Edmonton` keeps UTC-6 from that moment on.

**Why it matters here.** Supabase's Postgres (17.11) already has 2026c, so the database works out meeting times correctly. Node's built-in time zone data in this build environment is 2025b, which still falls back to UTC-7. Any server or phone with data that old would show every time from today an hour early, including meeting times, and would roll "today" over an hour late.

**The call.** The app's time helpers (`lib/time.ts`) use the `America/Edmonton` rules for moments before 2026-11-01 08:00 UTC and a fixed UTC-6 zone from then on. That agrees with the database and with any up-to-date device, whatever data the device has. The unit tests check both sides of the change, and the database tests check the meeting times the database works out. If Alberta ever changes again, this is the one place to update.

**Found while building M3.** A database test expecting the old fall-back caught it. The earlier unit tests encoded the old rule and are corrected.

## 2026-11-01: M3 as built

**Holds on screen.**
- The time picker re-reads the board from the database every 3 seconds while the screen is visible, and at once when the phone wakes or comes back online. In the two-browser walk-through the other phone showed a hold in 0.3 to 1.5 seconds and a released or booked time in up to 2.3 seconds.
- The hold keeper in the app layout checks in every 20 seconds and lets the hold go when the person leaves the booking screens (Book a meeting and New lead). It learns about a hold from the booking screen itself, after the move there, so a hold made on Schedule or Home is never let go on the way.
- Opening a page never places a hold; only a tap does. View as turns the keeper off.

**Booking screens.**
- Booking starts from a tapped time or from a lead. With a time and no lead it lists the person's New and Follow up leads, plus "Add a new lead and book it".
- The booking screen says whether the person holds the time, with Pick another time and Let go. If the hold lapsed, it offers Hold this time again.
- On New lead, the Cancel button became an X so Save lead and Save and book fit side by side on a phone.

**What shows where.**
- Setter Home's My bookings shows live bookings and tonight's results; moved and cancelled ones drop off there but stay on My pay as "No fee" lines, and on Keenan's Tonight and Schedule, muted.
- Keenan's Schedule follows the evening he picks (`?day=`) and lists that evening's bookings in full, with outcomes, Move, Cancel and time blocks (one time, or the whole evening).

**GPS fallback.** "Use where I'm standing" shows on New lead and Edit lead whenever the address isn't picked from the suggestions, and on a lead page with no map position. A phone position isn't dropped by editing the typed address; picking a suggestion replaces it. The app warns when another lead is within 25 m.

**Keenan's template.** His live Settings say a 5:00 pm start with six 35-minute slots, not the 6:00 pm, 45-minute defaults. The app follows Settings; flagged in the report in case the 35 minutes isn't meant (his note said 45 minutes, drive included).

**Supabase's security advisor after M3.** It lists the thirteen booking functions (holds, booking, move, cancel, outcomes, pay, time blocks, the board and the two read-only time checks) as callable by signed-in users. That is the design: each one checks who is calling, and they are the only way to write holds, meetings, earnings and time blocks. The internal helpers they use are not callable. Accepted, like the role helpers and public views before them.

## 2026-11-02: A secret key in the public JavaScript, and the build check

**What happened.**
- Checking production after M3 found a Supabase secret key in the JavaScript every visitor downloads. Vercel's `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` held a secret key instead of the publishable one.
- It surfaced because M3's live schedule board is the first thing that reads the database straight from the phone, and Supabase refuses a secret key from a browser. The app's servers had used the same key since the first sign-in on production, on 2026-10-26.

**What Keenan did.**
- Made a new secret key and deleted the exposed one.
- Set the publishable key in `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and the new secret key in `SUPABASE_SERVICE_ROLE_KEY`, for Production and Preview.
- Redeployed.

**What the logs show.** Supabase's request log covers the project's whole life, from 2026-10-25.
- The exposed key was used 4,910 times, from 2026-10-26 to 2026-11-01, every time by the app's own servers on Vercel or by the test browsers.
- Every request that read or changed data carried a signed-in person's token, so the usual rules applied. None used the key's admin powers.
- No account, setting or record changed except through the app, by Keenan or by the tests.
- Nothing has used the key since it was deleted.

**The call.**
- `next.config.ts` runs a check (`lib/public-env-guard.ts`) that refuses to build, or to start the dev server, when any `NEXT_PUBLIC_` value is a Supabase secret key. Keenan approved it for keys starting `sb_secret_`.
- It also catches the legacy service_role key, a JWT with the role `service_role`. That is the same mistake in the older key format, which this project still accepts; the test environment uses one. My call.
- The error names the variable and never prints the value. It also says to delete the key in Supabase if it was ever deployed.
- Unit tests cover the check, including that `next.config.ts` refuses to load. A real build was shown to stop within seconds with a made-up secret key in a public variable, set either in the environment or in a local env file.
- The rule is in CLAUDE.md (rule 6), `.env.example` and `docs/05-supabase-setup.md`.

## 2026-11-02: The secret key incident is closed

Keenan confirmed everything the check asked about was him:
- his three password sign-ins (2026-10-26, 2026-10-28 and 2026-11-01);
- the two Springbank knock sessions on his account;
- the one sign-in to keenancudi@gmail.com.

Nothing else in the logs pointed anywhere else, so the incident is closed. Vercel's own request logs aren't needed, and the Vercel connection stays off.

## 2026-11-02: Meeting times in Settings are Keenan's choice

Whatever Settings says about the meeting template (start, length, number, days) is Keenan's choice. Reports stop flagging it. The 5:00 pm, 35-minute note under "M3 as built" stays as history.

## 2026-11-02: M3.5, the booking sheet and Schedule redesign, before M4

Keenan tried M3: every rule is right, but the screens don't follow how a setter works at a door. M4 is on hold until M3.5 is done.

**What stays exactly as it is.** Holds, no double booking, Before you book, pay and every existing test.

**Approved schema additions, all additive:**
- the Looked into it before column on leads, with its own answers;
- the per-step notes in Settings;
- a table for day-specific schedules.

**The impeccable design skill** (github.com/pbakaus/impeccable, Apache 2.0) is in `.claude/skills/impeccable`, with its license and notice, so every session has it. Its hooks are not installed.
- Its init and document steps were answered from CLAUDE.md and docs/ instead of an interview, as Keenan asked. They wrote `PRODUCT.md` and `DESIGN.md` at the repository root.
- CLAUDE.md's design rules win over anything it suggests.
- Its critique scores for the booking flow and the Schedule page are recorded before and after the redesign, below.

**Judgment calls, made before building:**
- **When the sheet saves the lead.**
  - A lead needs a first name and an address in the database, so the sheet saves it the moment it has both: when the setter leaves the address screen in After the door.
  - Before that, what was entered lives on the phone, and survives a reload.
  - After that, each screen saves as the setter goes, and photos attach to the lead as they upload.
  - Letting go after that point keeps the lead as New.
- **Let go asks first.** It is one small button next to the Back button, and the customer's time depends on it, so it asks "Let go of 7:30 pm?" and says whether the person is already saved.
- **One sheet for every booking.**
  - From Schedule or Home, tapping a time opens the sheet on the steps.
  - From New lead's Save and book and the lead page's Book a meeting, the sheet opens on the times first, then skips every screen that is already filled in.
  - Moving a booking uses the same sheet: pick the new time, then Move.
  - The old Book a meeting page sends old links to Schedule. New lead loses its "Hold a time" button; the sheet holds the time now.
- **A reload doesn't lose the booking.** If the phone reloads the app while the sheet is open (iPhones sometimes do after the camera), the sheet comes back on the same screen, as long as the time is still the person's.
- **Day schedules are per meeting host and per evening.**
  - "Just this day" gives that evening its own start, length and number of meetings.
  - "All days" updates the defaults in Settings and drops that evening's own schedule. Other evenings Keenan set on their own keep their times, and the pop-up names them.
  - An evening with its own schedule can go back to the usual times.
  - A day schedule can also open an evening that isn't one of the usual meeting days.
- **Bookings that no longer line up.**
  - A booked meeting stays at its time, and the board shows it there.
  - Times on the new template that overlap it are left off the board, so Keenan is never booked into two meetings at once.
  - A hold on a time that disappears lets go at once, so the setter isn't stuck on a time that can't be booked; the pop-up warns about holds as well as bookings.
- **The "?" notes.** Three notes, one each for At the door, After the door and Book. The old Door guide text stays in the database, unused. New lead shows the same notes behind a "?" where the Door guide card was.
- **View as.** The sheet starts with a hold, which is a write, so it can't open while viewing; the times stay disabled there, as in M3. Everything the sheet adds to the lead page, the lead form and Schedule shows in View as exactly as the person sees it.

## 2026-11-02: M3.5 as built

**Judgment calls made while building and polishing:**
- **Keenan's Schedule opens on tonight** whenever tonight has meetings, so his own evening is the first thing he sees. Setters still open on the first evening with an open time.
- **Times keep the app's Canadian style**, "7:30 p.m.", so the done screen reads "Booked for 7:30 p.m. tonight." Tomorrow's times say "tomorrow", as the evening strip does.
- **A day change that drops a held time** releases the hold with the existing reason `released`. Adding a new reason would mean replacing the check constraint, a drop, which wasn't asked for.
- **Chosen things are light, not gold.** A chosen answer and the evening on screen are marked in Night Text with a tick or an outline. Gold stays on the next action: the primary button, open times and the held time (DESIGN.md, the Porch Light Rule).
- **Keenan can tap booked and blocked times.** A booked one takes him to its card and lights it up; a blocked one opens Unblock.
- **Escape in the address field** closes the suggestions, not the sheet.
- **The board shows every booked meeting at its own time and length** (migration 20261102051654, the function only).
  - The critique found that after a day change to longer meetings, a booking that still lined up could drop off the board.
  - Booking, holds and the double-booking checks never read the board, so no double booking was ever possible. Only the display was wrong.
  - A new database test proves the fix.
- **Block time's "whole evening" blocks every open time.** It writes one block for each run of back-to-back open times. Booked and held times are never part of a block, so the database never refuses it, and the button says what it blocks.
- **The pencil pop-up asks before All days, and can do nothing.**
  - Cancel is there.
  - Just this day and All days stay off until something changes and the bookings have been checked.
  - It shows the evening as setters will see it, with a one-line summary by the buttons.
- **The sheet comes back after a reload even if the hold let go**, when anything was typed. It says the hold let go and offers it again when it is still free. This goes beyond the M3.5 rule, which covered a held time only, because losing what was typed at the door costs more than the extra screen.
- **The screen stays on while a time is held** (the browser's Screen Wake Lock, where the phone has it), so a phone that would lock mid-conversation doesn't let the hold lapse.
- **Let go moved to the left, above Back.** A slip near Next can then only pick another time, which keeps the hold. Its confirmation puts "Keep holding" where Next was. It also offers "Let go and open their lead to set a follow-up day", or "Add the address to save them first" when the person isn't saved yet.
- **An answer that rules out booking says so at once.** Owns the home: No and Wants a price: Not yet each get a line under the question. At Book they show as answers with "Change answer", not as missing items.
- **Field and checkbox edges reach 3:1 in both themes** (WCAG 1.4.11). Night Input changes from #2f4958 to #5e7a8a and Day Input from #c7d0d6 to #7d8f9b. The contrast test now checks edges as well as text.
- **On an iPad in landscape, Keenan's Schedule has two panes**: the board on the left, held in place, and the evening's bookings on the right.

**Critique method.** Nielsen's 10 heuristics, out of 40. Two isolated reviewers scored, without seeing each other or the detector, and two isolated detector runs checked the code and the rendered pages. The critique step that asks the user which issues to fix was skipped (Questions skipped: Keenan's brief set direction and scope: critique, adapt, clarify and polish before merging).

**Scores** (snapshots in `.impeccable/critique/`):

| Surface | Before M3.5 | After the build | Final, after the critique fixes |
|---|---|---|---|
| Booking flow | 23/40, Acceptable | 29/40, Good | 31/40, Good |
| Schedule page | 26/40, Acceptable | 27/40, Acceptable | 31/40, Good |

The detector found no problems in the source either time. In the rendered pages it found one advisory on the final round (a word left alone on a line in a meeting card), which was fixed.

**Fixed after the final scoring**, from the final reviews:
- **Booking sheet bugs:**
  - Back and Pick another time lost a typed address.
  - Book could do nothing for a person who wasn't saved yet.
  - A taken time showed two notices.
  - Let go during a Move had the wrong message.
- **Booking sheet checks:**
  - The phone is now checked at the door.
  - Picking an address runs New lead's existing-lead check.
  - The chip says when there's no signal to check the hold.
- **Booking sheet layout:**
  - An existing lead's Find out 2 of 2 no longer scrolls.
  - The Book checklist follows the screens' order.
- **Schedule:**
  - The times pop-up names holds that will let go.
  - "Use the usual times" asks first.
  - A time no longer splits from its "p.m." across lines.
- **Light theme:** the New lead tab label is navy, because gold text on white is 2.9:1.

The final scores were measured before these fixes.

**Left for later**, in the backlog: the iPad homeowner half, Undo after a day change, marks on the evening strip, the distance warning at time pick, and Move offered on an already-booked lead.

## 2026-11-02: Supabase SQL runs without a prompt (Keenan)

Keenan asked for SQL changes to be accepted automatically. `.claude/settings.json` (committed, so every session has it) allows the two Supabase tools that run SQL, `execute_sql` and `apply_migration`, without a permission prompt. The rules in CLAUDE.md are unchanged:
- every database change is still a migration file;
- no destructive SQL (drop, delete, truncate) goes through the connector;
- a migration that truly has to drop or delete still waits for Keenan at the screen.

## 2026-11-02: M5 Meeting Mode in two takes, ahead of M4 (Keenan)

Keenan's first meeting is the evening of 2026-11-03, so Meeting Mode comes before M4, in two takes. Take 1 (approved up front, including its pricing and schema changes, no plan approval needed) ships on a preview link by 9 am Calgary: the presentation, This house and the live quote builder, with uploads working so Keenan can load photos in the morning. Take 2, after his first meetings: the leave-behind folder, accepting with the 5% commission, the quote-ready rule and a deeper design pass. He brings printed materials until then.

**The review flow changed (replaces merge on green).** Run the full suite, push the branch, and report with a clickable Vercel preview link first (previews lose their login wall). Keenan looks on the iPad and gives feedback; only "push the changes" merges to main. No test checklists for him. Also standing from today: every milestone with new or changed screens uses the impeccable skill, shape before building, critique and polish before the preview, scores in the report.

**The short plan for take 1** (build straight through):
- **Schema, one additive migration:** `photo_slot` gains `mockup`; `event_type` gains `colour_confirmed`; settings gain `rush_colour_fee_per_ft` (null = unset), `service_call_fee` (null = unset), `quote_valid_days` (14), `faq_text`; the exact warranty wording, the company contact and the six reshaped presentation pages are seeded; the `quote_status` enum and the `quotes` table from the data model (owner-only RLS, plus `colour_timing` and `rush_fee_per_ft`); leads gain `track_colour_initials` and `track_colour_initialled_at` under the same owner-only guard as the track colour; a private `presentation` storage bucket, owner-managed.
- **Code:** `lib/pricing.ts` (pure, unit-tested); owner actions for the quote draft, the initials, the presentation text and images, and the mockup; `/meeting/[leadId]` full screen outside the app chrome, with the proxy extended so /meeting is signed-in only and read-only under View as; a service worker (new; caching only) so images and the meeting document survive weak signal; Settings gains the presentation editor and the new fields; Meeting mode buttons on Tonight's cards and the lead page.
- **Tests:** pricing unit tests; an RLS file proving sales can never read or write quotes or set initials; the smoke test covers /meeting's sign-in redirect; every existing suite stays green.
- **Risks, named:** offline is "opened once with signal keeps working", not a full offline app; Safari must be the judge of the service worker, so the preview is the real test; the morning depends on Keenan's uploads, so empty pages are skipped by design.

**Judgment calls:**
- **Presentation lives in `settings.presentation`** (the jsonb that existed since M1), reshaped to six pages with a `kind` each. Images only where they carry the page: Hidden by day (day and night) and the gallery; the other pages are text. The M1 seed pages that meeting mode now covers elsewhere (price, payment, neighbours) are folded into the six; the quote is its own screen, not a presentation page.
- **Seed text is plain and claim-free**: no durations, counts or stats, nothing we can't back. The drafts are marked as drafts in Settings, never on the customer-facing screen, because tomorrow they may show unedited.
- **The warranty page** renders `settings.warranty_text` exactly; the service call amount shows under it only when `service_call_fee` is set, so the text itself never holds a stale number.
- **The mockup is a lead photo** in the existing bucket, slot `mockup`, one per lead (a new upload takes the slot, the old one stays as an extra, like every slot). Owner uploads it from the lead page.
- **Initials live on the lead** (latest, with the moment) and every confirmation writes a `colour_confirmed` event, so the timeline shows it happened at each meeting. The guard that lets only the owner set the track colour covers the initials columns too. Initials are not secret (no dollars), so the event is safe for the team to read.
- **One draft quote per lead**, reused on each save; totals are stored per the data model, and always recomputed by `lib/pricing.ts` for display. Status stays `draft` in take 1.
- **Colour timing on the quote**: `stock` (included), `factory_order` (included, spring), `rush` (fee per foot times total feet). Rush is offered only when the fee is set. A lead with no track colour yet can still get a draft; the colour screen says the colour is still to be set and the initials wait.
- **Meeting mode is always dark navy**, whatever the device theme: it is the brand at dusk, and the customer sees it.
- **Offline shape:** everything the meeting needs is loaded with the page and kept client-side; the draft and the screen state live in localStorage per lead (like the booking sheet); the new service worker caches hashed assets and the presentation and mockup images (ignoring the signed-URL query, so a re-signed URL still hits the cache) and keeps the last copy of the meeting document for reloads. Writes stay online-only: a failed save keeps everything and says "No signal".
- **The service worker is new** (none existed; M0 shipped only the manifest). It caches, never queues writes, and registers in production builds only.
- **Take 1's design pass is one round**: shape first, one dual-reviewer critique with scores on the built screens, polish, then the preview. The full before-and-after pass lands in take 2, as Keenan asked.
- **Dates a customer reads are written out** ("November 16, 2026", `formatFullDate`), never raw YYYY-MM-DD; the quote's valid-until line uses it.
- **Meeting mode's timeline events come from the database** (migration `20261102092840_m5_meeting_events`). The first build wrote `quote_created` and `colour_confirmed` from the app, but `lead_events` only takes notes from people (every other event is written by a trigger), so those inserts were refused and nothing showed. Found while checking the acceptance criteria against the policies, before any meeting. Two additive triggers now write them: `quote_created` with the quote's id only, and `colour_confirmed` with the initials and the colour by name as it stood at that moment, so the timeline says which colour was confirmed. The actions no longer try.
- **The colour can be chosen or changed inside meeting mode.** The colour screen's "Change the colour" opens the lead page's own track colour form full screen, so the owner-only rule, the active list and the RAL Classic check are the same ones, enforced the same way; nothing new in the database. Without it, settling a colour at the table meant leaving through the X onto the lead page, with its notes and names, in front of the customer. A changed colour asks for initials again (the old initials stay on the lead until new ones are recorded, and every confirmation's event names its colour) and moves the quote's colour line to match.
- **Fresh start, or resume.** Tonight and the lead page open `/meeting/<lead>#start`, and the deck starts at the cover; the deck then drops the `#start`, so a reload mid-meeting resumes on the same screen (within 3 hours) with the quote as typed. The service worker's copy is the same either way: the cache ignores the fragment.
- **The way out takes two taps** ("Tap again to leave"), so a brushed corner never shows the lead page to the customer.
- **A fresh quote shows no price** until something is measured ("Adds up here as we measure."), instead of the control box alone as the price. The bill sits high in its column, clear of the iPad's keyboard, and its label is Total; the page heading says Your price.
- **Meeting photos keep 3200 px** on the long edge (presentation photos and mockups; setter photos stay at 1600), because meeting mode fills a screen 2388 px wide and the mockup zooms to 2.2 times. Both buckets allow 10 MB.
- **What the walk-through cannot do: save as Keenan.** The owner's one-time session only views (rule 10), so the meeting-mode walk-through types a quote and initials but never taps Save or Confirm, and refuses a bad RAL number before anything saves. What covers the save path instead: the database tests prove the quote and initials rules and the two triggers; the actions use the same owner check as every other owner action; and the first save will be Keenan's own, at the first meeting.
- **Design scores, take 1.** One critique round on the built screens: 28/40 (first reviewer, before polish). A fresh reviewer, who did not see that round, scored the polished build 25/40 and found mostly different problems; its three P0s and the cheap P1s were then fixed, and the same reviewer re-scored the final build 28/40 with no P0s left. Different reviewers calibrate differently, so 28 then 25 is not a before and after of the same eye; 25 then 28 is. One slip from the final review was closed before the preview: in meeting mode the colour chooser cannot save "no colour" when a customer taps the chosen colour to agree with it. The rest of its list is in the backlog for take 2. The seeded "colour matched to your soffit" lines stay as Keenan's drafts to edit; "an investment in your home" is the spec's own wording.
- **The meeting-mode screenshot shoot** stages photos the same way every live test stages data: it saves `settings.presentation` first (to a backup file and in memory), points the two image slots at test files, and restores the row exactly afterwards, verified by comparison; its lead, photos and files are test-named and removed in the same cleanup. The owner session it uses stays view-only: it types into client-side fields but never taps Save or Confirm.

## 2026-11-02: The Meetings page, merged on green (Keenan)

Keenan asked for a Meetings item in the owner's navigation, meeting mode's own home, and approved merging it on green straight to live, without the preview step, because his first meeting is that evening. Rule 13's preview flow stays the default; this is a one-time approval for this change.

- **Navigation.** Meetings goes right after Schedule, as he asked. Six items do crowd a phone's tab bar: at 375 to 390 px each column is 62 to 65 px wide and the gold New lead button is 64 px with its ring, so it would touch its neighbours. So Admin became a small gear in the header (owner only, marked when an Admin page is open), as his request allowed, and the rail and the bar keep the same five items: Home, Schedule, Meetings, New lead, Leads. New lead keeps its gold button but is no longer exactly in the centre, since Keenan put Meetings right after Schedule; CLAUDE.md now says "the prominent gold button".
- **Whose meetings.** Every live meeting shows, in time order, with the host's name only when it isn't the person looking. Keenan is the only host today; showing everyone also keeps test meetings off his own evening.
- **Flags.** No mockup and no track colour each show on the meeting, with a link to the lead page where both are fixed.
- **Start a meeting.** Search uses the Leads search (names, address, neighbourhood, phone digits), every lead, newest first, eight at most. A new person is a lead like any other, saved with the same checks as New lead, as New, with source Other (changeable on the lead page), then meeting mode opens with a full page load so the iPad keeps it.
- **Get tonight ready** does in the page what opening each meeting once would do: it fetches each of tonight's meeting pages, then every script, style, font and photo the page names, and puts them in the same caches the service worker reads when there is no signal. A meeting counts as saved only when its page and every one of those files are in the caches; the time shown is when the page was fetched. The cache names live in `lib/offline.ts` and a unit test keeps them equal to `public/sw.js`. On an iPad, the home-screen app and Safari keep separate storage, so it saves for whichever of the two it is tapped in.
- **Testing without writing as Keenan.** The walk-through stages tonight's and an upcoming meeting for a throwaway host, never in Keenan's evening, checks the order and the flags, searches, has the new-person form refused before anything saves, runs Get tonight ready on its own second server, stops that server, and opens a meeting that was never opened on that device.
- **Design review.** Two dual reviews. The first build scored 27/40 (Acceptable), with two P0s, both about working without signal: a save that went stale when a flag was fixed afterwards, and saved meetings unreachable once the app reloaded without signal. Both were fixed, along with the cheap P1s. The service worker now also keeps the Meetings page and sends any app page that can't load without signal to it. The polished build scored 32/40 (Good), no P0s; of its two P1s, the summary claiming "opens without signal" before the Meetings page itself was saved was fixed, and Safari without signal can't be reached here (WebKit isn't installed in the cloud environment), so the report names it. Records are in `.impeccable/critique/`.
- **For Keenan's OK:** New lead keeps its gold button but is no longer exactly in the centre of the owner's bar, because he placed Meetings right after Schedule. If he'd rather keep it centred, the owner's order would be Home, Schedule, New lead, Meetings, Leads.

## 2026-11-02: Focus, and the customer quote link take 1 (Keenan)

**Focus.** Keenan set the app's fundamentals to three things: the setter sessions (knocking, leads and booking), the sales meetings (meeting mode on the iPad) and the shareable quote link. M4 (pipeline board), M6 (sales dashboard), M7 (website lead form and daily email) and the backlog are parked until he says otherwise, recorded in CLAUDE.md, the roadmap and the backlog. The spec's "public quote links are V2" line is replaced by this milestone.

**The quote link, take 1: the plan.** Keenan approved take 1's scope, decisions, pricing and schema changes up front and asked for it straight through, so Todd Dean can get his link soon. The plan:
- **Schema (additive).** `quote_links` (owner-only: the token, the lead, who made it, visits, the customer's selection, Book my install, revoked); `push_subscriptions` (each member's own devices, stored sealed); `settings.min_job_total` and `quotes.min_job_total` (empty by default); four event types (`quote_link_created`, `quote_link_opened`, `quote_link_revoked`, `install_requested`); token functions for the page; one storage rule for the mockup. Extra-work lines gain an `upper_only` flag inside `quotes.adders`.
- **Files.** `lib/pricing.ts` (selection, upper-only, minimum), `lib/quote-link/` (customer view, links, option names), `lib/push/` (sealing, sending), `app/q/[token]/` (the customer's page and its actions), the lead page's Quote card and Send sheet, Settings (minimum job total, notifications), the quote builder's "only with upper runs", `proxy.ts` (quote host), `public/sw.js` (push), tests.
- **Risks.** Storage passing the token header to its policy (proven by a database test before anything relies on it); iPhone and iPad push needs the app on the home screen (iOS 16.4 or later) and permission from a tap; previews share the production database, so a link made while Keenan reviews the preview is real and keeps working after the merge.

Judgment calls:
- **The link.** `/q/<token>`, 24 characters from 18 random bytes (144 bits), made in the database. The link belongs to the lead and shows the lead's latest quote, so updating the quote updates the same link. Unknown, revoked and out-of-date links all show the same expired screen, with no name and no prices.
- **Their selection** is stored as the positions of the runs they switched on, with a fingerprint of the runs at that moment. If Keenan changes the runs, an old selection no longer fits and the page goes back to the Recommended package. The option is named in words: "Recommended package" or "Start smaller: Front, Garage". Never a price.
- **No secret key in a customer's request (CLAUDE.md).** The page reads and writes only through token functions with the publishable key. The mockup is signed by the same key under a storage rule that lets a request carrying a live token sign that quote's mockup and nothing else, for ten minutes. The push needs Keenan's device addresses, which are his: they are stored sealed with a key derived from the server's push key, the booking function hands them to the server sealed, and only the server can open them, so no secret key runs and nothing readable leaves the database.
- **Who is notified.** The person who made the link, which is always Keenan in the app. Repeated taps on the same option don't notify again; a new option does.
- **Push keys.** Two environment variables, `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` (`VAPID_SUBJECT` is optional and defaults to mailto:info@vesperlighting.ca). Settings has a Make the keys helper that creates the pair on Keenan's own device for him to paste into Vercel, so no key passes through a chat or a third-party site.
- **Visits** are counted by the page after it opens, with no IP address or device details stored. Visits from a signed-in member on the same address don't count; on quote.vesperlighting.ca Keenan's app sign-in doesn't carry over, so the lead page's Preview opens the app-address copy.
- **The minimum job total** is copied onto each quote when it is saved, like every other price, and meeting mode shows the same minimum line, so the table and the link always agree.
- **Look.** The customer's page is always white with a navy header and gold for Book my install, like the documents take 2 brings.
- **Testing.** The owner's one-time session can't make or turn off a link (both write), so those are proven in database tests with the service role standing in for the owner. The live walk-through stages a link made by a throwaway account, so its push goes to a test address and never to Keenan's phone, drives the customer's page at phone size, and has the owner's session look at the lead's card.
- **Design review.** A dual review on the first build: 27/40 (Acceptable), no P0s, two P1s, both about Book my install: it booked in one tap with the reassurance only after the tap, and after booking the page forgot or contradicted the booking. Both were fixed with the P2s and the cheap minor items. The polished build re-scored 30/40 (Good), no P0s or P1s; its remaining P2s (the minimum line read as the minimum itself, keyboard focus hard to see) and most P3s were fixed before the preview. Records are in `.impeccable/critique/`.
- **Book my install asks once.** A tap opens "Book your install?" with the choice, the total and "There's nothing to sign or pay today", then Not yet or Yes, book my install. It is the one step Keenan's brief didn't name; it stops a thumb on a long page from booking (and from sending Keenan a notice) by accident. Once booked, the bar says "Install requested" and offers Update my choice only when the switches change.
- **The page opens at the Recommended package**, not at whatever someone last switched, because the link can be opened on more than one phone. Their switching is still saved, for Keenan's card ("Looking at ..."). Once they've booked, the page opens at what they booked.
- **Text it to [name].** The Send sheet adds a button that opens Keenan's own Messages to the customer's number with the text filled in; he still taps send. Nothing sends from the app.
- **For Keenan's call, not built:** an extra-work line can be marked "only with upper runs", but not "only with this run", so a "Garage corner" line stays when the garage is switched off. The service call fee isn't added beside the warranty on the link (meeting mode adds it when set). The track colour isn't on the page yet (take 2 documents).

## 2026-11-03: The setter side first (Keenan)

Keenan put the setter side ahead of M5 take 2: Zane and the other setters are about to use the app every night. Approved to merge on green; it changes no pay or booking rules.

**The plan.**
- **Polish.** One dual impeccable critique as a setter at phone size of Home, Leads, the lead page, New lead and My pay, run on a staged throwaway setter with a realistic evening; fixes with adapt, clarify and polish; a re-score after.
- **Schema (additive).** `profiles.welcome_done_at`; `finish_welcome()` for the setter's own row and `reset_welcome(profile_id)` for Keenan; `push_targets_for_member(profile_id)` and `push_devices_for_member(profile_id)`, owner only.
- **Files.** `/app/welcome` (the steps and the tour), `/app/notifications` (the setter's Notifications card), the bell in the header for setters, Reset welcome in People, the notices in the schedule actions, `lib/push/notices.ts` for the wording.
- **Risks.** Notifications need Keenan's VAPID keys in Vercel first; until then the card says notifications aren't set up yet. iPhone push needs the home-screen app. Setters already using the app see the welcome once too, since none of them has had it.

Judgment calls:
- **Where the welcome shows.** Home sends a setter whose welcome isn't done to it, so it appears on the first sign-in (sign-in lands on Home) and never interrupts a link they followed. Finishing or skipping stamps it done. A setter can still open it later from Notifications ("See the welcome again").
- **Who gets a notice, and how it's sent.** The setter recorded on the meeting (the one whose lead it is, who earns the fee), only when Keenan made the change and only when that person is a setter. Keenan's own action sends it: an owner-only function hands his server the setter's addresses sealed, so no secret key runs and nothing readable leaves the database. A setter's own moves and cancels send nothing.
- **What a notice says.** The street without the house number ("Aspen Crescent SW"); the fee only when the earning was actually added; a reason only from the fixed list (Not qualified reasons). A note Keenan types by hand, or an "Other" reason he wrote out, never goes on a lock screen: the notice says to see the booking instead.
- **On and off.** Per device: turning notifications off on a phone stops them there. Setters get one kind of notice today, so there is no list of kinds to choose from.
- **View as.** The welcome and Notifications render as the setter sees them, read only; the device list comes from the owner-only function, since Row Level Security keeps those rows to their owner.

Made while building (2026-11-03):
- **The welcome's frame.** It sits inside the app with the header kept (so View as's gold bar stays) and the tab bar stepping aside, as on the lead form; its own bar at the bottom has Back, then Next on the right, with Skip the welcome above. Shaped in `.impeccable/shape/2026-11-03__setter-welcome.md`.
- **Skip or Next.** The button on the right reads "Skip this step" until this phone has done the step, then "Next", so it never claims a step is done when it isn't. Each step reads the phone itself (opened from the home screen, location allowed, notifications on for this setter) rather than remembering a tap.
- **Leaving halfway.** Only Done or Skip the welcome marks it done. A setter who adds Vesper to the home screen and opens the new icon sees the welcome again there, and the first step then shows as done, which is the point: on iPhone, notifications only work from the icon. The iPhone steps say to sign in again if asked, since the home screen app can keep its own sign-in.
- **Steps are links.** Back and Next change the address (`?step=2`), so Keenan can page through the welcome with View as while every control that writes stays off. Viewing as a setter never sends him into their welcome from Home.
- **A shared phone.** If a phone's push address already belongs to another Vesper account, turning notifications on takes a fresh address for this person instead of taking over the other one; the old one goes quiet when the push service reports it gone.
- **View as on a device.** Keenan's browser is never the setter's phone, so View as shows the device part as a fresh setter sees it (not turned on) and lists the setter's own devices by name. The View as comparison test marks what a phone itself answers (`data-device`) and compares everything around it.
- **The reason on a lock screen.** A Not qualified notice names the reason only when it matches Settings' list word for word; anything else says the reason is on the lead.
- **The street.** House numbers and unit numbers go wherever they're written ("5-123", "#5", "Unit 5,", "... SW #5"); a numbered road keeps its number ("17 Avenue SW"). With nothing left, the notice just says "your booking".
- **Keenan's own.** His Notifications stay in Settings; the bell is for setters, and his /app/notifications opens Settings. The welcome is for setters only.

The setter screens' polish (2026-11-03), from the critique (27/40 before; record in `.impeccable/critique/`):
- **Home order.** The knock session comes first, since its counters are the evening's most tapped control; then tonight's open times, bookings and follow-ups. A lead saved while a setter is knocking returns Home to the counters ("Lead saved. On to the next door."); otherwise to Leads, as before. Bookings show from last night on, so a result Keenan marks the next morning is still on Home.
- **New lead's draft.** What is entered is kept on the phone (the fields, the answers and the guided photos already uploaded) and brought back after a reload, with Start over. It is saved while typing and whenever the phone hides the page (the camera, another app), never while the lead is being sent, and cleared on the page the save lands on, so a save that fails for want of signal keeps it. Extra photos aren't brought back; the notice says how many to add again. X asks before discarding anything entered.
- **Gold.** Chosen answers everywhere are light with a tick, like Find out; gold is only the next step. On a lead, Book a meeting is the one gold button; Call is plain.
- **The lead page.** It opens with what's next (the meeting, the follow-up day, why it was lost, or that Keenan takes it from here), lists Before you book with ticks on a lead that can be booked, then the meetings, Status and Notes, then the record (address, Find out, photos, house, track colour, timeline). A setter's own lead, booking and timeline entries say "you". Lost can't be saved until a reason is picked.
- **Pay.** A booking still to come reads "Fee if Qualified" (setters can't read the rate, so no amount); "Paid" is "Paid, all time"; earned fees get a tick.
- **Smaller things.** No cards inside cards; badges, list lines, photo hints and pay labels at 14 px; Sign out asks first, since setters can't reset their own password; doubled full stops after a time fixed, including meeting mode's initials line.
- **Not changed.** The gold edge of an open time in the light theme (about 2.9:1 on white) stays: the word Open carries it, and the colour is the brand's. The tab labels stay at their size. The "?" step notes stay on New lead and in the booking sheet; the welcome and its tour are the rest of the help.
- **After the re-score (29/40 for the five screens, 29/40 for the welcome and Notifications).** My pay's totals are rows with what each counts, so four-digit figures fit a phone; Before you book on a lead says what the lead says now and links to the fix; in Sign out, staying is the gold choice and setters are told to ask Keenan for their password; while searching, Leads offers Clear search instead of Active and All, and a search with no match in Mine offers everyone's leads; New is a neutral outline and Overdue is bold, not red (DESIGN.md keeps red for errors); blocked notifications say where to allow them, with Check again. Not done, with reasons in the critique record: a fixed bottom bar on the lead page, a bell that shows on or off, a one-tap Android install, a picture in the tour.

## 2026-11-03: Setter side, round 2, and View as (Keenan)

Keenan approved the scope: View as you can click through, the questions with Not collected, photos with Upload and example drawings, and the booking sheet's round 2. No pay rules change. Merge on green straight to live.

**The plan.**
- **Schema (additive).** `settings.hold_minutes` (5); the hold's timer reuses `slot_holds.renewed_at` (it lasts `hold_minutes` from there), so every booking function keeps its one live-hold test, `hold_grace()` now returns the hold length; `extend_hold()` and `hold_status()`; `renew_hold()` only reports. `leads.not_collected text[]` with a trigger that drops a question from it once it's answered; the unused `leads.both_decision_makers` becomes the "everyone who decides" question. `settings_public` gains `hold_minutes`.
- **View as.** The proxy lets server-action requests through while viewing, so each action's own guard refuses the write (every write action calls one; checked file by file), while any other request that isn't a read is still refused. Actions that only read (the sheet's lead, the setter's leads, duplicates, distance warnings) read as the viewed person. On the phone, a View as context acts out what needs a write to go on: holding a time and its timer, a photo (shown, not uploaded), a count. A final save says "View as: nothing was saved.", calmly. The disabled fieldset goes.
- **Files.** The booking sheet is rebuilt around a header with the wordmark and a time menu, six steps, swipe and a counter; New lead and Edit lead get Not collected and Mark the rest; photo slots get Upload and line drawings; the meeting card, the Meetings page and the lead page show "N of 8 collected"; Home gets the Unfinished list.
- **Risks.** The hold timer changes the most guarded rule in the app, so the race tests grow first. Click-through opens a path the proxy used to close, so the click-through test checks every table and the photo storage before and after.

Judgment calls:
- **What counts toward "N of 8".** The eight questions that take Not collected: phone, owns the home, wants a price, everyone who decides, Christmas lights now, looked into it before, which areas and timing. The soffit colour keeps its "Not sure" answer instead, isn't counted, and stays needed to book, not to save, so Mark the rest Not collected still finishes a lead in one tap.
- **Moving between steps.** Questions can be answered in any order, Back and the steps already reached are always open, and swiping right goes back. Next, and swiping left, finish a step, so they wait until every question on it has an answer; the step says what's left and offers Mark the rest Not collected.
- **The timer.** Add 5 minutes adds the hold length (5 minutes in Settings) to what's left, as often as needed; there is no cap, because each one is a tap. A run-out hold is taken back by the same button while the time is still free. The countdown counts from the server's own clock.
- **Drafts.** One per person being booked, on that phone, under the setter's own key; reopening one asks for a time first because leaving the sheet let the old one go. Booking that person clears it. View as keeps none.
- **Sign out while viewing.** It stays off: it would sign Keenan himself out. Exit is on the gold bar.
- **Push while viewing.** Turning notifications on says "View as: nothing was saved." without asking Keenan's browser for permission; his device isn't theirs.
Made while building (2026-11-03):
- **Not collected sits beside each question,** as a small dashed button on the question's own line, not as the last answer in its row (the shape brief's first idea). It is just as quiet, its touch area is still 44 px, and it saves a row per question: with it, every step of the sheet fits Keenan's iPhone 15 Pro Max (430 x 932) and a 390 x 844 phone without scrolling, as the installed app with the iPhone's safe areas. Four answers (Which areas) share one row, in smaller words below 420 px.
- **Next says what the step still needs** ("Add their name first", "Add the phone first", "Answer the rest first", "Add the address first", "Pick the soffit first", "Photos first") in an outline button, and tapping it goes to the first thing missing. A swipe to the left does the same. A swipe never books: Book is always a tap.
- **When the lead is saved from the sheet.** A new person once the address is in, as before; any lead only once every question has an answer or Not collected (a lead from before round 2 may still have open questions), so a save never fails on the rule.
- **Which drafts are kept.** A new person once anything is entered; a saved lead once a time was held for it or something changed. At most ten per phone, gone after 24 hours or once that person is booked.
- **A run-out time offered back is checked again every 5 seconds,** so "It's still free" never outlives someone else holding it; a run-out time someone else took offers no Hold it again or Add 5 minutes, only another time.
- **The sheet carries its own gold View as bar,** since the full-screen sheet covers the app's. Under View as, Home shows no Unfinished list (a setter with no drafts sees none, and the comparison test must match), and Allow location in the welcome never asks Keenan's phone.
- **The lead page's Find out list** shows the eight counted questions in the order they're asked, each answered, Not collected or Not answered, then the soffit colour, under "N of 8 collected. Not collected doesn't count."
- **The photo tiles** in the sheet are the Take photo buttons themselves (label, line drawing, "Take photo"); Upload sits in each tile's corner and opens the phone's photos, with no camera.
- **Testing the two sizes.** The walk-throughs run setter A at 430 x 932 and setter B at 390 x 844 with the safe areas added (59 or 47 px at the top, 34 at the bottom), and check every step for scrolling.

The round 2 polish (2026-11-03), from the critique (28/40 before; record in `.impeccable/critique/`):
- **Not collected says what it costs, at once.** On the door step, when Owns the home, Wants a price or Everyone who decides is Not collected (or No, or Not yet), a note under the questions says booking needs a Yes for them and how to follow up instead: a new person's steps are finished so they're saved, then the time is let go; a saved lead's time is let go and a follow-up day set on the lead. On the phone step, Not collected says the time can't be booked without a number. On New lead the same answers say the lead saves as a lead: Save lead turns gold and Save and book steps back. Mark the rest still marks every open question, the three included; the note shows the moment it does.
- **The house step.** The soffit colour moves from the photos to the address, on a step called "The house"; Photos is its own step with four large tiles. Still six steps.
- **Photo tiles.** "Take photo" is the tile's label, under the drawing; Upload is a quiet link in the corner and goes once the slot has its photo; a taken photo reads "Saved. Tap to retake".
- **The held time names its day** ("Tonight", "Tomorrow" or the date); the countdown is larger and in the body colour; Book names the day when it isn't tonight ("Book Tue 5:00 p.m."). A screen reader hears "Hold options for" and the time, not the ticking countdown.
- **The bottom bar.** A step that isn't finished shows a dashed outline button that says what's missing ("Fix 4 first" on Book); tapping it goes there and outlines the first open question for a moment. Next is outline, not gold, while the hold has run out. It's "Change time" everywhere.
- **Layout.** Everyone who decides in two columns; the Not collected chip clear of the answers; the four Which areas answers fit at 390. The time menu's shadow is the small one; the held time's border is 2 px.
- **Slow signal.** Holding, adding time, saving, booking and moving give up after 25 seconds with "That's taking too long. Check your signal and try again." (booking adds "If it booked, it shows on Schedule."). The times and the step notes say when they didn't load, with Try again.
- **Smaller things.** Unfinished says where a draft stopped ("Stopped at the photos, 3 minutes ago"), not "step 6 of 6"; the house step's GPS line says "At the house:"; a swipe no longer raises the keyboard; the address suggestions close once the phone's position is taken; card descriptions no longer leave one word on a line.
- **Not changed.** The countdown stays in the header in front of the homeowner, as Keenan asked; drafts have no remove button, since they go after 24 hours as Keenan set; text doesn't follow the iPhone's Larger Text setting (app wide, not this round); Sign out stays beside the bell (the app header, not this round); Back on the first step stays, disabled.
- **After the re-score (31/40, up from 28; one P1).** A fresh reviewer, who didn't see the first round, found one P1: a person who can't be booked could only be kept by holding a time through two or three more screens. Changed:
  - **Keep as a lead.** Wherever an answer rules booking out (the phone, the door, Book), the note offers Keep as a lead as the one gold button, and Next steps back to an outline; it still works, for when they go to get the number. It lets the time go at once. A new person carries on in New lead, with everything entered handed over in New lead's own draft, and New lead says "Kept as a lead, and the time is free again." A saved lead has its changes saved (or, for a lead from before round 2 with questions still open, kept in Unfinished, as Let go does) and opens on its page, where the follow-up day is set. A draft reopened from Unfinished whose answers rule booking out offers "Keep as a lead instead" above the times. Under View as nothing is let go or saved, and New lead gets the person in memory only. New lead itself keeps no draft on the device while Keenan views as someone, like the sheet.
  - **The first step's corner.** Let go takes the place of a Back with nowhere to go, and asks first, like the time menu's Let go.
  - **What Next says.** Photos count down ("Take the photos first", "2 more photos first", "1 more photo first", "Add the reason first"); Book says "Can't book yet" while an answer rules it out (the homeowner said it, so it isn't a fix), and "Fix 2 first" otherwise.
  - **Answers.** The tick runs in the words' own line, so choosing "Front and sides" no longer pushes its words onto a third line and the row below down. A question sits closer to its own answers and further from the next.
  - **Photo tiles.** Bigger drawings (48 px at 390, 56 at 430), a shorter Take photo line, and on a wide phone a few words for the angle ("Straight on", "From the front left", "From the front right", "Optional, for its colour"); the one-line hint is "Hold it sideways. At night, hold still."
  - **Smaller things.** The soffit hint asks "Look closely: white or off-white?"; the lead page's Find out answers sit in two even columns on a phone, so "(403) 555-0166" and "Not collected" stay on one line; the step notes' starting text follows round 2's steps (a migration changes only a note still at its first starting text, so anything Keenan writes stays his).
  - **View as.** The sheet's slim gold strip says "Viewing as [name]. Read only." with Exit, like the app's bar; "View as: nothing was saved.", and any error, shows just above the bottom bar, next to the button that was tapped; Home says Unfinished bookings stay on the setter's phone. Every step still fits at both sizes while viewing.
  - **Checked, not a fault.** The reviewer read two bookings at one address as a missed duplicate warning. Leads within 25 m of a phone position are named in the sheet and on New lead (checked with two throwaway setters); the screenshots were taken before the answer arrived, about a second after the position.
  - **Not changed.** A Book that times out still says to look on Schedule rather than asking the database itself; the countdown keeps its "left"; Which areas keeps "Not sure" beside "Not collected" (the homeowner isn't sure, versus not asked); address suggestions stay biased to Calgary, not limited to it, so nearby towns work; the under-a-minute bar still offers Add 5 minutes when booking is ruled out (Keep as a lead is on the screen).

## 2026-11-03: Book with no answer (Keenan)

Keenan asked: when Book times out or loses signal, check whether that lead now has the booking before showing an error; if it went through, show the done screen; and test it with a dropped response. It replaces "If it booked, it shows on Schedule." from the round 2 polish.

- **The check.** `sheetBookedAt` reads whether the lead has a live meeting (booked or confirmed) at the held time. It is read only, as the person the sheet is for; every sales user can already see every booking, so no schema or policy changes. It gets 10 seconds, so a setter waits 35 at most.
- **What the setter sees.** Booked: the done screen, the draft cleared. Not booked: "Not booked yet. Check your signal and tap Book again.", with the time still held. Can't tell: "No signal to check whether it booked. Tap Book again once you have signal: it can't book twice." (the database refuses a second booking for the same lead or time, so that is true).
- **Where else it asks (judgment call).** An unheard booking uses the hold up, so until the sheet knows how Book went, the same question comes first when the hold goes missing (the signal comes back, the countdown ends, the hold's own check every 30 seconds, Add 5 minutes) and when a later Book is refused. Without that, the sheet would tell a setter their own booking was "just booked" by someone else, and switch Book off. If the check itself can't get through, the notice says "It may have booked: check your signal." instead of naming someone else.
- **The test.** The M3 walk-through drops setter A's requests in the browser, as a lost signal would: Book's answer after the server booked (done screen, no error); Book before it reached the server (not booked yet, still held, nothing booked); Book's answer and the check together (can't tell, one booking); the signal back (done by itself); and Book tapped again after an unheard booking (refused, checked, done, one booking only).
- **Not changed.** Move's timeout message stays as it was (not asked). A new person's first save has the same gap: if that answer drops, saving again makes a second copy of the lead. Noted for Keenan, not fixed here.

## 2026-11-04: Merging by who sees it (Keenan)

Keenan set a standing rule, now CLAUDE.md rule 13: anything customers never see (setter and owner screens, fixes, tests) merges on green, straight to live; anything customers see (the quote link, meeting mode's presentation, PDFs and documents) waits for a preview and his "push the changes".

- **Meeting mode counts as customer facing, all of it.** Keenan named meeting mode's presentation; the rest of meeting mode, the quote builder included, is on the iPad in front of the customer the whole time (CLAUDE.md, Meeting mode), so it waits for a preview too. Keenan confirmed this reading the same day.
- **A branch that changes both waits for the preview**, so nothing customers see goes live unseen. Also confirmed by Keenan.
- **Rule 11** no longer says Keenan never reviews preview links; he does, only for what customers see.
- **Previews ask for a Vercel sign-in.** The old rule said previews have no login wall; branch previews currently redirect to Vercel's sign-in (Vercel's Deployment Protection, a Vercel setting, not the app's). The rule now says he may be asked to sign in to Vercel first. Turning that protection off is Keenan's call and was not changed.

## 2026-11-04: A new lead saves once (Keenan)

Keenan approved, without a plan: a save key the phone makes once per new lead, an additive column with a unique index on `leads`, so a retried first save returns the same lead instead of making a copy; used on the booking sheet and on New lead; tested with a dropped response; merge on green.

- **The column.** `leads.save_key uuid`, with a unique index where it is set (migration `20261104024210_lead_save_key.sql`). Existing leads, and leads from other paths, have none. No policy changes: the key travels with the insert setters may already make. Setters can read it like any lead column; the app reads it only when saving, and a key found on someone else's lead is refused (below), so knowing one gets nobody anything.
- **When the phone makes it.** At the first save of a new person, not when the screen opens: New lead is drawn on the server first, and a key made there would differ from the browser's. It goes into the draft before the request leaves, so it survives a reload, the Unfinished list and Keep as a lead's hand-over to New lead. Drafts from before today get one at their first save the same way.
- **What the server does with it.** It looks the key up first. If the key is new it inserts the lead with it. If two tries race, the unique index lets one through, and the other finds that lead on its second look. A lead found by its key is brought up to date with what the try sent, the same columns the screen would write on a saved lead (the sheet its own, New lead the whole form), and New lead attaches only photos the lead doesn't have yet. A key that belongs to someone else's lead is refused (only possible on purpose). A save without a key, from a phone still running yesterday's app, saves as before.
- **New lead on a lost answer.** Checked on the live site before the fix: the lead was made, then the page fell to Next.js's own error page ("This page couldn't load. Reload to try again, or go back.") with the form gone, though the draft kept it; saving again after a reload made a copy. Now it keeps the form and says "No answer, so it may have saved. Tap Save again once you have signal: it won't make a copy." Next.js's own redirect after a save still goes through. Edit lead shares the form, so it says the same without the copy part (an edit saves the same lead).
- **The key lives in React state on New lead.** A first version kept it only in the hidden field's own value; React reset that when it drew the form again after the lost answer, so Save again made a fresh key and a second lead. The M2 walk-through caught it before release.
- **The test.** The M3 walk-through drops the answer to the sheet's first save after the server has made the lead, taps Next again, and checks there is one lead and the sheet goes on with it. The M2 walk-through does the same on New lead: the message, the form as typed, and after Save again one lead with one "created" event and what was added since. The database tests insert the same key twice, for the same person and for someone else, and race two first saves at the same instant.
- **How answers are dropped.** In the browser's own network (Chrome DevTools Protocol, Fetch domain), not Playwright's `route.fetch()`. The first run against the live site after Book with no answer merged showed why: `route.fetch()` sends from the test's own process, which this sandbox doesn't let reach the deployed site (`getaddrinfo ENOTFOUND`). So "the answer drops after the server booked" turned into "the request never left", and the app rightly said Not booked yet, which the test didn't expect. Every check before that section passed on the live site. The new helper (`tests/live/drop.mjs`) lets the browser send the request and fails only its answer, the same locally and on the live site.

## 2026-11-04: New lead's answer limit (Keenan)

Keenan approved, merge on green: New lead's save gets the same 25-second answer limit as the booking sheet, so a request that hangs ends in the same lost-answer message instead of "Saving" for ever, with a test.

- **One limit, one place.** `lib/answer-within.ts` holds the 25 seconds and the helper that applies it; the booking sheet and New lead both use it (unit tested with a fake clock).
- **New lead sends its save from the tap itself, not inside a React transition.** The first try put the limit inside the form's existing `useActionState`, and the new walk-through check showed it didn't work: after 45 seconds there was still no message and Save still said Saving. React commits transitions that run at the same time together, and Next.js's own bookkeeping for a server action is one of them, so the form's "no answer" could only appear once the hung request ended. The booking sheet never had this, since it calls its saves from the tap. New lead now does the same, with its own Saving state.
- **Redirects still go through.** Next.js ends a save with a redirect, which reaches the caller as an error while its router is already on its way to where the save lands; New lead tells it apart with Next.js's own check (`unstable_rethrow`) and stays on Saving until the page changes. A late answer, after the message, still lands the same way.
- **Save again while the first is still stuck waits behind it.** Next.js runs server actions one at a time, so a second Save is sent only once the stuck one ends (a phone usually drops a stalled connection when the signal changes). If it is still stuck, the second Save says the same message at 25 seconds. Either way the save key keeps it to one lead.
- **The test.** The M2 walk-through holds New lead's answer after the server made the lead, checks the message and Save are back at 25 seconds (24 to 40 allowed) with one lead, then drops the stuck request and checks Save again gets back that lead. `tests/live/drop.mjs` gained "hold" for this.

## 2026-11-04: Setter Home order, and contact privacy (Keenan)

Keenan approved both, merge on green, and contact privacy goes live first because Zane starts soon.

- **Home order.** Back to the spec: after a save "Lead saved. On to the next door.", then Unfinished bookings when there are any, tonight's open times, my bookings, the knock session and follow-ups due. This replaces the 2026-11-03 polish, which had put the knock session first.
- **What a setter sees of someone else's lead.** The name, address, status and bookings, never the phone or email: not on the lead page (no Call, Text or email), a booking card, Schedule, search or anywhere else. On their own leads (created or assigned to them) nothing changes. Keenan sees everything.
- **Enforced in the database, column by column.** Postgres row security works on whole rows, and setters must still read every row, so the rule sits in column privileges instead: signed-in people get read access to every `leads` column except `phone` and `email`, by name. A query asking for either one, or for `*`, is refused for everyone, Keenan's own session included, so no screen can leak them by accident. The numbers come from the view `lead_contacts`, which returns every lead's for Keenan and only their own leads' for a setter, with a security barrier so its filter applies first. It runs with its owner's rights, like the app's other public views, which Supabase's advisor flags; that is the point of it here. Additive: nothing moves and nothing is dropped.
- **A number saved, without the number.** `leads.phone_saved`, a generated column, tells whether a phone is saved. "6 of 8 collected", Find out ("Saved, hidden" on someone else's lead) and Before you book use it where the number itself isn't visible. The booking function reads the phone itself, as before.
- **Search.** Phone search runs through `lead_contacts`, so a setter's search by digits finds only their own leads; names and addresses still search everyone's.
- **View as.** It reads with Keenan's own session, which may see every number, so the app applies the same rule in code for the person being viewed (`maySeeContact`): exactly what that setter would see.
- **Later columns.** A column added to `leads` needs a read grant in its own migration, or only the service role can read it. Written into the data model.
- **Switched on.** At 16:08 Calgary on 2026-11-04 (`20261104220841_contact_privacy_on`), once the app reading contacts only through `lead_contacts` was live. With it on, the database suite passed (176, including a setter's own session refused the phone and email by name, through `*`, a filter and an embed) and so did four walk-throughs on the live site (446 checks); the database logged no refusal from the app or anyone using it.
- **What went wrong on the way (2026-11-04).** The first contact privacy migration (`20261104100612`) took table-wide read access on `leads` away while the deployed app still asked for whole lead rows and for the phone on Schedule's meetings. A worker restart left it that way from 04:06 to 15:12 Calgary: lead pages answered "not found", Tonight, Schedule and My bookings showed no bookings, and phone searches found nothing. The database's request log shows no requests at all in that window, so nobody met it; the first sign-in after it was at 15:13, once it was put back (`20261104211259`, contact privacy paused). From now on the switch is thrown only after the app that no longer needs whole rows is live (`contact-privacy-on`, after this branch), and the privacy tests that need it run then.
- **A hole found along the way, closed.** Supabase's default privileges had given signed-in people insert, update and delete on every view, and the app's views are simple ones that run with their owner's rights, so a write through `settings_public`, `profiles_public` or `profile_names` (and the new `lead_contacts`) would have reached settings, profiles or leads around their policies: a setter could have changed meeting times or step notes, or renamed or removed people. The app never writes through them, and the request log shows no such write in the four days it keeps. All four are now read only (`20261104211501`, `20261104212002`), with database tests that try each write and expect a refusal.

## 2026-11-04: The quote link rework, settled by debate (Keenan)

Keenan asked for a debate before building, with five separate agents each arguing from one seat: the homeowner who got the link and hasn't decided, a door-to-door closer, a premium brand designer, a mobile UX specialist and a plain-language editor. Keenan's rules in his message were not up for debate. Two rounds ran: positions (each read the brief, DESIGN.md, PRODUCT.md and screenshots of take 1 at 390 and 430), then rebuttals with all five positions in hand. Where the seats split, the majority carried; a tie went to Keenan's own wording or order. No plan went to Keenan, as he asked. The same five review screenshots after the build.

What they found wrong with take 1: the first screen read like a record (full name, address, "Good until") and the total sat about 1,200 px down; the runs were listed twice; switching a run changed nothing in view; Call and Text sat about 2,500 px down under an open warranty.

### Settled

- **Order.** Keenan's eight sections, in his order. Inside them:
  - Their house: a slim navy band with the wordmark (not sticky); the mockup full width in a 3:2 frame on navy, with an expand button instead of a caption; "[First name], here's your quote"; the total; "Price held until [date]" right under it; then "No payment until your install is complete." and "Financing is available. Just ask." (take 1's spec keeps financing always visible).
  - Your lights: the compact list, "What do these mean?", then the diagram last, right above the switches, so a switch, the house and the total share one screen at 390. Not pinned (5 to 0): pinned, it and the bar would cover a third of a 660 px screen.
  - Start smaller: the switch rows, then the breakdown, then the total, then the minimum note.
  - Tap to open: See our work first once it has photos (5 to 0); until then it is hidden, so Keenan's order shows.
  - A small footer with the address, phone and email, so a door-knocking company shows it is local.
- **One live total.** The hero total follows the switches, with "Full quote $4,560" quiet under it when anything is off, so the big number is always what they would book (4 to 1; UX wanted the hero to stay the full quote).
- **No total in the bottom bar** (4 to 1; UX switched sides in round 2). Call and Text with words, then Book my install in gold with navy text. With words on Call and Text, a price beside the button does not fit at 390, and "$3,450 + GST" never would.
- **Never "level".** In Calgary "lower level" is the basement. Rows show the name and feet only; "What do these mean?" ends with "Upper is the second storey. Lower is the main floor." (5 to 0).
- **The diagram.** One two-storey front view for every house, with short side returns at each end so the sides have lines (3 to 2: the designer and the homeowner wanted a bungalow drawing too, picked by whether the quote has an upper run; UX answered that a two-storey quoting only lower runs would then get a bungalow). The photo is the portrait; the drawing is a key. A lit part is a navy track with gold dots tucked under the roof edge (gold on navy reads at 4.9:1; bare gold on white is 2.9:1 and washes out outdoors). A run switched off is a dashed navy line at 40%, so on and off differ in shape, not only colour; never gold, since gold means light. Parts not in the quote are the plain outline. Caption: "Gold marks your lights." "Other" runs are listed, not drawn.
- **What do these mean?** One column (5 to 0), each row the same small house with one part in gold: Eave, Gable, Garage line, Sides, Porch (Keenan's five). The soffit is named inside Eave, since the product points use the word (the designer's middle way between adding a sixth row and leaving it out).
- **Line names.** "Upper roof access", with "$200, or $400 with an upper gable" under it, from the quote's own two amounts (3 to 2 over "Second-storey work"); every dollar line says what it is for where it appears, so a switch that moves $400 to $200 never looks like a trick. "Rush colour fee", Keenan's own term from his track colour sentence, with "[Colour] track, powder coated this season" under it (5 to 0; "Colour before Christmas" read like a second charge and a dated promise). The control box says "Always included". Discounts show with a true minus sign, in navy. Meeting mode uses the same names, from `lib/pricing.ts`.
- **The minimum.** Keenan's two sentences at the total, the first semibold, in a quiet box with a hairline border; the breakdown keeps its "To reach our $2,500 minimum" line so the column adds up. No third line (4 to 1).
- **Track colour.** "Your colour: White." when the quote names one, then Keenan's own sentence, with the rush fee as a dollar amount inline; with no fee set, the clause after "spring" drops and the sentence still reads.
- **Product points.** One column, a navy line icon to the left of each line, no cards or grid. Keenan's order (the seats split 2, 2 and 1; it opens with looks and ends on the warranty, and Settings can reorder them). Icons: lightbulb, house (the track, 4 to 1 over a paintbrush), lightning bolt (24V), phone, plug, shield.
- **Christmas banner.** A cream band across the page with navy text, the question bold on its first line; no icon, no button, no close X (5 to 0).
- **Book my install.** The confirm step: "Book your install?", "There's nothing to sign or pay today. Keenan will be in touch to set your install date and go through the agreement.", with Back and Yes, book my install. The thank-you keeps take 1's wording from the spec.
- **Text with a start.** Text opens Messages with "Hi Keenan, a question about the quote for [address]: " so Keenan can place it whoever sends it; "Just ask." opens "Hi Keenan, can you tell me about financing?".
- **The closed page.** "This quote link is closed." and "Call or text Keenan for an up-to-date quote.", Call and Text, no name, no prices. Never "expired": since 2026-11-04 a link only closes when Keenan turns it off.
- **Motion.** One easing, cubic-bezier(0.22, 1, 0.36, 1). Totals count to the new value over 450 ms in tabular figures, carry on from where they are if switched again, and land exact; a screen reader hears the new total once. Diagram parts cross-fade in 240 ms; lines that appear or drop off ease height and opacity over 200 ms; Tap to open eases open in 220 ms and closed in 180 ms. Nothing moves on load or on scroll, and there is no first-view light-up (5 to 0). With reduce motion on, nothing counts or slides; values swap with a fade of 100 ms or less (3 to 2; the editor and the closer wanted no fade at all).

### The main disagreements, and why they went the way they did

- **The bar's total.** The closer fought hardest for a live total with "Pay after install" in the bar, as a closer who never leaves. Lost: it does not fit at 390 beside worded Call and Text, a bare price beside the button reads like a checkout, and the live total already sits under the switches and in the hero.
- **Bungalow drawing.** Lost 3 to 2, above. If Keenan wants it, it is a second drawing and a rule for picking it.
- **"Not yet" or "Back".** The homeowner wanted take 1's "Not yet" (it says they can come back without being chased); three seats wanted Back, so the button doesn't suggest putting it off.
- **"Within a day".** Four seats wanted it cut from the thank-you as a promise the business might not keep. It stays: it is Keenan's wording in the spec (take 1), and he decides what he promises. Worth a look from Keenan.
- **"To have it before Christmas".** The homeowner read it as a promised date. It is Keenan's own sentence, so it stays as written; the breakdown line says "this season" instead.
- **Prefilled names.** The homeowner wanted "it's Todd" in the text; the address works whoever sends it.

### After the build: the five seats' screenshot review (2026-11-04)

The same five agents reviewed screenshots of the built page at 390 and 430 (all runs on, uppers off, under the minimum, everything opened, the confirm step, after the price hold, a closed link). Changed:

- **The total sits right under the switches** (all five). The first build put the breakdown between the switches and the total, so a flip changed a number about 300 px out of sight, with the hero far above and no total in the bar; the seats who gave up a bar total in round 2 had counted on a total beside the switches. Now the total, and Keenan's minimum box when it applies, follow the last switch; the lines that make it up come after. The walk-through checks the gap (60 px or less).
- **Switching off takes away the light, not the roof** (designer). Roof edges stay solid in every state; a switched-off part shows a dashed line where the track was, in navy at 60% (over 3:1 on white, the homeowner measured the first version at 2.6:1).
- **More gold** (designer, homeowner). Nodes 3.2 units across at a 5.5-unit pitch on the 4.5-unit track, so the lights read as gold rather than a dark bead line. The five small drawings are each cropped to their own part and their lines and lights are drawn the same size on screen as the big drawing's, so the porch and the sides are long enough to see (UX).
- **"Upper & Lower Sides" lights both sides** (editor): a sides run named for both floors lights both returns, whatever level it was saved with.
- **The hero** (editor, closer, UX). The greeting comes first (the grey street address above it went: the photo shows the house). The no-payment line sits right under "Price held until", semibold, with no rule between, which also brings the Christmas banner onto the first screen at 390. Keenan's minimum sentences show once, in the box at the total, not in the hero, where "That" read as the full quote.
- **Words.** "For work up high: $200, or $400 with an upper gable" (closer, designer); "The track sits on the soffit, the underside of that edge" (editor); curly apostrophes in the page's own words, so the font no longer mixes the two (designer, editor; Keenan's own texts from Settings stay as he typed them).
- **Touch.** The footer's phone and email are their own 44 px rows, underlined (UX). The closed page puts Call and Text in the same bottom bar as the quote page, in thumb reach (UX). The expand button on the photo is navy with a white icon, so it no longer outshines the house and the price (designer). The runs list above the drawing reads as a legend, without dividers.
- **One visit per opening.** The first walk-through counted each visit twice on the development server, which runs a page's start-up twice; the page now records one visit however often that runs.

Not changed:

- **"No extra cost" tags on switched-off rows under the minimum** (closer). True and friendly, but the debate turned down extra minimum copy 4 to 1, and the total staying at $2,500 as parts come back on already shows it.
- **"Still thinking it over? Text Keenan any question." above the footer** (closer, from the homeowner's round 1). The bar's Text already carries a first line about their quote; left out as a second ask.
- **A sticky total inside Start smaller** (UX): the total right under the switches does the same job with no motion.
- **A "both floors" level in meeting mode** (editor): not asked for; the name rule above covers Todd's quote.

### Prices and status that came with the rework (2026-11-04)

- **Settings changed at once** (migration `20261104230300`): $24 a foot, the $2,500 minimum, the $200 service call fee, prices held 120 days. Quotes already made keep their own prices.
- **Price hold days are a new column.** `settings.quote_valid_days` has a check that allows 1 to 90, so 120 couldn't go in it; changing that check means dropping it, which needs Keenan at the screen (rule 4). The new `price_hold_days` (1 to 365, 120) is what the app uses; `quote_valid_days` was set to 90 and is no longer read. Dropping the old column's check is left for Keenan's go-ahead.
- **The rush colour fee per foot is no longer used.** No quote ever had one, so nothing needs carrying over; the per-foot columns stay, unused, per the additive rule.
- **A quote keeps its rush colour fee whatever the colour timing**, so the customer's link can name it in the track colour sentence and switching to this season at the table finds it; the price counts it only for this season.
- **Todd Dean's quote** (the only quote so far): "Family & Friends Discount", prices held until March 2, 2027 (120 days from November 2, the day it was made, Calgary), and the $2,500 minimum. It was made before upper access existed, so it has no upper access or rush colour line.
- **The Christmas banner's season is a judgment call.** Keenan said it hides itself after December 24. It shows from September 1 to December 24 (Calgary) while it is on, so "Want them up for Christmas?" never appears in the spring; Keenan can turn it off or change the words in Settings.
- **Status.** Vercel Pro is in place. Keenan is turning off Vercel Authentication for previews, so the preview link should open on his phone without a Vercel sign-in (the report says if it still asks). Meeting times stay at 5:00 pm with six 35-minute meetings.

### The design critique, before the preview (2026-11-05)

The impeccable skill's critique ran as two isolated agents (a design review, and the detector in a browser) on a staged TEST quote on the production build. Take 1 ended at 30/40 (75%). The rework scored 27/36 (75%, flexibility scored n/a on a sales page), then 30/36 (83%) after its fixes; snapshots are in `.impeccable/critique/`. The detector found one advisory, the hero total's 2.75rem size, which is deliberate (DESIGN.md's type steps are the app's and have no display size).

- **A quick second tap can't book** (P1). The confirm step's Yes sits where Book my install was; a tap on it within half a second of the step opening, timed from the press, is ignored. The walk-through taps twice and checks nothing books.
- **Each switch has a small drawing of its own part** (P1). With Safari's toolbar showing (about 660 px of a 390 phone), the big drawing sat off screen while the thumb was on the switches; now every row shows its part lit while on and dashed once off. The big drawing stays as the overview.
- **Focus shows everywhere** (P2): the photo's outline draws (Tailwind's `outline-none` had been cancelling it) and the footer links have the page's ring.
- **The breakdown adds up downwards** (P2): it closes on a Total row, and under the minimum "Before the minimum" (the lines' own sum, discount taken) sits above the top-up, so the discount visibly still counts. Not "Subtotal", which the PDF will use for the total before GST.
- **Smaller.** The small drawings drop the windows and are cropped tighter.
- **For Keenan, not changed.** "Garage Eave" in the run names and "Garage line" in the explainer are two names for one part; "Two Upper Gables" is drawn as one gable; and "Upper & Lower Sides" lights the upper side on the drawing while upper access follows the level it was saved with (lower), so a quote whose only upper work is that run charges no upper access. Setting that run to upper in meeting mode would charge it.

## 2026-11-05: Keenan's answers on the quote link rework

- **The thank-you says "within one business day"** instead of "within a day" (the spec and the page).
- **The Christmas banner runs September 1 to November 30** (Calgary), not to December 24 (migration `20261105042102`). The install season ends mid-December and custom colours take one to two weeks, so a later banner would promise something Vesper can't deliver. This replaces the September 1 to December 24 judgment call above.
- **"Upper & Lower Sides" stays as built.** The drawing lights both sides for a sides run named for both floors; Keenan sets the level in meeting mode when he quotes, which decides upper access.
- **See our work stays hidden** until Keenan adds real install photos to the presentation gallery.
- **The rush colour fee stays $350** everywhere: Settings, and each new quote's own copy.
- **The old `quote_valid_days` check is dropped** (Keenan approved; run as `20261105045236` while he was at the screen to confirm it). The column stays, unused.
- **The track colour line follows the banner's dates.** From September 1 to November 30 it keeps Keenan's words, the rush colour fee "to have it before Christmas". From December 1 nothing on the page mentions Christmas: non-stock colours show the spring option only, "Any other colour is powder coated for a spring install, with colour matching included at no extra cost." The rush colour fee stays available in meeting mode, with no Christmas promise.
- **A quote priced for this season after November 30 (judgment call).** For a quote Keenan priced with the rush colour fee, the spring-only line would contradict the fee in that customer's own breakdown, so it reads "Any other colour is powder coated: nothing extra if it can wait for spring, or the $350 rush colour fee to have it sooner."
- **keenancudi@gmail.com** is left as it is: Keenan's answer came through as the blank template twice, so nothing is changed until he picks.

## 2026-11-05: The Session tab (Keenan)

Keenan approved the scope up front, merge on green, aiming to be live before 3:00 pm Calgary because setters are out that afternoon. Built from main, not from the quote link branch, so nothing from the unreviewed quote page goes live.

- **A standing merge window.** CLAUDE.md rule 13 now says: on knocking days (Monday to Saturday), no merges to main between 3:00 and 9:30 pm Calgary (21:00 to 03:30 UTC), unless it fixes something broken or Keenan says so, since a deploy mid-shift can change the app under a setter at a door. Alberta is on UTC-6 all year, so the UTC hours hold all year.
- **The tab.** Session is `/app/session`, the gold round button where New lead was, with a door icon. New lead keeps its own page; it is a button at the top of Leads and a smaller one on Session. On New lead the side rail marks Leads.
- **Unfinished shows in both states (judgment call).** Keenan listed Unfinished under the knocking view. It shows when not knocking too, under Start knocking, so a draft left after ending a session is never out of sight until the next one starts.
- **Out today (judgment call).** Everyone else with a session started today, the ones still out first ("Since 4:10 pm"), then the ones who finished ("4:10 to 6:05 pm"), each with their neighbourhood and today's doors and conversations. Showing who already finished tells a setter which streets were knocked today.
- **Fixing the start time.** Any time earlier today, never in the future, and only while the session runs (a session's end can't come before its start). The server action checks it. No schema change: a person's own open session was already theirs to update under its row policy, counters included, and nothing pays on sessions.
- **The end summary.** Time out (start to end), doors, conversations, leads (saved while it ran, which is how leads link to a session) and bookings (those leads with a booking still on: booked, confirmed or marked; a move keeps it, a cancel doesn't). It shows after End knocking until it's closed or the page is left.
- **Where saves land.** While a session runs, New lead's Save lead lands on Session with "Lead saved. On to the next door.", for Keenan too (before, only setters went back to Home, and Keenan to Leads). Save and book returns to Session once the booking is done. The booking sheet's Done after a booking made from Session shows the same line: a booking saves the lead too, so Keenan's wording fits both. New lead's Cancel goes back to Session while knocking, otherwise to Leads.
- **The welcome tour** now says "Start knocking on Session."
- **Critique and polish (impeccable).** Two isolated reviewers, a design review and a detector with browser measurements: 28/40 before polish. The detector found nothing in six views (its planted-page control found six), and the browser found the End question opening under the tab bar at 390 wide and 40 px Undo buttons. Fixed:
  - End's question scrolls above the tab bar and takes focus;
  - Undo is 44 px, and the counters' names match what they show ("Doors +1, now 3", "Undo door");
  - "Saving." shows only when a save is slow;
  - a retry is a bordered warning with how many taps are waiting, and taps not saved yet stay on the phone until they land (checked by going offline and reloading: they arrived);
  - a session ended on another phone stops the counters and offers Start again, instead of "Reload the page", which an installed app can't do;
  - the summary comes from the database, stays until the next start, shows time out as one of its numbers (whole clock minutes, so it agrees with the times shown) and has no gold edge;
  - New lead and End share the last row with New lead in the thumb corner, and Unfinished moves under them;
  - the saved line clears on the next tap;
  - the knocking heading is a size down, so "Knocking in Crescent Heights" stays on one line;
  - "Where are you knocking?" labels the field, with a line on what counts as a door and a conversation;
  - Out today says Out now or Finished.
- **Re-score and a second polish.** The re-score came to 29/40 and found two more problems: the saved line appeared above the counters, so they jumped down under the thumb and a quick second tap could land on Undo; and on a 390-wide iPhone used as an installed app the End and New lead row sat under the tab bar. Second polish:
  - one status row under the counters, always the same height, holds the save state, the saved line with Open, a retry with how many taps wait, the start-time note and Start again; nothing is ever added above the counters;
  - one Undo there takes back the last tap and names it, instead of an Undo under each counter (a low tap no longer quietly removes a count);
  - Unfinished is one row saying how many, which opens the list, above the times;
  - End knocking is a quiet text button, New lead the outlined one in the thumb corner;
  - the links beside the heading and the start time keep their 44 px tap area without adding line height;
  - Out today says where each person is now ("Bridgeland, since 4:32 p.m. Earlier: Renfrew.") and lists a finished person's places in the order they knocked them.
  With six times tonight the End and New lead row now clears the raised Session button by 42 px on a 390-wide iPhone in the installed app (status bar and home indicator emulated) and by 118 px on Keenan's 430.
- **Final re-score and a third polish.** Two fresh reviewers scored it 29/40 again; the detector, the overlay and the CLI's own page engine over CDP found nothing, and the counters never moved through start, taps, Undo, an offline retry and its recovery. Their remaining points, fixed:
  - 12 px between the counters and the status row, so a low tap can't reach Undo, and Undo says what it took back until the next tap;
  - the save line claims only what's true: "Taps save as you go.", "Saving." when slow, "All taps saved." once taps that had to wait have landed (before, "All taps saved." could show for up to 0.8 s while a tap was on its way);
  - the neighbourhood field selects its text on a tap and has a clear button, so moving to the next neighbourhood isn't a manual delete;
  - the summary is two short lines ("4:32 to 6:05 p.m. Out 1 h 33 min." and "48 doors, 12 conversations, 3 leads, 1 of them booked."), so Start knocking stays clear of the tab bar at 390 after ending;
  - End's question scrolls into view again when a message appears under it, and Keep going gives focus back to End knocking;
  - a fixed start time can't go back into an earlier session today (checked on the server), so time out never counts twice.
  Not re-scored after this third polish. Noted, not changed: the raised gold Session button stays gold on its own page (a nav-wide choice), Keenan's booked tiles open the booking on Schedule but not on Session, and Fix start time opens above the counters.
- **Adversarial code review before merging.** Five reviewers, one area each (counting, server, save flows, screen states, regressions), found 20 points; fixed before merge:
  - the times heading could name a different evening than the grid under it after a refresh (a setter could hold Monday 8:15 thinking it was tonight): the grid is now keyed to the evening the heading names;
  - taps could be sent twice when a setter left Session mid-retry and came back: a closed Session stops sending, and the next one waits for any send still on its way before reading the taps kept on the phone;
  - more than 100 unsaved taps of a kind would have been refused and wiped: they now go out in batches of 100;
  - a booking made from Session wiped an unrelated New lead draft on the phone: the draft is cleared only when its save key is the saved lead's;
  - dropping ?added= from the address bypassed Next's router, so a later action brought the saved line back (also when not knocking): it's dropped through the router from the screen that's always there;
  - the minute the last session ended was refused as a fixed start although the message offered it; a read error on fixing the start time read as "session has ended";
  - Undo during a retry left "0 taps not saved yet"; Escape on the booking sheet's done screen skipped the return to Session; the Let go dialog still said Unfinished was on Home; "1 lead, 1 of them booked" reads "1 lead, booked"; a summary from an earlier session could outrank a later one ended on another phone; View as's acted-out start and fix skipped the checks a setter gets.
  Left as they are: Session's read queries show an empty list when a read fails, like the rest of the app; main's quote-link database test checks the live database, whose quote-link migrations are still only on the quote link branch, so a fresh project built from main alone wouldn't pass it until that branch merges.
- **Not changed, for Keenan to decide.** The design review suggested docking the counters just above the tab bar, where the thumb rests, instead of second from the top as Keenan listed them; and asked whether every conversation should also count a door, so a talk is one tap. Both change what Keenan specified, so neither was built.
- **Tests that were already failing on main.** The full database suite had five failures unrelated to Session:
  - one day-schedule test picked "the first closed evening" which, on a Thursday, is Sunday, today + 3, an evening two earlier tests in the same file give their own schedule (on the throwaway test host; it stopped at its first check, so nothing was changed);
  - main's four quote-link checks expected take 1's database, but the quote link rework's migrations are already live (closed instead of expired, no expiry by date, new fields).
  The first now skips evenings its neighbours use; the second now checks what the live database does, copied from the rework branch's checks without its new-column reads (main's types don't have those columns until the rework merges).

## 2026-11-05: The new Homes (Keenan)

Keenan approved the scope up front, merge on green; built after the Session tab, from main.

- **One way into Session on both Homes.** Start knocking, a quiet row that opens Session (the neighbourhood is picked there), or, while the person is out, a gold-edged bar for the live session ("Knocking in Bridgeland. Since 4:32 p.m. 24 doors, 6 conversations.") that opens it. It was a gold button until the critique: two gold ways into Session a thumb apart broke the one-gold rule, and the tab is the one that stays.
- **Today and Tomorrow** is a two-segment switch that swaps the list in place; both evenings are drawn on the server, so it never waits on the network. It opens on Today every time. The chosen segment is a neutral fill, not gold: gold stays for actions.
- **The team's schedule says only where and when (judgment call).** Keenan named the time, the area and who booked it. The area is the lead's neighbourhood, or its street (no house number) when there is none. No customer name either: the list is for clustering, and leaving names out keeps it far from the contact rule. It asks the database for no contact columns at all. A setter's own lead says "Your booking", or "Your lead, booked by Keenan" when he picked the time: the same bookings How mine went shows, which goes by whose lead it is (the fee rule), not by who tapped. Moved and cancelled bookings are left out.
- **How mine went (judgment call on the range and order).** The last 7 days first, newest first, one line each with the outcome (or "Not marked yet"): the name says how it went, and the morning after that is the question. Then Coming up, soonest first, one line each (day and time, name, area, "N of 8 collected"). Both open the lead, where Move and Cancel are. Coming up started as full cards with Move and Cancel; the critique found them repeating the team schedule just above and pushing the outcomes and follow-ups below the fold.
- **Keenan's meetings are compact cards (after the critique).** A glance, not a workbench: the time, the name and address, whose lead and "N of 8 collected", the Meetings page's flags on one line ("Still needs a mockup and the track colour." with Open the lead; one shared component), the distance from the meeting before, then Meeting mode, Navigate and Call in that order, and after the slot the outcome he marks there. Photos, notes, the map position line, Move and Cancel stay on Schedule, the Meetings page and the lead. Moved and cancelled bookings are left to Schedule, so the count on the switch always matches the cards. Full cards were about 465 px each, about 1.3 meetings to a screen. The walk-through can't put test meetings on Keenan's real today or tomorrow without real setters seeing them, so it checks the Home's order and the switch; the flags are the Meetings page's own component, checked there.
- **Keenan's Home drops the team-today totals and today's leads (judgment call).** His list for this Home didn't include them; "who's out knocking right now" replaces the team list (only people with a session open now, with their doors and conversations today). M6 brings the dashboard numbers back.
- **The heading follows the switch.** "Meetings today" and "Meetings tomorrow" (and "Team schedule today" and "tomorrow" for setters), so a list scrolled past the switch still names its evening. Keenan's Home is headed by the date instead of "Today", which the switch already says.
- **Left as the critique found it.** The team schedule doesn't list the evening's open times in words: the shape brief keeps open times off Home (they're on Session, one tap away). Team rows don't open anything: they hold no lead for anyone but their setter.
- **Re-score and a second polish.** Two fresh reviewers scored the polished Homes 25/40 (a harsher reviewer than the first; the detector, the overlay and the CDP page scan found nothing, every tap target is 44 px, the switch makes no request and keeps focus, and the team schedule carries no name, phone, email or link). An adversarial code review (four reviewers, two skeptics per finding) agreed on one real bug. Fixed:
  - a booking cancelled before its time stayed under Coming up looking live (the team schedule above had already dropped it); Coming up now holds only bookings still on, and a cancelled one shows under the last 7 days as Cancelled once its time has passed;
  - team rows are one line where they fit, and the setter's own read in full strength, so How mine went stays on the first screen of a 390-wide iPhone on a full evening;
  - the last 7 days shows its four newest and "Show all" for the rest, with the outcome in its own right-hand column (Qualified carries a tick, no colour) and "Last night, 6:00 p.m." to match Coming up's "Tonight, 6:00 p.m.";
  - the chosen day on the switch has a Night Text outline as well as the fill (the fill alone was 1.2:1 in the light theme, lost in sun);
  - the setter Home shows the date under the greeting;
  - both Homes read again when the installed app comes back after a minute away (Session already did);
  - on Keenan's Home only his next meeting says Next and has the gold Meeting mode (two or three gold outlines on one screen broke the one-gold rule); the prep line is itself the link, so there's no second "Open the lead" beside the name; the distance comes before it; a marked outcome folds to "Qualified. Change"; one line above the cards adds up the prep ("2 of 3 still need a mockup or the track colour. Open Meetings");
  - Out knocking now says its counts are today in Calgary time, as the spec says, and drops "Out now" on every row under a heading that already says it;
  - the walk-through's check that a finished setter isn't listed as out now used a setter with no session at all, so it could never fail: that setter now has one that finished earlier today.
  Left as found: a failed read still shows the empty state, as everywhere in the app; team rows still open nothing (they hold no lead id for anyone but their setter, and Coming up opens the setter's own).
- **Final re-score and a third polish.** Two fresh reviewers scored it 27/40 (up from 25/40); the detector, the overlay and the CDP scan found nothing (its planted-page control found four), and nothing was written after sign-in. Their remaining points, fixed:
  - once Keenan's slots start, every card grew a full outcome form with its own gold Save, a stack of forms at 9 pm: a started meeting is now one line, "How did it go? Mark it", that opens the form, as a marked one reads "Qualified. Change"; Meeting mode, Navigate and Call go once the slot has started;
  - on a phone the next meeting's gold is Navigate (the drive is the next thing), on an iPad Meeting mode (CLAUDE.md: meeting mode is iPad first);
  - team rows are always two lines, area then who booked it, so "who booked" sits in one place down the list (one line where it fit put it in two places), and a setter's own rows open their lead;
  - "Not marked yet" instead of "Waiting for Keenan to mark it", which wrapped in its column;
  - Follow-ups due with nothing due shows only its empty line;
  - a meeting that has started no longer shows or counts its prep flags (a mockup can't be made for a meeting that's under way).
  Checked through the view-only owner session with two test meetings earlier today (one started and not marked, one marked No-show).
  Not changed: "N of 8 collected" shows even at 8 of 8 (CLAUDE.md asks for it on every lead), and the prep summary stays when every meeting is flagged (it still counts them).
- **A quote-link database check that failed by chance.** Its "malformed token" was the real token with "_" in place of its last character, which is the real token itself whenever that character already was "_" (tokens are 24 random base64url characters, so one run in 64). It failed once in this branch's suite; the check now always picks a different character, and the database suite passed again on the fix. The quote link rework branch has the same line and gets the same fix when it's brought up to date.
- **Verified on production.** The M3 walk-through (157 checks) and the View as walk-through passed against production after the deploy. The View as walk-through's first run there failed one check, "Session shows the knock session that is running": it read the page right after the tab tap, before Session had drawn (its settle step can return before the loading screen appears). It passed on a second run (154 checks), and the check now waits for the heading and reports what it saw.
- **His Home no longer writes.** It used to close his sessions left open from an earlier day; Session does that now, so the View as walk-through checks his Home whatever he left open.
- **A test footprint that compared nothing.** The M3 walk-through's check that Keenan's own pages change nothing read day schedules through a column that doesn't exist, so it compared two empty answers. It reads the real columns now.

## 2026-11-05: Booking sheet round 3 (Keenan, after a day of using it)

Keenan approved the scope up front, additive schema changes and a line in the Book step note included. Nothing customer facing, so it merges on green, but after 9:30 pm Calgary under the knocking-day rule, and it must be live for the next shift. Built from main. Merged at 6:35 pm Calgary on 2026-11-05, inside the knocking window, because Keenan said to push it (rule 13 allows it when he says so); the Book step note migration was applied at the same time (recorded as 20261106003545, and Keenan's note was still the starting text, so the line went in place).

- **Move freely, check at Book.** Next and swiping always move on, answers missing or not. A step the setter has been on (or passed) with something missing carries a small marker under its progress segment; the counter says how many answers are still missing ("Step 3 of 6, 7 to answer", replacing "3 left", which counted steps ahead; it was "4 to finish", counting steps, until the design review before merge showed it disagreeing with Book's "7 left to answer" on the same screen, so both count answers now). Book is the only gate: it lists everything still missing on the other steps, each a tap to its step, where Next says "Return to Book"; Book stays off until all of it is answered (Not collected included) with the same Before you book rules. While it's off, its button says how much is left ("2 left to answer") and a tap goes to the list, to the phone when that's the last thing, or to the note's Keep as a lead when an answer rules booking out.
- **The save rule stays (judgment call).** Keenan's change is about moving between steps. The rule that a lead saves only once every question has an answer or Not collected (2026-11-03) is unchanged, so with the phone asked last a new person is usually saved at Book, which then books. A step still saves as the setter moves on whenever everything is answered.
- **Photos before the first save.** Photos used to need a saved lead. Now, for a person not saved yet, each photo uploads at once to the setter's own folder (as New lead's always did), stays with the draft on the phone, and goes into its slot at the first save, a retry after a lost answer adding only the ones the lead doesn't have. The Photos step no longer waits for the address.
- **The phone comes last.** It moved from the first step to Book, right above the Book button, with Not collected as before and Call or text to confirm beside it. The first step keeps the name. The phone is still required to book; Not collected on it rules booking out and offers Keep as a lead, in one note on Book. The Book step note gains Keenan's line, "Last, the number: "What's the best number to confirm your meeting?"", in its own migration applied when this goes live (so setters on the 2026-11-05 shift never read "number last" while the live app still asked for it first). A note Keenan has edited would keep his words and get the line at the end.
- **Use where I'm standing: why it seemed to do nothing.** Four causes, from the code and from research on iPhone home-screen apps:
  - a good position saved, but the address box stayed empty, so nothing visible changed and the step still said the address was missing;
  - the button took the iPhone's first reading, which is usually rough (Wi-Fi or cell towers, 65 m or more) before GPS settles, and turned it away when it was over 50 m;
  - a home-screen app can be denied location without being asked, and the message said to allow it "in the phone's settings", where Vesper has no entry of its own (Safari's settings cover it);
  - with Precise Location off, every reading is several kilometres, so it could never pass.
  Now it shows "Finding where you are..." at once, listens for up to 15 seconds and takes the first reading within 50 m, shows how close it's getting, and ends with a clear result or a clear reason, with the iPhone steps when location or Precise Location is off. The result line comes into view, so it's never under the fold.
- **The nearest address, from the key we have.** Google's Geocoding API turns the position into the nearest street address. Checked on 2026-11-05 from a signed-in page on the live site, with a throwaway test setter and one lookup (the key never printed or stored): the current key already allows it (it answered with a street address), so nothing needs switching on. Price: Google's Geocoding Essentials SKU, 10,000 free a month, then $5 per 1,000; this app's 50 to 300 a month cost nothing. Suggested to Keenan: a daily cap in Google Cloud (Quotas, Geocoding API) so a misuse of the public key can't run up a bill. The address is filled only into an empty box, for the setter to check the house number (on a new street it can be a neighbour's address or just the street); anything typed is never written over, and the nearest one is offered with "Use it" instead. The map position is always the phone's own, and Google's place id isn't stored with it.
- **The optional answers.** House type on the house step (the sheet used to leave it alone; it now saves it); the setter's read (Hot, Warm, Just curious) and the hot buttons (No more ladders, Up for Christmas, Year-round curb appeal, Safety and security, or Not sure on its own) on the learned step; call or text beside the phone. One tap each, never required, never part of "N of 8 collected". On New lead too (call or text beside the phone, the read and hot buttons after Find out), on the lead page under From the door, and in View as. Keenan's Meetings page and Home cards show the read and hot buttons in one line ("Hot · No more ladders, Up for Christmas").
- **Who sees the read (judgment call).** Setters read every lead's non-contact columns as a team, so the read and hot buttons are readable by the team like the other answers; they are internal and never appear in meeting mode, the quote PDF or the quote page. Not sure can't be saved beside a hot button (a database check, and the app clears one for the other).
- **Drafts kept before round 3.** A draft saved on a phone before this release has no optional answers; it comes back with them empty and marked as not asked, and a saved lead's own come back from the database before any save, so reopening an old Unfinished can't blank them.
- **Types by hand.** The live database also holds the quote link branch's columns, so regenerating the types would bring them onto main; the three columns and enums were added to `types/database.ts` by hand instead.
- **The learned step may scroll (noted).** Keenan put the setter's read and the hot buttons on What else did you learn, with its four questions, so that one step can scroll a little on a 390-wide phone; every other step still fits without scrolling at 390 and 430.
- **Not changed.** The welcome's location step still asks once with a quick, rough reading; the button is what proves a precise position works. Meeting mode, the quote PDF and the quote page don't show any of the new answers.
- **From the review before merge (fixed).** An independent review of the branch found these, each fixed and covered by the walk-through where it can reach:
  - a new person reaches Book before their first save, so the 10 km warning now works from the position on the sheet, not only from a saved lead;
  - Next or a swipe while Use where I'm standing is still listening, or while the nearest address is on its way, used to throw the result away. The address step now stays alive out of sight until it ends, every change to the address goes straight into the draft (so the counter and Book's list are live on that step too), and if it fails out of sight a notice says why with Go there;
  - a photo for a person not saved yet could drop out of the draft when a retake failed or when the Photos step came back on weak signal and its preview couldn't be signed, while Book still counted it. A retake now keeps the earlier photo until the new one is up, an unsigned photo shows as saved without its picture, and the photos that count are exactly the ones the save will attach;
  - Book can't be changed while it saves and books, so what's booked is what was on screen at the tap, and a save that lands keeps anything changed meanwhile;
  - Next moves on even when a save on the way fails (it says calmly that it's kept on the phone and Book saves it), so weak signal never pins a setter to a step;
  - a booking the database refuses as not ready points at the step that fixes it; an open sheet kept before round 3 is read with its defaults, so an empty one isn't reopened; and "Add the house number" no longer shows next to an address that has one.
- **From the design review before merge (polished).** Two isolated assessments (a design review, and a detector and browser pass as a test setter) agreed on these, now changed:
  - the counter and Book's button count the same thing, answers ("Step 4 of 6, 7 to answer" over "7 left to answer");
  - Book's list is one row per step, its missing things named ("Looked into it before, Timing"), so the whole list shows on a 390-wide phone above the pinned phone; the held time isn't repeated in Book's summary, since the header shows it;
  - a row opens its step with the first missing thing brought into view and outlined, not at the top; Back there goes to the step before (Next is the way back to Book);
  - in the sheet, Use where I'm standing speaks of "this phone at the door", like New lead; while it listens the button stays at full strength and says "Listening, up to 15 seconds", and a found position is said with a tick by the address it belongs to ("Position saved from this phone at the door, accurate to about 8 m."), brought into view;
  - four-across answers (House type) carry their tick in the chip's corner, so choosing one never moves its words; the hot buttons use the same type size and tick as every other answer.
  Not changed, as questions for Keenan: whether the progress bar should become tappable to jump straight to a step (the phone is four swipes from the door), and whether the four "what they learned" questions should still gate booking now that "Mark the rest Not collected" is the quickest way through.
- **After the re-score (29/40, from 28; round 2 was 31).** A second pair of isolated assessments of the polished build found these, also changed before merge:
  - a step opened from Book had "Back" (the step before) beside "Back to Book"; the gold button now says "Return to Book", so only one button says Back;
  - when Use where I'm standing fails out of sight, its notice with Go there is in the calm bordered style, not red; the location-off and Precise Location notes say "What you've entered stays here." before the steps, only where that's true (the booking sheet, and New lead when it's making a lead, outside View as), since the steps end by closing Vesper;
  - the progress markers are 8 px, up from 6;
  - New lead's optional answers (house type, setter's read, call or text) use the same one-tap answers as its questions, so tapping the chosen one again clears it, as the page says;
  - on the lead page, From the door puts each label above its answer on a phone, so the hot buttons aren't squeezed into a narrow column;
  - "Use it" beside the nearest address is a full 44 px wide;
  - a last read-only review of this polish found that clearing an optional answer on New lead (a second tap) changed no radio, so the phone's draft kept the old answer until the next change; a tap on New lead now saves the draft too.
  Not changed: "Mark the rest Not collected" stays on the door step, as Keenan set it in round 2 (removing it there is his call); the answer chips' tick still sits inline in two- and three-across rows, where it shifts the centred words a little but never wraps them (round 2's rule).

## 2026-11-06: Round 4, tap to jump and sessions (Keenan, after the 2026-11-05 shift)

A small round, nothing customer facing, merged on green before 3:00 pm Calgary. Keenan approved a small additive schema change up front.

- **Tap to jump.** Each step on the booking sheet's progress bar is a button, 44 px tall and about 54 px wide on a 390-wide phone (the six share the full width), so Book is one tap from the door. To make that room the counter moved off the bar to the line with the step's part of the visit ("At the door", right side "Step 1 of 6, 12 to answer"); the header grows by about a third of a button. A jump keeps what was typed on the address step and saves nothing on the way (judgment call: Book saves before it books, and the draft stays on the phone). It doesn't turn on "booking [name]" or Return to Book; Next after a jump is the plain next step. A step jumped over gets no marker; Book's list names what's missing. "Mark the rest Not collected" stays on the door step (Keenan's call).
- **Sessions end themselves.** A session still open at midnight Calgary time ends at its last tap, or at its start with no taps, marked as ended automatically.
  - The last tap is now recorded (`knock_sessions.last_tap_at`, set by every counter tap). Sessions open when this came in took it from their last change (judgment call: the best record there was; for Keenan's 2026-11-05 Springbank session that is 6:50 pm).
  - A `pg_cron` job runs every five minutes rather than once at midnight (judgment call), so it holds whatever the clocks do; each run only touches sessions from an earlier Calgary day, and at most minutes pass after midnight.
  - The close Session and Start knocking already ran for the person now uses the same rule and marks it automatic too (it used the last change, which a start-time fix also moved).
  - The summary shows the next day for a session that ended itself (with its day), and says "Ended automatically: it was still open at midnight, so it ends at the last tap." (or "at its start, with no taps").
  - Tonight's three sessions (Keenan's Springbank from 2:13 pm; Jaxon's and Jax's Cortina from 5:07 pm) were closed by the job's first run at 12:15 am: Keenan's at 6:50 pm, the other two at their start, all marked automatic.
- **The reminder.** A session 15 minutes old with no tap at all shows a quiet line in the status row under the counters, in the counters' own words: "Tap Doors +1 at every door, and Conversations +1 when someone answers." In the status row (judgment call) so nothing pushes the counters down when it comes or goes. It goes for good at the first tap, a tap from before a reload included.
- **One spelling per neighbourhood.** A new session's neighbourhood takes the spelling of the first session that used it, ignoring capitals and extra spaces, in the database (a trigger), so every phone and View as agree. As a setter types, the team's neighbourhoods that match show under the box to tap (judgment call: the team's, since setters work as a team; up to four, the ones starting with what's typed first). Tonight's "cortina" became "Cortina", as Keenan asked (it was in fact entered a third of a second before "Cortina", so the first-spelling rule alone would have kept the lower case). Only sessions take the rule: a lead's neighbourhood comes from Google or from the session, which now has the one spelling.
- **From the review and the critique before merge (round 4).** Two isolated design assessments (28/40 for the changed screens, against 29 for the booking sheet and 29 for Session before) and a three-area code review, each finding checked by two skeptics. Changed:
  - the bar fills for the steps gone through, not by position (a jump to Book looked finished while Book said 12 to answer), the current step is taller, a tap shows pressed, there's a small gap below the held time, screen readers hear each step's title, and the tap that closes the time menu no longer also jumps;
  - a sheet reopened part way (a reload, Unfinished) counts the steps before as gone through, so their markers come back;
  - the overnight summary's wording comes from the times, not the counters: "Ended on its own at midnight, so it counts up to the last tap."; with nothing tapped it gives the day and start only and says "Nothing was tapped, so no time out is counted.";
  - the reminder also counts taps restored from the phone after a reload;
  - the suggestions: what was typed comes first, the setter's own recent places are left out (they're chips already), one label ("The team has knocked"), the list stays put after a tap, and the box moves up so the list clears the keyboard;
  - the spelling rule applies when a session gets a place; an update that only changes capitals keeps what's given, so a spelling can be fixed by hand (migration `20261106072859`);
  - the tests check the session's end state, not how many rows a call closed, since the five-minute job runs on the same database;
  - the welcome tour says a step on the bar can be tapped;
  - after the re-score (28/40 again; both assessors found the current step hard to tell once every step was filled): steps gone through are drawn softer than the current one, a missing marker is a hollow ring (it read as "you are here"), the held time is 44 px tall rather than 48 so the steps sit a little further from it, the neighbourhood box stops clear of the sticky header when it scrolls up, suggestion rows are bordered like the chips, and a double full stop is gone.
  Not changed: the step names stay as they are (the bar's screen-reader labels now use each step's title; Book's list keeps its short names); the counter lives in the scrolling body, so it scrolls off What else did you learn, the one step allowed to scroll.
- **Skew protection: off.** Checked on the live site on 2026-11-06 with a throwaway test setter: 22 in-app page requests and a server action carried no `x-deployment-id` header and no `?dpl=`, and the page has no deployment id. Next.js 16.4 adds them by itself when Vercel's Skew Protection is on. It is a Vercel project setting (Settings, Advanced, Skew Protection, with access to system environment variables on), available on Pro and Enterprise plans, not Hobby. Checked again after the round 4 deploy (merge `ad701b8`): 44 requests, 21 of them in-app page requests and one server action, none with the header or `?dpl=`, so it is still off and Keenan needs to turn it on.

## 2026-11-06: Round 5, Session and the booking sheet from the field (Keenan)

A small round, nothing customer facing, approved up front, merged on green after 9:30 pm Calgary. No schema change.

- **How rounds are tested now (Keenan).** CLAUDE.md rule 11 and the design line changed: every round runs unit tests, lint, types and the build; only the walk-throughs that cover what changed; database tests only for a migration, a permission, or holds and bookings (those keep the race tests); the full suite once a day, on the first round of the day, and before any preview; one quick live check after a deploy; a check that fails once and passes on a re-run is a flake, noted and moved past; no review panels on small rounds, one careful self-review instead; impeccable scoring only for new screens and bigger redesigns; one docs commit per round. This round ran the Session walk-throughs (`m2`, `sessions`), the booking sheet's (`m3`), View as (`nav-view-as`, since both screens changed and View as must cover them) and the hold and booking race tests (`m3-booking`, `m35-day-schedules`), because Session now holds times on other evenings and Delete lets a time go. Judgment call: the full suite wasn't run, as Keenan's review list for this round named only these.
- **Delete an unfinished booking.** A tap on an unfinished booking opens two choices under it, Pick up where you left off and Delete, one above the other (judgment call: side by side they don't fit a 390-wide phone, and apart they're harder to mis-tap). Delete turns into "Tap again to delete" with a line saying what it does, so it takes three taps in all. It removes the draft from the phone; if this phone still has that sheet open with a time held (the app closed mid-booking), it asks the server whether that same time is still this person's hold and lets it go (judgment call: never a hold from another phone or for another time). A person already saved stays in Leads, and the confirm says so ("[name] is saved, so they stay in Leads."). Photos taken before a first save stay in the setter's own private folder, as they do when a draft runs out after 24 hours. The same list on Home works the same way.
- **Other evenings from Session.** Session's open times have the same row of days as Schedule (Tonight, Tomorrow, then each evening of the booking window with how many times are open) in place of the All evenings link, and the chosen evening's times in the same spot. The heading is now just "Open times"; one quiet line under the days says when the chosen evening has nothing open or no meetings, or why it opened on a later evening (`eveningNote` in `lib/schedule/board.ts`, unit tested). The day picked stays picked when the times refresh (judgment call: it used to jump back to the opening evening). The row adds about 70 px; the knocking view still fits one screen at 430 x 932 (End knocking 42 px clear of what the installed app needs), and at 390 x 844 it now scrolls a little to End knocking (before, it fit with 38 px to spare); the counters and tonight's times stay on the first screen.
- **The phone on every step.** A slim one-line field ("Phone", 44 px tall) at the bottom of every step, above Back and Next, staying put as the steps change; it opens the number pad and shows a tick once it's a real number. Typing a number takes back a Not collected (judgment call: the field is never locked, so a number given late is just typed). Call or text to confirm and the phone's Not collected moved onto the Book page itself, under what's still missing. While the keyboard is up, the sheet fits the part of the screen still showing (the visual viewport; iPhones don't shrink the page for the keyboard), so the field and Back and Next sit right above it. To keep every step but What else did you learn from scrolling at 390 x 844 with the extra line, the house step's gaps are a little tighter on narrow phones, the footer's spacing is a little tighter, and the nearest-address line is shorter ("Nearest address filled in. Check the house number.", on New lead too). Book with the phone marked Not collected may scroll a little, like Book with things missing. Unfinished's "Stopped at" for the first step now says "the name".
- **Not reachable by the walk-throughs:** the real iPhone keyboard (a desktop browser has none), so the footer above the keyboard is checked by measurement only, on Keenan's phone.

## 2026-11-07: Round 6, Part 1: Leads, the questions and private notes (Keenan, from the field)

Nothing customer facing; merged on green after 9:30 pm Calgary. Keenan approved the scope up front, the additive schema changes and the edits to the step notes and door guide included. Part 2 (the AI note taker) waits on Keenan's keys; what it needs went to him first (OpenAI `gpt-transcribe` for speech, Claude for the note and answers, `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` in Vercel, about $40 to $50 a month with Claude Opus 5.5 or about $8 with Claude Haiku 5.5, his choice).

- **Testing.** The first round of the day, so the full suite ran (CLAUDE.md rule 11): unit (448), lint, types, build, database (195, plus `notes-locked` after the second migration), smoke, and every walk-through: location 9, m1 23, m2 122, m3 174, m5 meeting 37, Meetings page 27, View as 163, quote link 36, sessions 19, setter side 51. The first pass found two real problems, not flakes, both fixed and their walk-throughs re-run: the Leads page's who menu carries the search in a hidden field, so m2's search box selector matched two inputs (now the search box by its name); and the soffit's Note chip made its label line 12 px taller, which tipped the house step at 390 into scrolling when a nearby lead's notice shows (the chip now reaches into the space around the line, like Not collected). Two helper agents did the Leads page and the walk-through updates in parallel, on their own files; no review panels.
- **Two migrations, the second after the deploy.** `round6_leads_and_notes` (additive: the Phone call source, the combined answers, the split soffit's column, `answer_notes`, the `lead_notes` view and the timeline's note policy) went in before the build, since the running app ignores all of it. `round6_notes_private` takes away the table-wide read of `leads.notes` and edits the step notes and door guide; it went in right after the deploy, because the app that was live until then still read `leads.notes` straight from the table (judgment call, the same way contact privacy was switched on). Its own database test (`tests/rls/notes-locked.test.ts`) ran after it.
- **Leads.** One row of four status filters (Active, Later, Met, Closed) with a count each, and a small native menu for whose leads beside the title, which fits a 390-wide phone with room to spare. CLAUDE.md's "no top tabs" is about navigation; this row filters the page, so it stays (judgment call, recorded in CLAUDE.md). Keenan's Mine is the leads he created; Setters is every lead someone else created (judgment call: by who added it, since that's what "the leads he adds himself" means). Met and Closed show their outcome; Keenan's cards show the source. Keenan's cards drop "read only", since he can change any lead.
- **The questions.** Which areas, Timing and Call or text are no longer asked anywhere; saves don't send them, so older leads keep what they have (judgment call: the lead page no longer lists them either). Six questions are counted. Christmas lights now and Looked into it before take two answers together, stored as one combined value so the columns stay single answers and every screen reads them the same way (judgment call over a second column). A split soffit takes two colours and must have its note, in the database too.
- **A Note on every required question.** A small chip beside Not collected opens a one-line box; on the soffit it sits on the colour's own label line in the booking sheet so the house step doesn't grow. The phone's note sits beside its Not collected on Book and on New lead. The lead page's new Notes card lists every note together.
- **Notes privacy.** `answer_notes` has no read grant at all; `lead_notes` hands notes to the owner and the lead's own setter, like `lead_contacts`; the timeline's select policy hides `note` entries from other setters; the app applies the same rule again for View as (`lib/leads/notes.ts`) and drops note entries from the timeline of a lead the viewed setter doesn't own. The soffit's "which is where" note stays with the answer (readable like the colour), since it describes the house, not the person.
- **The step notes and door guide.** "which parts of the house, and when" came out of the At the door note, and both the note and the door guide got "Mention that we're installing now, right up to Christmas."
- **Session at 390.** The day row's chips are 48 px tall on Session (56 on Schedule) and the "Open times" heading is for screen readers only, since the chips already say "Tonight, 6 open"; the knocking view fits one screen at 390 x 844 again.
- **Meeting mode** still shows the first soffit colour only. Showing both is a customer-facing change, so it waits for the next preview (noted, not done).

## 2026-11-08: Round 7, Branch A: the Meetings page's prep list (Keenan)

Owner only, nothing customer facing; merges on green. Keenan approved the scope up front, the additive schema change (`meetings.confirmed_at`, `settings.confirm_text`, `confirm_meeting`) and the ready-made text included. Migration `20261108035054_round7_meeting_prep`.

- **Testing.** Not the first round of the day in Calgary (round 6's full suite ran on 2026-11-07), so (CLAUDE.md rule 11): unit, lint, types, build, the whole database suite (a migration changed), and the walk-throughs that cover what changed: the Meetings page (prep list, quick pick, Home, Schedule), View as (Schedule and Home cards changed for everyone) and m3 (Schedule's meeting card).
- **Quick pick.** Two sideways rows under tonight: Next few days (the next three evenings after tonight) and Recent leads (the ten newest leads that aren't lost, without the booked ones). Judgment calls: three evenings is "the next few days"; the meetings after them stay listed below as Later, so no meeting shows twice; the rows scroll on their own and the page never scrolls sideways. Each card is one tap to its prep list (the whole card) with its own outlined Start.
- **Ready, or what's left.** The items are, in Keenan's order, Mockup uploaded, Track colour set, Quote drafted (a quote with at least one run), Time confirmed (only for a booked meeting still to come; Start a meeting for a walk-in has none), Missing answers filled (any of the six left Not collected or unanswered), and, from Branch B, Roofline traced. The prep line replaces the mockup and track colour flags on the Meetings page and his Home; Home says "2 left: quote, missing answers" on one line, the Meetings page "Prepare for the meeting · 2 left: …".
- **The prep list page** (`/app/meetings/prep/[lead]`, owner only, View as never reaches it). One gold button at a time (DESIGN.md): the first item still to do; Start turns gold once everything is Ready. The mockup and track colour reuse the lead page's own controls; Draft the quote opens meeting mode at `#quote` (Branch B makes meeting mode open on the quote there; until then it opens where it would). Missing answers are answered with the same buttons as the door, Christmas lights and Looked into it taking two answers as there.
- **Confirming.** Text is an `sms:` link with the text filled in, so his phone's Messages opens with it to change before sending; Call is a `tel:` link. Confirmed is a separate tap that records when (judgment call: the app can't know a text was sent), and Take it back clears it. The text fills {first_name}, {day} ("tonight", "tomorrow" or the weekday) and {time} ("7:30"); the wording is in Settings under Confirming meetings. A moved meeting starts unconfirmed, since it's a new time. The tick shows only to Keenan (setters don't confirm meetings, and Schedule is shared).
- **Not reachable by the walk-throughs:** tapping Confirmed or saving answers as Keenan, since the owner's one-time session only views. The database test proves setters, signed-out callers and the secret key are refused; the walk-through stages a confirmed time to check the ticks, and checks the text, the links and the buttons without tapping them.

## 2026-11-08: Round 7, Branch B: meeting mode, deeper (Keenan; settled by a five-seat debate)

Customer facing, so it waits for the preview and merges only on "push the changes". Keenan approved the scope up front, the additive schema changes included. Before building, five separate agents argued it out over two rounds, each with its own brief: a Calgary homeowner at the kitchen table, Keenan closing, a premium brand designer, an iPad presentation specialist and a plain-language editor. A sixth settled it into a build spec, and three more researched a reference shot for every photo slot. The full spec, with each decision's seats for and against, is kept with the branch's working files; what follows is what was decided and why.

- **Page order.** Cover, What Vesper is, Hidden by day, Warm white most nights, Try it on your house, Run it from your phone, Homes we've lit, How install day works, Our 10-year warranty, Where your lights would go, Your colours, Your price. Three quick product pages answer "what is it", "will it look like junk by day" and "will it look tacky"; their own house lit at page 5 is the trial close while attention is high; the phone page turns the toy into ownership and is where Keenan takes the iPad back; real installs straight after the preview keep it honest; the customer holds the iPad for four harmless pages before the inputs; the price still comes in about ten minutes. All five seats.
- **The cover** is navy with the wordmark and the address, no photo: a stranger's photo of their house before any trust reads as "they photographed our house", and it would spend the picker's reveal.
- **Layout.** The photo above a solid navy band (about 30% of the height), headline left of a line at 56%, words right, every button bottom right on navy; install day and the warranty split, picture left. Take 1's caption plates covered the roofline being sold. Headlines 52/60 px, words 27/30 px, nothing a customer reads under 20 px, because they read it from 1.2 to 1.5 m across a table.
- **More.** At most one per page, a labelled 56 px button that says what's behind it (never "More", "Learn more", an i or a plus), opening one full-screen layer, 60 words at most (the full warranty excepted, being word for word). No More on the picker (the controls are the page) or the mockup (pinch is the depth).
- **Words.** All in Settings, seeded from the debate. Plain language, Canadian spelling, no dashes or exclamation marks, no jargon (lights, never nodes; "about 8 inches apart"; "red, green and blue, plus its own white"), only promises kept today: nothing about schedules, voice, more phones, monthly fees, durations or "before Christmas" until Keenan confirms them. "We", never Keenan by name. Every page stands alone; the bridges are Keenan's to say.
- **"Colour matched" is gone** from every new customer word: white is the only stock track. "White track is in stock. Other colours are made to order." Flagged, not changed: the take 1 presentation that is live today still says the track "matches its colour" on Hidden by day (it goes away when this ships, or Keenan can edit it in Settings now), and the parked quote link rework carries the same claim in its FAQ and product point, to fix on that branch.
- **Flagged for Keenan:** "an investment in your home" is dropped from What Vesper is (he can put it back in Settings).
- **Fallbacks.** Until Keenan's own photo is in a slot: an original line drawing in the brand colours (the house lit warm white, the day and night pair, two lit corners, a plain phone outline with nothing on its screen), words alone, or the page skipped. Never the customer's photo on a generic page (it has no track on it, so it would fake proof) and never another company's photo.
- **References** (Keenan: never copy them into the app): stored as links only in an owner-only table, loaded in the browser from where they live with no referrer, shown only in Settings' shot list and the rehearsal view under "Example to copy". The meeting payload has no field for them, the offline copy never caches the rehearsal route or a cross-origin image, and unit tests check both. 34 researched, one or two per slot; most images weren't viewable from the cloud session, so each says what was confirmed and what Keenan should check by eye.
- **The light picker.** Their photo dimmed to dusk (measured per photo in prep to about 20%, never brightened, a flat navy layer, no vignette or invented glow), lights at 5 a metre along the traced roofline scaled from the garage door (Double 16 ft by default), each drawn as a core, a tight halo and a faint bloom so neighbours touch without merging into a tube. Five looks to start: Warm white #FFB46B (about 3000 K), Cool white #E4EEFF, Christmas, Game night (red and amber, never brand gold, which glows brown), Halloween; colours in blocks of 3. Steady, Twinkle, Chase and Off; every meeting opens on Warm white, Steady; nothing moves until tapped; no light changes more than 3 times a second (a unit test checks every look with every effect). The first arrival holds the photo half a second, dusk falls over 1.2 s and every light comes on together, the way the product does. No zoom. Words only on the look buttons, no swatches: the house is the swatch.
- **Tracing** is prep item 6: taps along the roof edge with a loupe, pinch to zoom, lines per separate edge, the garage door for scale, See it lit. Under two minutes a house. Lines are not tied to quote runs (the quote is built at the table, after the picker).
- **Gallery.** One photo at a time, the look as the only caption (never a neighbourhood: with a few installs it's enough to find a house), See all N for the grid; no nested scroller trapping a swipe.
- **The warranty.** The first three lines word for word, the company and phone; the full text and the service call fee behind The full warranty, so no dollar figure appears before the price page.
- **Your colours.** Split soffit on two lines, never joined with "and" ("Off-white or cream" already has an "or"); "We'll check it together." for Not sure; the setter's note is never sent to meeting mode at all; "Screens can't show colour exactly, so we choose it from the colour book together."; a labelled eave drawing so they know which surface is the soffit.
- **Leaving** takes a 600 ms hold (or Escape): a customer holding the iPad would do what "Tap again to leave" says and land on the lead page with its notes.
- **The data** is new and additive (`settings.deck`, `settings.light_looks`, `deck_photos`, `presentation_references`, `roofline_traces`), so the deck that is live today is untouched until the merge. The references seed was split into its own migration and checked against the file by checksum after applying.
- **Not reachable from the cloud session:** WebKit and a real iPad, so the picker's frame times on an older iPad aren't proven here; a watchdog drops Twinkle to 15 fps if frames run slow. The iPad setup note (home-screen app, Night Shift and True Tone off, a Focus on, brightness up, Guided Access) is in Settings and the report.

### After the build: the same seats reviewed it (2026-11-08 to 11-09)

The five seats from the debate, a spec checker and an impeccable critique reviewed iPad screenshots of the built deck (1180x820 and 1366x1024, the real app against the real database, a staged test lead). Impeccable scored it 28/40 before and 35/40 after two fix rounds, and every seat called it ready for Keenan's preview. What the review changed from the settled spec, and why:

- **Page 4's drawing** looked broken (a crop leaking the upper floor and stopping in mid-air; every seat). The drawn fallbacks now fill the photo area edge to edge like a photo crop, and pages 2, 3 and 4 zoom in step by step: the whole house, a medium view of the lower floor with the upper walls running off the top, then the entry close up. The day half of Hidden by day is a warm paper tone instead of pure white (it glared at dusk), with the track drawn as one slim strip under the edge.
- **Up close** shows a close day view of one eave with the track tucked under it until Keenan's photo exists (the spec said words alone; four seats said a button called Up close has to open something to see).
- **The phone page** draws the whole lit house with the phone standing in front of it, its screen still blank as settled.
- **The light picker's colours** read pastel: colour lights now mix their core 30% toward white with a 0.7 halo (whites keep 60%; Warm white 45% so it reads warmer beside Cool white). The wash on the wall is 0.6 m deep at 20% for whites and 26% for colours (it was invisible at 0.35 m). The photo is framed to the roofline and the door the scale was set on, always keeping the full margin above the roof; the bottom gives way, ground first. A fresh meeting opens the picker on Warm white, Steady with the light-up to play, as settled (the build had kept the last look for 3 hours). On the photo, only a flick or a long drag turns the page, so a customer tracing their roofline with a finger never does. While Off is chosen, the remembered look shows as an outline.
- **Navigation:** the chevrons moved off the pictures into the bottom row beside the dots (thumbs rest at mid-height when someone holds the iPad), and they and the dots hide while a layer is open. The exit X sits 20 px in, and its hold is cancelled by any slide or a second finger, so holding the iPad by its corner never leaves the meeting.
- **Words-only pages and layers** sit centred at the deck's 64 px margin instead of hugging the top; the mockup page draws no divider beside an empty column.
- **The colour chooser in the meeting** opens as a layer, in plain words (Colour number, from the colour book; no "RAL Classic" or "powder coating" on the customer's screen), with the number field and Save above where the iPad keyboard comes up. Save turns gold only once something changed.
- **Typography:** apostrophes draw as typographic ones; the service call fee reads "+ GST" while GST is on.
- **Settings:** a When to shoot view of the shot list (Daylight, Blue hour with today's Calgary sunset, After a snowfall, Install day); fit checks that refuse words or More labels that would run into the bottom row at either iPad size; the rehearsal opens on the Customer view once a lead is picked.
- **The reference shots** were rewritten as plain notes for Keenan (they read like a research log), and where the first example showed the opposite of its slot the backup took its place. Applied in data migrations matched on the seeded text, so nothing Keenan edits is touched. The connector asked for an approval on one of them; Keenan said never to ask him to approve SQL (2026-11-09, now in CLAUDE.md), so it went in as five plain-update pieces that needed none.

Flagged for Keenan, not changed (settled words, his call in Settings): the initials sentence says "the track colour we'll order" before the price; "Hidden by day" and "By day you see your house" are strong on a dark soffit with a white track; install day's step 1 says "the colours" are confirmed on the day; "Every light has its own white" depends on the white LED's colour temperature. The price page stays as built until its own round.

## 2026-11-09: Soffit colour code and Use for the track (Keenan)

Keenan asked for each lead to record the soffit's own colour from the RAL colour book (the number, a photo of the book held up to the soffit, or both), and added a one-tap "Use for the track" for himself. Setter and owner screens only, nothing customer facing, so it merges on green. Migration `20261109012757_soffit_colour_code` (additive: `leads.soffit_ral_code` and `soffit_ral_code_2` with their read grant, the `soffit_book` and `soffit_book_2` photo slots, the trigger that clears the second code when the soffit stops being split, and the timeline's field list).

- **Where.** On the lead page it sits inside the Find out card, right under the soffit colour, with its own heading; on Keenan's prep list it sits in the Track colour item, above the track colour itself, since Use for the track is what links them. Never on the booking sheet, New lead or meeting mode. A soffit of one colour gets one code and one photo with no colour label; a split soffit gets two, each headed with its colour's name. Judgment call: the single block shows even when the soffit colour isn't answered yet or is Not sure, because that is exactly when the colour book helps.
- **Typing the number.** "RAL" is printed in the box and the number pad opens, so only the four digits are typed; "RAL 9010", "ral9010", "RAL-9010" and " 9010 " all save as 9010. The name reads back under the box as soon as four digits are in, and a number not on the RAL Classic list says so before Save. Emptying the box turns Save into Clear. After an error the box keeps what was typed. Judgment call: the lead's own setter now gets the whole RAL Classic list on their own lead page to name the number as they type (every setter could already read that list); other setters get only the names shown.
- **The photo.** Through the same upload as every lead photo: shrunk on the phone, into the person's own storage folder, then `attachLeadPhotos` with the slot, which now also refreshes the prep list for these two slots. Judgment call: a small single-slot component beside `PhotoSlots` rather than two more slots inside it, because the four guided slots also drive the booking sheet's tiles and Before you book, and these must stay out of both. A tap on the photo shows it large in a panel inside the app (not a new tab, which the installed app opens in Safari). A replaced photo stays with the lead under More photos, like any retake.
- **Use for the track.** Owner only, beside each saved code, with a line saying what it sets. The server reads the code from the lead (never from the browser) and picks the first active colour on Keenan's Track colours list with that RAL code, in his order, otherwise Custom with the code; a retired colour is never picked. It saves by calling the track colour card's own action (`setTrackColour`), so the owner-only guard, the timeline entry and the refreshes are exactly as before. "Already set" means the track colour is exactly what the tap would set; judgment call: a lead whose track is Custom 9016 while White (9016) is on the list still offers the button, since the tap would switch it to the stock colour. Once set it reads "Track colour is White, RAL 9016 Traffic white." The track colour form starts again from the saved colour whenever a code's "already set" changes, so it never shows the old choice after a Use for the track; it is not restarted on every saved change, since that would also wipe its "Saved." after its own save.
- **Buttons.** Save and Use for the track are outlined, never gold: the lead page and the prep list already have their one gold action.
- **The timeline.** "Changed the soffit colour code", "Changed the second soffit colour code", "Updated Find out: second soffit colour" (the split soffit's second colour, which had no label before), "Added the colour book photo" and "Added the second colour book photo". Never the number; nothing is copied into notes or event payloads beyond what the triggers write.
- **View as.** The section renders for the person viewed: their own lead's code is a field with Save and the photo buttons, another setter's lead reads only, and Use for the track never shows. A Save reaches the server, which refuses it, and the screen says "View as: nothing was saved." calmly with the typed number kept; a photo is shown on screen only.
- **Tests.** Unit tests for `lib/leads/soffit-code.ts` and the timeline labels; a database test `tests/rls/soffit-code.test.ts` (throwaway setters, removed after); a new live walk-through `tests/live/soffit-code-walkthrough.mjs` (the setter types and saves a code, adds a colour book photo, a second setter reads it, the owner's one-time session looks at Use for the track on the lead page and the prep list without tapping it, View as compared and refused); and soffit checks added to the View as comparison and click-through in `nav-view-as-walkthrough.mjs`.
- **Not reachable by the walk-throughs:** tapping Use for the track, and saving a code or photo as Keenan, since the owner's one-time session only views. The unit tests cover what the tap would choose, the database test proves a setter can't set the track colour (the service role stands in for Keenan's path), and the walk-through stages "already set" with the service role to check that state.

**The mockup is Keenan's alone (found by this feature's review, 2026-11-09).** The setters' photo policy never looked at the slot, so a setter could put a photo in the mockup slot of their own lead, and it would take the place of Keenan's in meeting mode and on the customer's quote link. A guard (`lead_photos_mockup_owner_only`) now refuses a mockup from anyone signed in but the owner, and the photo action refuses it too; the database test covers both. A guard rather than a replaced policy, so the change stays additive.

**Use for the track and Settings.** Until the stock colours in Settings > Track colours carry their RAL numbers, no soffit code can match one, so Use for the track sets Custom (needs powder coating). Keenan gives White, and any other stock colour that is a RAL Classic colour, its number once, and from then on a matching soffit code picks the stock colour.

## 2026-11-09: Round 8, quote outcomes and setter commission (Keenan)

Keenan asked for a quote's outcome on the lead page (Accepted, Declined, Cancelled, Installed, each on the timeline with who and when) and for the setter's commission (5% of the lights and control boxes after discounts, to the lead's setter, coming on acceptance, payable once installed, marked paid in Pay, voided with the reason if undone or cancelled before it is paid; setters see their own in My pay and on Home). Internal only, Keenan and setters: it merges on green outside the knocking window. Additive schema changes approved up front. Accepting a quote and the commission move here from M5 take 2, which keeps the leave-behind folder, Mark presented and the quote-ready rule. Four migrations: the new enum values first (`quote_status` cancelled, `event_type` quote_cancelled and quote_acceptance_undone), then the columns and guards, then the outcome functions, then the review's fixes (below).

- **The commission base is worked out in the database**, from the stored quote, never from a number a browser sends (`quote_commission_base`): feet = the sum over the accepted runs of `least(10000, greatest(0, round(feet)))`, numeric JSON values only; track = `round(price_per_ft x 100) x feet` cents; boxes = `round(box_price x 100) x greatest(box_count, 0)` cents, and boxes always count; discounts = the sum of `round(greatest(0, amount) x 100)` cents over `quotes.discounts`, numeric values only; base = `greatest(0, track + boxes - discounts) / 100`; amount = `round(base x settings.commission_rate, 2)`. It never reads `adders`, `colour_timing`, the rush fees, the upper access fees or `min_job_total`, so the rush colour fee, upper access, every extra work line and any top-up to the minimum are left out by construction, on main today and after the quote link rework merges. This supersedes both earlier rules: "the accepted quote total as actually priced, before GST" (main's docs) and "lights and control box after discounts, rush and upper access left out" (2026-11-04, recorded on the rework branch), which said nothing about other extra work or the minimum top-up. Discounts come off the lights and boxes only, not off the whole subtotal as on the quote itself.
- **A TypeScript mirror in a new file, `lib/pay/commission.ts`**, never in `lib/pricing.ts`, which the rework rewrites. It takes only the runs, the box count, the two prices, the discounts and the accepted positions, and imports only `cleanFeet`, `QuoteRun` and `QuoteLineItem` from `lib/pricing.ts`, so it compiles on both sides of that merge. It is for previews (Keenan's Accepted sheet) and unit tests, and gives exactly the database's amount. Judgment call (builder L): money is turned into cents from the number's own decimal digits rather than by multiplying by 100, because 1.005 x 100 is 100.49999999999999 in floating point while Postgres reads the stored 1.005 exactly and rounds it to 101; and the amount is worked in whole cents times basis points, rounded half up, which is what `round(numeric, 2)` does where a plain `base x 0.05` can be a cent low ($3,002.10 at 5% is $150.11, not $150.10). Unit tests cover both, hand-worked examples, a Start smaller acceptance, and a quote with rush colour, extra work, an upper-only line and a minimum above its total, to show each is left out.
- **The accepted option.** If the customer booked "Start smaller" on their link (`quote_links.booked_selection`, while it still matches the quote's runs), Accepted offers it as the default choice beside the full quote. The accepted positions are stored on the quote (`accepted_runs int[]`, null = every run) and the commission counts only those runs.
- **Who earns it.** The lead's setter at acceptance, `coalesce(leads.assigned_to, leads.created_by)`: the same person who gets the booking pay (which is recorded on the meeting when it is booked) unless the lead was reassigned since. Only `sales` profiles earn; a lead assigned to Keenan earns nothing, and his card says "No commission: the lead is yours."
- **Only the database moves a quote to accepted, declined or cancelled**, through owner-only SECURITY DEFINER functions (`quote_accept`, `quote_decline`, `quote_cancel`, `quote_undo_acceptance`, plus `lead_mark_installed`), gated by `acts_as_owner()` so the test suite's service role can stand in for Keenan. A guard on quotes refuses any other way in or out of those three statuses (hint `outcome_only`), and locks an accepted quote's numbers (hint `quote_locked`) by comparing the whole row as JSON minus the outcome fields, `notes`, `pdf_path`, `presented_at` and `updated_at`, so it never names the rework's columns. A safety-net trigger on leads keeps the commission in step if a lead's status changes any other way: leaving Sold or Installed voids pending unpaid commission ("The lead left Sold"), Installed makes it payable, Installed back to Sold makes it not payable again.
- **Undo, then accept again.** One commission row is allowed per quote (void rows included, `earnings_one_commission_per_quote`) and its amount never changes, and replacing that index would not be additive. So when a commission is voided by Undo, Cancel or the safety net, its `quote_id` is cleared (the earnings guard allows that one change, only on a void, unpaid row) and the quote it came from is kept in a new `source_quote_id`; a fresh acceptance can then make a new row at the new amount. A paid commission is never touched: Undo and Cancel leave it paid (the screen says so), and a lead never gets a second commission while one is pending or paid (`quote_accept` returns the reason `already_paid`).
- **Undo** puts the quote back to `draft`, so meeting mode opens it again for changes, and the lead back to the status it had before Accepted, stored on the quote at acceptance (`lead_status_before`; never sold, installed or lost, else Met), with the planned install day cleared. It is offered while the lead is Sold, not after Installed. To change an accepted quote's numbers, Keenan undoes the acceptance first.
- **Accept** works from draft, presented, declined or cancelled (a customer who comes back). One accepted quote per lead. It needs a track colour on the lead first, and copies it onto the quote the way saving a draft does; if there isn't one, the sheet asks for it first.
- **Decline and cancel reasons** are one fixed list: price, timing, partner said no, went with someone else, other, stored as those words (the database checks them). It is a different list from `settings.lost_reasons`, which still governs Lost set by hand. The lead's `lost_reason` gets the reason's words for a decline ("price", so the card reads "Lost: price") and "cancelled, <reason>" for a cancel ("Lost: cancelled, timing"). Judgment call (builder L): "Lost: cancelled, timing" reads well as it is, so the Leads card prints `lost_reason` unchanged, and the timeline's status line reads "Moved from Sold to Lost. Reason: cancelled, timing."
- **The note with Other** goes only on the quote (`outcome_note`, at most 300 characters, owner only like every quote column), never in `lost_reason`, an event payload or a commission note, because setters read those. Judgment call (builder L): the note is optional with Other, as the database allows; a note with any other reason is refused (`bad_note`).
- **The 10-day window** is not stored. The Cancel sheet works it out from `accepted_at`, and the database puts `inside_window` (accepted within 10 days of the cancel, `accepted_at > now() - interval '10 days'`) in the cancel's event, so the timeline says "Cancelled the sale: timing, inside the 10-day window." or "..., after the 10-day window." `lib/quotes/outcome.ts` uses the same test, as 10 x 24 hours: the database's sessions run in UTC, where `interval '10 days'` is 240 hours, so the two agree even across a daylight saving change (when the window is an hour longer or shorter in Calgary's own clock time, which never matters here).
- **Cancelled, not "Cancelled the meeting".** The timeline says "Cancelled the sale" so it never reads like a meeting cancelled before its time.
- **Installed** is offered once the lead is Sold with an accepted quote. It asks for the day (today by default, never later than today in Calgary), sets `installed_at` to noon Calgary time on that day so every screen shows the right day, and the commission becomes payable (`payable_at = now()`, so a backdated install doesn't backdate pay). The existing status change event logs it.
- **The planned install day** goes in a new `leads.install_on date`, asked (optional) when the quote is accepted: a read grant for every signed-in person, set only by the owner. A trigger also stops a signed-in non-owner changing `sold_at` or `installed_at`, which their column grants used to allow on their own leads.
- **Declining or cancelling closes the customer's link** as a side effect: the link shows the newest draft, presented or accepted quote, so a declined or cancelled one drops out and the customer sees the existing closed page with call and text. Accepted keeps the link working. No customer page code changes; flagged in the round's report.
- **The owner's status menu** no longer offers Sold or Installed; they come from the quote's outcome, so the commission can't be skipped. On a Sold or Installed lead with an accepted quote, the status menu gives way to a line pointing to the outcome card. Lost and the earlier statuses work as before (and the safety net voids any unpaid commission if Keenan moves a Sold lead to Lost by hand).
- **Timeline events** carry the quote id and fixed-list facts only: `quote_accepted` `{quote_id, install_on}`, `quote_declined` `{quote_id, reason}`, `quote_cancelled` `{quote_id, reason, inside_window}`, `quote_acceptance_undone` `{quote_id}`. Never an amount, never a typed note. Judgment call (builder L): the timeline only ever prints a reason that is on the list, so a payload with anything else in it still reads "Marked the quote declined."
- **Money on setter screens.** Home uses whole dollars when there are no cents ("$142"), like Keenan's example (`formatMoney` from `lib/pricing.ts`); My pay keeps its own style ("$142.00"). Keenan's outcome card uses whole dollars too ("$142 to Zane, coming once installed").
- **The Settings label** for the rate becomes "Commission (% of the lights and control boxes after discounts)".
- **Declining while a sale stands.** `quote_decline` is refused while another quote on the lead is accepted (`already_accepted`): the sale stands on the accepted quote, so declining an older draft must not send the lead to Lost. Declining or cancelling also clears the planned install day.
- **Undo back to Follow up.** A lead whose status before Accepted was Follow up comes back to Follow up due tomorrow, the way a cancelled booking does, because Follow up always needs its day.
- **Words for the database's refusals** live in `lib/quotes/outcome.ts`, one per hint. Judgment call (builder L): the functions answer a quote they can't find with the same hint as one in the wrong status (`not_open`, `not_accepted`, `not_undoable`), so those words fit both: "This quote has changed since the page opened. Refresh to see where it stands."
- **The planned install day on the timeline.** The acceptance's own entry names the day ("Marked the quote accepted. Install planned for Fri, Nov 20."). An edit entry that lists the field names it without the day ("Changed the planned install day."), the way every other field is named.
- **How the mirror is checked.** Beside the hand-worked examples, the unit tests check the mirror's rounding against exact whole-number arithmetic for thousands of bases and rates, and its cents against Postgres's half-up rounding for thousands of stored amounts, so a preview never differs from the database by a cent.
- **The planned install day after the yes** (builder U1). The accepted card has a Change link (Add a day when there is none), owner only and refused under View as, so a sale accepted with no date gets one without Undo and accept again, which would void and remake the commission.
- **The status menu keeps a Sold or Installed lead's own status** (builder U1) when there is no accepted quote, so a lead marked Sold by hand before round 8 still shows where it is and can move to Lost or an earlier status. None existed when this round merged (checked on the live database, 2026-11-10). It never offers Sold or Installed as a new choice, and the server refuses a status change on a Sold or Installed lead that has an accepted quote, for a page opened before the sale.
- **Setter screens** (builder U2). Pay lists voided lines from the last 30 days, up to 20 per setter, booking fee voids included. My pay's Commission card always shows, with an empty state. Keenan's Pay shows a commission's rate and base ("5% of $2,840.00") so he can check it; setter screens show only the amount. Home's commission rows sit under a Sales heading at the top of How mine went, newest void only per lead, hidden once the lead has a live or paid commission again. My pay's total stays labelled "Paid, all time".

**After the review (2026-11-10).** A four-reviewer pass, each finding checked by a skeptic, found nothing that leaked data and nine smaller gaps, all fixed before merging (one more migration, `round8_outcome_fixes`):
- **A way back from Installed.** Installed had no buttons and the status menu was hidden, so a wrong tap, a wrong day or a cancel after the install could never be put right. The card now offers Cancelled after Installed (`quote_cancel` already allowed it: an owed commission is voided, a paid one stays paid) and Not installed yet (`lead_undo_installed`, owner only): back to Sold, the install date cleared by `leads_guard`, and an owed commission waits for the install again through the safety net.
- **Undo after the meeting.** A quote accepted while the lead was still Meeting booked (outcomes are marked after the slot) came back to Meeting booked with no meeting. Undo now sends it to Met when no booked or confirmed meeting is left.
- **No new quote while one is accepted.** Meeting mode saves into the lead's draft, or makes one; after an acceptance there is no draft, so a save made a second quote that then stood in for the sale on the customer's link and the outcome card. The quotes guard now refuses a new quote on a lead whose quote is accepted (hint `quote_locked`). Meeting mode's own words for that refusal ("Check your signal") are left as they are this round, since meeting mode doesn't change; noted for the meeting mode branch.
- **The link closes for good on a no or a cancel.** Decline and Cancel now also call `revoke_quote_link`, so the page reads as expired even when an older open quote is still on the lead, and the timeline says the link was turned off. Accept again doesn't bring it back; Send again makes a new link.
- **The planned install day on the timeline.** `leads_log_events` now names `install_on` when it changes on its own ("Changed the planned install day."), with who and when; not when a status change sets or clears it in the same update, where the outcome's own line already says it.
- **Home's words for a void** follow the database's fixed note: "Cancelled. No commission." for a cancel, "Sale reopened. No commission for now." for an undone acceptance, "No longer sold. No commission." otherwise. It said Cancelled for all three.
- **A declined or cancelled card after the lead moves on** says where the lead is now ("They said no. The lead is now Follow up.") instead of "The lead is Lost".
- **The status menu on the server** refuses a change on a Sold or Installed lead with an accepted quote (see above).
- **The quote link rework merge.** A unit test fixture carried the old per-foot rush key with a plain cast, which would fail the type check once the rework's `QuoteInputs` lands; it is cast through `unknown` now.
- Refuted by the skeptics: that pre-round-8 Sold leads with no quote could never be marked Installed in practice (none exist, and none can be made now), and that the outcome card demotes an Installed lead.

## 2026-11-10: Round 9, the meeting as one story, and offers (Keenan; settled by the five seats)

Keenan: the meeting has to make more sense from start to finish, each page leading into the next; offers (a quote keeps the house's measured runs once and each offer picks which runs it covers), shown biggest first in meeting mode with the customer's pick marked, built in a quote editor on the lead page, on the customer's link in place of Start smaller, and on round 8's Accepted sheet with commission on that offer's lights and boxes. Customer facing: one preview, merged only on "push the changes". Keenan approved the scope up front, additive schema changes included.

**One branch.** `meeting-story` combines main (with round 8), the quote link rework and round 7's meeting mode, deeper, which were each waiting for a preview. The round 8 follow-ups are in: meeting mode's save says in plain words when a quote is accepted (hint `quote_locked`), and the link's `optionName` and `choiceLabel` survive.

**The same five seats** (a Calgary homeowner at the kitchen table, Keenan closing, a premium brand designer, an iPad presentation specialist, a plain-language editor) walked the whole meeting in order over two rounds, and a sixth settled it into a build spec, kept word for word in `docs/meeting-story-spec.md` with each contested point's votes. In short:
- **Order:** Cover, Up once there all year, Hidden by day, Run it from your phone, Homes we've lit (skipped while empty), Our 10-year warranty, Your house (new), Try it on your house, Your track colour, Your price, What happens next (new). The Vesper pages come first, then the story turns once to their house and never comes back. Warm white is cut to a stand-in (the picker opens on Warm white instead); Where your lights would go merges into Your house (the mockup is its picture when there's no trace); How install day works merges into What happens next.
- **The Next label** ("Next: {page}", 20 px, beside the forward arrow) replaces round 7's rule that the bridges are Keenan's to say. More and every layer's Back moved to the bottom left to make room.
- **Your price** is a presentation, not a form: every option's total at once, biggest first, the one on screen lit on the house drawing (runs left out dashed) with its own breakdown, and an outlined Choose that marks the pick (no gold on the customer's page). Building and editing moved to the quote editor, behind a small Edit at the table.
- **Your track colour:** one rule. White is in stock and included; every other colour is made to order, with two equal choices, Install in spring (included) or Install this season (the rush fee, hidden when not set). The initials stay on this page and are read back on What happens next, with the box there if they were skipped.
- **What happens next:** the recap once an option is chosen, then Your colour, Your install day (Pick a day, optional), On the day, Paying ("No payment until your install is complete."), What we'll need behind a tap, and "We'll text you a link to this quote, with every option." Meeting mode never accepts a quote.
- **Every word** is in `settings.deck` (pages) and a new `settings.deck.lines` map, editable in Settings > Presentation, seeded only where round 7's seed still stood.

**Lead's rulings on the spec:** the Lower level quick start names its option "Main floor" (all five seats; customers read "lower level" as the basement), and it is an open question for Keenan; at most 4 offers, names up to 20 characters in the editor; "See it as they will" cut for time.

**Data, all additive (five migrations):** `quotes.offers` (`[{id, name, runs, boxes}]`, empty = one full wrap over every run), `meeting_offer`, `meeting_install_on`, `accepted_offer`, `accepted_boxes`; `quote_links.selection_offer`, `booked_offer`; `quote_offers_clean`, `quote_commission_base_boxes`, `quote_accept_offer`, `quote_link_select_offer`, `quote_link_book_offer`; `quote_for_customer` gains the offers, the meeting's choice, whether the quote is accepted and with which option, the next steps (colour confirmed, install day: the lead's else the meeting's, What we'll need) and Keenan's lines; `quote_undo_acceptance` also clears the accepted option. The settings.deck words and the link's track product point ("A slim aluminum track tucked under your roof edge, so it's hard to spot by day.") change only where they still read as seeded. The customer page function keeps every field today's live page reads, so nothing changes for customers before the preview is approved.

**Decisions made while building:**
- An offer's breakdown is `lib/pricing.ts` over its own runs and box count: lights at the price per foot, control box, upper access for its own upper runs ($200, $400 with an upper gable), rush colour if chosen, extra work (upper-only lines drop off without an upper run), discounts, the minimum top-up, the total. Two shared details read "{feet} ft at {price} a foot" and "{colour} track, made to order this season". An option with no measured feet is never shown to a customer.
- Commission on Accepted: the rate times that option's lights plus its own boxes, less the quote's discounts, never below zero, worked out in the database (`quote_accept_offer`). A quote whose offers cover no run yet still offers the full quote through round 8's function, so Accepted is never stuck.
- The Accepted sheet starts on the option chosen at the meeting, else the one booked on the link, else the biggest, and says where it came from ("Chosen at the meeting: Main floor", "Booked on their link: Main floor"); the install day is prefilled from the day picked at the table.
- Meeting mode and the lead page's editor save to the same single draft row through one action; the pick, the install day and the colour timing save quietly in the background when there's signal, never with a message on the customer's page. Each quote keeps the minimum it was made with.
- While a quote is accepted, no new quote starts on the lead (round 8), and the editor and Edit layer are read only with plain words.
- The customer's link opens on the booked option, else the meeting's choice, else the biggest; Book my install records the offer and the server prices it from the stored quote, never from the browser; after Accepted it shows only what was agreed. "colour matched to your soffit" and "colour matching" are gone.
- Your house shows their Front photo by day in the picker's crop when the roofline is traced, the mockup ("Your house, lit") when it isn't, the Front photo alone, or our drawing of the measured runs; the turn into the picker is an instant change with the band fading in, so the photo stays put.
- Prep's "Quote drafted ahead" ticks once any offer covers a run with feet, and opens the lead page's editor.

**Open questions for Keenan** (from the seats): initials on the colour page or only after a yes; "Main floor" or "Lower level"; whether a day picked at the table is one he can keep; "made to order" and "this season" or his "powder coated" and "before Christmas"; "Hidden by day" or "What you see by day"; plain words for the link's "RGBW" and "24V" points.

## 2026-11-10: Book now, finish later (Keenan)

Keenan: a booking needs only a time plus a name or an address; everything the old Before you book list required can be finished later; a No on owns the home still rules a booking out; a sticky reminder for setters' bookings still to finish; the lead page's address under the name and a To be completed dropdown. Setters and Keenan only: merges on green outside the knocking window. Keenan approved the scope up front, additive schema changes included. One migration, `book_now_finish_later`.

- **Name or address.** The database requires both `first_name` and `address_line`, and making them optional isn't additive. So a booking without a name saves "Name to come", and one without an address "Address to come", each with a flag (`name_to_come`, `address_to_come`) that a trigger clears the moment the field holds anything else, and that can't be switched on beside a real value. Every screen reads naturally with no change; the to-finish lists read the flags. Push notices would name "Address to come" as the street, which is harmless.
- **What rules a booking out** is now only a No on owns the home (`booking_problems`). One input check stays: Other as a photo skip reason with no note, since the meetings table can't store Other without its note. `meetings.everyone_deciding_present` is still always true (its check constraint requires it, and changing that isn't additive).
- **Missing**, for the reminder and To be completed (`lib/leads/to-finish.ts`, one list): no answer and Not collected both count as missing; a No (wants a price, everyone who decides) is an answer; Not sure on the soffit is an answer; the phone is judged by `phone_saved` only (contact privacy); photos are done with all three guided photos or a skip reason. While the address is to come, the map position folds into the Address item.
- **Book in the sheet.** Book needs a held time, a first name or an address, and no No on owns the home; a phone number typed wrong or a split soffit without its note still blocks Book by name, since they can't be saved. The step counter still counts Not collected as dealt with; Book's To finish later list counts it as missing, matching the reminder. Only Book's save is relaxed: Next and Keep as a lead still save only what New lead could.
- **The edit page** of a saved lead saves part answers, so finishing later works one piece at a time; New lead on its own keeps the full rule (every answer, Not collected included). Keenan may want New lead to work like booking: a small change if so.
- **The reminder bar** is for `sales` only (and View as a setter), counts upcoming booked or confirmed meetings on the setter's own leads, sits in the shared app layout under the header (accent background, a gold dot, no red), drops a booking once its time starts, and is covered by the booking sheet's full-screen dialog. Scroll margins on the Session and Notifications pages grew to clear the taller sticky top.

## 2026-11-10: Meeting mode round 10 (Keenan)

Keenan needed it live by 7:00 pm Calgary the same day, so no debate, no scoring, no review panel; the scope was approved up front, schema changes included, and he waived the preview and the 3:00 to 9:30 pm window for this merge.

- **Mockups live in their own table** (`lead_mockups`), not more `lead_photos` slots: one picture carries several jobs (Main, Day, Night, scene, offers) as flags, which a slot can't. Owner only, like the mockup slot. "Remove" sets `removed_at` and the row stays, because the migration rules keep destructive SQL out of the connector; for the same reason the foreign key to `leads` has no cascade, so tests take a test lead's mockups off before removing the lead.
- **The old pages leave the order, their words stay**: Homes we've lit, Your house and its stand-ins, the light picker's stand-in and the separate track colour page are no longer shown, but their keys and Settings words still parse, so nothing saved breaks and they can come back.
- **Front** (a quick start) is the runs named front, plus the garage and the porch, which face the street; runs named back, rear or side never count. Front lower is offered only when the front has an upper run, since otherwise it would match Front.
- **Coverage words** drop the level words from run names ("Upper front" is the front) and say the levels once, and only on a house with an upper run, so a bungalow reads "Front and back: 100 ft".
- **Black Friday pricing** was kept out of the 7:00 pm merge, as Keenan allowed: it touches acceptance and commission. It merged after 9:30 pm.
- **The first mockup added to a house with no Main becomes its Main**, so a single upload is enough for the deck and the link.
- **What the deck builder settled while building:** the Main mockup page keeps its headline band under the picture rather than going edge to edge; the track colour can no longer be changed inside the deck (its chooser lived on the retired colour page), so it is changed on the lead page; "On the day" left What happens next (Pick a day stays); the "Your choice" tag on an option is for screen readers only, the tick and fill show the choice; the rehearsal with no lead shows only the cover, the warranty and What happens next. Settings lines no page reads now (the colour page's, the On the day step's, the house drawing caption) are kept so nothing saved breaks.
- **Talking points** sit in the top right corner (the exit holds the top left), show after a 200 ms hold so a passing tap never flashes them, and are kept in `settings.deck.talking`; they have no customer-copy checks because customers never see them.

## 2026-11-10: Black Friday pricing (Keenan, round 10, late merge)

- **The deal is one line on the quote.** Saying yes with the button on saves a "Black Friday" discount line worked out on the chosen option's own total (before the minimum, which still lifts it). The link, `quote_accept_offer` and commission already read the quote's discounts, so nothing else changed in the database. Choosing another option recomputes the line; turning the button off, or taking the choice back, removes it.
- **The line follows the deal type** (Keenan, 2026-11-11, replacing the first take, where a saved line was fixed dollars for every option): a percent deal is stored as `{label: "Black Friday", amount, percent}` and `lib/pricing.ts` works the percent out on whichever option is being priced (lights, boxes, upper access, rush and extra work, less the fixed discounts, before the minimum), so the customer's link gives each option its own percent; a dollars deal stays `{label, amount}`, the same dollars on every option. `amount` always holds the dollars for the chosen option, and on Accepted it is rewritten to the accepted option's own dollars before `quote_accept_offer` runs, because the database's commission subtracts the stored amount.
- **An option already at the minimum keeps one price** with nothing struck through, since the deal can't take it lower.
- **The live check never changes Settings:** the walk-through shows the deal to its own browser only, by rewriting the meeting page it was served, and stops every save in the browser.

## 2026-11-11: No light picker (Keenan)

Keenan doesn't want an editor: he uploads a photo of the same house for each look, and the phone page's scene buttons are the colour picker. Try it on your house left the deck for good, even when a roofline is traced, and joined the retired pages (its Settings words and looks are kept, under "Not in the meeting now"). The roofline tracing is hidden: no card on the lead page, no "Roofline traced" item on the prep list (so readiness no longer asks for it), and the tracing route sends Keenan back to prep. The tracer's code and every saved trace stay where they are; nothing was removed from the database.

## 2026-11-10: Round 9 shipped inside the knocking window (Keenan; recorded 2026-11-11)

Keenan needed the meeting story for his 5:00 pm meetings, so at 3:39 pm he had it merged inside the knocking window without the preview: only the walk-throughs for meeting mode, the quote page and booking ran, and everything else stopped. The polish pass on meeting mode was cut mid-run; what had landed compiled and passed, so it shipped. In: the breakdown fits its slot, the drawing had a fixed slot, and the Next button is 48 px. Left out: the editor drawing's labels crowd at 390, the editor's Close and Save changes pair differ between its two shells, 48 px chips in the editor, en-CA dates in the editor, the Accepted sheet's footer padding, and What happens next's worst case at 1180 x 820. The link's polish did land: two-line option rows, the meeting's tag on the border, "to confirm your install day", and the lead page's Customer's link card. Round 10 then removed the drawing and the separate Your house page, which closes the drawing items. Still open from round 9: `meetings.everyone_deciding_present` is always true.

## 2026-11-11: Round 10 catch-up (Keenan)

- **Mockup files were readable by setters.** The setters' storage policy let a signed-in setter sign any file in the lead-photos bucket, and the old lead_photos policy let them read the old mockup slot's rows, so a setter who listed Keenan's folder could open a mockup. Both policies were changed in place (`alter policy`, nothing replaced): a setter reads a photo file only when it isn't a mockup, through `photo_file_is_mockup`, a security definer function, because a policy's own subquery sees only what the setter sees (nothing of lead_mockups). The customer's link is unchanged. The RLS suite now proves a setter can't sign, download or list a mockup, new or old, while their own lead photos still work, and that a token lists nothing of another house.
- **The stored quote numbers are the chosen option's.** Nothing on screen reads `quotes.subtotal`, `gst` or `total` (every screen prices from the runs), so the fix is to store the right thing for whatever reads them later (the dashboard, the PDF): the save stores the option chosen at the table (else the whole quote), and Accepted stores the accepted option's own numbers with its discount rewrite, in the same update, before `quote_accept_offer` runs.
- **A percent line in the editor** reads "15% off" in its amount box (read only), with the dollars per option as the note under it and "Use dollars instead" to make it a fixed amount.
- **Uploads that can't be read** (a HEIC the browser can't decode, say) are told apart from uploads that failed on signal, and say so. Safari hands over a JPEG for a HEIC picked from Photos, and decodes HEIC itself from iPadOS 17, so the message is for the odd file from the Files app on an older iPad.
- **The Black Friday walk-through writes.** Unlike every other walk-through, it saves with the owner's one-time session, on test records only, because Keenan asked for the real path (Settings, Your price's yes, the Accepted sheet). It refuses to start while a deal is already set, restores the deal to None in a `finally`, removes nothing, and names what it kept.

## 2026-11-11: Round 11, quoting by area (Keenan)

Keenan quotes areas of the house, not runs, with gables as something he includes or leaves out, and sells from a short list of standard offers. Approved up front, schema changes included, with the first step being the removal of the Black Friday test records (done: the two TEST setters, the two TEST LEAD (Black Friday) leads and everything hanging off them, listed before, nothing else).

- **An area is still a run.** `quotes.runs` keeps its shape and gains `area`, `gable`, `rate` and `flat` on each run, so every quote made before this round keeps its exact prices and opens everywhere (meeting mode, the link, the editor, the Accepted sheet); offers keep pointing at run positions, which is also how a gable is ticked on or off an offer. Nothing is migrated: an old run is tagged on the way into the editor by what its name and part make obvious (garage and porch are the front; back and rear the back; side the sides; a gable by its part), and the rest stay as Other, named as they were. Two old runs on one area both stay, shown as "Front lower: Garage".
- **Pricing per area** lives in `lib/pricing.ts` only: a run's lights are its flat price, or its feet at its own rate or the quote's; the "Track and lights" line names the feet at each rate ("64 ft at $24, 38 ft at $28"), and a flat area is its own line by name ("Shed, 20 ft, flat price"). The minimum, discounts, Black Friday, rush colour and GST are untouched. The database mirrors the lights in `quote_lights_cents`, which the commission functions now use, so the commission is still 5% of lights and box after discounts with upper access left out.
- **Upper access** still fills in automatically ($200, or $400 with an upper gable) from the offer's runs; an amount typed over it is stored on the offer (`upper_access`, 0 included) and shows with no "why" detail, since the why is Keenan's.
- **Presets** replaced the three quick starts: Front lower only, Full front, Front upper, Full wrap, Front plus back, Full back and Custom, and only those the measurements can fill (no Front upper without an upper front, no Full back without a back). A preset includes its measured gables to start.
- **The photo on an offer** reuses the mockups' "for an offer" marks (`lead_mockups.offer_ids`): picking a mockup on an offer card moves that mark to it, uploading adds the mockup and marks it; the deck and the link already show an offer's own picture, else the Main, so nothing changed there.
- **The house drawing is gone** from the editor too (it had left meeting mode and the link in round 10); the two views are plain lists for Keenan, and customers only ever see the offer's photo.

## 2026-11-11: The views drawn, and the update notice (Keenan)

- **Round 11 shipped lists under Front and Back headings where Keenan had picked drawn views.** The views are now drawn: a plain two-storey outline for each of Front and Back, the lower roofline, upper roofline and a gable peak on each level as tappable lines (solid with its feet when measured, faint and dashed when not), the Sides as two lines of their own between the views, and the lines an offer covers lit in gold while its card is tapped. The price choice and Other stay as rows under the drawing, and an old quote's extra runs on an area still show by name, never merged. Customers never see the drawing; the offer's photo is theirs.
- **The update notice** is a quiet line, not a prompt: "Vesper updated. Reopen to get the latest.", tappable to reload. Each build carries its own id (the deploy's commit, or a build stamp when there is none), inlined at build time, and `/api/version` answers with the live one, never cached. The app asks when it comes back to the foreground, which is when a setter at a door would meet a new build, and every ten minutes while open; a flurry of asks within 30 seconds is one ask. It never interrupts a booking or a meeting: meeting mode's layout doesn't carry it, and it stays hidden while the booking sheet is open, so a deploy mid-shift is still quiet.

## 2026-11-11: Round 12, tidy up (Keenan)

Keenan's three parts: the everyone-who-decides bug, the polish that was cut from rounds 9 to 11, and one full rehearsal of a meeting done twice. No new features; the first round of the day, so the full suite ran once at the start, then only what changed.

**Everyone who decides.** Since round 2 every booking recorded that everyone who decides would be there: `book_meeting` and `move_meeting` wrote `true` into `meetings.everyone_deciding_present`, whose check needs `true`. Keenan approved relaxing that rule. A check can't be dropped additively (rule 4: no destructive SQL), so the old column stays as it is, always true, and nothing reads it. The answer now lives in `meetings.everyone_deciding` (`yes`, `no`, `not_asked`), set by a before-insert trigger from the lead's own `both_decision_makers` when a meeting is booked or moved, and kept in step by a trigger on `leads` for the meetings that haven't started and aren't moved or cancelled (book now, finish later: the answer usually arrives after the booking). Existing meetings took the lead's answer as it is now, since the old column never held the real one; no data was removed. The booking functions were not touched, so the race tests kept passing unchanged. The line shows for Keenan only, before the meeting starts, on the prep page, the Meetings page and the meeting cards (Home and Schedule share the card): "Someone who decides won't be there." or "Not asked yet whether everyone who decides will be there.", and nothing on a yes. Neither booking pay nor Qualified reads the answer: `booking_problems` has not ruled it out since book now, finish later, no pay function reads the column, and Keenan marks Qualified himself.

**The Black Friday walk-through cleans up.** It was written at Keenan's request to leave its records in place, named in a KEPT block, for the round 10 catch-up. It then went into the daily suite (every `*-walkthrough.mjs` runs), so each morning left two setters, two leads, their quotes, links, mockups and a commission behind; Keenan had those first records deleted in round 11. It now removes everything it made at the end (a REMOVED block) and `KEEP=1` restores the old behaviour. This morning's leftovers were removed by hand.

**The rehearsal is not in the daily suite.** `tests/live/rehearsal.mjs` writes with the owner's one-time session (Keenan allowed it for this rehearsal, on marked test records), sets the Black Friday deal in Settings for its second pass and takes minutes, so it is named without the `-walkthrough` suffix and runs only when asked.

**The polish that was cut (round 12, part 2).** One pass, no scoring, no panels, at 1180 x 820, 430 and 390. Fixed: the quote editor's Close and Save changes are one pair in both shells (the lead page's sheet and meeting mode's Edit layer, which said Done and Save quote), every chip, price mode and stepper in the editor is 48 px, and dates read in words over the device's own picker ("November 25, 2026", never 11/25/2026) in the editor's Price held until and the Outcome sheets' three install day fields; the shared sheet's action row has 16 px around it like the body (every sheet gained 4 px); Your price on a phone goes to one column so no price is cut off, and Keenan's Edit button sits one row up, clear of the dots. Judgement calls for Keenan: "Save changes" is now the label in meeting mode even for a quote not saved yet (the status line still says "Not saved yet"); the Outcome sheets' dates went onto the same words-over-picker field so one sheet doesn't read numerals while the next reads words; a 58-character offer name truncates on Your price's option button (the editor caps new names at 20 characters, so only an old name does this); meeting mode at phone widths is only tolerable (the band pages keep their iPad type; its phone layout is not a small fix) and is left alone; Black Friday on in What happens next was checked with the stored deal line only, never by turning the deal on in Settings.

## 2026-11-11: Round 13, Keenan's calls from the round 12 report (Keenan)

Six parts, worked one at a time, tested by what each touches, merged on Keenan's word inside the knocking window (he overrode it for this round, at about 4:35 pm Calgary).

**Show to customer.** Each offer in `quotes.offers` may carry `hidden: true` (kept only when true). The database is the gate, not the page: `quote_offers_shown` is the cleaned list without the hidden ones, and it is all that `quote_for_customer`, the link's two taps and the link's picture functions read; `quote_accept_offer` refuses a hidden offer; a check on `quotes.offers` never lets every offer be hidden. Judgement calls: hiding the offer chosen at the table drops that choice (the customer no longer sees it); if the customer had already booked an offer that is then hidden, their page stops saying they booked it, while Keenan's own row keeps the booking; deleting the last shown offer shows a hidden one again, on the card, so "at least one is always shown" holds without a blocked save; the lead page's Quote line counts the hidden ones without a price.

**The Accepted sheet opens on what the customer booked.** Round 9's five seats had it open on the table's choice; the rehearsal showed that a quick Mark accepted then takes the option the customer did not ask for. Keenan's call: the booked option first, the table's choice marked on its own row, otherwise the table's choice.

**See it on your house.** The customer's link now gets the house's phone scenes, each by its name; until this round a scene was never listed or signed for a link. Only a scene's name is sent (it is what the customer already reads on the phone page); a Day or Night picture, a hidden offer's picture and a removed one stay out. The section shows when there is a look or more than one option; with one option and no scene the picture sits in Your price as before. Tapping a look again goes back to the option's picture. The price rows no longer have to share a screen with the picture: the Looks and Options under the picture do.

**One place for an offer's picture.** The photo spot on the offer card; the Mockups section lost its offer chips and says which offers use each picture instead (the Main is used by every offer without its own). The spot gained Use the Main, since it is now the only way back.

**The important parts first.** Tucking the soffit code alone could not keep the quote and the time to confirm above the fold once a house has mockups (four tiles are over 1,100 px tall), so the prep list's order changed: Quote drafted, Time confirmed, Mockup uploaded, Track colour set, Missing answers filled. The one-line summaries on Meetings and Home follow the same order. On the lead page the three quote cards sit above the Meetings card too.

**Small things.** "Already at our lowest price." shows on Your price in the meeting only: the customer's link strikes no prices, so it has nothing to explain there. It is one of the deck's lines (`price_lowest`), so Keenan can reword it. Save quote, then Save changes applies on the lead page as well as in meeting mode, so the pair still matches. The roofline taps are fixed by drawing the gables first; a gable keeps its peak and most of its legs.

**Speed.** The lead page asked the database one thing after another, about eleven trips deep; it now asks in two rounds. Time to the Quote card on a test lead with a quote, four mockups and a link: from the test machine (a local build against the live database) 2.8 s before and 1.2 s after (first visit 3.4 s and 1.8 s). The 2.5 to 3.8 s in the round 12 report came from that test machine, which sits farther from the database than the live site: the live site was already at about 0.7 s (1.35 s on a first visit) before this round. Mockups upload together, an offer's picture is saved in one call instead of two or three, and Mark accepted says what it is doing. The after times for Mark accepted and the four-mockup upload come from the rehearsal, run after 9:30 pm so its test Black Friday deal never shows during a meeting; they are in the report for this round. That rehearsal ran once on 2026-11-11 at about 10 pm Calgary, on a build of main, and all 118 checks passed: Mark accepted took 2.4 s and 1.8 s (2.7 to 3.1 s before), four mockups uploaded in 3.9 s and 3.7 s (6.0 to 6.6 s before), and the lead page inside the rehearsal took 1.7 to 2.3 s (2.5 to 3.8 s before). On the live site after the deploy the lead page took about 0.8 s, the same as before within noise, and a first visit about 0.8 s, down from about 1.35 s.

**A stale check found.** Round 12 changed Pay's commission base to read without ".00" after its walk-throughs had run; the quote-outcomes walk-through still expected the old form and was corrected here.

## 2026-11-11: The real logo, and a frame for the deck's photos (Keenan)

A quick round, merged on Keenan's word inside the knocking window.

**The logo.** Keenan attached three files: the full logo in white letters, the same in navy, and the V mark alone. All three are in `brand/` (trimmed to the artwork) with web sizes in `public/brand/`, served on the quote domain too. The logo replaced the text wordmark in the app header (following the theme), the sign-in page, the booking sheet's header, the customer's quote link (white on its navy band) and the deck's cover (white on the dark deck). Two calls: the deck has no mark in a corner today, only on the cover, and none was added, so nothing sits over his photos; the V mark is not square, so the app icon stays the placeholder until a square version comes (the V mark is navy and would vanish on the icon's navy tile; on a white tile it would work). At the header's height the "LIGHTING" line is small but legible on a retina screen; the logo is kept whole rather than cropped.

**The frame.** The house's pictures in the deck (Up once there all year, Hidden by day, the warm and cool pair, Run it from your phone, Your price) sit in a frame the photo's own shape: rounded corners, a hairline border, a soft shadow and a margin from every edge; the frame eases to a new shape and a new picture fades in. The customer link's house pictures (See it on your house, Your price) get the same treatment on white. DESIGN.md keeps the app itself flat and names this as the exception. Keenan's own photos in the deck's named slots, which fill their band edge to edge by design, were left full width.

## 2026-11-11: Round 15, the cover and full screen (Keenan)

Tested by what it touches and merged on Keenan's word inside the knocking window (he overrode it for this round), with no preview.

**The cover.** It leads with the Main mockup in the same frame as the other pages, the logo and the words on a 400 px column to its right. "Prepared for the {family} home" takes the family name as everything after the first name; a lead with one name (or none split out) reads "Prepared for {name}". Today's date is the iPad's day in Calgary. The six new lines (who it is for, both forms; what Vesper is; the three points) are in Settings with the deck's other lines; the points allow six words, since "Run it from your phone" is five. A house with a Main but no scenes shows the house with no icon; a house with no Main keeps the old centred cover with its line. A legacy single mockup (before round 10) counts as the Main.

**The selector.** It lists the Main first, then each scene once, by the names Keenan gave them (an unnamed Main reads "Lights on"). On the cover and Up once there all year it sits on the picture; on Run it from your phone the drawn phone is still the selector, so the picture there has no second icon, and full screen from that page opens on the scene showing.

**Full screen.** One way for every house photo: a tap opens it, a tap, swipe down, Escape or the X closes it. Pinch to zoom moved there: the inline picture on Up once there all year no longer zooms, so a tap can open full screen (round 10 had it zoom in place). While it is open the deck hides its dots, Next, the way out and the talking points, and the arrow keys don't turn the page. Hidden by day keeps its slider, so it gets a corner expand button; Your price shows the option's picture first and goes back to it on close.

## 2026-11-11: Round 16, simpler offer cards (Keenan)

Tested by what it touches and merged on Keenan's word inside the knocking window (he overrode it), with no preview.

Each option on Your price now shows three things: its name, its feet on one line under it ("165 ft of lights") and its price. The list of areas it covers ("Front and garage, upper and lower: 165 ft") ran too long and is gone. "Everywhere on Your price" was read to include the breakdown layer's line under "What's in {name}", which now reads the feet too; the breakdown rows themselves are unchanged. Black Friday's struck price and "Already at our lowest price." still show when they apply. The customer's link matches: each option row, the single-option line over the breakdown and the accepted page give the feet in place of the areas. The words are a new deck line, `price_feet` ("{feet} ft of lights"), in Settings with the price page's other lines; it needs no migration, since the link already reads every deck line with the defaults filling any that are missing. The feet are the same feet the old line counted (each run once), shown to one decimal at most. The quote editor's offer cards keep their coverage line: that is Keenan's screen, not the customer's.

## 2026-11-11: Quote link take 3 (Keenan)

Four parts, tested by what they touch (pricing unit tests, then the quote-link, meeting and quote-outcomes walk-throughs one after another), merged outside the knocking window with no preview, on Keenan's word. Schema changes are additive.

**Track types.** Hat track (also H track) is the standard and costs the quote's price a foot. Double and J track each have their own price a foot in Settings, Pricing, empty until Keenan sets them; an empty one can't be picked in the editor ("Set ... in Settings, Pricing"). Picking a track copies its price onto the area (`track`, `trackRate` in the run), so later Settings changes never alter the quote. Keenan's own $ a foot or a flat price on the area still wins. On the breakdown, Hat track areas stay together in "Track and lights"; each Double or J track area gets its own line, named for the area, with "22 ft of J track at $30 a foot" (or "22 ft of J track, flat price"). The commission counts it as lights at what it is priced at, in `lib/pay/commission.ts` and in `quote_lights_cents`.

**About your track.** Shows the track types the shown options use, each with its words from Settings (deck lines `link_track_*`) and a simple line drawing seen end on. Every quote uses Hat track, so the section is on every link; it could be limited to quotes with Double or J track if Keenan prefers. The default words say only what Keenan told us and nothing guessed about the product: Hat track is the standard and sits under the edge of the roof with the lights built in (his deck's own words); Double and J track are for parts of a roofline where the standard track is not the right fit, J most often on upper gables. He rewrites them in Settings. The drawings are simple shapes by the tracks' names (a hat-shaped channel, two side by side, a J), not his exact profiles.

**Build your own.** A row after Keenan's options (shown when at least two areas can be ticked and the quote isn't accepted). It starts from the option on screen with that option's areas ticked; the areas offered are the measured ones in the options Keenan shows, so an area only a hidden option covers never shows, and neither does one with no feet. Feet, prices and track types stay his. It keeps the starting option's box count; upper access is the automatic amount from the areas ticked. At least one area stays ticked. The price uses the same `lib/pricing.ts` (minimum, Black Friday percent or dollars, GST display) and the server prices it again from the stored quote. Book my install saves it through `quote_link_book_custom`, which checks every position, replaces their last build (id `customer`, `from_customer`) and books it as Book my install does; Keenan is told again only when the areas changed. On the customer's page, and on the price page at the table if there is a later meeting, it reads "Your own option" (if Keenan renames the offer, his name shows at the table); Keenan sees "Custom quote (from the customer)" with his offers, marked "Built by the customer on their link", and accepts it like any other. It doesn't count toward his four. Judgement call: if Keenan's editor is open from before the customer built theirs and he saves, his save writes the offers he has, which can drop their build; reopening the editor first avoids it.

**Documents.** Settings, Documents: upload a PDF or photo once with a name (rename or Remove later; Remove retires it, so links stop showing it). On the lead, a new "On their link" card under the Customer's link card: tick standard documents, add files for this customer only (Remove takes a second tap), Agreement to sign, and the signed agreements. The link shows a Documents section only when something is ticked or uploaded; each opens on the phone and has a download button, through ten-minute links the token signs. Files live in a new private bucket, `link-documents`. Nothing is ever taken out of a table (the connector rule): unticking and Remove set a time, and a removed customer file stays in the private bucket where nothing signs it.

**The agreement.** Keenan writes it in Settings, Documents; until then Agreement to sign is greyed with "Add the agreement text in Settings first." With it ticked, the link shows the text, the option on screen and its total, a name box and a signature box (finger, or mouse), and Sign (navy: gold stays Book my install's). Signing their own build saves the build first. The database saves the signing (their name, the signature, the time, the agreement's text and a copy of the quote as it stood), books that option, writes `agreement_signed` (option and signer, never a price) and returns who to tell; Keenan gets a push like Book my install's, titled "{name} signed the agreement". One signing per link (a new link allows a new one). Judgement call on the PDF: instead of storing a PDF the phone's request made, the PDF is made each time from the saved record with `@react-pdf/renderer` (added this round, pinned 4.9.0), so a customer can never send in a total; it is white, navy and gold, shows the date with the year and the time (Calgary), the option and its lines, subtotal, GST and total with the GST number when GST is on (the formal-document rule), the track colour, "No payment until your install is complete.", the agreement and the signature. Keenan opens it from the lead; the customer gets "Your signed copy" on their link. The lead's timeline says "Signed the agreement for {option}, as {name}." under the customer's name, like their other taps. A copy of the quote's prices lives in `agreement_signatures`, which is owner-only like `quotes`.

**Tests.** 1,323 unit tests, including the track pricing, Build your own, documents, the signed agreement and its PDF, Keenan's save keeping the customer's build, and the timeline line. Database tests in `tests/rls/quote-link-take3.test.ts` (16): a setter and an anonymous caller read and write none of the four new tables; a live token signs exactly the files its link shows (not a stray file, not without the token, not for a signed-in setter; an unticked or retired document stops at once); `quote_link_book_custom` refuses a hidden-only area, an unmeasured one, one off the quote and an empty pick, saves one offer beside Keenan's untouched ones, replaces their last, and tells Keenan once per change; the agreement is absent until ticked, validates the name and the signature, takes one signing per link, saves the copy of the quote, books the option and writes no price; and accepting the customer's build with a J track area gives a commission base of the lights at their own prices plus the boxes. The quote database tests around it were run too (7 files, 118 tests). Walk-throughs, one after another on the final build: the new `tests/live/quote-link-extras-walkthrough.mjs` (35 checks: Keenan's screens view only, with Agreement to sign greyed until Settings has text, the track choice in the editor, Settings and Settings, Documents; then the customer's phone: About your track, the J track line, documents opening and saving, Build your own booked and rebuilt, the agreement signed with a drawn signature, the signed copy as a PDF with the logo; then Keenan's lead card, his PDF, the timeline, their build among his offers and its name at the table), quote-link (77), m5-meeting (63), meeting-story (60) and quote-outcomes (79). The test sets Settings' agreement text only when it is empty and no other lead has Agreement to sign on, and puts it back. Not reached, because the test's sign-in as Keenan is view only: his own taps that save (uploading a document, ticking one, ticking Agreement to sign, saving the agreement's text, picking a track); their screens were opened and the database rules behind them are tested.

