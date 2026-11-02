# Shape brief: the booking sheet and the owner's Schedule header (M3.5)

Written with the impeccable skill's shape step on 2026-11-02, before any code. Keenan's M3.5 brief (decisions.md, 2026-11-02, and the product spec) answered the discovery questions; the assumptions below are marked as such. The visual world is the incumbent one in DESIGN.md ("Porch Light"), and CLAUDE.md's design rules win over anything here.

## 1. Job and audience
- **Who:** a setter at a homeowner's door in Calgary, late afternoon into dusk, phone in one hand, the homeowner beside them looking at the screen. Keenan uses the same sheet for his own leads and to book a setter's lead from the lead page, on his phone or iPad.
- **Mode:** Operate. The tool disappears into the conversation; nothing on screen competes with the homeowner.
- **Need:** pick a time together, claim it at once, and finish the details as the conversation goes and right after leaving the door, without losing the time.

## 2. Outcome and proof
- **Primary action:** a booked meeting that passes Before you book, in as few taps as the conversation allows.
- **Success:** the setter can say "it's yours" the moment the time is tapped, the held time stays visible on every screen, and the done screen says exactly when ("Booked for 7:30 pm tonight.").
- **Product truth no template has:** the hold that makes double booking impossible, the door process (open, find out, photos, book) as the step order, and Before you book as the gate.

## 3. Selected direction
- **Visual authority:** the incumbent world in DESIGN.md: night navy, gold only where the next action is, Manrope, flat surfaces, 44 px targets.
- **Structural thesis:** one full-screen sheet with three fixed zones that never move:
  - the top bar: the held time on the left (gold when held), "?" on the right, and the three-step progress bar under them;
  - the content: one screen of one step;
  - the bottom bar: a quiet row with "Pick another time" and "Let go", and under it Back (outline, left) and Next (gold, right, in thumb reach).
- **Focal moments:** the held time chip (the promise to the customer) and Next. Per the Porch Light Rule, nothing else on a screen is gold: chosen answers use the strong neutral treatment (light fill, dark text, a check), not gold.
- **Implementation consequence:** the sheet lives in the shared app layout, above every page, so a navigation underneath never closes it, and it owns the hold: it checks in while open and lets go when closed without booking.

