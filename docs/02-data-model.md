# Data model

Postgres on Supabase. Every table has RLS enabled. `id` columns are `uuid default gen_random_uuid()`. Every table has `created_at timestamptz default now()` and, where rows change, `updated_at` kept current by a trigger. Money is `numeric(10,2)`. Feet are integers. Times are `timestamptz` and the app displays them in `America/Edmonton`.

## Enums

```
role:            owner | sales | crew          -- Postgres type is named user_role; the UI says Admin, Sales associate, Crew
lead_status:     new | follow_up | meeting_booked | met | quoted | sold | installed | lost
lead_source:     door | referral | neighbour_card | website | other
house_type:      bungalow | bi_level | two_storey | other
soffit_colour:   white | black | brown | other
meeting_status:  booked | confirmed | qualified | not_qualified | no_show | cancelled   -- qualified and not_qualified both mean the meeting was held
quote_status:    draft | presented | accepted | declined | expired
event_type:      created | note | status_change | call | text | meeting_booked | meeting_outcome | quote_created | quote_presented | quote_accepted | quote_declined | photo_added | edited
run_level:       lower | upper
earning_type:    booking | commission
earning_status:  pending | paid | void
```

## Tables

### profiles
One row per user, keyed to `auth.users.id`. Created by a trigger when Supabase Auth creates the user. The trigger gives `owner` to info@vesperlighting.ca and `sales` to everyone else. A partial unique index allows at most one owner row, and a trigger refuses to demote or deactivate it. The People screen can never assign the owner role.
```
id uuid pk references auth.users
email text not null                             -- copied from auth.users by the trigger, kept in step on change
full_name text not null
phone text
role role not null default 'sales'
active boolean not null default true
created_at, updated_at
unique index on (true) where role = 'owner'     -- exactly one owner
```
A new login is created by the admin, who also sets every non-owner password: the app generates it (three common words and four digits), shows it once, and the admin texts it. Reset password from People generates a new one and ends that person's open sessions through `end_user_sessions(uuid)`, a SECURITY DEFINER function callable only by the service role that deletes the user's rows from `auth.sessions` and `auth.refresh_tokens`. Non-owners have no self-service password change or reset. The trigger reads the role from the auth user's `app_metadata` (only the service role can write it; users can edit their own `user_metadata`). The Auth server writes `app_metadata` in an update right after the insert, so the profile is created by the first of the insert or that update that carries a usable role. The owner is still decided by email. An account created with no role or an unknown role gets no profile row and therefore no access: no policy matches it, both public views return nothing to it, and the app signs it out with "not set up yet". A new role appears in People by adding it to the assignable list in code.

### settings
Single row (id = 1). Owner only. Everything the business tunes without a deploy.
```
id int pk
price_per_ft numeric(10,2) not null default 23.00
box_price numeric(10,2) not null default 500.00
neighbour_discount numeric(10,2) not null default 150.00
referral_credit numeric(10,2) not null default 150.00
gst_rate numeric(5,4) not null default 0.0500
gst_enabled boolean not null default false
gst_number text                      -- printed on formal documents when GST is on
warranty_text text not null
presentation jsonb not null          -- pages: [{title, body, image_paths[]}]
booking_pay numeric(10,2) not null default 20.00      -- flat pay per qualified booking
commission_rate numeric(5,4) not null default 0.0500  -- share of the accepted quote total before GST
lost_reasons text[] not null default '{price, other company, not now, could not reach, other}'
not_qualified_reasons text[] not null default '{Not the homeowner, Decision maker missing, Did not want a price, Roofline we cannot do, Other}'   -- added in M3
meeting_days int[] not null default '{1,2,3,4,5,6}'   -- 0 = Sunday
meeting_start time not null default '18:00'
meeting_slot_minutes int not null default 45
meeting_slot_count int not null default 4
distance_warning_km numeric(5,1) not null default 10
company jsonb not null               -- name, phone, email, address for PDFs
updated_at
```

### leads
```
id uuid pk
created_by uuid not null references profiles
assigned_to uuid references profiles          -- defaults to created_by
knock_session_id uuid references knock_sessions
status lead_status not null default 'new'
source lead_source not null default 'door'
first_name text not null
last_name text
phone text                                      -- E.164 normalized, Canada (+1) when no country code is typed, required before booking
email text
address_line text not null
city text not null default 'Calgary'
postal_code text
neighbourhood text                              -- from Places or typed
lat double precision
lng double precision
place_id text
house_type house_type
soffit_colour soffit_colour
soffit_note text
est_feet int
notes text
both_decision_makers boolean                    -- set at booking time
consent_text boolean not null default false     -- CASL: agreed to texts and emails
lost_reason text
lost_at timestamptz
follow_up_on date                               -- the day to come back; required while status is follow_up, cleared when it leaves
sold_at timestamptz
installed_at timestamptz
created_at, updated_at
```
Indexes: `(assigned_to, status)`, `(status, created_at)`, `(lat, lng)`, `place_id`, `knock_session_id`, `(created_by, created_at)`, and `follow_up_on` where status is `follow_up`.

