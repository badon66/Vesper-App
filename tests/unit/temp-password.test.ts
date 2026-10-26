import { describe, expect, it } from "vitest";
import { generateTempPassword, TEMP_PASSWORD_PATTERN } from "@/lib/people/temp-password";

describe("generateTempPassword", () => {
  it("is three groups of four readable characters", () => {
    for (let i = 0; i < 200; i += 1) {
      const pw = generateTempPassword();
      expect(pw).toMatch(TEMP_PASSWORD_PATTERN);
      expect(pw).toHaveLength(14);
      expect(pw).not.toMatch(/[0O1lI]/);
    }
  });

  it("does not repeat", () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateTempPassword()));
    expect(seen.size).toBe(200);
  });
});
