---
target: the customer quote link, the rework (after the build and the five-seat screenshot review, before the critique's fixes)
total_score: 27
max_score: 36
na_heuristics: 7
p0_count: 0
p1_count: 2
target_identity: "file:/home/user/components/quote-link/customer-quote.tsx"
timestamp: 2026-11-05T01-40-00Z
slug: components-quote-link-customer-quote-tsx
---
Method: dual-agent (A: an isolated design-review sub-agent; B: an isolated detector and browser sub-agent), against a staged TEST quote on the production build at 390x844, 430x932 and 390x664, by keyboard and with reduce motion. Take 1 ended at 30/40 (75%, 2026-11-02); this build scores 27/36 (75%, heuristic 7 n/a on a Persuade surface).

| # | Heuristic | Score |
|---|---|---|
| 1 | Visibility of System Status | 3 |
| 2 | Match System/Real World | 3 |
| 3 | User Control and Freedom | 3 |
| 4 | Consistency and Standards | 3 |
| 5 | Error Prevention | 3 |
| 6 | Recognition Rather Than Recall | 3 |
| 7 | Flexibility and Efficiency | n/a |
| 8 | Aesthetic and Minimalist Design | 3 |
| 9 | Error Recovery | 3 |
| 10 | Help and Documentation | 3 |
| | **Total** | **27/36 (Good)** |

Design specificity: specific in the details (the house drawing, the money lines that say what they are for, the Calgary words, gold only as light), standard in the frame (a category mobile offer page).

Detector (B): the CLI scan found one advisory, `design-system-font-size` on the hero total's 2.75rem (deliberate: the page's one big price; DESIGN.md's ramp has no display step); the browser overlay found no anti-patterns at the top, middle or bottom.

Priority issues and what happened (commit 774ae34):
1. P1. A quick second tap on Book my install landed on the confirm step's Yes. Fixed: Yes ignores taps in its first half second; the walk-through taps twice and checks nothing books.
2. P1. On a typical phone (390x664, Safari's toolbar showing) the drawing was off screen while switching. Fixed: each switch row starts with a small close-up of its own part, lit while on and dashed once off; the big drawing stays as the overview.
3. P2. The photo button's focus outline didn't draw (Tailwind v4 `outline-none` beat `outline-3`), and the footer links had a faint default. Fixed: `outline-solid` on focus; the footer links have the page's ring.
4. P2. The breakdown had no closing sum, and under the minimum the discount looked cancelled. Fixed: a quiet Total row closes the column, and a Subtotal row sits above the top-up to the minimum.
5. P3. The cropped small drawings showed stray fragments. Partly: they drop the windows; doors and wall edges stay.
Not changed, for the owner: the runs listed in Your lights (his section 4), "What you're getting" (his words), and "Upper & Lower Sides" lighting the upper sides while upper access follows the run's saved level (a pricing rule).
