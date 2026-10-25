# Session prompts

How to run each Claude Code session. The context lives in `CLAUDE.md` and `docs/`, so prompts stay short. Paste the prompt for the current milestone, let it plan, approve, let it build. Use the biggest model for M0, M1, M3 and M5 (architecture, auth and RLS, scheduling logic, pricing). A cheaper model is fine for M2, M4, M6 and M7 once the foundation is solid.

## Before the first session (one-time setup, done by Keenan)
1. Create an empty GitHub repo `vesper-app`. Commit `CLAUDE.md` and `docs/`.
2. Create a Supabase project `vesper-app` (Canada region if offered). Save the project URL, anon key and service role key.
3. Create a Vercel project linked to the repo. Add the Supabase variables as environment variables.
4. Create a Google Cloud project, enable Places API (New), make an API key restricted to the app's domains.
5. Add all keys to `.env.local` locally. Never paste keys into a chat.

## M0 prompt
```
Read CLAUDE.md and docs/. Milestone M0 in docs/03-roadmap.md. Plan first: list the files you'll create, the packages and exact versions, and anything you're unsure about. Wait for my approval, then build. Done means every M0 criterion passes and you give me a checklist to try on my iPhone.
```

## M1 prompt
```
Milestone M1. Read docs/02-data-model.md carefully: profiles, settings, the role enum, and the RLS summary. Plan the migration, the sign-up trigger, the invite flow and the settings screen before writing code. Auth and RLS changes need my approval. Include the RLS test script described in the data model. Done means every M1 criterion passes.
```

## M2 prompt
```
Milestone M2: leads and knock sessions on the phone. This is the screen setters use at the door, so speed and one-handed use matter more than anything. Plan first, including how photos are resized and uploaded and how Places autocomplete fills neighbourhood and lat/lng. Then build. Test on a 390 px wide viewport. Done means every M2 criterion passes and the RLS test proves a setter cannot see another setter's lead.
```

## M3 prompt
```
Milestone M3: scheduling. Read the business rules in CLAUDE.md and the meetings section of the data model. Plan first and show me: how open slots are generated (Calgary time, DST), how the unique index prevents double booking and how the UI handles the race, how the distance warning works, and the exact confirmation text flow. Write the unit tests before the UI. Then build the booking screen and the Tonight view. Done means every M3 criterion passes.
```

## M4 prompt
```
Milestone M4: pipeline board and lead detail for iPad and desktop. Plan first. Keep the board simple: statuses as columns, drag and drop, lost reason prompt. Lead detail is the owner's full view of a lead. Done means every M4 criterion passes on an iPad-sized viewport in landscape.
```

## M5 prompt
```
Milestone M5: meeting mode and quotes on iPad. Start with lib/pricing.ts and its unit tests, show me the function and tests, and wait for approval. Then the quote builder, then the presentation pages driven by settings, then the PDF. Customer-facing text must have no em dashes and must use settings.warranty_text verbatim. Done means every M5 criterion passes and you give me a sample PDF to look at.
```

## M6 prompt
```
Milestone M6: the owner dashboard. Plan the queries first (SQL views or functions are fine) and show me what each tile counts and over what range. Keep it small and honest: nothing invented, empty states written in plain language. Then build for desktop and iPad. Done means every M6 criterion passes and the page loads in under two seconds with seeded data.
```

## M7 prompt
```
Milestone M7: website lead endpoint, daily email, PWA polish, accessibility, Playwright smoke test. Plan first. The endpoint is public, so show me the validation, the shared secret check and the rate limit before building. Done means every M7 criterion passes.
```

## When something breaks
```
Here is what I did, what I expected, and what happened: [describe]. Reproduce it first, tell me the cause in one or two sentences, then fix it with the smallest change. Add a test that would have caught it.
```

## When I want a change that is not in the roadmap
```
New request, not in the current milestone: [describe]. Tell me whether it belongs in V1, V1.5 or V2, what it would touch, and what it would cost in time. Don't build it until I say so. If it's small and obviously right, say so and I'll approve.
```

## End of every session
```
Update docs/03-roadmap.md (tick the criteria that pass, move the current milestone marker), add any judgment calls to docs/decisions.md, and give me the checklist of what to try on my phone or iPad.
```
