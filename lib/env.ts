import { z } from "zod";

// Every environment variable the app reads is declared here and validated
// with Zod, so a missing value fails loudly with the variable's name instead
// of surfacing as a confusing Supabase error later. Add new variables here
// and to .env.example in the same commit.

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url({
    error: "must be the Supabase project URL, like https://xyz.supabase.co",
  }),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .min(1, { error: "must be the Supabase publishable key" }),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

export function parsePublicEnv(
  source: Record<string, string | undefined>,
): PublicEnv {
  const result = publicEnvSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `${issue.path.join(".")} ${issue.message}`)
      .join("; ");
    throw new Error(
      `Environment is not configured: ${problems}. Copy .env.example to .env.local and fill in the values.`,
    );
  }
  return result.data;
}

let cached: PublicEnv | undefined;

// The process.env references below must stay as literal property reads so
// Next.js can inline them into the browser bundle.
export function getPublicEnv(): PublicEnv {
  cached ??= parsePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  return cached;
}
