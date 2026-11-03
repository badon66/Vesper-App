---
target: the booking sheet round 2, New lead questions, photo slots, Unfinished, View as feedback (before polish)
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/home/user/components/booking/booking-sheet.tsx"
target_fingerprint: "sha256:d8657d23313a99d609ee3aa0bb9bd5172dacc49171f676d5bff4fbfee95b3706"
target_path: /home/user/components/booking/booking-sheet.tsx
timestamp: 2026-11-03T10-06-17Z
slug: components-booking-booking-sheet-tsx
---
Method: dual-agent (A: design review sub-agent · B: detector sub-agent), round 2 before polish, 2026-11-03. A read PRODUCT.md, DESIGN.md, CLAUDE.md's design rules, the shape brief, the source, and 59 screenshots of the real build at 430 x 932 and 390 x 844 (installed app, safe areas added), light theme and View as included. B ran the CLI detector on the 11 changed files, URL scans of 10 rendered pages, and Playwright measurements on 5. Neither saw the other's output.

# Design health score (Assessment A)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | The held time hides its day until Book; the countdown is 12 to 14 px muted text |
| 2 | Match System / Real World | 3 | "At the door:" on an After the door step; "Not sure" next to "Not collected" |
| 3 | User Control and Freedom | 3 | A person who can't be booked has no short way out of a held time |
| 4 | Consistency and Standards | 2 | Dashed means four things; not-ready Next tappable but not-ready Book disabled; two gold buttons after a run-out; Change time vs Pick another time |
| 5 | Error Prevention | 2 | One tap on Mark the rest marks all three booking questions Not collected, silently |
| 6 | Recognition Rather Than Recall | 3 | The held day must be remembered; nothing says Not collected blocks booking |
| 7 | Flexibility and Efficiency | 3 | Hold actions live in the hardest corner on a 6.7 in. phone |
| 8 | Aesthetic and Minimalist Design | 3 | Space spent unevenly: Who and Address thin, Learned full |
| 9 | Error Recovery | 3 | Not collected first flagged on step 6; a not-ready Next on a question step shows nothing |
| 10 | Help and Documentation | 3 | Nothing tells a new setter what Not collected costs |
| **Total** | | **28/40** | **Good** |

# Design specificity verdict
Authored for Vesper in its structure and its hold: the held time is an object in the header with its own menu; the parts are named for where the setter stands; "Three questions to book" turns the database rule into a title; the line drawings of each house angle draw the roofline heavier; "Use where I'm standing" states its accuracy; Before you book is the database's rule list in plain words; gold stays on Next, the held time and Book. Generic in places: the Who form, the dashed chip, the Book checklist styling, and a done screen that is one sentence on an empty screen. Missed: the drawings shrink to 32 to 40 px thumbnails in the sheet; neither Book nor the done screen shows the house; the held time leaves out the day.

Deterministic scan (B): CLI exit 0 with 1 advisory, design-system-font-size on the 28 px sheet title at 420 px and wider (deliberate per Keenan's "bigger type at 430"; DESIGN.md's type ramp doesn't record the step). URL scans: 9 of 10 pages clean; 1 advisory, a straggler ("first.") in the Follow-ups due card description on Home (card.tsx's CardDescription lacks text-pretty). Measurements: no tap target under 44 x 44 (smallest, the "?" at exactly 44), no text under 12 px (12 px is the floor: the countdown at 390 and the photo tile captions), no horizontal overflow, every step fits without scrolling at both sizes, and all text at AA or better (Not collected chip 8.44:1 dark, 6.34:1 light; its dashed edge 3.85:1 and 3.35:1). The Upload button takes the tile's bottom-right corner, both still at least 44 px. No overlay: there is no user-facing browser tab here.

Where they agree: both put the photo tiles' smallest text (Take photo, Upload, 12 px) and the 12 px countdown at the bottom of the hierarchy. Where B adds: the straggler in the Follow-ups due card. Where B can't see: the silent Not collected on booking questions, the missing day, the bottom bar's contradictions; the detector reads markup, not consequences.

