---
target: round 4, the booking sheet's tappable step bar and the Session tab's reminder, overnight summary and neighbourhood suggestions (after polish, re-score)
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/home/user/components/booking/booking-sheet.tsx"
target_fingerprint: "sha256:57b019f47df1673f7c3b526016f02f91d89fcd0ef9b537f697b363bc5b255598"
target_path: /home/user/components/booking/booking-sheet.tsx
timestamp: 2026-11-06T08-00-00Z
slug: components-booking-booking-sheet-tsx
---
Method: two rounds, each with two isolated assessors that never saw each other's work or earlier critiques: a design review from screenshots and source (A), and a detector, CDP page scan and browser measurement pass as throwaway TEST setters, read only (B).
- Before round 4: the booking sheet 29/40 (2026-11-05, round 3 after polish) and the Session tab 29/40 (2026-11-05).
- Round 4, first pass (commit c70a1db): A 28/40. B: CLI 1 advisory (the sheet heading's 1.75rem step from round 2, deliberate), CDP 0 findings; the reminder sits in the status row with the counters unmoved, 15.5:1 contrast, and fits the knocking view's first screen.
- Round 4, after polish (commit 5cc1e00): A 28/40. B: CLI the same one advisory, CDP 0 findings; the suggestion list stays put after a tap; found the neighbourhood box could scroll under the sticky header and a double full stop, both fixed after.
- A last polish (commit 3a0c206) followed this re-score and was not re-scored: steps gone through drawn softer than the current one, hollow markers, the held time 44 px tall, a calmer overnight summary with nothing tapped, the box clear of the header, bordered suggestion rows.

# Design health score (Assessment A, after polish)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Counter and countdown clear; the current step only 2 px taller than steps gone through (since fixed) |
| 2 | Match System / Real World | 3 | The bar follows the visit; a no-tap overnight summary claimed a time out (since fixed) |
| 3 | User Control and Freedom | 3 | Every step one tap away; Back follows step order |
| 4 | Consistency and Standards | 2 | The marker looked like a page dot while Book uses open circles (since a hollow ring); four names for the count |
| 5 | Error Prevention | 3 | Book the only gate; the menu-closing tap no longer jumps; steps close under the held time (gap widened) |
| 6 | Recognition Rather Than Recall | 2 | Unnamed bars; the tour is the only teacher |
| 7 | Flexibility and Efficiency | 3 | Jump, swipe, Book's rows, suggestions, chips |
| 8 | Aesthetic and Minimalist Design | 3 | Calm and flat; a tick on its own line in House type |
| 9 | Error Recovery | 3 | Book's list leads to each step; a disabled bar during uploads shows no change |
| 10 | Help and Documentation | 3 | Step notes and the tour |
| **Total** | | **28/40** | **Good** |

# Priority issues (round 4, after polish)
1. [P1] The current step hard to see once every bar is filled. Worked: steps gone through softer, the current one full strength and taller.
2. [P1] The neighbourhood box can slide under the sticky header on focus. Worked: a scroll margin clears the header.
3. [P2] The marker read as "you are here". Worked: a hollow ring, like Book's open circles.
4. [P2] A no-tap overnight summary claimed "Out under a minute". Worked: day and start only, "Nothing was tapped, so no time out is counted."
5. [P3] Steps close under the held time. Worked: the held time is 44 px, not 48, so the gap is wider.

# Not changed (Keenan's calls or out of scope)
"Mark the rest Not collected" stays on the door step; the step names stay; the counter scrolls off What else did you learn, the one step allowed to scroll; Back follows step order.
