-- Round 6, part two (Keenan, 2026-11-07), applied once the app that reads
-- notes only through lead_notes is live:
-- 1. Nobody reads leads.notes from the table itself any more (lead_notes
--    hands them out to the owner and the lead's own setter).
-- 2. The step notes and the door guide: Which areas and Timing are no longer
--    asked (their columns and saved answers stay), and setters mention that
--    installs run right up to Christmas.

revoke select (notes) on public.leads from authenticated;


-- ---------------------------------------------------------------- step notes and door guide

update public.settings
   set step_note_at_door = replace(
         step_note_at_door,
         'Listen for the rest: their Christmas lights now, whether they''ve looked into permanent lights, which parts of the house, and when.',
         'Listen for the rest: their Christmas lights now, and whether they''ve looked into permanent lights.'
       )
 where id = 1;

update public.settings
   set step_note_at_door = rtrim(step_note_at_door) || E'\n\n' || 'Mention that we''re installing now, right up to Christmas.'
 where id = 1 and position('right up to Christmas' in step_note_at_door) = 0;

update public.settings
   set door_guide = rtrim(door_guide) || E'\n' || 'Mention that we''re installing now, right up to Christmas.'
 where id = 1 and position('right up to Christmas' in door_guide) = 0;
