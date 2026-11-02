# Data model

Postgres on Supabase. Every table has RLS enabled. `id` columns are `uuid default gen_random_uuid()`. Every table has `created_at timestamptz default now()` and, where rows change, `updated_at` kept current by a trigger. Money is `numeric(10,2)`. Feet are integers. Times are `timestamptz` and the app displays them in Calgary time. Alberta has stayed on UTC-6 all year since November 1, 2026 ("Alberta Time", time zone data 2026c); the database's `America/Edmonton` already knows, and the app pins UTC-6 from that moment so phones with older time zone data show the same times.

## Enums

```
role:            owner | sales | crew          -- Postgres type is named user_role; the UI says Admin, Sales associate, Crew
lead_status:     new | follow_up | meeting_booked | met | quoted | sold | installed | lost
lead_source:     door | referral | neighbour_card | website | other
house_type:      bungalow | bi_level | two_storey | other
soffit_colour:   white | off_white | black | brown | other | not_sure    -- off_white and not_sure added 2026-11-01; black and brown stay but are unused (the app offers White, Off-white or cream, Other, Not sure)
photo_slot:      front | left_corner | right_corner | soffit
christmas_lights_now: hires | diy | none
roofline_areas:  front | front_and_sides | full_wrap | not_sure
install_timing:  before_christmas | new_year | no_rush
looked_into_before: got_quotes | thought_about_it | new_to_them   -- added in M3.5
meeting_status:  booked | confirmed | qualified | not_qualified | no_show | cancelled | moved   -- qualified and not_qualified both mean the meeting was held; moved means it was replaced by a meeting at another time; confirmed is unused for now
map_position_source: picked | device               -- picked from the address suggestions, or the phone's own position at the door
quote_status:    draft | presented | accepted | declined | expired
event_type:      created | note | status_change | call | text | meeting_booked | meeting_outcome | quote_created | quote_presented | quote_accepted | quote_declined | photo_added | edited | meeting_moved | meeting_cancelled   -- the last two added in M3
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
hosts_meetings boolean not null default false   -- may run meetings; Keenan for now (M3). Set by the database, never from the app yet
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
door_guide text not null                        -- the M2.6 Door guide; unused since M3.5, kept per the additive rule
step_note_at_door text not null                 -- M3.5: the "?" note for the booking sheet's At the door step, owner edited; starts as in the product spec
step_note_after_door text not null              -- M3.5: the note for After the door
step_note_book text not null                    -- M3.5: the note for Book
not_qualified_reasons text[] not null default '{Not the homeowner, Decision maker missing, Didn''t want a price, Roofline we can''t do, Other}'   -- Other asks for text
meeting_days int[] not null default '{1,2,3,4,5,6}'   -- 0 = Sunday
meeting_start time not null default '18:00'
meeting_slot_minutes int not null default 45
meeting_slot_count int not null default 4
distance_warning_km numeric(5,1) not null default 10
booking_cutoff_minutes int not null default 30  -- setters can hold, book or move into a time until this long before it starts; the owner until it starts
hold_grace_minutes int not null default 2       -- a hold whose screen stops checking in lets go after this long
booking_window_days int not null default 14     -- bookings open tonight and this many evenings ahead
meeting_host_id uuid references profiles        -- who runs meetings booked from the app: Keenan; empty means the owner
company jsonb not null               -- name, phone, email, address for PDFs
updated_at
```

### track_colours
Keenan's list of track colours, managed in Settings like the lost reasons. Rows are never deleted: a retired colour stays so old leads keep it, and only active colours can be chosen for a lead.
```
id uuid pk
name text not null                              -- unique among the list, case-insensitively
ral_code text references ral_classic_colours    -- optional
sort_order int not null                         -- the order Keenan sets
active boolean not null default true            -- false once retired
created_at, updated_at
```
Seeded with White, Off-white, Brown, Black and Grey, in that order.

