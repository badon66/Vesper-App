import { describe, expect, it } from "vitest";
import { NO_QUOTE_STAMP, QUOTE_CHANGED, quoteStamp, stampedUpdatedAt } from "@/lib/quotes/stamp";

// Round 20 (Keenan, 2026-11-14): a save never wipes something newer. The
// stamp a screen opens a quote with moves on whenever the quote is saved
// (from any device, or the customer's own build), the customer books on
// their link, or they sign.
describe("a quote's stamp", () => {
  const quote = { id: "q1", updatedAt: "2026-11-14T01:00:00.000Z" };
  const none = { bookedAt: null, signedAt: null };

  it("moves on with a save, a booking or a signing, and only then", () => {
    const opened = quoteStamp(quote, none);
    expect(quoteStamp({ ...quote }, { ...none })).toBe(opened);
    // The same moment written another way is the same stamp.
    expect(quoteStamp({ id: "q1", updatedAt: "2026-11-14T01:00:00+00:00" }, none)).toBe(opened);
    expect(quoteStamp({ ...quote, updatedAt: "2026-11-14T01:00:01.000Z" }, none)).not.toBe(opened);
    expect(quoteStamp(quote, { ...none, bookedAt: "2026-11-14T01:05:00Z" })).not.toBe(opened);
    expect(quoteStamp(quote, { ...none, signedAt: "2026-11-14T01:06:00Z" })).not.toBe(opened);
    expect(quoteStamp({ ...quote, id: "q2" }, none)).not.toBe(opened);
  });

  it("is 'none' with no quote, and gives back the quote's own time", () => {
    expect(quoteStamp(null, { bookedAt: "2026-11-14T01:05:00Z", signedAt: null })).toBe(NO_QUOTE_STAMP);
    expect(stampedUpdatedAt(quoteStamp(quote, none))).toBe(Date.parse(quote.updatedAt));
    expect(stampedUpdatedAt(NO_QUOTE_STAMP)).toBeNull();
  });

  it("says so in Keenan's words", () => {
    expect(QUOTE_CHANGED).toBe("This quote changed since you opened it. Reopen it to see the latest, then make your change.");
  });
});
