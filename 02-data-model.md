# Data model

Postgres on Supabase. Every table has RLS enabled. `id` columns are `uuid default gen_random_uuid()`. Every table has `created_at timestamptz default now()` and, where rows change, `updated_at` kept current by a trigger. Money is `numeric(10,2)`. Feet are integers. Times are `timestamptz` and the app displays them in `America/Edmonton`.

## Enums

```
role:            owner | sales | crew
lead_status:     new | follow_up | meeting_booked | met | quoted | sold | installed | lost
lead_source:     door | referral | neighbour_card | website | other
house_type:      bungalow | bi_level | two_storey | other
soffit_colour:   white | black | brown | other
meeting_status:  booked | confirmed | held | no_show | rescheduled | cancelled
quote_status:    draft | presented | accepted | declined | expired
event_type:      created | note | status_change | call | text | meeting_booked | meeting_outcome | quote_created | quote_presented | quote_accepted | quote_declined | photo_added | edited
run_level:       lower | upper
```

## Tables

### profiles
One row per user, keyed to `auth.users.id`. Created by a trigger on sign-up; role set by the owner.
```
id uuid pk references auth.users
full_name text not null
phone text
role role not null default 'sales'
active boolean not null default true
created_at, updated_at
```

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
warranty_text text not null
presentation jsonb not null          -- pages: [{title, body, image_paths[]}]
confirmation_text text not null      -- template with {first_name} {setter_name} {day} {time} {address}
lost_reasons text[] not null default '{price, other company, not now, could not reach, other}'
meeting_days int[] not null default '{1,2,3,4,5,6}'   -- 0 = Sunday
meeting_start time not null default '18:00'
meeting_slot_minutes int not null default 45
meeting_slot_count int not null default 4
distance_warning_km numeric(5,1) not null default 10
inventory_feet_on_hand int not null default 0
inventory_warning_feet int not null default 300
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
phone text                                      -- E.164 normalized, required before booking
email text
address_line text not null
city text not null default 'Calgary'
postal_code text
neighbourhood text                              -- from Places or typed
lat double precision
lng double precision
place_id text
house_type house_type
storeys int
soffit_colour soffit_colour
soffit_note text
est_feet int
notes text
both_decision_makers boolean                    -- set at booking time
consent_text boolean not null default false     -- CASL: agreed to texts and emails
lost_reason text
lost_at timestamptz
sold_at timestamptz
installed_at timestamptz
created_at, updated_at
```
Indexes: `(assigned_to, status)`, `(status, created_at)`, `(lat, lng)`.

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
Append only. The lead's timeline and the raw material for the dashboard.
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
Open slots are computed from settings (days, start, slot length, count) minus `meetings` minus `time_blocks`. There is no slots table. The unique index is what prevents double booking.
```
id uuid pk
lead_id uuid not null references leads
owner_id uuid not null references profiles      -- who runs the meeting (Keenan)
booked_by uuid not null references profiles
starts_at timestamptz not null
ends_at timestamptz not null
status meeting_status not null default 'booked'
both_decision_makers boolean not null default false
confirmation_sent_at timestamptz
outcome_notes text
rescheduled_to uuid references meetings
created_at, updated_at
unique (owner_id, starts_at) where status in ('booked','confirmed','held')
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
Totals are computed in one pure function in `lib/pricing.ts`, used by the UI and the server action, and covered by unit tests. The database stores the result so history is stable if prices change later.

### inventory_adjustments
```
id uuid pk
delta_feet int not null                          -- positive for stock in, negative for corrections
reason text not null
created_by uuid references profiles
created_at
```
Feet available to sell = settings.inventory_feet_on_hand + sum(adjustments) - sum(total_feet of quotes with status accepted on leads not yet installed).

## Planned for V2 (not created in V1)
`jobs` (lead_id, install_date, crew lead, status, materials jsonb, box_location, zones jsonb, photos, checklist, completed_at), `job_assignments` (job_id, profile_id, role), `timesheets` (profile_id, job_id, clock_in, clock_out, minutes, approved), `crew_profiles` (pay_rate, height_authorized, driver_authorized, test_passed_at), `warranty_records`. Leave the `crew` role and `lead_status.installed` in place so these slot in without migrations to existing columns.

## RLS summary

| Table | owner | sales |
|---|---|---|
| profiles | all | read own row; read `full_name` and `role` of active profiles (for names on the schedule) |
| settings | all | read only the fields the client needs: slot template, confirmation_text, distance_warning_km (expose through a view `settings_public`) |
| leads | all | insert; select and update where `created_by = auth.uid()` or `assigned_to = auth.uid()`; cannot set status to `met`, `quoted`, `sold`, `installed` |
| lead_photos | all | insert and select for their own leads |
| lead_events | all | insert for their own leads; select for their own leads |
| knock_sessions | all | all on own rows |
| time_blocks | all | select (times only) |
| meetings | all | insert where `booked_by = auth.uid()` and the lead is theirs; select own meetings fully; select all meetings' `starts_at`, `ends_at`, `status` and the lead's `neighbourhood` through a view `meeting_slots_public` |
| quotes | all | none |
| inventory_adjustments | all | none |

Write the policies in SQL in the migration that creates each table. Add a test script that signs in as a sales user and proves it cannot read another setter's lead, cannot read quotes, and cannot double book a slot.

## Storage buckets
- `lead-photos`: private, signed URLs, max 10 MB per file, images only. Resize client side to 1600 px on the long edge before upload.
- `quotes`: private, PDFs, owner only.
- `presentation`: private, owner writes, app reads through signed URLs.
