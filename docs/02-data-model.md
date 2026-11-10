# Data model

Postgres on Supabase. Every table has RLS enabled. `id` columns are `uuid default gen_random_uuid()`. Every table has `created_at timestamptz default now()` and, where rows change, `updated_at` kept current by a trigger. Money is `numeric(10,2)`. Feet are integers. Times are `timestamptz` and the app displays them in Calgary time. Alberta has stayed on UTC-6 all year since November 1, 2026 ("Alberta Time", time zone data 2026c); the database's `America/Edmonton` already knows, and the app pins UTC-6 from that moment so phones with older time zone data show the same times.

## Enums

```
role:            owner | sales | crew          -- Postgres type is named user_role; the UI says Admin, Sales associate, Crew
lead_status:     new | follow_up | meeting_booked | met | quoted | sold | installed | lost
lead_source:     door | referral | neighbour_card | website | other | phone_call   -- phone_call added in round 6 (2026-11-07), for leads Keenan adds from a call
house_type:      bungalow | bi_level | two_storey | other
soffit_colour:   white | off_white | black | brown | other | not_sure    -- off_white and not_sure added 2026-11-01; black and brown stay but are unused (the app offers White, Off-white or cream, Other, Not sure)
photo_slot:      front | left_corner | right_corner | soffit | mockup | soffit_book | soffit_book_2   -- mockup added in M5: the customer's mockup image, one per lead, owner-uploaded; soffit_book and soffit_book_2 added 2026-11-09: the RAL colour book held up to the soffit (to its second colour when split)
christmas_lights_now: hires | diy | none | hires_and_diy   -- hires_and_diy added in round 6: both answers given together
roofline_areas:  front | front_and_sides | full_wrap | not_sure   -- no longer asked from round 6; kept with its saved answers
install_timing:  before_christmas | new_year | no_rush   -- no longer asked from round 6; kept with its saved answers
looked_into_before: got_quotes | thought_about_it | new_to_them | quotes_and_thought   -- added in M3.5; quotes_and_thought (both together) in round 6
meeting_status:  booked | confirmed | qualified | not_qualified | no_show | cancelled | moved   -- qualified and not_qualified both mean the meeting was held; moved means it was replaced by a meeting at another time; confirmed is unused for now
map_position_source: picked | device               -- picked from the address suggestions, or the phone's own position at the door
quote_status:    draft | presented | accepted | declined | expired | cancelled   -- take 1 writes drafts only; round 8 (2026-11-09) adds cancelled (a yes taken back later) and writes accepted, declined and cancelled through the outcome functions only
event_type:      created | note | status_change | call | text | meeting_booked | meeting_outcome | quote_created | quote_presented | quote_accepted | quote_declined | photo_added | edited | meeting_moved | meeting_cancelled | colour_confirmed | quote_link_created | quote_link_opened | quote_link_revoked | install_requested | quote_cancelled | quote_acceptance_undone   -- meeting_moved and meeting_cancelled added in M3; colour_confirmed added in M5 (the customer initialled the track colour; payload holds the initials and the colour by name, never a price); the four quote link events added 2026-11-02 (payloads hold the link id, or the option they picked in words and the run names, never a price); round 8 (2026-11-09) adds quote_cancelled and quote_acceptance_undone and writes quote_accepted and quote_declined (see `lead_events`)
run_level:       lower | upper
earning_type:    booking | commission
earning_status:  pending | paid | void
setter_read:     hot | warm | just_curious                              -- round 3 (2026-11-05): the setter's read, optional
hot_button:      no_ladders | up_for_christmas | curb_appeal | safety_security | not_sure   -- round 3: what would make them say yes, optional
confirm_by:      call | text                                            -- round 3: how to confirm the meeting, optional; no longer asked from round 6 (Keenan confirms)
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

### profiles: the welcome (2026-11-03)
```
welcome_done_at timestamptz                       -- when the setter finished or skipped the first sign-in welcome; null shows it on Home
```
`finish_welcome()` stamps the caller's own row; `reset_welcome(profile_id)` (owner only) clears it, from People. Neither touches anything else on the profile.

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
presentation jsonb not null          -- M5: six pages in order, [{kind, title, body, image_paths[]}]
                                     -- kinds: what_vesper_is | hidden_by_day | whites_first | install_day | warranty | gallery
                                     -- hidden_by_day image_paths = [day, night]; gallery holds many; other pages are text
                                     -- paths point into the 'presentation' bucket; a page with no content is skipped on the iPad
booking_pay numeric(10,2) not null default 20.00      -- flat pay per qualified booking
commission_rate numeric(5,4) not null default 0.0500  -- share of the lights and control boxes after discounts on the accepted quote (round 8, 2026-11-09)
rush_colour_fee_per_ft numeric(10,2)             -- M5: per foot; unused since 2026-11-04 (rush_colour_fee replaced it), kept per the additive rule
rush_colour_fee numeric(10,2)                    -- 2026-11-04: one flat amount a job ($350) for a non-stock colour powder coated this season; null = not set, the choice and its line are hidden. Copied onto each quote
upper_access_fee numeric(10,2)                   -- 2026-11-04: added to a quote with upper runs and no upper gable ($200); null = no line. Copied onto each quote
upper_gable_access_fee numeric(10,2)             -- 2026-11-04: added instead when an upper gable is in the quote ($400); null = no line. Copied onto each quote
service_call_fee numeric(10,2)                   -- M5: warranty years 6 to 10 ($200 since 2026-11-04); null = not set, no amount shows
quote_valid_days int not null default 14         -- M5: unused since 2026-11-04 (price_hold_days replaced it); set to 90, and its 1..90 check was dropped on 2026-11-05 (Keenan approved)
price_hold_days int not null default 120         -- 2026-11-04: a new quote holds its prices until this many days out (1..365), shown to the customer as "Price held until"
christmas_banner_on boolean not null default true  -- 2026-11-04: the customer quote page's Christmas banner; it shows only from September 1 to November 30 (Calgary) while on (2026-11-05; it was to December 24)
christmas_banner_title text not null             -- its bold first line, "Want them up for Christmas?" (1..80 characters)
christmas_banner_text text not null              -- its words, "We install every day the weather allows. Book now to get on the schedule." (up to 300)
product_points jsonb not null                    -- 2026-11-04: [{icon, text}], up to 8 (the form offers 6), under "What you're getting" on the quote page; icon is one of lightbulb, house, zap, smartphone, plug, shield-check, paintbrush, sun, snowflake, wrench, clock, check
min_job_total numeric(10,2)                      -- quote link (2026-11-02): the least a job can cost before GST; null = no minimum. Copied onto each quote when it is saved
faq_text text not null default ''                -- M5: the folder's FAQ (take 2); seeded as a draft
lost_reasons text[] not null default '{price, other company, not now, could not reach, other}'
door_guide text not null                        -- the M2.6 Door guide; unused since M3.5, kept per the additive rule
step_note_at_door text not null                 -- M3.5: the "?" note for the booking sheet's At the door step, owner edited; starts as in the product spec
step_note_after_door text not null              -- M3.5: the note for After the door
step_note_book text not null                    -- M3.5: the note for Book
confirm_text text not null default 'Hi {first_name}, it''s Keenan with Vesper Lighting. Just confirming {day} at {time}. See you then!'  -- round 7: the ready-made confirmation text on the prep list; 1 to 400 characters; {day} is tonight, tomorrow or the weekday; not in settings_public
not_qualified_reasons text[] not null default '{Not the homeowner, Decision maker missing, Didn''t want a price, Roofline we can''t do, Other}'   -- Other asks for text
meeting_days int[] not null default '{1,2,3,4,5,6}'   -- 0 = Sunday
meeting_start time not null default '18:00'
meeting_slot_minutes int not null default 45
meeting_slot_count int not null default 4
distance_warning_km numeric(5,1) not null default 10
booking_cutoff_minutes int not null default 30  -- setters can hold, book or move into a time until this long before it starts; the owner until it starts
hold_grace_minutes int not null default 2       -- unused since round 2 (2026-11-03); the hold timer below replaced the check-in grace period
hold_minutes int not null default 5             -- round 2: how long a hold lasts, and what Add 5 minutes adds; the timer is what frees a time
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
phone text                                      -- E.164 normalized, Canada (+1) when no country code is typed, required before booking; read only through lead_contacts (contact privacy, 2026-11-04)
email text                                      -- read only through lead_contacts (contact privacy, 2026-11-04)
phone_saved boolean generated always as (phone is not null) stored  -- 2026-11-04: whether a number is saved, readable by anyone who reads the lead, so completeness and Before you book read right without the number
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
soffit_ral_code text references ral_classic_colours    -- 2026-11-09: the soffit's own RAL Classic code from the colour book (the first colour when split); optional
soffit_ral_code_2 text references ral_classic_colours  -- 2026-11-09: the split soffit's second colour's code; cleared by a trigger whenever soffit_colour_2 is empty
owns_home boolean                               -- Find out: Yes true, No false
wants_price boolean                             -- Find out: Yes true, Not yet false
christmas_lights_now christmas_lights_now       -- Find out: Hires someone, Does it themselves, None
areas_wanted roofline_areas                     -- Find out: Front only, Front and sides, Full wrap, Not sure
install_timing install_timing                   -- Find out: Before Christmas, New year, No rush
looked_into_before looked_into_before           -- Find out (M3.5): Got quotes, Thought about it, New to them
track_colour_initials text                       -- M5: the customer's initials confirming the track colour, owner-written only (same guard as the track colour)
track_colour_initialled_at timestamptz           -- M5: when they initialled it; every confirmation also writes a colour_confirmed event
track_colour_id uuid references track_colours   -- set by the owner only: one of the active colours
track_ral_code text references ral_classic_colours  -- set by the owner only: Custom, a RAL Classic code (needs powder coating)
est_feet int
notes text
both_decision_makers boolean                    -- round 2: the question "Everyone who decides will be there": Yes true, No false; booking copies it to meetings.everyone_deciding_present
not_collected text[] not null default '{}'      -- round 2: the questions marked Not collected (phone, owns_home, wants_price, both_decision_makers, christmas_lights_now, looked_into_before, areas_wanted, install_timing); an answered question is never in it (a trigger keeps them apart)
setter_read setter_read                         -- round 3 (2026-11-05): Hot, Warm or Just curious; optional, never counted; Keenan sees it on Meetings and Home; never in meeting mode or anything a customer sees
hot_buttons hot_button[] not null default '{}'  -- round 3: any that apply, or Not sure alone (checked: Not sure never beside another; at most four); optional, never counted; shown with the read
confirm_by confirm_by                           -- round 3: call or text to confirm the meeting; optional
save_key uuid                                   -- 2026-11-04: made on the phone once per new lead (booking sheet, New lead) and sent with every try of its first save, so a retry finds this lead instead of making a copy; unique; empty on leads saved before it or by other paths
consent_text boolean not null default false     -- CASL: agreed to texts and emails
lost_reason text
lost_at timestamptz
follow_up_on date                               -- the day to come back; required while status is follow_up, cleared when it leaves
sold_at timestamptz
installed_at timestamptz                        -- round 8: the day Keenan marks the job Installed, at noon Calgary time
install_on date                                 -- round 8 (2026-11-09): the planned install day, asked when the quote is accepted; read grant to signed-in people; owner only to set
created_at, updated_at
```
Indexes: `(assigned_to, status)`, `(status, created_at)`, `(lat, lng)`, `place_id`, `knock_session_id`, `(created_by, created_at)`, `follow_up_on` where status is `follow_up`, and a unique index on `save_key` where it is set.