Rules enforced in the database:
- `created_by` is always the signed-in user, and `assigned_to` defaults to it. A lead can only link to a knock session of the person who created it.
- A setter may change status only when both the old and new status are `new`, `follow_up` or `lost`. Setters can never change `created_by` or `assigned_to`. M3's booking sets `meeting_booked` inside a database function the guard trusts; the owner can set any status.
- `lost` requires `lost_reason`, from `settings.lost_reasons`. `lost_at`, `sold_at` and `installed_at` are stamped automatically, and reopening a lost lead clears `lost_at` and `lost_reason`.
- `follow_up` requires `follow_up_on`. Leaving `follow_up` clears it. A signed-in person cannot set a follow-up date earlier than today in Calgary; moving the date on a lead that stays in `follow_up` is an edit. The status change into `follow_up` records the date in its event payload, and a date change alone logs an `edited` event naming the field.
- `lat` and `lng` are both set or both empty. A typed address with no map position is allowed; booking will require one.
- `phone` is stored in E.164 or not at all.
- Deleting a profile that still owns leads or knock sessions is refused; deactivate people instead.

### lead_photos
```
id uuid pk
lead_id uuid not null references leads on delete cascade
storage_path text not null                      -- bucket 'lead-photos', private, signed URLs
caption text
created_by uuid references profiles
created_at
```

### lead_events
Append only for everyone, the owner included: no updates, no deletes. The lead's timeline and the raw material for the dashboard. Database triggers write `created`, `status_change` (with from and to, plus the reason for `lost` or the date for `follow_up` in the payload), `edited` (with the names of the changed fields, never their values) and `photo_added`, with the signed-in user as actor. People write only `note` events by hand.
```
id uuid pk
lead_id uuid not null references leads on delete cascade
actor_id uuid references profiles
type event_type not null
from_status lead_status
to_status lead_status
payload jsonb                                   -- note text, meeting id, quote id, etc.
created_at
```

### knock_sessions
```
id uuid pk
user_id uuid not null references profiles
neighbourhood text not null
started_at timestamptz not null default now()
ended_at timestamptz
doors_knocked int not null default 0
conversations int not null default 0
notes text
created_at, updated_at
```
One open session per person, enforced by a partial unique index. Counters change only through `bump_knock_session(session, doors, conversations)`, one atomic update that never goes below zero, so fast taps never lose counts. A session still open from an earlier Calgary day is closed the next time its owner opens the app, with `ended_at` set to its last update. Leads saved while a session is open link to it.

### time_blocks
Owner-blocked time (no meetings), for example a late install day.
```
id uuid pk
owner_id uuid not null references profiles
starts_at timestamptz not null
ends_at timestamptz not null
reason text
created_at
```

### meetings
Open slots are computed from settings (days, start, slot length, count) minus `meetings` minus `time_blocks`. There is no slots table. The unique index is what prevents double booking. After each slot the owner sets the outcome: `qualified`, `not_qualified`, `no_show` or `cancelled`. Sales users can read every meeting, so `outcome_note` must never contain a price.
```
id uuid pk
lead_id uuid not null references leads
owner_id uuid not null references profiles      -- who runs the meeting (Keenan)
booked_by uuid not null references profiles
starts_at timestamptz not null
ends_at timestamptz not null
status meeting_status not null default 'booked'
both_decision_makers boolean not null default false
outcome_reason text                             -- required when status is not_qualified; from settings.not_qualified_reasons, free text when Other
outcome_note text                               -- optional for no_show and cancelled, never a price
outcome_at timestamptz
rebooked_as uuid references meetings            -- set on a no_show or cancelled meeting when the lead is booked again
created_at, updated_at
unique (owner_id, starts_at) where status in ('booked','confirmed','qualified','not_qualified')
```

### quotes
```
id uuid pk
lead_id uuid not null references leads
created_by uuid not null references profiles
status quote_status not null default 'draft'
price_per_ft numeric(10,2) not null              -- copied from settings at creation
box_price numeric(10,2) not null
box_count int not null default 1
runs jsonb not null default '[]'                 -- [{name, feet, level}]
total_feet int not null default 0
adders jsonb not null default '[]'               -- [{label, amount}]
discounts jsonb not null default '[]'            -- [{label, amount}]
gst_rate numeric(5,4) not null                   -- copied from settings at creation
gst_number text                                  -- copied from settings at creation
subtotal numeric(10,2) not null default 0
gst numeric(10,2) not null default 0
total numeric(10,2) not null default 0
financing_offered boolean not null default false
notes text
pdf_path text                                    -- bucket 'quotes', private
valid_until date
presented_at, accepted_at, declined_at timestamptz
created_at, updated_at
```
Totals are computed in one pure function in `lib/pricing.ts`, used by the UI and the server action, and covered by unit tests. The database stores the result so history is stable if prices change later. `subtotal` is the total before GST and is the base for commission. Every price on a quote belongs to that quote: `price_per_ft`, `box_price`, each adder and discount amount, and custom lines in `adders` and `discounts`. Settings supplies the defaults when the quote is created; later changes to settings never alter an existing quote. Accepting a quote creates a `commission` earning (see `earnings`).

