import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
