import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Row Level Security tests run against the real Supabase project with
// throwaway users. They need the three variables from .env.example and a
// network path to Supabase, so they are kept out of `npm test`.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    include: ["tests/rls/**/*.test.ts"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 90_000,
  },
});
