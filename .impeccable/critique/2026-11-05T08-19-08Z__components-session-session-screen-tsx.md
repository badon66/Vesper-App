---
target: the Session tab (/app/session), before polish
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/home/user/components/session/session-screen.tsx"
target_fingerprint: "sha256:89fb8f12e0e162de7025c0794f9df92804214c14f59dfdf7afaf3e5c93885d77"
target_path: /home/user/components/session/session-screen.tsx
timestamp: 2026-11-05T08-19-08Z
slug: components-session-session-screen-tsx
---
Method: dual-agent (A: design review sub-agent · B: detector and browser sub-agent)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | "Not saved yet. Retrying." and "This session has ended" share the quiet grey line with "All taps saved."; the summary is gone after a reload |
| 2 | Match System / Real World | 3 | Door words throughout; "link to it" and "Reload the page" (impossible in the installed app) slip in |
| 3 | User Control and Freedom | 3 | Undo, Keep going and Cancel exist; a closed or reloaded summary can't come back |
| 4 | Consistency and Standards | 3 | Schedule's tiles reused exactly; 40 px Undo, pill chips, a gold-bordered status card and End in the next-step corner break the app's own rules |
| 5 | Error Prevention | 3 | End asks first and waits for unsaved taps, but its buttons open under the tab bar at 390 and on an installed Pro Max |
| 6 | Recognition Rather Than Recall | 3 | Last neighbourhood prefilled with recent chips; nothing says what counts as a door or a conversation |
| 7 | Flexibility and Efficiency | 2 | The most tapped control sits in the upper third; drafts and the saved line push New lead off screen |
| 8 | Aesthetic and Minimalist Design | 3 | Calm and flat; about ten gold elements, an Undo row as heavy as the actions, a three-line Unfinished explainer |
| 9 | Error Recovery | 3 | Plain next steps, except "Reload the page" under counters that still look live |
| 10 | Help and Documentation | 2 | No word on what a door or a conversation is, the two numbers that feed the funnel |
| **Total** | | **28/40** | **Good** |

## Design Specificity Verdict

**LLM assessment**: the words and flow are Vesper's ("Knocking in Crescent Heights", "Doors +1", "Lead saved. On to the next door.", "Since 4:32 p.m."), and reusing Schedule's time tiles is right. The parts are app-standard (outline buttons in grids, pill chips, a tinted summary card); no template tells (no gradients, hero numbers, icon grids or emoji).

**Deterministic scan**: `impeccable detect` on the five changed markup files: 0 findings, exit 0 (regex rules only for .tsx). Browser overlay injected in 6 views (knocking, summary, not knocking at 390 x 844 and 430 x 932): 0 findings, with a positive control on a planted page returning 6, so the zero is real. Browser measurements found what the detector can't: Undo buttons 40 px tall (173 x 40 at 390), the End confirm's buttons at y 762 to 806 against a tab bar at 779 (390 x 844), and the raised gold Session button overlapping the bottom row when the heading wraps.

## What's Working

1. Counting you can trust: taps count at once, are batched and retried, added atomically on the server, and End waits for unsaved taps. Offline, the counter kept going and caught up.
2. Plain copy in the setter's words with no em dashes ("Started 4:32 p.m. Out 1 h 12 min.", "That time hasn't happened yet. Pick a time earlier today.").
3. Reuse and restraint: one time picker, both themes readable (muted text 8.44:1 dark, 6.34:1 light), the base knocking view fits at 430 x 932.

## Priority Issues

- **[P1] The End confirm opens under the tab bar** at 390 x 844 and on an installed Pro Max: the final tap of the night shows a question with no visible answer. Fix: scroll the confirm above the bar when it opens and move focus to it. (adapt)
- **[P1] Thumb reach is backwards**: the counters sit in the upper third while New lead and End sit in the easy zone. Fix proposed: dock the counters above the tab bar. Not built: it changes the order Keenan specified, so it goes to him as a question. (layout)
- **[P2] The status line goes quiet or dead-ends when it matters**: "Saving" flickers every tap; a retry reads like success; a session ended elsewhere says "Reload the page" while the counters still look live; queued taps live in memory only and are lost if the app reloads offline. Fix: delay "Saving.", show unsaved taps as a bordered warning with a count, grey the counters with a Start again button when the session ended elsewhere, and keep unsent taps on the phone until they land. (harden)
- **[P2] Real states push New lead off screen**: the saved line lingers, and Unfinished sits between the times and New lead. Fix: hide the saved line on the next tap and drop it from the address; put New lead and End above Unfinished, New lead in the thumb corner; a one-line Unfinished explainer. (layout, distill)
- **[P2] The end summary is unfinished**: gone after a reload, "1 Conversations", a gold border on a status, time out tucked into small text, and minutes that can disagree with the times shown. Fix: draw it from the server until the next start, labels above numbers with time out as one of them, a neutral border, minutes counted from the times shown. (polish, harden)

## Persona Red Flags

**First-time setter**: no example in an empty neighbourhood field; nothing says what counts as a door or a conversation; End's buttons hidden at 390; the summary vanishes on reload.
**Fast experienced setter**: reaches to the upper third for every door; 40 px Undo 8 px under the +1; the saved line lingers; New lead pushed off screen by drafts; VoiceOver says "Saving" on every tap.
**Keenan (iPhone 15 Pro Max, installed)**: End's buttons under his tab bar; gold everywhere so it no longer marks the next thing; mistaken Starts leave zero-door sessions in Out today.

## Minor Observations

- Counter names "Add one to doors, now 3" don't contain the visible "Doors +1"; Undo's name lacks "Undo" (label in name).
- Focus drops to the page after Start, End, Keep going and Yes, end it.
- With tonight full, "Nothing left tonight" heads another evening's open tiles; the day belongs in the heading.
- "Start knocking" heading repeats the button; heading order h2 then h1 in the summary view.
- Pill chips unlike the evening strip's 6 px chips; Out today rows still out and finished look alike apart from the time.
- Fix start shows no confirmation when it saves.

## Questions to Consider

- Is every conversation also a door? Should Conversations +1 add a door too?
- Would Keenan take the counters docked above the tab bar, instead of second from the top?
- On this screen, which is the porch light: the counters or the times?
