---
target: the booking sheet round 3 (move freely, phone last, Use where I'm standing, optional answers), New lead's new fields, the lead page's From the door (after polish, re-score)
total_score: 29
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:/home/user/components/booking/booking-sheet.tsx"
target_fingerprint: "sha256:3fc69ea1b348f06db1d18d54656048e0dcf23233c27c467601d098d4a310de92"
target_path: /home/user/components/booking/booking-sheet.tsx
timestamp: 2026-11-05T22-55-00Z
slug: components-booking-booking-sheet-tsx
---
Method: two rounds, each with two isolated assessors that never saw each other's work or earlier critiques: a design review from screenshots and source (A), and a detector, CDP page scan and browser measurement pass as a throwaway test setter (B).
- Round 1 (build of 2026-11-05 21:34, commit before b3f5e18): A scored 28/40. B ran the CLI detector (1 advisory finding: the sheet heading's 1.75rem step at 420 px and wider, a deliberate size from round 2) and the CDP engine on six pages (0 findings). B also found in the browser that Next while Use where I'm standing was still finding threw the reading away, which an independent code review found too; fixed.
- Round 2 (commit ba32f9b, after polish): A scored 29/40. B: CLI 1 advisory (the same heading size), CDP 0 findings on New lead at 390 and 430 and the lead page at 390. B measured "Finding where you are..." 3 ms after the tap; the button at full strength while listening; the found position ticked under the address and brought into view; no new field under 44 x 44 except "Use it" (38 px, since widened). From the screenshots, B found Book's list whole above the pinned phone at both sizes, the counter agreeing with the Book button, and the house step fitting.
- Before 28/40 (round 1), after 29/40 (round 2). Round 2 of the sheet scored 31/40 on 2026-11-03, on a different surface (the steps before round 3's changes).
- The last polish after the re-score (commit 2eecc55) was not re-scored.

# Design health score (Assessment A, round 2)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Countdown, counter, Book's list and Saving/Booking are good; the missing marker is a small unexplained dot; photos count as one answer |
| 2 | Match System / Real World | 3 | The language is the setters' own; the number is asked at the door but its field is on Book (Keenan's choice) |
| 3 | User Control and Freedom | 3 | Swipes both ways, Next never blocks, drafts kept; no direct jump between steps; Back beside Back to Book |
| 4 | Consistency and Standards | 2 | Two tick placements; Mark the rest's scope differs between the sheet and New lead; the out-of-sight location notice was red |
| 5 | Error Prevention | 3 | Book as the only gate, database checks, save keys; Mark the rest on the door step rules booking out in one tap |
| 6 | Recognition Rather Than Recall | 3 | Book names every missing item; the dots don't say what; the number may have to be remembered until Book |
| 7 | Flexibility and Efficiency | 3 | Swipes, Mark the rest, Existing lead, Book's rows; no tappable step jump |
| 8 | Aesthetic and Minimalist Design | 3 | Calm and flat; What they learned scrolls with six groups |
| 9 | Error Recovery | 3 | Specific location reasons with iPhone steps; the location-off note didn't say the answers stay |
| 10 | Help and Documentation | 3 | Keenan's step notes and plain inline hints |
| **Total** | | **29/40** | **Good** |

# Priority issues (as found in round 2)
1. [P1] The number is asked at the door but its field is four steps on. Not changed: Keenan put the phone on Book; a tappable progress bar (jump to Book) is a question for him.
2. [P2] "Mark the rest Not collected" on the door step rules booking out in one tap. Not changed: Keenan set it in round 2; a question for him.
3. [P2] "Back" beside "Back to Book". Worked: the gold button says "Return to Book".
4. [P2] The location-off note strands the setter. Worked: it says "What you've entered stays here."; the out-of-sight notice is in the calm bordered style, not red.
5. [P3] The markers under-report. Worked: 8 px markers. Photos still count as one answer.

# Also worked (round 1 and round 2)
One count everywhere ("Step 4 of 6, 7 to answer" over "7 left to answer"); Book's list one row per step, the time not repeated; a row opens its step with the first missing thing outlined; Back from there goes to the step before; the sheet says "this phone at the door"; the locate button stays full strength and says "Listening, up to 15 seconds"; a found position is ticked by the address and brought into view; four-across answers carry their tick in the corner and House type stays four across so the house step fits; the hot buttons match the other answers' type; New lead's optional answers clear on a second tap; From the door stacks on a phone; "Use it" is 44 px wide.