### ral_classic_colours
The RAL Classic colours (the system in the RAL K7 colour book): code and English name, about 216 rows, seeded by a migration and read only. Used to check a Custom track colour and show its name.
```
code text pk                                    -- four digits, like 9010
name text not null                              -- like Pure white
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
position_source map_position_source             -- picked from the suggestions, or device: the phone's GPS at the door
position_accuracy_m numeric(6,1)                -- for device positions: how accurate the phone said it was, 50 m or better
house_type house_type
soffit_colour soffit_colour                     -- Find out: White, Off-white or cream, Other (with soffit_note), Not sure
soffit_note text
owns_home boolean                               -- Find out: Yes true, No false
wants_price boolean                             -- Find out: Yes true, Not yet false
christmas_lights_now christmas_lights_now       -- Find out: Hires someone, Does it themselves, None
areas_wanted roofline_areas                     -- Find out: Front only, Front and sides, Full wrap, Not sure
install_timing install_timing                   -- Find out: Before Christmas, New year, No rush
looked_into_before looked_into_before           -- Find out (M3.5): Got quotes, Thought about it, New to them
track_colour_id uuid references track_colours   -- set by the owner only: one of the active colours
track_ral_code text references ral_classic_colours  -- set by the owner only: Custom, a RAL Classic code (needs powder coating)
est_feet int
notes text
both_decision_makers boolean                    -- unused; M3 keeps the confirmation on the booking instead (meetings.everyone_deciding_present)
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
- `lat` and `lng` are both set or both empty, and `position_source` is set exactly when they are. A typed address with no map position is allowed to save; booking requires one. For a brand-new street Google doesn't have yet, the phone's own position at the door counts, stored as `device` with its accuracy, which must be 50 m or better and inside the Calgary area. A position saved without a source is taken as picked.
- `phone` is stored in E.164 or not at all.
- The track colour is set by the owner only: a signed-in non-owner cannot set or change `track_colour_id` or `track_ral_code`. At most one of the two is set. A newly chosen `track_colour_id` must be an active colour; a lead keeps a colour that is later retired.
- Deleting a profile that still owns leads or knock sessions is refused; deactivate people instead.

### lead_photos
```
id uuid pk
lead_id uuid not null references leads on delete cascade
storage_path text not null                      -- bucket 'lead-photos', private, signed URLs
slot photo_slot                                 -- Front, Left corner, Right corner or Soffit close-up; null for More photos
caption text
created_by uuid references profiles
created_at
```

The Find out answers are null until answered, and none of them is required to save a lead. Changes to them are logged as `edited` events by field name, like other edits.

One photo per slot per lead (a partial unique index on `(lead_id, slot)`). A photo added to a slot that already has one takes the slot, and the earlier photo stays as an extra with its slot cleared, through a trigger, because only the owner deletes photos. The `photo_added` event records the slot in its payload.

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

### day_schedules
One evening's own meeting times (M3.5), set by the owner from Schedule's pencil with "Just this day". An evening without one uses the template in `settings`. Changing or dropping one stamps the old row; rows are never erased.
```
id uuid pk
host_id uuid not null references profiles       -- whose evening it is: the meeting host
day date not null                               -- the Calgary date of the evening
meeting_start time not null
meeting_slot_minutes int not null               -- 15 to 120
meeting_slot_count int not null                 -- 1 to 12
created_by uuid not null references profiles
removed_at timestamptz                          -- set when the evening goes back to the usual times, gets new times, or "All days" replaces it
removed_by uuid references profiles
created_at
unique (host_id, day) where removed_at is null
```
- An evening's times are its own schedule's when it has one, otherwise the template's, and then only on `meeting_days`. A day schedule can open an evening that isn't a usual meeting day.
- A change never moves or cancels a meeting. A meeting that no longer starts at one of the evening's times keeps its time, and any time that overlaps it can't be held or booked.
- A hold on a time that is no longer one of the evening's times lets go at once, stamped `released`; the holder's screen sees the time is no longer on the board.
- Written only by `set_day_schedule` (below), under the evening lock.

### time_blocks
Times the owner blocks so nothing can be booked, for example a late install day. Removing a block stamps it; rows are never erased.
```
id uuid pk
host_id uuid not null references profiles       -- whose evenings it blocks
starts_at timestamptz not null
ends_at timestamptz not null                    -- after starts_at
reason text
created_by uuid not null references profiles
removed_at timestamptz                          -- set when the owner removes the block
removed_by uuid references profiles
created_at
```

### slot_holds
A time someone has started booking (Keenan, 2026-11-01: no double booking is a hard rule). Rows are never erased: a hold that ends is stamped.
```
id uuid pk
host_id uuid not null references profiles
starts_at timestamptz not null
holder_id uuid not null references profiles
lead_id uuid references leads                   -- the lead being booked, once known
meeting_id uuid references meetings             -- set when the hold is for moving this meeting
renewed_at timestamptz not null default now()   -- the holder's screen checks in to keep it alive
released_at timestamptz                         -- set when the hold ends
release_reason text                             -- booked, moved, released, switched or lapsed (M3.5: a hold whose time disappears in a day change is released)
created_at
unique (host_id, starts_at) where released_at is null
unique (holder_id) where released_at is null    -- one hold per person
```
A hold is active while `released_at` is empty and `renewed_at` is within `settings.hold_grace_minutes` of now. One that has gone quiet longer has lapsed: the next claim on that time stamps it `lapsed` and takes over, and the holder's next check-in takes the time back only if it is still free. Holds are written only by the booking functions below.

### meetings
Open times are computed from the evening's own schedule in `day_schedules` when it has one, otherwise the template in settings (days, start, slot length, count), minus anything that overlaps a live meeting, active holds and time blocks, within the booking window and before the cutoff. There is no slots table. After each slot the owner sets the outcome: `qualified`, `not_qualified`, `no_show` or `cancelled`. Sales users can read every meeting, so `outcome_note` must never contain a price.
```
id uuid pk
lead_id uuid not null references leads
host_id uuid not null references profiles        -- who runs the meeting: Keenan for now; not tied to the owner role
setter_id uuid not null references profiles      -- the lead's assigned setter when it was booked; earns the booking fee
booked_by uuid not null references profiles      -- who picked the time
starts_at timestamptz not null
ends_at timestamptz not null                     -- starts_at plus the evening's slot length when it was booked
status meeting_status not null default 'booked'
everyone_deciding_present boolean not null      -- the setter's confirmation that everyone who decides on the house will be there; must be true
photos_skipped text                             -- 'homeowner_said_no' or 'other' when the Front, Left corner or Right corner photo is missing at booking; shown to the owner on Schedule
photos_skip_note text                           -- required when photos_skipped is 'other'
outcome_reason text                             -- required when not_qualified: from settings.not_qualified_reasons, or the text typed for Other
outcome_note text                               -- optional for no_show and cancelled, never a price
outcome_at timestamptz                          -- when the status left booked: an outcome, a cancel or a move
outcome_by uuid references profiles
rebooked_as uuid references meetings            -- on a no_show, cancelled or moved meeting: the meeting that replaced it
created_at, updated_at
unique (host_id, starts_at) where status in ('booked','confirmed','qualified','not_qualified')
unique (lead_id) where status in ('booked','confirmed')   -- one live booking per lead
```
Rules, all enforced in the database:
- **No double booking** (a hard rule). Tapping an open time places a hold; booking takes the caller's own active hold or a free time, never a time someone else holds. Holds and bookings take the same transaction lock, one per host and Calgary evening, and the unique indexes are the last line.
- **Who may book.** The lead's setter or the owner, for a lead in New or Follow up that passes Before you book, into a time on the template, inside the window and before the cutoff (setters: `booking_cutoff_minutes` before it starts; the owner: until it starts), not blocked.
- **Move and cancel.** A move creates a new meeting at the new time (held first, like a booking) and marks the old one `moved` with `rebooked_as` pointing to the new one. A cancel marks it `cancelled` and sends the lead to Follow up for the next Calgary day. Setters may do either on their own upcoming bookings until the time starts; the owner on any.
- **Outcomes** are the owner's: from the slot's start for Qualified, Not qualified and No-show, and any time for Cancelled. Qualified and Not qualified set the lead to Met; No-show and Cancelled set it to Follow up for the next day. An outcome can be corrected until the booking fee is paid.
- `lead_events` records `meeting_booked`, `meeting_moved`, `meeting_cancelled` and `meeting_outcome` with the meeting ids, times, outcome and reason, never an amount.

### Booking functions
Every write to `slot_holds`, `meetings` and `earnings` goes through these SECURITY DEFINER functions; no policy lets anyone write those tables directly. Each takes the evening lock (a move takes both evenings, in a fixed order). The server actions call them with the signed-in person's own session.
- `schedule_board(host, as_sales, viewer)`: every time in the window with its state (open, held, booked, blocked or closed), the holder's name and initials, and a booked time's neighbourhood and setter. Times come from each evening's own schedule or the template. Every live meeting shows at its own start and end, whether or not it still lines up, and template times that overlap any live meeting are left out (migration 20261102051654: before it, a meeting that still lined up could drop off the board after a longer meeting length). Read only; the screens poll it.
- `set_day_schedule(day, start, minutes, count, scope, host)`: the owner's. Scope `day` gives that evening its own times; `all` updates the template in settings and drops that evening's own times; `usual` drops them only. It takes the evening lock, lets go of holds on times that disappear (stamped `released`), never touches a meeting, and writes Settings only when a value changes. `day_schedule_preview(day, start, minutes, count, scope, host)` lists, read only, the meetings that wouldn't line up and the holds that would let go, for the pop-up's warning.
- `hold_slot(starts_at, lead, meeting, host)`, `renew_hold()`, `release_hold()`.
- `book_meeting(lead, starts_at, everyone_deciding_present, photos_skipped, photos_skip_note, host)`.
- `move_meeting(meeting, new_starts_at)` and `cancel_meeting(meeting, note)`.
- `set_meeting_outcome(meeting, outcome, reason, note)` and `mark_earnings_paid(ids)`: the owner's (the service role may call them too, for the test suite).

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
track_colour_name text                           -- copied from the lead's track colour when the quote is made ready
track_ral_code text                              -- the RAL code used, when there is one
track_custom boolean not null default false      -- a Custom RAL colour, which needs powder coating
notes text
pdf_path text                                    -- bucket 'quotes', private
valid_until date
presented_at, accepted_at, declined_at timestamptz
created_at, updated_at
```
A quote can't be marked ready until the lead's track colour is set; the quote stores the colour name and RAL code it used, prints them, and shows a Custom colour as needing powder coating. Totals are computed in one pure function in `lib/pricing.ts`, used by the UI and the server action, and covered by unit tests. The database stores the result so history is stable if prices change later. `subtotal` is the total before GST and is the base for commission. Every price on a quote belongs to that quote: `price_per_ft`, `box_price`, each adder and discount amount, and custom lines in `adders` and `discounts`. Settings supplies the defaults when the quote is created; later changes to settings never alter an existing quote. Accepting a quote creates a `commission` earning (see `earnings`).

