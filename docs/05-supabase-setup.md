# Supabase setup and a second project

There is one Supabase project today. Keenan has decided against a second one for now, and nobody should recommend one. This file keeps the app ready to add one whenever he asks: it lists everything the app needs from Supabase and the steps to set up a copy.

## Projects

| Project | Ref | Region | Used by |
|---|---|---|---|
| Vesper-App (production) | `ajnopydosoewftfwmiog` | us-west-2 (Oregon) | the live app, the RLS suite and the live walk-throughs, with test-prefixed data cleaned up after each run |

The app finds its project only through environment variables (see below). Nothing in the app, the tests or the scripts names a project's URL, ref or keys.

## What lives where

| What | Where it lives | How a new project gets it |
|---|---|---|
| Tables, columns, enums, constraints, indexes | `supabase/migrations/` | Running the migrations in order |
| Row Level Security policies, grants, revokes | `supabase/migrations/` | Running the migrations |
| Functions and triggers, including the profile trigger on `auth.users` | `supabase/migrations/` | Running the migrations |
| Views (`settings_public`, `profiles_public`, `profile_names`) | `supabase/migrations/` | Running the migrations |
| The settings row (`settings.id = 1`) and its defaults | `supabase/migrations/` | Running the migrations |
| The `lead-photos` storage bucket and its policies | `supabase/migrations/` | Running the migrations |
| Auth and project settings listed below | Supabase dashboard only | Set by hand, from this file |
| The owner account | Supabase Auth | Created by hand, step 4 below |
| Every other account | Supabase Auth | Created by the owner in People |
| Project URL and keys | Environment variables | Copied from the new project |

Every database change goes in a migration file, never by hand in the dashboard or with ad hoc SQL (CLAUDE.md, rule 4). Each file is named `<version>_<name>.sql` with the version the database recorded for it. The Supabase connector picks that version when it applies a migration, so after applying one, rename the file to match `supabase_migrations.schema_migrations`. A fresh, empty project then reaches the same schema by running the files in order.

## Dashboard settings the app relies on

These are not in any migration. The dashboard moves its menus around now and then, so go by the setting names. When one of them changes, update this table in the same commit as any code that depends on it.

Sign-up off and the minimum length of 10 were set by Keenan in M1. The rest are Supabase's defaults, which the app works with. Auth settings cannot be read from the build sessions, so check the live values against this table when setting up a copy.

| Setting | Value | Why |
|---|---|---|
| Region (chosen when the project is created) | us-west-2 (Oregon) | Vercel functions run in `pdx1` (Portland) next to it (`vercel.json`). Another region makes every screen slower. |
| Authentication > Sign In / Providers > Email | Enabled | Everyone signs in with email and password. |
| Allow new users to sign up | Off | There is no sign-up. Only the owner creates logins, from People. |
| Minimum password length | 10 | Must equal `PASSWORD_MIN_LENGTH` in `lib/auth.ts`; change both together. |
| Password requirements | No required characters, or at most Letters and digits | Generated passwords are three lowercase words and four digits, like `maple-river-stone-4821`. A rule demanding capitals or symbols would refuse them. |
| Leaked password protection | Off | Needs a paid Supabase plan. Turn it on if the plan changes. |
| Confirm email | Not relied on | Logins are created already confirmed: by the admin API from People, and by hand with Auto Confirm for the owner. No email is ever sent. |
| Authentication > URL Configuration > Site URL | The URL of the app that uses the project (production: https://vesper-app-mocha.vercel.app) | Housekeeping only: the app sends no auth emails or links, so no redirect URLs are needed. |
| JWT signing keys | Asymmetric (ES256), the default for new projects | The app checks tokens locally against the published keys, so no Auth call is needed for that check. A project still on the legacy shared secret works but is slower. |
| Data API | On, exposing the `public` schema (the defaults) | The app reads and writes through it. |
| SMTP and email templates | Not set | The app sends no email of any kind. |
| Realtime | Not used | |

## Environment variables

The full list, with comments, is in `.env.example`. These three point the app and the tests at a project:

| Variable | From the project | Used by |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL | The app (browser and server), the RLS suite, the walk-throughs |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key (`sb_publishable_...`) | The app, the RLS suite, the walk-throughs |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret key (`sb_secret_...`, or the legacy service_role key) | Owner-only server actions for Auth admin calls, the RLS suite, the walk-throughs. Server only, never `NEXT_PUBLIC_`. |

They are set in three places: Vercel (Production and Preview), the cloud environment the build sessions run in, and `.env.local` on any machine that runs the app. Pointing something at another project means changing these three values there and nothing else.

## Setting up a second project

1. **Create the project.** In the same Supabase organization, region us-west-2 (Oregon), with a name like `vesper-app-test`. Keep the database password in a password manager; the app never uses it. Check first that the organization's plan allows another active project; free plans cap how many can run at once.
2. **Apply the dashboard settings** in the table above.
3. **Run the migrations in order.** From a copy of the repository, with the Supabase CLI:
   ```
   npx supabase link --project-ref <new project ref>
   npx supabase db push
   npx supabase migration list
   ```
   - `link` asks for the database password.
   - `db push` applies every file in `supabase/migrations/` in order and records each file's own version, so the history matches production.
   - `migration list` should show every version both locally and remotely.

   Applying the files one by one through the Supabase connector also builds the same schema, but the connector records its own version numbers. Align those afterwards with `npx supabase migration repair`:
   - `--status reverted` for each connector number;
   - `--status applied` for each file's version.
4. **Create the owner account by hand.** Go to Authentication > Users > Add user > Create new user:
   - email info@vesperlighting.ca;
   - a strong password of at least 10 characters;
   - Auto Confirm User on.

   The database makes that email the owner and no other. Check that `profiles` has exactly one row, with role `owner`. Everyone else is added later by the owner in People; tests add their own throwaway accounts and delete them.
5. **Point an environment at it.** Copy the project URL, the publishable key and the secret key into the three variables, wherever the copy should be used:
   - the cloud environment's variables and `.env.local` for test runs;
   - optionally Vercel's Preview environment.

   Production keeps its own values.
6. **Let the cloud environment reach it.** The build sessions reach Supabase through an allowlist. If it names only the production host, add the new project's host, or `*.supabase.co`, under the environment's network settings (Network access > Allowed domains).
7. **Run the suites against it:** `npm run test:rls`, then `npm run build` and `npm run test:live`. The View as walk-through needs the owner account from step 4, and opens and closes its own one-time session there just as it does on production.

Types in `types/database.ts` come from the schema and stay the same, because both projects run the same migrations.
