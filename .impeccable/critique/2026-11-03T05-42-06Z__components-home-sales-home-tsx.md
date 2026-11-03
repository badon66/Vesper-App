---
target: "the setter screens: Home, Leads, a lead page, New lead, My pay (before polish)"
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/home/user/components/home/sales-home.tsx"
target_fingerprint: "sha256:c95d5a36a767a28d4a7103ac1964599fc41390542937ff6f58f86e6de0ff5310"
target_path: /home/user/components/home/sales-home.tsx
timestamp: 2026-11-03T05-42-06Z
slug: components-home-sales-home-tsx
---
Method: dual-agent (A: design review sub-agent · B: detector and browser sub-agent), isolated from each other, on the setter's screens (Home, Leads, a lead's page, New lead, My pay) at 390 x 844 touch and once at 360 px, both themes, against a local production build of the setter-side branch (commit 40e67eb) with a staged throwaway setter (six test leads in every state, a past knock session, a qualified booking with a $20 fee), 2026-11-03. Read only: nothing was saved.

# Assessment A: Design Review (before polish), summary

Verdict: specific where it counts (the time tiles, the 128 px counters with Undo, the photo slots' roofline guidance, the step notes), generic in the frame: Home and the lead page are stacks of identical cards (ten on a lead), and gold marks chosen answers, which breaks the Porch Light Rule.

| # | Heuristic | Score |
|---|---|---|
| 1 | Visibility of System Status | 3 |
| 2 | Match System/Real World | 3 |
| 3 | User Control and Freedom | 3 |
| 4 | Consistency and Standards | 2 |
| 5 | Error Prevention | 2 |
| 6 | Recognition Rather Than Recall | 3 |
| 7 | Flexibility and Efficiency | 2 |
| 8 | Aesthetic and Minimalist Design | 3 |
| 9 | Error Recovery | 3 |
| 10 | Help and Documentation | 3 |
| | **Total** | **27/40 (Acceptable)** |

Priority issues:
1. P1. New lead loses everything on a reload (the camera reloads iPhones) or a stray tap on X, which discards with no confirm.
2. P1. The knock counters are buried on Home: Start knocking at about y 1174 on an 844 px screen, below six time tiles and the bookings; Save lead lands on Leads, so every door is Home, scroll, +1.
3. P2. Gold marks choices: chosen House type, Source, Status and follow-up day fill gold with no tick (Find out on the same form uses a light fill and a tick); a lead's header has two gold buttons, Book a meeting and a full-width Call.
4. P2. The lead page is a 3,171 px record, not a next step: Book a meeting top left, Status and Notes 8th and 9th of ten cards, a booked lead's time in the third card, a lost lead's reason only in the timeline, and Before you book never listed.
5. P2. Pay and outcomes undersell the reward: "No fee" on upcoming bookings, last night's results gone from Home at midnight, "Paid" with no range.

Cognitive load: low on Home, Leads, New lead and My pay; high on the lead page (single focus, hierarchy, progressive disclosure, working memory). Decision points over four options: "Why was it lost?" and "Where the lead came from" (five each). Leads spends about 420 px on controls before the first lead.

Minor: "Sam Rivers (test)'s lead" and "Added by Sam Rivers (test)" on your own things; Status titled twice; "Not set yet" without a full stop; a lost lead still asks for a phone; Save status enabled for Lost with no reason; "Pending install" wraps at 360 px; "Meeting Mon, Nov 2 at 11:00 p.m.." on Leads rows; 12 px text in badges, list meta lines, photo hints and pay labels; Sign out one tap away with no confirm, for people who can't reset their own password; the light theme's gold edge on open tiles about 2.9:1.

# Assessment B: Detector and browser evidence, summary

CLI: `detect --json` on the 21 files of the five screens: no findings (regex pass only on .tsx). In the page (detect.js injected on 8 views, both themes): `nested-cards` at three places (Home's Follow-ups list, the lead page's meeting card inside the Meetings card, My pay's bookings list), all real bordered boxes inside a Card; two advisory stragglers (the photo hint without text-pretty, "This lead is at Met. From here Keenan moves it along."). No contrast, tiny-text or overflow findings; no page errors.
