import { describe, expect, it } from "vitest";
import { generatePassword, PASSWORD_PATTERN } from "@/lib/people/password";
import { PASSWORD_WORDS } from "@/lib/people/password-words";

describe("generatePassword", () => {
  it("is three common words and four digits, joined by hyphens", () => {
    for (let i = 0; i < 300; i += 1) {
      const pw = generatePassword();
      expect(pw).toMatch(PASSWORD_PATTERN);
      const parts = pw.split("-");
      expect(parts).toHaveLength(4);
      for (const word of parts.slice(0, 3)) expect(PASSWORD_WORDS).toContain(word);
      expect(new Set(parts.slice(0, 3)).size).toBe(3);
      expect(pw.length).toBeGreaterThanOrEqual(16);
    }
  });

  it("does not repeat", () => {
    const seen = new Set(Array.from({ length: 300 }, () => generatePassword()));
    expect(seen.size).toBe(300);
  });

  it("uses a word list that is lowercase, short and free of duplicates", () => {
    expect(PASSWORD_WORDS.length).toBeGreaterThanOrEqual(200);
    expect(new Set(PASSWORD_WORDS).size).toBe(PASSWORD_WORDS.length);
    for (const word of PASSWORD_WORDS) expect(word).toMatch(/^[a-z]{4,7}$/);
  });
});