# Overall impression
The hold is the best-designed thing in the app: an object with a menu, calm under a minute, honest when it runs out, re-checked so "still free" can't go stale. The weak spots are consequences and hierarchy: Not collected on a booking question costs four more steps before anyone says so, and the photo tiles make Upload look like the button.

# What's working
1. The hold as an object: one gold-bordered button with the time and countdown, a menu that opens at once, Add 5 minutes in thumb reach under a minute, never red, a run-out explained exactly and re-checked every 5 s, a wake lock, and a reload that checks the hold with the database again.
2. Next says what the step still needs, and Book is the database's own list in plain words, with Fix or Change answer beside each failure.
3. Product craft and an honest View as: the drawings, the GPS accuracy line, the dusk photo hint, and "View as: nothing was saved." in calm text exactly where the save would have been.

# Priority issues
1. [P1] Booking questions fail silently until step 6, and one tap closes all three. Not collected on Owns the home, Wants a price or Everyone who decides shows nothing; Mark the rest marks all three; the phone's Not collected keeps the same hint; New lead's Save and book then holds a real time for a lead that can't be booked; the No and Not yet advice can't be followed on step 2. Fix: a note in the non-blocking warning style the moment any of them rules booking out, a bold phone line, copy that names a path that exists, and Save and book that steps back when booking is ruled out. (clarify, harden)
2. [P1] The photo tiles reverse the order of importance: Upload is a bordered panel, Take photo a 12 px caption, and Upload stays after a photo is saved. Fix: Take photo as the tile's visible label, Upload quiet and gone once the slot has its photo, bigger drawings, and the soffit question moved to the address step so the photo step is four large tiles. (layout)
3. [P2] The held time doesn't say which day, and the countdown is the faintest text on screen; its spoken name changes every second. Fix: the day in the time, a bigger countdown in the body colour, the day on the Book button when it isn't tonight, a fixed spoken name. (typeset)
4. [P2] The bottom bar contradicts itself: a not-ready Next focuses a hidden Not collected radio with no visible change; a not-ready Book is a disabled dim gold; two golds after a run-out; Change time and Pick another time. Fix: show the open question, one dashed tappable style for both, Next steps back to outline while the hold has run out, one name. (polish)
5. [P2] Layout slips on the step the homeowner sees: Everyone who decides in a 3-column grid with 2 answers; the Not collected chip about 3 px above the rightmost answer; "Front and sides" breaking over three lines at 430. (layout)

# Persona red flags
- A new setter at dusk: Mark the rest under "Three questions to book" changes nothing visible; "Not yet" consequences in 14 px grey; a right thumb aimed at No lands near Not collected; Upload looks like the button; "At the door:" on the sidewalk step; the countdown unread until the under-a-minute banner.
- Keenan at 430: "5:00 p.m." on every step for a booking two weeks out; the step-up misses the menu, the chips and the photo captions; the House step scrolls only under View as.
- Large text or bright sun: the iPhone's Larger Text setting has no effect (fixed rem sizes); the smallest text is the most important (countdown, photo captions, Upload).

# Minor observations
The times view and the "?" note can wait on "One moment." with no failure state; the address step says "At the door:"; "Stopped at step 6 of 6" reads as finished; no way to remove a draft; step 1's bottom-left is a disabled Back; the time menu uses shadow-lg; the held time's 1 px gold border is about 2.9:1 on white; a swipe on an unfinished Who raises the keyboard; Sign out sits beside the bell.

# Questions to consider
1. Should the homeowner see a ticking clock at the door?
2. Should "Three questions to book" come before the name?
3. If one of the three questions means "not tonight", is a held time the right container?

Questions skipped: five priority issues were found, but Keenan's brief for this round already decided the next step (critique, then polish what it finds at both phone sizes, before release), and the session runs without questions.