Rules enforced in the database:
- `created_by` is always the signed-in user, and `assigned_to` defaults to it. A lead can only link to a knock session of the person who created it.
- A setter may change status only when both the old and new status are `new`, `follow_up` or `lost`. Setters can never change `created_by` or `assigned_to`. M3's booking sets `meeting_booked` inside a database function the guard trusts; the owner can set any status.
- `lost` requires `lost_reason`: from `settings.lost_reasons` when set by hand, or written by a quote's outcome (round 8): the reason's words for a declined quote ("price") and "cancelled, <reason>" for a cancelled sale ("cancelled, timing"), never the note. `lost_at`, `sold_at` and `installed_at` are stamped automatically, and reopening a lost lead clears `lost_at` and `lost_reason`.
- Round 8 (Keenan, 2026-11-09):
  - Only the owner sets `install_on`, `sold_at` and `installed_at`: a trigger (`leads_owner_dates`) refuses a signed-in non-owner's change to any of them, compared after `leads_guard` has stamped its own dates, so a setter's own New, Follow up and Lost moves still work.
  - Sold and Installed come from the quote's outcome: `quote_accept` sets Sold, `lead_mark_installed` sets Installed. The app no longer offers either in the owner's status menu.
  - A safety net (`leads_commission_sync`, after a status change) keeps the commission in step whatever path changes the status: leaving Sold or Installed for anything else voids every pending, unpaid commission of the lead ("The lead left Sold", `quote_id` cleared); becoming Installed makes pending commission payable; going from Installed back to Sold makes it not payable again.
