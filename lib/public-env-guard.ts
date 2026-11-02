// Anything in a NEXT_PUBLIC_ variable is copied into the JavaScript every
// visitor downloads. A Supabase secret key there gives anyone full access to
// the database, so next.config.ts refuses to build, or to start the dev
// server, when any NEXT_PUBLIC_ value is one. Added 2026-11-02, after a
// secret key was found in production's public JavaScript (docs/decisions.md).
//
// It catches both kinds of Supabase secret key:
//   - secret keys, which start with sb_secret_;
//   - the legacy service_role key, a JWT whose payload has
//     "role": "service_role".
// The error names the variable and never prints its value.
//
// Build time only: it reads Node's Buffer, so no browser code imports it.

const SECRET_KEY_PREFIX = "sb_secret_";

function isLegacyServiceRoleKey(value: string): boolean {
  const parts = value.split(".");
  if (parts.length !== 3 || !value.startsWith("eyJ")) return false;
  try {
    const payload: unknown = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return typeof payload === "object" && payload !== null && "role" in payload && payload.role === "service_role";
  } catch {
    return false;
  }
}

// True for a Supabase secret key, ignoring stray spaces or quotes around it.
export function isSupabaseSecretKey(raw: string): boolean {
  const value = raw.trim().replace(/^["']+|["']+$/g, "");
  return value.startsWith(SECRET_KEY_PREFIX) || isLegacyServiceRoleKey(value);
}

// The names of the NEXT_PUBLIC_ variables that hold a Supabase secret key.
export function publicVariablesHoldingSecrets(env: Record<string, string | undefined>): string[] {
  return Object.entries(env)
    .filter(([name, value]) => name.startsWith("NEXT_PUBLIC_") && typeof value === "string" && isSupabaseSecretKey(value))
    .map(([name]) => name)
    .sort();
}

export function assertNoSecretsInPublicEnv(env: Record<string, string | undefined>): void {
  const names = publicVariablesHoldingSecrets(env);
  if (names.length === 0) return;
  throw new Error(
    `Refusing to build: ${names.join(", ")} ${names.length === 1 ? "holds" : "hold"} a Supabase secret key. ` +
      "Anything in a NEXT_PUBLIC_ variable is copied into the JavaScript every visitor downloads. " +
      "Put the publishable key (sb_publishable_...) there and keep the secret key only in SUPABASE_SERVICE_ROLE_KEY. " +
      "If this value was ever deployed, delete that key in Supabase (Project Settings > API Keys) and make a new one.",
  );
}
