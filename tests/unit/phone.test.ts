import { describe, expect, it } from "vitest";
import { formatPhone, normalizePhone } from "@/lib/phone";

describe("normalizePhone", () => {
  it("treats a number without a country code as Canadian", () => {
    for (const typed of ["403 555 0199", "4035550199", "(403) 555-0199", "403.555.0199", "1 403 555 0199"]) {
      expect(normalizePhone(typed), typed).toEqual({ ok: true, e164: "+14035550199" });
    }
  });

  it("keeps a number typed with + and a country code", () => {
    expect(normalizePhone("+1 587 330 4417")).toEqual({ ok: true, e164: "+15873304417" });
    expect(normalizePhone("+44 20 7946 0958")).toEqual({ ok: true, e164: "+442079460958" });
  });

  it("accepts other North American numbers as +1", () => {
    expect(normalizePhone("212 555 0123")).toEqual({ ok: true, e164: "+12125550123" });
  });

  it("treats blank as no phone and rejects numbers that cannot be real", () => {
    expect(normalizePhone("")).toEqual({ ok: true, e164: null });
    expect(normalizePhone("   ")).toEqual({ ok: true, e164: null });
    expect(normalizePhone(null)).toEqual({ ok: true, e164: null });
    for (const typed of ["12345", "403 555", "not a phone"]) {
      const result = normalizePhone(typed);
      expect(result.ok, typed).toBe(false);
    }
  });
});

describe("formatPhone", () => {
  it("shows North American numbers the local way and others internationally", () => {
    expect(formatPhone("+14035550199")).toBe("(403) 555-0199");
    expect(formatPhone("+442079460958")).toBe("+44 20 7946 0958");
    expect(formatPhone(null)).toBe("");
  });
});