- `follow_up` requires `follow_up_on`. Leaving `follow_up` clears it. A signed-in person cannot set a follow-up date earlier than today in Calgary; moving the date on a lead that stays in `follow_up` is an edit. The status change into `follow_up` records the date in its event payload, and a date change alone logs an `edited` event naming the field.
- `lat` and `lng` are both set or both empty, and `position_source` is set exactly when they are. A typed address with no map position is allowed to save; booking requires one. For a brand-new street Google doesn't have yet, the phone's own position at the door counts, stored as `device` with its accuracy, which must be 50 m or better and inside the Calgary area. A position saved without a source is taken as picked.
- `phone` is stored in E.164 or not at all.
- Round 3 (2026-11-05): `setter_read`, `hot_buttons` and `confirm_by` have their own read grants, like every column but the phone and email, and edits to them are logged as `edited` events by field name. Writes follow the row policies, as for the other answers.
- Contact privacy (Keenan, 2026-11-04): signed-in people read `leads` column by column, every column except `phone` and `email`, so a query that names either one, or asks for `*`, is refused. Setters still write the phone and email of their own leads. The phone and email come from the view `lead_contacts` (`lead_id`, `phone`, `email`, `created_by`, `assigned_to`), which returns every lead's for Keenan and only their own leads' for a setter. It runs with the view owner's rights and a security barrier, so its own filter applies before anything a caller adds. A column added to `leads` later needs a read grant in its migration, or nobody but the service role can read it.
- At most one lead has a given `save_key` (the unique index), so two tries of the same first save can never both make a lead, even at the same instant. The app looks the key up before it inserts, and again when the insert hits the index; it hands a lead back only to the person who created it.
- The track colour is set by the owner only: a signed-in non-owner cannot set or change `track_colour_id` or `track_ral_code`. At most one of the two is set. A newly chosen `track_colour_id` must be an active colour; a lead keeps a colour that is later retired.
- Round 6 (Keenan, 2026-11-07):
  - `soffit_colour_2 soffit_colour` (nullable, read grant): a split soffit's second colour. A check allows it only beside a different first colour, never Not sure, and only with a `soffit_note` saying which is where.
  - `answer_notes jsonb not null default '{}'` (an object): a short note per required question, keyed `phone`, `owns_home`, `wants_price`, `both_decision_makers`, `christmas_lights_now`, `looked_into_before`, `soffit_colour`. No read grant: read only through `lead_notes`.
  - Notes are private to the lead's own setter and the owner. `notes` loses its read grant (migration `round6_notes_private`, applied once the app read notes only through the view). The view `lead_notes` (security barrier, read only) returns `lead_id, notes, answer_notes, created_by, assigned_to` for every lead to the owner and for their own leads (created or assigned) to a setter, like `lead_contacts`. The app applies the same rule again for View as (`lib/leads/notes.ts`).
  - `areas_wanted`, `install_timing` and `confirm_by` are no longer asked; the columns and their saved answers stay, and saves never write them. The questions counted for "N of 6 collected" are phone, owns home, wants a price, everyone who decides, Christmas lights now and looked into it before.
- Soffit colour code (Keenan, 2026-11-09; migration `soffit_colour_code`):
  - `soffit_ral_code` and `soffit_ral_code_2` (text, foreign keys to `ral_classic_colours(code)`, read grant to signed-in people): the soffit's own number from the RAL colour book, one per soffit colour. Optional everywhere: never needed to save or book, never in the six counted questions, never anything to do with pay. They follow the row policies like the other answers: the lead's own setter (created or assigned) and the owner write them, every signed-in member of the sales side reads them.
  - A trigger (`leads_soffit_code_tidy`, before insert or update of `soffit_colour_2` or `soffit_ral_code_2`) clears `soffit_ral_code_2` whenever `soffit_colour_2` is empty, so a second code only exists beside a second colour.
  - The `edited` event names `soffit_colour_2`, `soffit_ral_code` and `soffit_ral_code_2` when they change (field names only, never the code).
  - The photo of the colour book goes in the `soffit_book` slot (`soffit_book_2` for the second colour) under the existing lead photo rules: setters add them to their own leads from their own storage folder, the owner manages all, a new photo takes the slot and the old one stays as an extra, and `photo_added` records the slot.
  - Use for the track (owner only) is not a database feature: the app sets `track_colour_id` or `track_ral_code` through the existing owner-only track colour path, so the track colour guard is unchanged.
