import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertNoSecretsInPublicEnv,
  isSupabaseSecretKey,
  publicVariablesHoldingSecrets,
} from "@/lib/public-env-guard";

// Made-up values, built at run time so nothing here looks like a real key.
const fakeSecret = "sb_" + "secret_" + "made-up-for-tests";
const fakePublishable = "sb_" + "publishable_" + "made-up-for-tests";
const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
const legacyKey = (role: string) =>
  `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ iss: "supabase", ref: "example", role })}.made-up-signature`;

const safeEnv = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: fakePublishable,
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: "made-up-maps-key",
  SUPABASE_SERVICE_ROLE_KEY: fakeSecret,
};

function messageOf(run: () => void): string {
  try {
    run();
  } catch (error) {
    return (error as Error).message;
  }
  return "";
}

describe("isSupabaseSecretKey", () => {
  it("knows a secret key, with or without stray spaces and quotes", () => {
    expect(isSupabaseSecretKey(fakeSecret)).toBe(true);
    expect(isSupabaseSecretKey(`  ${fakeSecret}\n`)).toBe(true);
    expect(isSupabaseSecretKey(`"${fakeSecret}"`)).toBe(true);
  });

  it("knows the legacy service_role key, and lets the legacy anon key through", () => {
    expect(isSupabaseSecretKey(legacyKey("service_role"))).toBe(true);
    expect(isSupabaseSecretKey(legacyKey("anon"))).toBe(false);
  });

  it("lets publishable keys, URLs and other values through", () => {
    for (const value of [fakePublishable, "https://example.supabase.co", "made-up-maps-key", "", "eyJ.not.a-jwt"]) {
      expect(isSupabaseSecretKey(value)).toBe(false);
    }
  });
});

describe("the public variable check", () => {
  it("passes when the public variables hold only public values", () => {
    expect(publicVariablesHoldingSecrets(safeEnv)).toEqual([]);
    expect(() => assertNoSecretsInPublicEnv(safeEnv)).not.toThrow();
  });

  it("leaves the secret key alone in SUPABASE_SERVICE_ROLE_KEY, where it belongs", () => {
    expect(publicVariablesHoldingSecrets({ SUPABASE_SERVICE_ROLE_KEY: fakeSecret, OTHER: legacyKey("service_role") })).toEqual([]);
  });

  it("refuses a secret key in the publishable key variable, naming it", () => {
    const env = { ...safeEnv, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: fakeSecret };
    expect(() => assertNoSecretsInPublicEnv(env)).toThrow(/Refusing to build: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY holds a Supabase secret key/);
  });

  it("refuses a secret key in any NEXT_PUBLIC_ variable, and lists every one", () => {
    const env = { ...safeEnv, NEXT_PUBLIC_ZEBRA: fakeSecret, NEXT_PUBLIC_ALPHA: legacyKey("service_role") };
    expect(publicVariablesHoldingSecrets(env)).toEqual(["NEXT_PUBLIC_ALPHA", "NEXT_PUBLIC_ZEBRA"]);
    expect(() => assertNoSecretsInPublicEnv(env)).toThrow(/NEXT_PUBLIC_ALPHA, NEXT_PUBLIC_ZEBRA hold a Supabase secret key/);
  });

  it("never prints the key itself", () => {
    const message = messageOf(() => assertNoSecretsInPublicEnv({ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: fakeSecret }));
    expect(message).toContain("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
    expect(message).not.toContain(fakeSecret);
    expect(message).not.toContain("made-up-for-tests");
  });

  it("ignores variables that are not set", () => {
    expect(publicVariablesHoldingSecrets({ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined })).toEqual([]);
  });
});

describe("next.config.ts", () => {
  const probe = "NEXT_PUBLIC_GUARD_PROBE";
  afterEach(() => {
    delete process.env[probe];
    vi.resetModules();
  });

  it("loads normally when no public variable holds a secret key", async () => {
    vi.resetModules();
    await expect(import("@/next.config")).resolves.toHaveProperty("default");
  });

  it("refuses to load, so the build stops, when one does", async () => {
    vi.resetModules();
    process.env[probe] = fakeSecret;
    await expect(import("@/next.config")).rejects.toThrow(/Refusing to build: NEXT_PUBLIC_GUARD_PROBE/);
  });
});

describe("an Anthropic key in a NEXT_PUBLIC_ variable (round 17)", () => {
  it("refuses to build, names the variable and never prints the value", () => {
    const env = { NEXT_PUBLIC_POLISH_KEY: "sk-ant-api03-not-a-real-key", ANTHROPIC_API_KEY: "sk-ant-api03-fine-here" };
    expect(() => assertNoSecretsInPublicEnv(env)).toThrow(/Refusing to build: NEXT_PUBLIC_POLISH_KEY holds an Anthropic API key/);
    try {
      assertNoSecretsInPublicEnv(env);
    } catch (e) {
      expect(String(e)).not.toContain("not-a-real-key");
    }
    expect(() => assertNoSecretsInPublicEnv({ ANTHROPIC_API_KEY: "sk-ant-api03-fine-here" })).not.toThrow();
  });
});
