---
target: the new Homes (setter and Keenan), after the first polish
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/home/user/components/home/sales-home.tsx"
target_fingerprint: "sha256:264726af8145d04273dd4fea77cb7c64bbbebb7eb3c13dca628219ac3ad02703"
target_path: /home/user/components/home/sales-home.tsx
timestamp: 2026-11-05T11-02-00Z
slug: components-home-sales-home-tsx
---
Method: dual-agent (A: design review sub-agent · B: detector and browser sub-agent), fresh and isolated, branch home-v2 at d821f2a. A different, harsher reviewer than the first round, so the scores are not a like-for-like trend.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | A cancelled future booking still shows under Coming up; Home never refreshes on return |
| 2 | Match System / Real World | 3 | Last night reads "Wed, Nov 4 at 6:00 p.m." |
| 3 | User Control and Freedom | 3 | The switch is instant; nothing on the setter Home writes |
| 4 | Consistency and Standards | 2 | Gold Meeting mode on every card; two links to the same lead; team rows look tappable |
| 5 | Error Prevention | 3 | Move and Cancel kept off Home |
| 6 | Recognition Rather Than Recall | 3 | The setter's own team rows aren't marked; no date on the setter Home |
| 7 | Flexibility and Efficiency | 2 | No prep summary or next marker for Keenan; Last 7 days has no cap |
| 8 | Aesthetic and Minimalist Design | 3 | Calm; some repetition ("Out now" under "Out knocking now") |
| 9 | Error Recovery | 1 | A failed read becomes a confident empty state |
| 10 | Help and Documentation | 3 | Empty states say what will appear and how |
| **Total** | | **25/40** | **Acceptable** |

## Priority issues
- [P1] A booking cancelled before its time stays under Coming up looking live (also found by the adversarial code review, upheld 8 of 8).
- [P1] How mine went falls below the fold on a 390-wide installed iPhone with a full evening; Last 7 days has no cap.
- [P2] Gold repeats on Keenan's cards; "Open the lead" duplicates the name; the outcome form grows every card after the slot.
- [P2] Home can show stale or untrue data (no refresh on return; read errors read as empty).
- [P2] The outcome in Last 7 days floats mid-row.

Detector: CLI, overlay and CDP page engine all 0 findings. Measured: every tap target at least 44 px; muted text 8.4:1 dark, 6.3:1 light; the chosen day's fill 1.3:1 dark and 1.2:1 light (fixed with an outline); no write after sign-in; no contact detail in the team schedule.

Fixed in the second polish: see docs/decisions.md, "Re-score and a second polish". Left: read errors still show empty states (app-wide); team rows open nothing.