- Deleting a profile that still owns leads or knock sessions is refused; deactivate people instead.

### lead_photos
```
id uuid pk
lead_id uuid not null references leads on delete cascade
storage_path text not null                      -- bucket 'lead-photos', private, signed URLs
slot photo_slot                                 -- Front, Left corner, Right corner or Soffit close-up; the mockup; the colour book (soffit_book, soffit_book_2); null for More photos; only the owner fills the mockup slot (guard `lead_photos_mockup_owner_only`, 2026-11-09)
caption text
created_by uuid references profiles
created_at
```

The Find out answers are null until answered, and none of them is required to save a lead. Changes to them are logged as `edited` events by field name, like other edits.

One photo per slot per lead (a partial unique index on `(lead_id, slot)`). A photo added to a slot that already has one takes the slot, and the earlier photo stays as an extra with its slot cleared, through a trigger, because only the owner deletes photos. The `photo_added` event records the slot in its payload.

### lead_events
Append only for everyone, the owner included: no updates, no deletes. The lead's timeline and the raw material for the dashboard. Database triggers write `created`, `status_change` (with from and to, plus the reason for `lost` or the date for `follow_up` in the payload), `edited` (with the names of the changed fields, never their values) and `photo_added`, with the signed-in user as actor. From M5 they also write `quote_created` when a quote is added (payload: the quote's id, never an amount) and `colour_confirmed` each time the customer's initials are recorded (payload: the initials and the colour by name at that moment). People write only `note` events by hand.

Round 8 (2026-11-09): the quote outcome functions write `quote_accepted` (`{quote_id, install_on}`), `quote_declined` (`{quote_id, reason}`), `quote_cancelled` (`{quote_id, reason, inside_window}`, whether the cancel came within 10 days of `accepted_at`) and `quote_acceptance_undone` (`{quote_id}`); Installed is logged by the `status_change` it makes. Every setter reads these, so a payload holds the quote id and fixed-list facts only: a reason from the five, inside the window or not, the planned install day. Never an amount, never a typed note. The timeline reads them as "Marked the quote accepted. Install planned for Fri, Nov 20.", "Marked the quote declined: price.", "Cancelled the sale: timing, inside the 10-day window." and "Undid the quote's acceptance." A change to the planned install day on its own is an `edited` event naming `install_on` ("Changed the planned install day."; review, 2026-11-10); a status change that sets or clears it in the same update doesn't add one.
```
id uuid pk
lead_id uuid not null references leads on delete cascade
actor_id uuid references profiles
type event_type not null
from_status lead_status
to_status lead_status
payload jsonb                                   -- note text, meeting id, quote id, etc.
-- Round 6: a `note` entry is read only by the owner and the lead's own setter (the select policy); every other entry by the whole sales side, as before.
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
last_tap_at timestamptz                         -- round 4: the last counter tap
ended_automatically boolean not null default false   -- round 4: still open at midnight, ended itself
created_at, updated_at
```
One open session per person, enforced by a partial unique index. Counters change only through `bump_knock_session(session, doors, conversations)`, one atomic update that never goes below zero and records `last_tap_at`, so fast taps never lose counts. A session still open at midnight Calgary time ends itself (round 4, 2026-11-06): `ended_at` is its last tap, or its start with no taps, and `ended_automatically` is true. `end_open_knock_sessions()` (security definer; only the service role and the scheduled job can run it) does this for everyone, run by the `pg_cron` job `end-open-knock-sessions` every five minutes; `close_my_stale_knock_sessions()`, which Session and Start knocking run for the person, uses the same rule. Sessions open when this came in got `last_tap_at` from their last update. The neighbourhood keeps the spelling of the first session that used it: a trigger (`knock_sessions_neighbourhood_spelling`, security definer) tidies spaces and takes the earliest spelling that matches ignoring capitals, with an index on `lower(neighbourhood)`. Leads saved while a session is open link to it.

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
renewed_at timestamptz not null default now()   -- round 2: where the hold's timer counts from; it lasts settings.hold_minutes from here, and Add 5 minutes moves it on by that much
released_at timestamptz                         -- set when the hold ends
release_reason text                             -- booked, moved, released, switched or lapsed (M3.5: a hold whose time disappears in a day change is released)
created_at
unique (host_id, starts_at) where released_at is null
unique (holder_id) where released_at is null    -- one hold per person
```
A hold is active while `released_at` is empty and its timer hasn't run out: `renewed_at` plus `settings.hold_minutes` is still ahead (round 2, 2026-11-03; before, a hold lived while its screen checked in). One that has run out has lapsed: the next claim on that time stamps it `lapsed` and takes over. The holder can add `hold_minutes` to a live hold (`extend_hold`), or take a run-out hold back while the time is still free. Holds are written only by the booking functions below.

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
confirmed_at timestamptz                        -- round 7: when Keenan confirmed the time with them (text or call); set only through confirm_meeting, owner only; a moved meeting starts unconfirmed
created_at, updated_at
unique (host_id, starts_at) where status in ('booked','confirmed','qualified','not_qualified')
unique (lead_id) where status in ('booked','confirmed')   -- one live booking per lead
```
Rules, all enforced in the database:
- **No double booking** (a hard rule). Tapping an open time places a hold; booking takes the caller's own active hold or a free time, never a time someone else holds. Holds and bookings take the same transaction lock, one per host and Calgary evening, and the unique indexes are the last line.
- **Who may book.** The lead's setter or the owner, for a lead in New or Follow up that passes Before you book, into a time on the template, inside the window and before the cutoff (setters: `booking_cutoff_minutes` before it starts; the owner: until it starts), not blocked.
- **Move and cancel.** A move creates a new meeting at the new time (held first, like a booking) and marks the old one `moved` with `rebooked_as` pointing to the new one. A cancel marks it `cancelled` and sends the lead to Follow up for the next Calgary day. Setters may do either on their own upcoming bookings until the time starts; the owner on any.
- **Confirmed** (round 7): `confirm_meeting(meeting, confirmed)` sets or clears `confirmed_at`, for the owner only (42501 for anyone else, the secret key included) and only on a meeting still `booked` or `confirmed`.
- **Outcomes** are the owner's: from the slot's start for Qualified, Not qualified and No-show, and any time for Cancelled. Qualified and Not qualified set the lead to Met; No-show and Cancelled set it to Follow up for the next day. An outcome can be corrected until the booking fee is paid.
- `lead_events` records `meeting_booked`, `meeting_moved`, `meeting_cancelled` and `meeting_outcome` with the meeting ids, times, outcome and reason, never an amount.

