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
  // Optional. Without it the address field is plain text and leads save
  // without a map position.
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().optional(),
  ),
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
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
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

// The quote link and push (2026-11-02). All optional: without
// QUOTE_BASE_URL, links use the address the app was opened on; without the
// VAPID keys, the app works and sends no pushes. Server only.
const blankIsUnset = (value: unknown) => (typeof value === "string" && value.trim() === "" ? undefined : value);

const extrasEnvSchema = z.object({
  QUOTE_BASE_URL: z.preprocess(
    blankIsUnset,
    z.url({ error: "must be a full address, like https://quote.vesperlighting.ca" }).optional(),
  ),
  VAPID_PUBLIC_KEY: z.preprocess(blankIsUnset, z.string().trim().optional()),
  VAPID_PRIVATE_KEY: z.preprocess(blankIsUnset, z.string().trim().optional()),
  VAPID_SUBJECT: z.preprocess(blankIsUnset, z.string().trim().optional()),
});

export type ExtrasEnv = z.infer<typeof extrasEnvSchema>;

export function parseExtrasEnv(source: Record<string, string | undefined>): ExtrasEnv {
  return parseEnv(extrasEnvSchema, source);
}

let cachedExtras: ExtrasEnv | undefined;

// Server only. Never import this from a Client Component.
export function getExtrasEnv(): ExtrasEnv {
  cachedExtras ??= parseExtrasEnv({
    QUOTE_BASE_URL: process.env.QUOTE_BASE_URL,
    VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
    VAPID_SUBJECT: process.env.VAPID_SUBJECT,
  });
  return cachedExtras;
}
