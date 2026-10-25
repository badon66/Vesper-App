import { describe, expect, it } from "vitest";
import { parsePublicEnv } from "@/lib/env";

const valid = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
};

describe("parsePublicEnv", () => {
  it("returns the values when both variables are present", () => {
    expect(parsePublicEnv(valid)).toEqual(valid);
  });

  it("names the missing variable and points at .env.example", () => {
    const { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: _omitted, ...missingKey } = valid;
    void _omitted;
    expect(() => parsePublicEnv(missingKey)).toThrow(
      /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.*\.env\.example/,
    );
  });

  it("rejects a Supabase URL that is not a URL", () => {
    expect(() =>
      parsePublicEnv({ ...valid, NEXT_PUBLIC_SUPABASE_URL: "not a url" }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("ignores unrelated variables", () => {
    expect(parsePublicEnv({ ...valid, OTHER: "x" })).toEqual(valid);
  });
});
