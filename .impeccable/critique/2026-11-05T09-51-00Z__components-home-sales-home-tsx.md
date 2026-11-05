---
target: the new Homes (setter and Keenan), as first built
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/home/user/components/home/sales-home.tsx"
target_fingerprint: "sha256:2c7c4d66aa055618e35bab601e9db64d7cc5f0b5c42481fd589c50af92312283"
target_path: /home/user/components/home/sales-home.tsx
timestamp: 2026-11-05T09-51-00Z
slug: components-home-sales-home-tsx
---
Method: dual-agent (A: design review sub-agent · B: detector and browser sub-agent), isolated from each other, branch home-v2 at 246d6b0. Setter Home measured live at 390 and 430, dark and light, with installed-iPhone safe areas; Keenan's Home judged from view-only owner screenshots and code.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | On Keenan's Tomorrow view the page still says "Today" and cards show a bare time |
| 2 | Match System / Real World | 3 | "Start knocking" only opens Session; "How mine went" opens with the future |
| 3 | User Control and Freedom | 3 | Cancel is confirmed; the switch is easy to undo |
| 4 | Consistency and Standards | 2 | Two gold ways into Session; "Your booking" by booked_by vs How mine went by setter_id |
| 5 | Error Prevention | 3 | Tomorrow's cards under a "Today" title invite a wrong-evening reading |
| 6 | Recognition Rather Than Recall | 3 | The team list shows only booked times |
| 7 | Flexibility and Efficiency | 2 | Team rows can't be tapped; Start knocking adds a screen |
| 8 | Aesthetic and Minimalist Design | 2 | Keenan's cards about 465 px each with Map position, Move and Cancel |
| 9 | Error Recovery | 3 | Prep flags name what's missing and link to the fix |
| 10 | Help and Documentation | 3 | Every section says what it counts and over what range |
| **Total** | | **27/40** | **Acceptable** |

## Priority issues
- [P1] Keenan's Tomorrow meetings read as today's (heading stays "Today").
- [P1] Keenan's cards are a workbench, not a glance (about 1.3 meetings per screen).
- [P2] Two gold doors to Session; the Home one is mislabelled as an action.
- [P2] How mine went opens with the future and repeats the team list.
- [P3] The team schedule hides the gaps (left as is: the shape brief keeps open times off Home).

Detector: CLI 0 findings; overlay and CDP page engine one straggler advisory (Follow-ups paragraph without text-pretty), fixed.

Fixed in the first polish (aa31d8d): headings name the evening, Keenan's h1 is the date, compact cards (Meeting mode, Navigate, Call; prep on one line; no photos, notes, Move or Cancel), moved and cancelled bookings left to Schedule, Start knocking a quiet row, outcomes first in How mine went, team rows say whose lead it is.
