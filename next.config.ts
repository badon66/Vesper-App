import type { NextConfig } from "next";
import { assertNoSecretsInPublicEnv } from "./lib/public-env-guard";

// Refuse to build, or to start the dev server, with a Supabase secret key in
// any NEXT_PUBLIC_ variable: those values go to every visitor's browser.
// See lib/public-env-guard.ts and docs/decisions.md (2026-11-02).
assertNoSecretsInPublicEnv(process.env);

// Every build carries its own id, for the update notice (Keenan,
// 2026-11-11): the deploy's commit on Vercel, else a stamp. It is public
// (it names a commit, nothing else) and the app compares it with what
// /api/version says is live.
const appBuild = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || String(Date.now());

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_APP_BUILD: appBuild },
  // People and Settings moved into Admin, and the owner's Home became the
  // dashboard (2026-10-28). Old links and home screen shortcuts still land.
  async redirects() {
    return [
      { source: "/app/people", destination: "/app/admin/people", permanent: false },
      { source: "/app/settings", destination: "/app/admin/settings", permanent: false },
      { source: "/app/dashboard", destination: "/app", permanent: false },
    ];
  },
  // Cache Components stays off in V1: every screen is per user and dynamic,
  // and the flag would require a Suspense boundary around every cookie read.
  // See docs/decisions.md (2026-10-25). Revisit before Next.js 17.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
