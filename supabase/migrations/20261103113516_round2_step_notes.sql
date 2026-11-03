-- Round 2 polish (2026-11-03): the booking sheet's step notes follow round
-- 2's steps.
--
-- What: the starting text of the three step notes in Settings, rewritten for
-- the steps Keenan set in round 2. At the door now asks only the three
-- questions booking needs (owns the home, wants a price, everyone who
-- decides); the rest of what the setter learns is noted after the door; and
-- Book says to keep someone as a lead when it isn't the right time, the way
-- the sheet now offers.
--
-- Why: the notes were written for the first booking sheet, which asked
-- about Christmas lights and timing at the door and never asked about a
-- price. The "?" on each step showed questions that step no longer asks.
--
-- Each note changes only while it is still the starting text: a note Keenan
-- has edited in Settings is his and stays as he wrote it. The column
-- defaults change too, so a new project starts with the same text.

alter table public.settings
  alter column step_note_at_door set default $note$Who you are, that you're with Vesper Lighting, and why you're on their street.

To book, ask as a conversation, not a survey:
- Is it their home?
- Would they like a price?
- Who else decides on the house, and can they be at the meeting?

Listen for the rest: their Christmas lights now, whether they've looked into permanent lights, which parts of the house, and when. You'll note it after the door.$note$,
  alter column step_note_after_door set default $note$Before you go: "Mind if I grab a few quick photos? Our lighting specialist will show you a mockup of your house with the lights on."

On the sidewalk: note what else you learned, then pick the address, check the soffit colour, and take the photos. Hold the phone sideways and get the whole roofline in.$note$,
  alter column step_note_book set default $note$A half-hour meeting with our lighting specialist, tonight or this week: a free mockup and a clear price, no obligation. Tell them the time is theirs.

If it's not the right time, keep them as a lead and set a follow-up day.$note$;

update public.settings
set step_note_at_door = $note$Who you are, that you're with Vesper Lighting, and why you're on their street.

To book, ask as a conversation, not a survey:
- Is it their home?
- Would they like a price?
- Who else decides on the house, and can they be at the meeting?

Listen for the rest: their Christmas lights now, whether they've looked into permanent lights, which parts of the house, and when. You'll note it after the door.$note$
where id = 1
  and step_note_at_door = $note$Who you are, that you're with Vesper Lighting, and why you're on their street.

Then find out, as a conversation, not a survey:
- Is it their home?
- Do they put up Christmas lights now, and how?
- Have they looked into permanent lights before, or is it new to them?
- Which parts of the house, and when?
- Who else decides on the house, and can they be at the meeting?$note$;

update public.settings
set step_note_after_door = $note$Before you go: "Mind if I grab a few quick photos? Our lighting specialist will show you a mockup of your house with the lights on."

On the sidewalk: note what else you learned, then pick the address, check the soffit colour, and take the photos. Hold the phone sideways and get the whole roofline in.$note$
where id = 1
  and step_note_after_door = $note$Before you go: "Mind if I grab a few quick photos? Our lighting specialist will show you a mockup of your house with the lights on."

On the sidewalk: pick the address, check the soffit colour, and take the photos. Hold the phone sideways and get the whole roofline in.$note$;

update public.settings
set step_note_book = $note$A half-hour meeting with our lighting specialist, tonight or this week: a free mockup and a clear price, no obligation. Tell them the time is theirs.

If it's not the right time, keep them as a lead and set a follow-up day.$note$
where id = 1
  and step_note_book = $note$A half-hour meeting with our lighting specialist, tonight or this week: a free mockup and a clear price, no obligation. Tell them the time is theirs.

If it's not the right time, let the time go and set a follow-up day.$note$;