### Booking functions
Every write to `slot_holds`, `meetings` and `earnings` goes through these SECURITY DEFINER functions; no policy lets anyone write those tables directly. Each takes the evening lock (a move takes both evenings, in a fixed order). The server actions call them with the signed-in person's own session.
- `schedule_board(host, as_sales, viewer)`: every time in the window with its state (open, held, booked, blocked or closed), the holder's name and initials, and a booked time's neighbourhood and setter. Times come from each evening's own schedule or the template. Every live meeting shows at its own start and end, whether or not it still lines up, and template times that overlap any live meeting are left out (migration 20261102051654: before it, a meeting that still lined up could drop off the board after a longer meeting length). Read only; the screens poll it.
- `set_day_schedule(day, start, minutes, count, scope, host)`: the owner's. Scope `day` gives that evening its own times; `all` updates the template in settings and drops that evening's own times; `usual` drops them only. It takes the evening lock, lets go of holds on times that disappear (stamped `released`), never touches a meeting, and writes Settings only when a value changes. `day_schedule_preview(day, start, minutes, count, scope, host)` lists, read only, the meetings that wouldn't line up and the holds that would let go, for the pop-up's warning.
- `hold_slot(starts_at, lead, meeting, host)`, `release_hold()`; round 2: `extend_hold()` (holder only: adds `hold_minutes` to a live hold, or takes a run-out one back while it's still free) and `hold_status()` (the caller's own hold and when it runs out); `renew_hold()` now only reports, like `hold_status()`, and never extends.
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
runs jsonb not null default '[]'                 -- [{name, feet, level, part}]; part (2026-11-04): eave | gable | garage | porch | sides | other, guessed from the name in the quote builder and changeable; a run saved before then has none and its name gives the guess
total_feet int not null default 0
adders jsonb not null default '[]'               -- [{label, amount, upper_only?}]; upper_only (2026-11-02): the line counts only while an upper run is selected
discounts jsonb not null default '[]'            -- [{label, amount}]
gst_rate numeric(5,4) not null                   -- copied from settings at creation
gst_number text                                  -- copied from settings at creation
subtotal numeric(10,2) not null default 0
gst numeric(10,2) not null default 0
total numeric(10,2) not null default 0
financing_offered boolean not null default false
colour_timing text                               -- M5: stock | factory_order | rush; how the colour is priced (see the spec)
rush_fee_per_ft numeric(10,2)                    -- M5: unused since 2026-11-04 (no quote ever had one), kept per the additive rule
rush_fee numeric(10,2)                           -- 2026-11-04: this quote's flat rush colour fee, kept whatever the timing (the link names it); counted only when colour_timing = 'rush'; null on a quote made before
upper_access_fee numeric(10,2)                   -- 2026-11-04: this quote's upper access amount without an upper gable; null on a quote made before, so no line
upper_gable_access_fee numeric(10,2)             -- 2026-11-04: this quote's amount with an upper gable; null on a quote made before
track_colour_name text                           -- copied from the lead's track colour when the quote is made ready (take 1 copies what is already set)
track_ral_code text                              -- the RAL code used, when there is one
track_custom boolean not null default false      -- a Custom RAL colour, which needs powder coating
notes text
pdf_path text                                    -- bucket 'quotes', private
valid_until date
min_job_total numeric(10,2)                      -- 2026-11-02: copied from settings when the quote is saved; null = no minimum
presented_at, accepted_at, declined_at timestamptz
accepted_runs int[]                              -- round 8: the accepted option, as 0-based positions into runs; null = every run (the full quote)
accepted_by uuid references profiles             -- round 8: who marked it accepted
lead_status_before lead_status                   -- round 8: the lead's status before Accepted (never sold, installed or lost, else met), where Undo puts it back
decline_reason text                              -- round 8: one of price | timing | partner said no | went with someone else | other
cancel_reason text                               -- round 8: the same five, for a yes taken back
cancelled_at timestamptz                         -- round 8
outcome_note text                                -- round 8: the note with Other, at most 300 characters; owner only like every quote column, never copied anywhere setters read
created_at, updated_at
```
A quote can't be marked ready until the lead's track colour is set; the quote stores the colour name and RAL code it used, prints them, and shows a Custom colour as needing powder coating. Totals are computed in one pure function in `lib/pricing.ts`, used by the UI and the server action, and covered by unit tests. The database stores the result so history is stable if prices change later. `subtotal` is the total before GST. It is not the commission base (round 8): the commission counts only the lights and control boxes after discounts (see `earnings`). Every price on a quote belongs to that quote: `price_per_ft`, `box_price`, each adder and discount amount, and custom lines in `adders` and `discounts`. Settings supplies the defaults when the quote is created; later changes to settings never alter an existing quote. Accepting a quote creates a `commission` earning (see `earnings`). Take 1 (M5) writes drafts only, one draft per lead reused; presented, the ready rule and the PDF arrive in take 2. Accepted, declined and cancelled arrive in round 8, on the lead page, through the outcome functions below. The rush line ("Rush colour fee", 2026-11-04) is the quote's flat `rush_fee` when `colour_timing` is 'rush'; a stocked colour and a factory order add nothing. Upper access ("Upper roof access") follows the runs that are on: nothing without an upper run with feet, `upper_gable_access_fee` when an upper run's part is a gable, otherwise `upper_access_fee`; on the customer's link it changes as they switch runs. Quotes made before 2026-11-04 have neither amount, so neither line. Commission is round 8's (see `earnings`).

Round 8 (Keenan, 2026-11-09): a quote's outcome.
- Only the database moves a quote to `accepted`, `declined` or `cancelled`. A guard (`quotes_outcome_guard`, before insert or update) refuses a row entering or leaving any of the three, or inserted with one, unless the outcome functions are running (hint `outcome_only`). While a quote stays accepted, its numbers are locked: any change outside its outcome fields, `notes`, `pdf_path`, `presented_at` and `updated_at` is refused (hint `quote_locked`). The guard compares the whole row as JSON, so it never names a column that only some databases have. It also refuses a new quote on a lead whose quote is accepted (hint `quote_locked`; review, 2026-11-10), so a later draft never stands in for the sale. To change an accepted quote, Keenan undoes the acceptance.
- The outcome functions are SECURITY DEFINER and owner only (`acts_as_owner()`, so the test suite's service role may call them too; anyone else gets `42501`, hint `not_allowed`); a refusal raises `P0001` with a stable hint the app turns into words (`lib/quotes/outcome.ts`; a quote that isn't found gets the same hint as one in the wrong status):
  - `quote_accept(quote, runs int[] default null, install_on date default null) returns jsonb`: from draft, presented, declined or cancelled (`not_open`); no other accepted quote on the lead (`already_accepted`); the lead needs a track colour (`track_colour_needed`); `runs` distinct, inside the quote's runs and not empty, null for every run (`bad_runs`). Sets the quote accepted with `accepted_at`, `accepted_by`, `accepted_runs`, `lead_status_before` and the lead's track colour copied on; the lead to Sold with `install_on`; creates the commission (see `earnings`); writes `quote_accepted`. Returns `{commission: {profile_id, amount} | null, reason: 'owner_lead' | 'already_paid' | null}` for Keenan's own screen.
  - `quote_decline(quote, reason, note default null)`: from draft or presented (`not_open`); never while another quote on the lead is accepted, since the sale stands on that one (`already_accepted`); a reason from the five (`bad_reason`); a note only with Other, trimmed, at most 300 characters (`bad_note`). The quote becomes declined with `declined_at`, the reason and the note; the lead goes to Lost with the reason's words and no planned install day; writes `quote_declined`; turns the lead's live link off (`revoke_quote_link`, which writes `quote_link_revoked`).
  - `quote_cancel(quote, reason, note default null)`: an accepted quote only (`not_accepted`). The quote becomes cancelled with `cancelled_at`, the reason and the note; pending unpaid commission on the lead is voided ("Cancelled: <reason>"); the lead goes to Lost with "cancelled, <reason>" and no planned install day; writes `quote_cancelled` with whether it came inside 10 days of `accepted_at`; turns the lead's live link off. Works on a Sold or Installed lead. The window is never stored.
  - `quote_undo_acceptance(quote)`: an accepted quote on a Sold lead (`not_undoable`), so never after Installed. Pending unpaid commission is voided ("Acceptance undone"); the quote goes back to `draft` with its accepted fields cleared, so meeting mode opens it again; the lead goes back to `lead_status_before` (or Met) with `install_on` cleared, and a lead going back to Follow up comes due tomorrow, as after a cancelled booking; a lead going back to Meeting booked with no booked or confirmed meeting left goes to Met instead; writes `quote_acceptance_undone`.
  - `lead_mark_installed(lead, on date)`: a Sold lead with an accepted quote (`not_sold`); the day set and not after today in Calgary (`bad_date`). The lead goes to Installed with `installed_at` at noon Calgary time on that day; the safety net makes the commission payable.
  - `lead_undo_installed(lead)` (review, 2026-11-10): Not installed yet, for a wrong tap or day. An Installed lead with an accepted quote (`not_installed`) goes back to Sold; `leads_guard` clears `installed_at` and the safety net makes an unpaid commission wait for the install again; a paid one stays paid. The status change logs itself.
  - `quote_commission_base(quote, runs int[])`: the commission base (see `earnings`), for the functions above only; nobody may call it directly.
- Declining or cancelling a quote takes it out of `quote_link_current_quote` (draft, presented or accepted) and turns the live link off, so the customer's link shows the closed page with call and text even if an older open quote is on the lead, and the lead page's Quote card shows the next quote, if any. An accepted quote keeps the link working.

### quote_links
The customer quote link (2026-11-02). Owner only; anonymous callers and sales users read nothing here. The public page reaches it only through the token functions below.
```
id uuid pk
lead_id uuid not null references leads
token text not null unique                        -- 24 characters, base64url of 18 random bytes (144 bits), made in the database
created_by uuid not null references profiles      -- who made it; Book my install notifies this person
created_at
revoked_at timestamptz                            -- turned off; a revoked link shows the closed page and can't be turned back on
revoked_by uuid references profiles
view_count int not null default 0                 -- visits, no IP address or device details stored
first_viewed_at, last_viewed_at timestamptz
selection int[]                                   -- positions (0-based) of the runs they have switched on; null = the Recommended package
selection_runs text                               -- fingerprint of the quote's runs when the selection was made; a different fingerprint means the quote changed and the selection is ignored
selection_at timestamptz
booked_at timestamptz                             -- the latest Book my install
booked_option text                                -- "Recommended package" or "Start smaller: Front, Garage"; words only, never a price
booked_selection int[]
notified_option text                              -- the option last pushed to the maker, so the same option twice notifies once
updated_at
unique (lead_id) where revoked_at is null         -- one live link per lead
```
The page shows the lead's latest quote, so updating the quote updates what the same link shows. A link is live while it is not revoked and the lead has a quote (2026-11-04: links don't expire). The quote's `valid_until` is the day its prices are held until; after it the page still works and says prices may have changed, and Book my install still works.

Functions (all `security definer`, `search_path = ''`):
- `issue_quote_link(lead_id)`: owner only. Returns the live link's token, making one (and a `quote_link_created` event) when there is none and the lead has a quote.
- `revoke_quote_link(lead_id)`: owner only. Stamps the live link revoked and writes `quote_link_revoked`.
- `quote_for_customer(token)`: anyone. One call returns what the page shows: `{state: 'live', first_name, last_name, address, city, valid_until, today, quote: {runs (with parts), runs_fingerprint, price_per_ft, box_price, box_count, adders, discounts, colour_timing, rush_fee, upper_access_fee, upper_gable_access_fee, min_job_total, gst_enabled, gst_rate, track_colour_name, track_custom}, warranty, service_call_fee, christmas, product_points, install_day, gallery, company, mockup_path, selection, booked_at, booked_option}` for a live token. `today` is Calgary's date, so the page knows whether the price hold has passed without trusting the phone's clock; `christmas` is `{title, text}` only while Settings has it on and the date is September 1 to November 30, otherwise null; `install_day` is the presentation's install day page; `gallery` is the presentation gallery's photo paths. For anything else (unknown or revoked) it returns `{state: 'closed', company: {name, phone, email}}` (2026-11-04; it was 'expired'): Vesper's public contact for the call and text buttons, with no customer name and no prices. No notes, costs, setter, status, timeline or other customer, ever.
- `quote_gallery_signable(name)`: storage's rule for the presentation bucket (2026-11-04): true only for a request carrying a live token in `x-quote-token` and an object that is one of the gallery's photos. Nothing else in that bucket can be signed or listed by an anonymous caller.
- `quote_link_visit(token)`: anyone. Adds one visit and stamps the time; the first visit writes `quote_link_opened`.
- `quote_link_select(token, positions int[])`: anyone. Saves which runs they have on.
- `quote_link_book(token, positions int[])`: anyone. Saves Book my install with the option in words, writes `install_requested` (the option and run names, no price), and returns the maker's sealed push addresses when this option hasn't been pushed yet. Never accepts the quote and never creates an earning.

### push_subscriptions
Web push addresses for members' devices (2026-11-02). Built for Book my install first and for any later alert (the backlog's booking alerts) without changes.
```
id uuid pk
profile_id uuid not null references profiles
endpoint_hash text not null unique                -- sha256 of the push address, so one device is stored once
sealed text not null                              -- the push address and its keys, AES-GCM sealed with a key derived from the server's VAPID private key; only the server can open it
label text not null                               -- "iPhone", "iPad" and so on, from the browser, for the list in Settings
created_at
last_sent_at timestamptz
removed_at timestamptz                            -- switched off; the row is kept, sealed, and gets nothing
```
Each member reads, adds and switches off only their own rows. A function that decides an event warrants a notice returns the recipient's sealed rows; the server opens them and sends: `quote_link_book` for Keenan's Book my install notice, and `push_targets_for_member(profile_id)` (owner only, 2026-11-03) for the notice a setter gets when Keenan marks, moves or cancels their booking. `push_devices_for_member(profile_id)` (owner only) lists a member's devices by label and date, for View as.

### earnings
What setters are owed and what they have been paid. One row per earning. Rows are created by server actions, never by the client directly.
```
id uuid pk
profile_id uuid not null references profiles      -- the setter who earned it: the lead's assigned setter
lead_id uuid not null references leads
meeting_id uuid references meetings               -- set for type 'booking'
quote_id uuid                                     -- set for type 'commission'; no foreign key (never added); cleared when a commission is voided by Undo, Cancel or the lead leaving Sold, so the quote can be accepted again
source_quote_id uuid                              -- round 8: the quote a commission came from, kept after quote_id is cleared
type earning_type not null
rate numeric(10,4) not null                       -- booking_pay in dollars, or commission_rate as a fraction, at creation
base_amount numeric(10,2)                         -- commission: the lights and control boxes after discounts on the accepted option (round 8); null for booking
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
- Round 8 (Keenan, 2026-11-09): a commission earning is created by `quote_accept`, for the lead's setter (`coalesce(leads.assigned_to, leads.created_by)` at that moment, the same person the booking fee goes to unless the lead was reassigned since it was booked), at `settings.commission_rate`, with `payable_at` null, unless that person's role isn't `sales` or the lead already has a pending or paid commission. Earlier no-shows on the lead do not change it.
- The base is worked out in the database from the stored quote (`quote_commission_base`), never from a number a browser sends: feet = the sum over the accepted runs of `least(10000, greatest(0, round(feet)))`, numeric values only; track = `round(price_per_ft x 100) x feet` cents; boxes = `round(box_price x 100) x greatest(box_count, 0)` cents, whatever runs were picked; discounts = the sum of `round(greatest(0, amount) x 100)` cents over `quotes.discounts`, numeric values only; base = `greatest(0, track + boxes - discounts) / 100`; amount = `round(base x rate, 2)`. It never reads `adders`, `colour_timing`, the rush fees, the upper access fees or `min_job_total`, so the rush colour fee, upper access, every extra work line and the minimum top-up are left out by construction. `lib/pay/commission.ts` mirrors it in whole cents and basis points, for previews and unit tests.
- Marking the job Installed sets `payable_at` (the safety net on `leads`). Undo acceptance, Cancel, or the lead leaving Sold or Installed any other way voids a pending unpaid commission (`status = 'void'`, the reason in `note`: "Acceptance undone", "Cancelled: <reason>" or "The lead left Sold") and clears its `quote_id`, keeping `source_quote_id`; that is what lets the quote be accepted again, at its new numbers, under the one-commission-per-quote index. A paid commission is never touched: Undo and Cancel leave it paid, and the lead gets no second commission while one is pending or paid.
- No earning is created when the profile that would receive it has role `owner`: leads assigned to the owner earn nothing.
- "Owed now" everywhere means `status = 'pending' and payable_at is not null`. "Coming once installed" (called pending install before round 8) means `status = 'pending' and payable_at is null`, which only a commission can be.
- Marking paid is a batch: `status = 'paid'`, `paid_at = now()`, `paid_by` = the owner, on the selected rows. Paid rows are never edited again, and the amount, rate, type, setter and lead of any earning never change. The guard (`earnings_guard`) allows one exception from round 8: an unpaid commission's `quote_id` may be cleared as it is voided.

