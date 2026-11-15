-- Round 22 (Keenan, 2026-11-15): Supabase's performance advice on policies,
-- in one additive migration: altered policies and three new ones, nothing
-- removed.
--
-- 1. Nine policies read auth.uid() once per query instead of once per row
--    ((select auth.uid())); is_owner() and is_sales_side() likewise.
-- 2. Overlapping policies are merged so each table has one policy per
--    action. The owner's catch-all policy on leads, profiles, knock_sessions
--    and lead_photos, and his separate earnings policy, are folded into the
--    per-action policies and retired: renamed, set to allow nothing, and
--    moved to service_role, which never reads through policies. Keenan's own
--    session keeps every read, add and change it had. It no longer has a
--    direct way to take rows out of those four tables, which nothing in the
--    app used: rows leave only in the 30-day purge, run with the server key.

-- leads: one policy per action.
alter policy "owner manages leads" on public.leads to service_role using (false) with check (false);
alter policy "owner manages leads" on public.leads rename to "retired in round 22: owner manages leads";

alter policy "sales side reads leads" on public.leads
  using ((select public.is_sales_side()));
alter policy "sales side reads leads" on public.leads rename to "owner and sales side read leads";

alter policy "sales side adds leads as themselves" on public.leads
  with check (
    (select public.is_owner())
    or ((select public.is_sales_side()) and created_by = (select auth.uid()))
  );
alter policy "sales side adds leads as themselves" on public.leads rename to "owner adds leads; sales side adds them as themselves";

alter policy "setters update their own leads" on public.leads
  using (
    (select public.is_owner())
    or ((select public.is_sales_side()) and (created_by = (select auth.uid()) or assigned_to = (select auth.uid())))
  )
  with check (
    (select public.is_owner())
    or created_by = (select auth.uid())
    or assigned_to = (select auth.uid())
  );
alter policy "setters update their own leads" on public.leads rename to "owner updates leads; setters update their own";

-- profiles: one policy per action.
alter policy "owner manages profiles" on public.profiles to service_role using (false) with check (false);
alter policy "owner manages profiles" on public.profiles rename to "retired in round 22: owner manages profiles";

alter policy "users read own profile" on public.profiles
  using (id = (select auth.uid()) or (select public.is_owner()));
alter policy "users read own profile" on public.profiles rename to "people read their own profile; owner reads every profile";

create policy "owner adds profiles" on public.profiles
  for insert to authenticated
  with check ((select public.is_owner()));

create policy "owner changes profiles" on public.profiles
  for update to authenticated
  using ((select public.is_owner()))
  with check ((select public.is_owner()));

-- earnings: one read policy.
alter policy "owner reads every earning" on public.earnings to service_role using (false);
alter policy "owner reads every earning" on public.earnings rename to "retired in round 22: owner reads every earning";

alter policy "setters read their own earnings" on public.earnings
  using (
    (select public.is_owner())
    or ((select public.is_sales_side()) and profile_id = (select auth.uid()))
  );
alter policy "setters read their own earnings" on public.earnings rename to "owner reads every earning; setters read their own";

-- knock_sessions: one policy per action.
alter policy "owner manages knock sessions" on public.knock_sessions to service_role using (false) with check (false);
alter policy "owner manages knock sessions" on public.knock_sessions rename to "retired in round 22: owner manages knock sessions";

alter policy "people start their own knock sessions" on public.knock_sessions
  with check (
    (select public.is_owner())
    or ((select public.is_sales_side()) and user_id = (select auth.uid()))
  );

alter policy "sales side reads knock sessions" on public.knock_sessions
  using ((select public.is_sales_side()));

alter policy "people update their own knock sessions" on public.knock_sessions
  using (
    (select public.is_owner())
    or ((select public.is_sales_side()) and user_id = (select auth.uid()))
  )
  with check (
    (select public.is_owner())
    or user_id = (select auth.uid())
  );

-- lead_photos: one policy per action.
alter policy "owner manages lead photos" on public.lead_photos to service_role using (false) with check (false);
alter policy "owner manages lead photos" on public.lead_photos rename to "retired in round 22: owner manages lead photos";

alter policy "setters add photos to their own leads" on public.lead_photos
  with check (
    (select public.is_owner())
    or (
      (select public.is_sales_side())
      and split_part(storage_path, '/', 1) = (select auth.uid())::text
      and exists (
        select 1 from public.leads l
        where l.id = lead_photos.lead_id
          and (l.created_by = (select auth.uid()) or l.assigned_to = (select auth.uid()))
      )
    )
  );

alter policy "sales side reads lead photos" on public.lead_photos
  using (
    (select public.is_owner())
    or ((select public.is_sales_side()) and slot is distinct from 'mockup'::public.photo_slot)
  );

create policy "owner changes lead photos" on public.lead_photos
  for update to authenticated
  using ((select public.is_owner()))
  with check ((select public.is_owner()));

-- lead_events: auth.uid() once per query.
alter policy "people add notes to leads they may edit" on public.lead_events
  with check (
    (select public.is_sales_side())
    and type = 'note'::public.event_type
    and actor_id = (select auth.uid())
    and (
      (select public.is_owner())
      or exists (
        select 1 from public.leads l
        where l.id = lead_events.lead_id
          and (l.created_by = (select auth.uid()) or l.assigned_to = (select auth.uid()))
      )
    )
  );

alter policy "sales side reads the timeline" on public.lead_events
  using (
    (select public.is_sales_side())
    and (
      type <> 'note'::public.event_type
      or (select public.is_owner())
      or exists (
        select 1 from public.leads l
        where l.id = lead_events.lead_id
          and (l.created_by = (select auth.uid()) or l.assigned_to = (select auth.uid()))
      )
    )
  );
