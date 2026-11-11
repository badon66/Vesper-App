import { describe, expect, it } from "vitest";
import { DEFAULT_LINES } from "@/lib/deck";
import { coverPrepared } from "@/lib/meeting/deck-pages";

// Round 15 (Keenan, 2026-11-11): the cover says who the quote is prepared
// for, by the family name when the lead has one.
describe("the cover's Prepared for line", () => {
  const lines = { cover_prepared: DEFAULT_LINES.cover_prepared, cover_prepared_first: DEFAULT_LINES.cover_prepared_first };

  it("uses the family name when the name has one", () => {
    expect(coverPrepared(lines, { name: "Jane Smith", firstName: "Jane" })).toBe("Prepared for the Smith home");
    expect(coverPrepared(lines, { name: "  Mary  Ann  Van Dyke ", firstName: "Mary" })).toBe("Prepared for the Ann Van Dyke home");
  });

  it("falls back to the name alone when there is no family name", () => {
    expect(coverPrepared(lines, { name: "Jane", firstName: "Jane" })).toBe("Prepared for Jane");
    expect(coverPrepared(lines, { name: "The Smiths", firstName: "" })).toBe("Prepared for The Smiths");
  });

  it("uses Keenan's own wording from Settings", () => {
    expect(coverPrepared({ cover_prepared: "For the {family} family", cover_prepared_first: "For {name}" }, { name: "Jane Smith", firstName: "Jane" })).toBe(
      "For the Smith family",
    );
  });
});