## Planned for V2 (not created in V1)
`jobs` (lead_id, install_date, crew lead, status, materials jsonb, box_location, zones jsonb, photos, checklist, completed_at), `job_assignments` (job_id, profile_id, role), `timesheets` (profile_id, job_id, clock_in, clock_out, minutes, approved), `crew_profiles` (pay_rate, height_authorized, driver_authorized, test_passed_at), `warranty_records`. Leave the `crew` role and `lead_status.installed` in place so these slot in without migrations to existing columns.

## RLS summary

Sales users collaborate, so they can read the team's leads, meetings and knock sessions. They can write only their own. Because of that, no dollar amount is ever stored in `leads`, `lead_events`, `meetings` or `knock_sessions`. Prices live in `quotes` and `earnings` only, and `lead_events.payload` for quote events holds the quote id and, from round 8, fixed-list facts only (a reason from the list, inside the 10-day window or not, the planned install day), never an amount or a typed note.

| Table | owner | sales |
|---|---|---|
| profiles | all | read own row; read `id`, `full_name` and `role` of active profiles through a view `profiles_public` (for pickers and the schedule); read `id` and `full_name` of every profile, deactivated ones included, through a view `profile_names` (so old leads and timelines still show who did what) |
| track_colours | select, insert, update; never delete | select all (active and retired) |
| ral_classic_colours | select | select |
| settings | all | read only the fields the client needs: slot template, `distance_warning_km`, `lost_reasons`, `door_guide`, `booking_cutoff_minutes`, `hold_grace_minutes`, `booking_window_days`, the three step notes and (round 2) `hold_minutes`, through a view `settings_public` that exposes nothing else |
| leads | all, phone and email through `lead_contacts` | insert as themselves; select every lead, every column but `phone` and `email`; update where `created_by = auth.uid()` or `assigned_to = auth.uid()`; change status only among `new`, `follow_up`, `lost`; no delete |
| lead_contacts (view) | every lead's phone and email | the phone and email of their own leads only (created or assigned) |
| lead_photos | all | select all; insert for their own leads, with the file inside their own storage folder |
| lead_events | select and insert; never update or delete | select all; insert `note` events on their own leads |
| knock_sessions | all | select all; insert and update own rows |
| time_blocks | select, insert, update (removing stamps the row) | select |
| day_schedules | select; writes only through `set_day_schedule` | select |
| slot_holds | select; writes only through the booking functions | select all; writes only through the booking functions |
| meetings | select; writes only through the booking functions | select all; book, move and cancel their own leads' meetings through the booking functions |
| quotes | all, except that accepted, declined and cancelled come only through the outcome functions, and an accepted quote's numbers are locked (round 8) | none |
| quote_links | all, through `issue_quote_link` and `revoke_quote_link` for writes | none |
| push_subscriptions | their own rows | their own rows |
| earnings | select; writes only through the booking functions and, from round 8, the quote outcome functions and the lead status safety net | select where `profile_id = auth.uid()`; no writes |

