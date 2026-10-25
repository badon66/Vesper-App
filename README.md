# Vesper App

Internal sales and operations app for Vesper Lighting, Inc. (Calgary). Read `CLAUDE.md` and everything in `docs/` before changing anything. They are the source of truth for what gets built and how.

## Stack

Next.js 16 (App Router, TypeScript), Tailwind CSS 4, shadcn/ui style components, Supabase (Postgres, Auth, Storage, Row Level Security), Vercel, installable PWA. Zod for validation, Vitest for unit tests, Playwright for smoke tests.

## Local setup

Requirements: Node 22 or newer (`.nvmrc` says 22) and npm.

1. Clone the repo and install:
   ```
   git clone https://github.com/badon66/Vesper-App.git
   cd Vesper-App
   npm install
   ```
2. Create your environment file and fill in the two values. Each one says where to find it:
   ```
   cp .env.example .env.local
   ```
3. Start the dev server and open http://localhost:3000:
   ```
   npm run dev
   ```

There is no sign-up. Until the People screen lands in M1, create accounts in the Supabase dashboard under Authentication, Users, Add user, with "auto confirm" on.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Production build, including the TypeScript check |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint over the whole repo |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit tests in `tests/unit` |
| `npm run test:e2e` | Playwright smoke tests in `tests/e2e`, run against a production build (run `npm run build` first) |
| `npm run icons` | Regenerate every app icon from `brand/icon.svg` |

Before every commit: `npm run typecheck && npm run lint && npm test && npm run build`.

## Project layout

```
app/            routes. (auth) holds /login, (app) holds everything under /app
components/     ui/ are shadcn style primitives; brand/ holds the wordmark
lib/            env validation, Supabase clients, small pure helpers
brand/          icon source. Replace icon.svg with the real mark and run npm run icons
public/icons/   generated PWA icons (do not edit by hand)
proxy.ts        session refresh and the /app sign-in redirect
tests/          unit/ (Vitest) and e2e/ (Playwright)
docs/           spec, data model, roadmap, session prompts, decisions, backlog
supabase/       SQL migrations, from M1 on
```

## Swapping the icon

Replace `brand/icon.svg` with the real Vesper mark (square, 512 by 512 viewBox, solid background), then run `npm run icons`. It regenerates `public/icons/*.png`, `app/icon.png` and `app/apple-icon.png`. Commit all of them.

## Deploying

Vercel builds every push. The GitHub repo is linked to the Vercel project, and the two variables from `.env.example` are set under Preview and Production in the Vercel project settings. Never commit `.env.local`.
