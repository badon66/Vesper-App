-- Round 6 (Keenan, 2026-11-07), additive and approved up front.
--
-- 1. Where a lead came from: Phone call, for the leads Keenan adds himself.
-- 2. Two answers that can be given together: Christmas lights now can be
--    Hires someone and Does it themselves; Looked into it before can be Got
--    quotes and Thought about it. Stored as one combined value each, so the
--    columns stay single answers. None and New to them stay on their own.
-- 3. A split soffit: a second colour, which needs a short note.
-- 4. A note on each required question (answer_notes), private like the
--    notes already there: only the owner and the lead's own setter read
--    them (lead_notes), the same way as the phone and email (lead_contacts).
--    Note entries on the timeline are read only by the owner and the lead's
--    setter. leads.notes loses its table-wide read grant in the next
--    migration, applied once the app that reads notes only through
--    lead_notes is live (the running app still reads the column).

alter type public.lead_source add value if not exists 'phone_call';
alter type public.christmas_lights_now add value if not exists 'hires_and_diy';
alter type public.looked_into_before add value if not exists 'quotes_and_thought';

-- ---------------------------------------------------------------- split soffit

alter table public.leads add column soffit_colour_2 public.soffit_colour;
alter table public.leads add constraint leads_soffit_colour_2_check check (
  soffit_colour_2 is null
  or (
    soffit_colour is not null
    and soffit_colour_2 <> soffit_colour
    and soffit_colour <> 'not_sure'
    and soffit_colour_2 <> 'not_sure'
    and coalesce(btrim(soffit_note), '') <> ''
  )
);
comment on column public.leads.soffit_colour_2 is
  'Round 6: the second colour of a split soffit. Only beside a first colour, never Not sure, and always with a short note (soffit_note) saying which is where.';
grant select (soffit_colour_2) on public.leads to authenticated;

-- ---------------------------------------------------------------- private notes

alter table public.leads add column answer_notes jsonb not null default '{}'::jsonb
  constraint leads_answer_notes_object check (jsonb_typeof(answer_notes) = 'object');
comment on column public.leads.answer_notes is
  'Round 6: a short note per required question, keyed by question (phone, owns_home, wants_price, both_decision_makers, christmas_lights_now, looked_into_before, soffit_colour). Private: read only through lead_notes.';

create view public.lead_notes
with (security_barrier = true)
as
select l.id as lead_id, l.notes, l.answer_notes, l.created_by, l.assigned_to
from public.leads l
where public.is_owner()
   or (public.is_sales_side() and (l.created_by = auth.uid() or l.assigned_to = auth.uid()));

comment on view public.lead_notes is
  'The notes on the leads the signed-in person may read them on: every lead for the owner, their own leads for a setter (round 6, 2026-11-07). Read only.';

revoke all on public.lead_notes from public, anon, authenticated;
grant select on public.lead_notes to authenticated;

-- Note entries on the timeline: the owner and the lead's own setter only.
alter policy "sales side reads the timeline" on public.lead_events
  using (
    public.is_sales_side()
    and (
      type <> 'note'
      or public.is_owner()
      or exists (
        select 1 from public.leads l
        where l.id = lead_events.lead_id
          and (l.created_by = auth.uid() or l.assigned_to = auth.uid())
      )
    )
  );
