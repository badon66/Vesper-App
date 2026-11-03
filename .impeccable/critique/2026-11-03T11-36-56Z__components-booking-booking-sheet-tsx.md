---
target: the booking sheet round 2, New lead questions, photo slots, Unfinished, View as feedback (after polish, re-score)
total_score: 31
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:/home/user/components/booking/booking-sheet.tsx"
target_fingerprint: "sha256:b775bbd53d463e5bcfaaaf09143b661b877b4d76c80a8c5731b6983f3ee683df"
target_path: /home/user/components/booking/booking-sheet.tsx
timestamp: 2026-11-03T11-36-56Z
slug: components-booking-booking-sheet-tsx
---
Method: re-score by an independent design-review sub-agent (Assessment A only), unanchored: it was not shown the first round, the commit history or the decisions log. It read PRODUCT.md, DESIGN.md, CLAUDE.md's design rules, the round 2 shape brief, the source, and 65 screenshots of the polished build (commit 8b8cfc8) at 430 x 932 and 390 x 844 as the installed app with safe areas, light theme and View as included, with static HTML and a scroll record, 2026-11-03. 28/40 before polish, 31/40 after. Its P1 and most smaller findings were worked afterwards, before the release (see docs/decisions.md, "After the re-score").

# Design health score (Assessment A)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of System Status | 4 | The hold is readable every second, synced to the server; a ran-out notice says whether the time is still free. One gap: the mid-sheet save isn't visible |
| 2 | Match System / Real World | 3 | Checklist rows read as system checks; "White is the only stock track colour" beside the soffit; the At the door note lists questions asked after the door |
| 3 | User Control and Freedom | 3 | Step 1 has no visible exit (Back disabled); a person who can't be booked can't be kept without holding a time |
| 4 | Consistency and Standards | 3 | New lead and the sheet handle a ruled-out booking differently; "Photos first" and "Fix 1 first" break the wording pattern |
| 5 | Error Prevention | 3 | The sheet keeps, and extends, a time it knows can't be booked (and a duplicate address read, later shown to be a screenshot timing artefact) |
| 6 | Recognition Rather Than Recall | 3 | Photo tiles hide the angle words behind small drawings; Let go only in the time menu |
| 7 | Flexibility and Efficiency | 3 | No one-tap "keep them as a lead and free the time" |
| 8 | Aesthetic and Minimalist Design | 3 | Labels that reflow when ticked; questions held apart by borders more than space |
| 9 | Error Recovery | 3 | A Book timeout sends the setter to Schedule; the way back from a ruled-out answer is two or three screens |
| 10 | Help and Documentation | 3 | The At the door note doesn't match its step; the sheet never says a chosen answer can be tapped again to clear it |
| **Total** | | **31/40** | **Good** |

# Priority issues (as found)
1. [P1] A person who can't be booked can only be kept by holding a time. Worked: Keep as a lead, the gold button wherever booking is ruled out, lets the time go at once; a new person carries on in New lead with everything entered, a saved lead opens on its page; Next steps back; drafts from Unfinished offer it above the times.
2. [P2] Step 1 has no visible way out. Worked: Let go takes Back's place on the first step, asking first.
3. [P2] Photo tiles hide the angle words and shrink the drawings. Worked: bigger drawings at both sizes and a few words for the angle on a wide phone; at 390 the words would push the photo step past one screen, so they stay for screen readers there.
4. [P2] The duplicate-address check skips "Use where I'm standing". Checked, not a fault: leads within 25 m of a phone position are named in the sheet and on New lead; the screenshots were taken before the answer arrived.
5. [P3] The learned step reflows under the thumb. Worked: the tick runs in the words' own line; a question sits closer to its answers than to the next question.

# Also worked
"Take the photos first" / "2 more photos first"; "Can't book yet" on Book when an answer rules it out; the soffit hint asks "Look closely: white or off-white?"; the lead page's answers in two even columns at 390; the step notes' starting text follows round 2's steps (only where Keenan hasn't edited them); View as: the strip's Exit, "nothing was saved" next to the bottom bar, Home says where Unfinished lives.

# Not changed
A Book timeout still points to Schedule; the countdown keeps "left"; "Not sure" stays beside "Not collected" on Which areas; Calgary stays a bias for address suggestions; the under-a-minute bar still offers Add 5 minutes when booking is ruled out.
