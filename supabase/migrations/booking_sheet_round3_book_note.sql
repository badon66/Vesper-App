-- Booking sheet round 3 (Keenan, 2026-11-05): the Book step note gains his
-- line about the number, now that the sheet asks for the phone on Book,
-- last, right above the Book button.
--
-- Applied when that app goes live (after the knocking day), so the note
-- never asks for the number last while the live sheet still asks for it
-- first. Changed in place only while the note is still its starting text; a
-- note Keenan has edited keeps his words and gets the line added at the
-- end. The column default changes too, so a new project starts with the
-- same text.

alter table public.settings
  alter column step_note_book set default $note$A half-hour meeting with our lighting specialist, tonight or this week: a free mockup and a clear price, no obligation. Tell them the time is theirs.

Last, the number: "What's the best number to confirm your meeting?"

If it's not the right time, keep them as a lead and set a follow-up day.$note$;

update public.settings
set step_note_book = $note$A half-hour meeting with our lighting specialist, tonight or this week: a free mockup and a clear price, no obligation. Tell them the time is theirs.

Last, the number: "What's the best number to confirm your meeting?"

If it's not the right time, keep them as a lead and set a follow-up day.$note$
where id = 1
  and step_note_book = $note$A half-hour meeting with our lighting specialist, tonight or this week: a free mockup and a clear price, no obligation. Tell them the time is theirs.

If it's not the right time, keep them as a lead and set a follow-up day.$note$;

update public.settings
set step_note_book = step_note_book || E'\n\n' || $note$Last, the number: "What's the best number to confirm your meeting?"$note$
where id = 1
  and position('best number to confirm' in step_note_book) = 0;
