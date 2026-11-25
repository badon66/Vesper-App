import { describe, expect, it } from "vitest";
import { earliestLine, INSTALL_WORDS, parseLinkInstall, pickButtonLabel } from "@/lib/quote-link/install";
import { formatDay, formatLongDay } from "@/lib/time";

// Round 23 (Keenan, 2026-11-17): Pick your install day on the customer's link.

describe("the link's install days", () => {
  it("reads what the database sends, and nothing else", () => {
    const parsed = parseLinkInstall({
      state: "live",
      ready: true,
      day: null,
      today: "2026-11-28",
      earliest: "2026-12-01",
      kind: "white",
      can_change: true,
      change_until: null,
      days: [{ day: "2026-12-02", full: false }, { day: "2026-12-03", full: true }, { day: "bad", full: false }],
    });
    expect(parsed).toMatchObject({ ready: true, day: null, earliest: "2026-12-01", kind: "white", canChange: true });
    // A list with a bad day is dropped whole rather than shown wrong.
    expect(parsed?.days).toEqual([]);
    expect(parseLinkInstall({ state: "expired" })).toBeNull();
    expect(parseLinkInstall(null)).toBeNull();
  });

  it("says it plainly, with Keenan's line under the days", () => {
    expect(INSTALL_WORDS.note).toBe("We’ll confirm your day with you a few days before. If the weather won’t allow it, we’ll move you to the next good day.");
    expect(earliestLine("2026-12-01", formatLongDay)).toBe("The first day you can pick is Tuesday, December 1, so there’s time to get your track ready.");
    expect(pickButtonLabel(null, null, formatDay)).toBe("Pick a day above");
    expect(pickButtonLabel("2026-12-02", null, formatDay)).toBe("Book Wed, Dec 2");
    expect(pickButtonLabel("2026-12-03", "2026-12-02", formatDay)).toBe("Move to Thu, Dec 3");
    // Customer words: no dashes.
    for (const text of Object.values(INSTALL_WORDS)) expect(text).not.toMatch(/[–—]/);
  });
});