## 4. Scope and boundaries
- **In:** the sheet and its screens; the time picker inside it (for lead-first entries, Pick another time and Move); New lead's Save and book, the lead page's Book a meeting and Move opening the sheet; the owner's Block time and pencil pop-ups on Schedule, with blocked and off-grid booked times on the board; the three step notes in Settings and behind "?" on New lead; Looked into it before everywhere Find out shows.
- **Untouched:** every booking rule and every existing test; Tonight's meeting cards and outcomes; My pay and Pay; the tab bar.
- **Anti-goals:** no page hops; no modal stacks inside the sheet (one dialog at a time: "?", Let go's question, Existing lead); no scrolling on a phone for any At the door or After the door screen; no gold on answers; no animation beyond a short slide between screens (150 to 200 ms).

## 5. Screens, states and ranges
**Times** (only when the sheet opens from a lead, from Pick another time, or for Move): the evenings strip and the times grid, the same tiles as Schedule. The title says whose time it is ("Pick a time for Jane", or "Move Jane's 7:30 pm to").

**At the door**
1. *Who are we meeting?* First name, last name and phone, with "Existing lead instead" as a small link at the top right of the content.
2. *Find out:* Owns the home (Yes, No), Wants a price (Yes, Not yet), Christmas lights now (Hires someone, Does it themselves, None).
3. *Find out:* Looked into it before (Got quotes, Thought about it, New to them), Which areas (Front only, Front and sides, Full wrap, Not sure, as a 2 by 2 grid), Timing (Before Christmas, New year, No rush).
4. *Will everyone who decides be there?* One large toggle: "Yes, everyone who decides will be there."

**After the door**

5. *Address:* the address field with suggestions, "Use where I'm standing", and the nearby-lead warning. Next saves the lead (it needs a first name and an address).
6. *Soffit colour:* White, Off-white or cream, Other (with a note), Not sure, as a 2 by 2 grid.
7. *Photos:* the four guided slots in a 2 by 2 grid, and "Can't get photos?" opening the skip reasons (Homeowner said no; Other, with a note).

**Book**

8. *Book 7:30 pm tonight:* who and where in two lines, the Before you book list (each item ticked, or "Missing" with a Fix link to its screen), any distance warning, and Next becomes "Book 7:30 pm" (off until everything passes, with "2 things missing" beside it).
9. *Done:* "Booked for 7:30 pm tonight." with the name and address, and Done (gold) with Open lead beside it.

**Move:** times, then *Move Jane to 8:15 pm tonight?* with Move, then *Moved to 8:15 pm tonight.*

**States:**
- Held: the time chip is gold and reads "7:30 pm tonight, held for you".
- Lapsed: the chip turns quiet and a notice says the hold let go, with Hold it again when the time is still free, or why not (someone is booking it, it was booked, it is no longer on the schedule) with Pick another time.
- Saving: Next shows "Saving" and stays put; a failed save keeps everything and says what to do.
- Photo upload failed: "Didn't upload. Tap to try again."
- No leads for Existing lead instead: "No New or Follow up leads of yours yet."
- Booking refused by the database: its own plain message, the list updated.

**Ranges:**
- 1 to 12 times an evening, 15 evenings in the window.
- Names up to about 40 characters, wrapping onto two lines in the summary.
- An evening can have 0 to 12 bookings, some of them off-grid after a day change.

## 6. Interaction and layout
- **Answers:** one tap selects and a second tap clears, as everywhere else in the app. Nothing auto-advances: the conversation isn't linear, so Next is always the setter's call.
- **Moving between screens:** Next and Back walk the screens in order. The progress bar's step names jump to the first screen of that step; Fix links jump to the exact screen. For a lead that is already filled in, Next skips every screen whose answers are complete.
- **Saving as you go:** answers before the lead exists stay on the phone, kept in a draft that survives a reload; after it exists, each screen saves on Next and photos attach as they upload.
- **Let go:** asks "Let go of 7:30 pm?", says whether the person is already saved, and offers "Keep holding" and "Let go".
- **"?":** opens the step's note in a small panel anchored to the bottom, with Close at the bottom right.
- **Phone (390 by 844):** the content area is what is left between the bars, and every At the door and After the door screen fits in it with the keyboard closed.
- **iPad, landscape and portrait:** the same sheet, with the content centred at up to 640 px and the bars spanning the width, their buttons aligned to the content's edges.
- **The owner's Schedule header:** "Schedule" on the left; "Block time" (outline, small) and a pencil icon button on the right, both 44 px. Setters never see them, and neither does View as.
- **The owner's pop-ups:** on a phone they are bottom panels, on an iPad centred dialogs up to 480 px, always with the main action at the bottom right.
  - Block time: the evening's times as a one-tap list, plus "The whole evening", an optional reason, and Block.
  - The pencil: start time, meeting length and number of meetings, a live preview of the times, the warnings, and "Just this day" (primary) and "All days" (outline). "Use the usual times" shows when the evening has its own.
  - Tapping a blocked time on the board, as the owner, offers Unblock.

## 7. Constraints and open decisions
- **View as:** times stay disabled, so the sheet never opens. The Schedule header's buttons don't show for setters, so they don't show in View as.
- **Accessibility:** 44 px targets; contrast at least 4.5:1 in both themes; focus moves to each new screen's heading; the dialogs trap focus and close with Escape.
- **Reuse:** the time tiles, the answer groups, the address field, "Use where I'm standing", the photo slots and the readiness list, rather than new variants.
- **Assumptions to confirm after build:**
  - two or three questions per Find out screen, rather than one;
  - Let go asks first;
  - Existing lead instead throws away anything typed on the first screen without asking.
