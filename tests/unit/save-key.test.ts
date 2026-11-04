import { describe, expect, it } from "vitest";
import { readSaveKey } from "@/lib/leads/save-key";

// A new lead saves once (Keenan, 2026-11-04): the key a first save sends.

describe("reading a save key", () => {
  it("takes none from yesterday's app or a path without one", () => {
    expect(readSaveKey(undefined)).toEqual({ ok: true, key: null });
    expect(readSaveKey(null)).toEqual({ ok: true, key: null });
    expect(readSaveKey("")).toEqual({ ok: true, key: null });
  });

  it("takes a key the phone made", () => {
    const key = crypto.randomUUID();
    expect(readSaveKey(key)).toEqual({ ok: true, key });
  });

  it("refuses anything that isn't one", () => {
    expect(readSaveKey("not-a-key").ok).toBe(false);
    expect(readSaveKey("6f1c2a3b-4d5e-4f60-8a7b").ok).toBe(false);
    expect(readSaveKey(42).ok).toBe(false);
    expect(readSaveKey({ key: crypto.randomUUID() }).ok).toBe(false);
  });
});
