---
target: the Session tab (/app/session), after two polishes
total_score: 29
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:/home/user/components/session/session-screen.tsx"
target_fingerprint: "sha256:dcc402ca4c2a48ea2aeee30b03b69b0a1d26b25ff1627ff8491fa9bbecc4b8b5"
target_path: /home/user/components/session/session-screen.tsx
timestamp: 2026-11-05T09-18-42Z
slug: components-session-session-screen-tsx
---
Method: dual-agent (A: design review sub-agent · B: detector and browser sub-agent), run twice after polish (29/40 after the first polish, 29/40 after the second; this snapshot is the second)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Live clock, retry count and saved line are clear; "All taps saved." shows while a tap is still on its way, and Undo says nothing |
| 2 | Match System / Real World | 3 | Street language throughout; "Leads 1, Bookings 1" after one booked door can read as two results |
| 3 | User Control and Freedom | 3 | Undo, Keep going, Cancel, Fix start time; the neighbourhood can't change once started and the prefilled field has no clear |
| 4 | Consistency and Standards | 3 | Schedule's tiles reused exactly; chips and outlines use the faint border; the compact Unfinished row wears the selected outline |
| 5 | Error Prevention | 2 | Undo sits 4 px under the Conversations counter; yesterday's neighbourhood is one tap from a wrong session |
| 6 | Recognition Rather Than Recall | 3 | Chips, a named Undo, "Stopped at what they learned"; the counting rule and Out today disappear while knocking |
| 7 | Flexibility and Efficiency | 3 | One tap to count, book or start; moving to a second neighbourhood takes five steps |
| 8 | Aesthetic and Minimalist Design | 3 | Calm and flat; nine gold shapes, the times block outweighs the counters |
| 9 | Error Recovery | 3 | Messages say what happened and what to do; End's no-signal line lands under the tab bar at 390 |
| 10 | Help and Documentation | 3 | Counting rule on the start screen, Unfinished's own hint; nothing in the knocking view |
| **Total** | | **29/40** | **Good** |

## Design Specificity Verdict

**LLM assessment**: belongs to this product: the neighbourhood as the title, "Doors +1", Schedule's own tiles with the holder's initials, the loop back to "On to the next door". Conventional in form, which suits Operate mode; the stat-card summary and outline chips are the generic parts.

**Deterministic scan**: file scan 0 findings (regex rules only for .tsx); the CLI's page engine over CDP on the signed-in page, 5 states at both sizes: 0 findings, with a planted low-contrast control flagged; overlay in every view: "No anti-patterns found." (the earlier run's flat-type-hierarchy advisory is gone: the times heading went to 16 px). Browser: no target under 44 px; muted text 8.44:1 dark, 6.34:1 light; the counters never moved through start, taps, Undo, offline retry and recovery; the End and New lead row clears the raised Session button by 42 px at 390 and 118 px at 430 with an installed iPhone's safe areas emulated.

## What's Working

1. Counting survives a weak signal and says so calmly: offline taps kept on the phone and saved within seconds of the signal returning; a session ended elsewhere stops the counters and offers Start again.
2. The knocking view fits one screen with six times tonight at 390 and 430, installed-app safe areas included; every target is 44 px.
3. Plain, specific copy and real reuse: Schedule's own picker, "Undo door", "That time hasn't happened yet. Pick a time earlier today."

## Priority Issues

- **[P1] Undo 4 px under the Conversations counter, and undoing says nothing.** Fix: 12 to 16 px between the counters and the status row; say what was taken back until the next tap. (harden)
- **[P2] The neighbourhood can't be changed once started; the prefilled field has no clear.** Fix: a clear button and select-on-focus; changing the place after start is Keenan's call. (harden)
- **[P2] "All taps saved." before the tap is saved.** Fix: claim it only when nothing is waiting. (clarify)
- **[P2] At 390 the end summary pushes Start knocking under the raised Session button; End's no-signal line lands under the tab bar.** Fix: a shorter summary; scroll the End panel into view again when its message appears. (adapt)
- **[P3] Gold everywhere while knocking, including the raised Session button on its own page.** Fix: a quieter current state for the prominent tab. (quieter)

## Persona Red Flags

**First-time setter (390)**: the counting rule disappears once knocking; yesterday's neighbourhood one tap from a wrong session; "Leads 1, Bookings 1" reads as two results.
**Fast experienced setter (393)**: a low tap on Conversations can hit Undo silently; the save line claims saved for the first 800 ms on a weak signal.
**Keenan (430)**: everything fits; his booked tiles open the booking on Schedule but not on Session; he can't see who else is out while knocking.

## Minor Observations

- Fix start time opens above the counters and moves them down 114 px; focus falls to the page after Keep going.
- Fix start time accepts a time inside a session already ended today, so two sessions could overlap.
- "Out now" and "Finished" rows look alike apart from the label.

## Questions to Consider

- Should the raised gold button be Doors +1 while knocking?
- Could Session show the next two open times plus "4 more", leaving the screen to the counters?
- Should a session's place be able to move as the setter does, and should teammates stay visible while out?
