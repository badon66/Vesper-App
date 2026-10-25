import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