### earnings
What setters are owed and what they have been paid. One row per earning. Rows are created by server actions, never by the client directly.
```
id uuid pk
profile_id uuid not null references profiles      -- the setter who earned it: the lead's assigned setter
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
- A booking earning is created when the owner marks a meeting `qualified`, for `meetings.setter_id` (the lead's assigned setter when it was booked, whoever picked the time), at `settings.booking_pay`, with `payable_at = now()`, unless the lead already has a booking earning. Not qualified, no-show and cancelled earn nothing.
- An outcome can be corrected until the booking earning is paid: moving away from Qualified voids an unpaid booking earning (`status = 'void'`, reason in `note`), and moving back to Qualified restores it.
- A commission earning is created when a quote is accepted, for `leads.assigned_to` at that moment, at `settings.commission_rate` on `quotes.subtotal` (the total as actually priced, before GST), with `payable_at` null. Earlier no-shows on the lead do not change it. Marking the lead `installed` sets `payable_at`. Marking the lead `lost` while the commission is unpaid sets `status = 'void'` with the reason in `note`.
- No earning is created when the profile that would receive it has role `owner`: leads assigned to the owner earn nothing.
- "Owed now" everywhere means `status = 'pending' and payable_at is not null`. "Pending install" means `status = 'pending' and payable_at is null`.
- Marking paid is a batch: `status = 'paid'`, `paid_at = now()`, `paid_by` = the owner, on the selected rows. Paid rows are never edited again, and the amount, rate, type, setter and lead of any earning never change.

## Planned for V2 (not created in V1)
`jobs` (lead_id, install_date, crew lead, status, materials jsonb, box_location, zones jsonb, photos, checklist, completed_at), `job_assignments` (job_id, profile_id, role), `timesheets` (profile_id, job_id, clock_in, clock_out, minutes, approved), `crew_profiles` (pay_rate, height_authorized, driver_authorized, test_passed_at), `warranty_records`. Leave the `crew` role and `lead_status.installed` in place so these slot in without migrations to existing columns.

## RLS summary

Sales users collaborate, so they can read the team's leads, meetings and knock sessions. They can write only their own. Because of that, no dollar amount is ever stored in `leads`, `lead_events`, `meetings` or `knock_sessions`. Prices live in `quotes` and `earnings` only, and `lead_events.payload` for quote events holds the quote id and nothing else.

| Table | owner | sales |
|---|---|---|
| profiles | all | read own row; read `id`, `full_name` and `role` of active profiles through a view `profiles_public` (for pickers and the schedule); read `id` and `full_name` of every profile, deactivated ones included, through a view `profile_names` (so old leads and timelines still show who did what) |
| track_colours | select, insert, update; never delete | select all (active and retired) |
| ral_classic_colours | select | select |
| settings | all | read only the fields the client needs: slot template, `distance_warning_km`, `lost_reasons`, `door_guide`, `booking_cutoff_minutes`, `hold_grace_minutes`, `booking_window_days` and the three step notes, through a view `settings_public` that exposes nothing else |
| leads | all | insert as themselves; select all; update where `created_by = auth.uid()` or `assigned_to = auth.uid()`; change status only among `new`, `follow_up`, `lost`; no delete |
| lead_photos | all | select all; insert for their own leads, with the file inside their own storage folder |
| lead_events | select and insert; never update or delete | select all; insert `note` events on their own leads |
| knock_sessions | all | select all; insert and update own rows |
| time_blocks | select, insert, update (removing stamps the row) | select |
| day_schedules | select; writes only through `set_day_schedule` | select |
| slot_holds | select; writes only through the booking functions | select all; writes only through the booking functions |
| meetings | select; writes only through the booking functions | select all; book, move and cancel their own leads' meetings through the booking functions |
| quotes | all | none |
| earnings | select; writes only through the booking functions | select where `profile_id = auth.uid()`; no writes |

Views on Supabase run with the privileges of the view's owner and bypass RLS, which is what lets sales read `settings_public`, `profiles_public` and `profile_names`. All three views return rows only when the caller has an active profile, so a signed-in account without a profile sees nothing. That is safe only while each view exposes nothing but the safe columns. Never add a column to a public view without checking this table. Supabase's security advisor reports these views as a finding; that is expected and accepted.

Write the policies in SQL in the migration that creates each table. Add a test script that signs in as a sales user and proves it can read another setter's lead but cannot update it, cannot read quotes, cannot read another setter's earnings, and cannot double book a slot.

## Storage buckets
- `lead-photos`: private, signed URLs valid one hour, max 10 MB per file, JPEG, PNG or WebP. Resized in the browser to 1600 px on the long edge and re-encoded as JPEG, which also drops location data, then uploaded straight from the phone to `<uploader id>/<random id>.jpg` while the form is still open. Active owner and sales profiles can read every file; people can upload only into their own folder; only the owner can delete. Files from abandoned forms stay unlinked; cleanup is in the backlog.
- `quotes`: private, PDFs, owner only.
- `presentation`: private, owner writes, app reads through signed URLs.
