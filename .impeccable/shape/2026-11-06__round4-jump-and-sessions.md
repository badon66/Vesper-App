# Shape: round 4, tap to jump and sessions (2026-11-06)

Mode: Operate. Phone first: setters at a door at dusk, one-handed, 390 and 430 wide.

## The booking sheet's progress bar
- Six steps, each a button: 44 px tall, sharing the full width (about 54 px each at 390), the thin bar drawn inside. The tap area reaches up into the empty padding of the header's top row, so the header grows by only a few pixels and every step but What else did you learn still fits without scrolling.
- The counter moves off the bar to the step's label line: "At the door" left, "Step 1 of 6, 12 to answer" right.
- A jump goes straight there, keeps what was typed, saves nothing; Next after it is the plain next step. A step jumped over gets no marker.
- Screen readers: a nav named Steps; each button "Step 3 of 6, What they learned", plus "something still missing" when marked; the current one is aria-current.

## Session
- Reminder: inside the status row under the counters (it never moves them), plain text in Night Text, no icon, no gold: "Tap Doors +1 at every door, and Conversations +1 when someone answers." After 15 minutes with no tap; gone at the first tap for good.
- Summary of a session that ended itself: its day before the times ("Thu, Nov 5, 5:07 to 6:50 p.m."), and a plain line "Ended automatically: it was still open at midnight, so it ends at the last tap." No warning style: nothing went wrong that the setter has to fix.
- Neighbourhood suggestions: as they type, up to four of the team's places that match, as full-width 44 px rows under the box, the name in semibold and "The team's" in muted text on the right; tapping one fills the box. Own recent chips stay below.

## Rules that win
Navy and gold, dark by default, gold only for the next action, no gradients, glassy effects or emoji, plain words, 44 px targets.
