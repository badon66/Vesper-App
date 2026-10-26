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

const serverEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1, { error: "must be the Supabase service role key (server only)" }),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

function parseEnv<T extends z.ZodObject>(
  schema: T,
  source: Record<string, string | undefined>,
): z.infer<T> {
  const result = schema.safeParse(source);
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

export function parsePublicEnv(
  source: Record<string, string | undefined>,
): PublicEnv {
  return parseEnv(publicEnvSchema, source);
}

export function parseServerEnv(
  source: Record<string, string | undefined>,
): ServerEnv {
  return parseEnv(serverEnvSchema, source);
}

let cachedPublic: PublicEnv | undefined;
let cachedServer: ServerEnv | undefined;

// The process.env references below must stay as literal property reads so
// Next.js can inline the public ones into the browser bundle.
export function getPublicEnv(): PublicEnv {
  cachedPublic ??= parsePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  return cachedPublic;
}

// Server only. Never import this from a Client Component.
export function getServerEnv(): ServerEnv {
  cachedServer ??= parseServerEnv({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  return cachedServer;
}