Views on Supabase run with the privileges of the view's owner and bypass RLS, which is what lets sales read `settings_public`, `profiles_public` and `profile_names`. All three views return rows only when the caller has an active profile, so a signed-in account without a profile sees nothing. That is safe only while each view exposes nothing but the safe columns. Never add a column to a public view without checking this table. Supabase's security advisor reports these views as a finding; that is expected and accepted.

Anonymous callers (the customer's quote page) have no access to any table. They call the four token functions, which return only customer-safe fields and change only their own link, and Storage lets a request carrying a live token sign that quote's mockup and nothing else (below).

Write the policies in SQL in the migration that creates each table. Add a test script that signs in as a sales user and proves it can read another setter's lead but cannot update it, cannot read quotes, cannot read another setter's earnings, and cannot double book a slot.

## Storage buckets
- `lead-photos`: private, signed URLs valid one hour, max 10 MB per file, JPEG, PNG or WebP. Resized in the browser to 1600 px on the long edge and re-encoded as JPEG, which also drops location data, then uploaded straight from the phone to `<uploader id>/<random id>.jpg` while the form is still open. Active owner and sales profiles can read every file; people can upload only into their own folder; only the owner can delete. Files from abandoned forms stay unlinked; cleanup is in the backlog.
- `lead-photos`, the quote link (2026-11-02): an anonymous request can sign (and so show for ten minutes) exactly one object, the mockup of the lead whose live token it carries in the `x-quote-token` header. Listing or signing anything else is refused.
- `quotes`: private, PDFs, owner only.
- `presentation`: private, owner writes, app reads through signed URLs.
