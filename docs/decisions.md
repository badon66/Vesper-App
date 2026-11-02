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
- **Get tonight ready** does in the page what opening each meeting once would do: it fetches each of tonight's meeting pages, then every script, style, font and photo the page names, and puts them in the same caches the service worker reads when there is no signal. A meeting counts as saved only when its page and every one of those files are in the caches; the time shown is when the page was fetched. The cache names live in `lib/offline.ts` and a unit test keeps them equal to `public/sw.js`.
- **Testing without writing as Keenan.** The walk-through stages tonight's and an upcoming meeting for a throwaway host, never in Keenan's evening, checks the order and the flags, searches, has the new-person form refused before anything saves, runs Get tonight ready on its own second server, stops that server, and opens a meeting that was never opened on that device.
