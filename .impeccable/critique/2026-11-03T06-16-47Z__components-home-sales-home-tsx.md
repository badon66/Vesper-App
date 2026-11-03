---
target: "the setter screens: Home, Leads, a lead page, New lead, My pay (after polish; plus the welcome and Notifications)"
total_score: 29
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:/home/user/components/home/sales-home.tsx"
target_fingerprint: "sha256:45782f57bf23c69b31a04ab9aef8e6872c104cd6776ae816d1b17746ccea1c0f"
target_path: /home/user/components/home/sales-home.tsx
timestamp: 2026-11-03T06-16-47Z
slug: components-home-sales-home-tsx
---
Method: re-score by a third, independent design-review sub-agent (Assessment A only), unanchored: it was not shown the first review. On the polished branch (commit 8f84a5b) at 390 x 664 and 390 x 844, spot checks at 360 px, both themes, with the same staged throwaway setter, 2026-11-03. Read only: every POST was blocked. Midnight passed in Calgary during the run.

# Set 1: Home, Leads, a lead's page, New lead, My pay (after polish)

| # | Heuristic | Score |
|---|---|---|
| 1 | Visibility of System Status | 3 |
| 2 | Match System/Real World | 3 |
| 3 | User Control and Freedom | 3 |
| 4 | Consistency and Standards | 2 |
| 5 | Error Prevention | 3 |
| 6 | Recognition Rather Than Recall | 3 |
| 7 | Flexibility and Efficiency | 3 |
| 8 | Aesthetic and Minimalist Design | 3 |
| 9 | Error Recovery | 3 |
| 10 | Help and Documentation | 3 |
| | **Total** | **29/40 (Good)**, from 27/40 |

Strengths named: New lead holds up at the door (the draft came back after a reload; Discard asks first); the Status card guides (dated follow-up picks, Lost waits for its reason); My pay's copy is honest.

Its findings, and what happened before release:
1. P1. My pay's totals overflowed their tiles past four digits. Fixed: totals are rows, label left and amount right, each with what it counts; Owed now leads.
2. P2. Before you book read an unmet item as met ("Wants a price: Yes"). Fixed: an unmet item names the question, says what the lead says now ("Not asked yet. Booking needs Yes.") and links to the fix.
3. P2. The Sign out dialog made leaving the gold choice. Fixed: Stay signed in is gold; setters are told to ask Keenan for their password.
4. P2. Search and the filters disagreed. Fixed: while searching, Active and All give way to "Clear search: every status shown"; a search with no match in Mine offers "Search everyone's leads".
5. P2. Book a meeting near the top of a long lead page. Not done (see the first review, item 4).
6. P3. Gold New badges and red Overdue. Fixed: New is a neutral outline; Overdue is bold body text everywhere (red is for errors only).
7. P3. The draft notice was off-screen after a reload. Fixed: the page opens at the notice.
8. Minor, fixed: the meeting link in a lead's header is 44 px; Home's follow-up labels are 14 px. Not done: dropping the year from "Added" dates.

# Set 2: the welcome (four steps) and Notifications

| # | Heuristic | Score |
|---|---|---|
| 1 | Visibility of System Status | 3 |
| 2 | Match System/Real World | 3 |
| 3 | User Control and Freedom | 3 |
| 4 | Consistency and Standards | 3 |
| 5 | Error Prevention | 3 |
| 6 | Recognition Rather Than Recall | 3 |
| 7 | Flexibility and Efficiency | 3 |
| 8 | Aesthetic and Minimalist Design | 3 |
| 9 | Error Recovery | 2 |
| 10 | Help and Documentation | 3 |
| | **Total** | **29/40 (Good)**, first score |

Strengths named: honest forward labels (Skip this step until the phone has done it, then Next); privacy explained at the moment of asking; recoverable (See the welcome again, a per-device list with test and switch off).

Its findings, and what happened before release:
1. P2. Blocked notifications were a dead end. Fixed: both screens say where to allow them on this kind of phone, offer Check again, and show no gold Turn on while blocked.
2. P3. "Skip the welcome" gave no reassurance. Fixed: step 1 says the bell opens it again. The Notifications card's "on one screen" copy is fixed.
3. Not done: a bell that shows on or off, a one-tap Android install prompt, a picture of the time tiles in the tour, hiding the disabled Back on step 1 (kept, as in the booking sheet).