### earnings
What setters are owed and what they have been paid. One row per earning. Rows are created by server actions, never by the client directly.
```
id uuid pk
profile_id uuid not null references profiles      -- the setter who earned it
lead_id uuid not null references leads
meeting_id uuid references meetings               -- set for type 'booking'
quote_id uuid references quotes                   -- set for type 'commission'
type earning_type not null
rate numeric(10,4) not null                       -- booking_pay in dollars, or commission_rate as a fraction, at creation
base_amount numeric(10,2)                         -- commission: the quote subtotal (before GST); null for booking
amount numeric(10,2) not null                     -- booking: rate; commission: round(base_amount x rate, 2)
status earning_status not null default 'pending'
payable_at timestamptz                            -- booking: set at creation; commission: set when the lead is marked installed
paid_at timestamptz
paid_by uuid references profiles
note text                                         -- void reason or payout reference
created_at, updated_at
unique (lead_id) where type = 'booking'          -- one booking fee per lead, ever
unique (quote_id) where type = 'commission'
```
Rules:
- A booking earning is created when the owner marks a meeting `qualified`, for `meetings.booked_by`, at `settings.booking_pay`, with `payable_at = now()`, unless the lead already has a booking earning. Not qualified, no-show and cancelled earn nothing.
- A commission earning is created when a quote is accepted, for `leads.assigned_to` at that moment, at `settings.commission_rate` on `quotes.subtotal` (the total as actually priced, before GST), with `payable_at` null. Earlier no-shows on the lead do not change it. Marking the lead `installed` sets `payable_at`. Marking the lead `lost` while the commission is unpaid sets `status = 'void'` with the reason in `note`.
- No earning is created when the profile that would receive it has role `owner`.
- "Owed now" everywhere means `status = 'pending' and payable_at is not null`. "Pending install" means `status = 'pending' and payable_at is null`.
- Marking paid is a batch update: `status = 'paid'`, `paid_at = now()`, `paid_by = auth.uid()` on the selected rows. Paid rows are never edited again.

## Planned for V2 (not created in V1)
`jobs` (lead_id, install_date, crew lead, status, materials jsonb, box_location, zones jsonb, photos, checklist, completed_at), `job_assignments` (job_id, profile_id, role), `timesheets` (profile_id, job_id, clock_in, clock_out, minutes, approved), `crew_profiles` (pay_rate, height_authorized, driver_authorized, test_passed_at), `warranty_records`. Leave the `crew` role and `lead_status.installed` in place so these slot in without migrations to existing columns.

## RLS summary

Sales users collaborate, so they can read the team's leads, meetings and knock sessions. They can write only their own. Because of that, no dollar amount is ever stored in `leads`, `lead_events`, `meetings` or `knock_sessions`. Prices live in `quotes` and `earnings` only, and `lead_events.payload` for quote events holds the quote id and nothing else.

| Table | owner | sales |
|---|---|---|
| profiles | all | read own row; read `id`, `full_name` and `role` of active profiles through a view `profiles_public` (for pickers and the schedule); read `id` and `full_name` of every profile, deactivated ones included, through a view `profile_names` (so old leads and timelines still show who did what) |
| settings | all | read only the fields the client needs: slot template, `distance_warning_km` and `lost_reasons`, through a view `settings_public` that exposes nothing else |
| leads | all | insert as themselves; select all; update where `created_by = auth.uid()` or `assigned_to = auth.uid()`; change status only among `new`, `follow_up`, `lost`; no delete |
| lead_photos | all | select all; insert for their own leads, with the file inside their own storage folder |
| lead_events | select and insert; never update or delete | select all; insert `note` events on their own leads |
| knock_sessions | all | select all; insert and update own rows |
| time_blocks | all | select |
| meetings | all | select all; insert where `booked_by = auth.uid()` and the lead is theirs |
| quotes | all | none |
| earnings | all | select where `profile_id = auth.uid()`; no insert, update or delete |

Views on Supabase run with the privileges of the view's owner and bypass RLS, which is what lets sales read `settings_public`, `profiles_public` and `profile_names`. All three views return rows only when the caller has an active profile, so a signed-in account without a profile sees nothing. That is safe only while each view exposes nothing but the safe columns. Never add a column to a public view without checking this table. Supabase's security advisor reports these views as a finding; that is expected and accepted.

Write the policies in SQL in the migration that creates each table. Add a test script that signs in as a sales user and proves it can read another setter's lead but cannot update it, cannot read quotes, cannot read another setter's earnings, and cannot double book a slot.

## Storage buckets
- `lead-photos`: private, signed URLs valid one hour, max 10 MB per file, JPEG, PNG or WebP. Resized in the browser to 1600 px on the long edge and re-encoded as JPEG, which also drops location data, then uploaded straight from the phone to `<uploader id>/<random id>.jpg` while the form is still open. Active owner and sales profiles can read every file; people can upload only into their own folder; only the owner can delete. Files from abandoned forms stay unlinked; cleanup is in the backlog.
- `quotes`: private, PDFs, owner only.
- `presentation`: private, owner writes, app reads through signed URLs.
