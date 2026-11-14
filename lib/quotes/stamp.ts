// A save never wipes something newer (round 20, Keenan, 2026-11-14).
//
// A quote's stamp says which version of it Keenan opened: the quote's own
// row (its id and the database's updated_at, which changes when Keenan saves
// it from any device or the customer books their own build), when the
// customer last booked on their link, and when they last signed. The lead
// page's quote editor and meeting mode both remember the stamp they opened
// with and send it with every save; the server refuses the save when the
// stamp has moved on since, so nothing the customer or another device did is
// written over. Shared by the server (lib/meeting/deck-payload.ts and the
// save action) and the client (use-quote-save.ts); no secrets here.

export const QUOTE_CHANGED = "This quote changed since you opened it. Reopen it to see the latest, then make your change.";

// The lead had no quote when it was opened.
export const NO_QUOTE_STAMP = "none";

const time = (value: string | null | undefined): number => {
  const at = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(at) ? at : 0;
};

export function quoteStamp(
  quote: { id: string; updatedAt: string } | null,
  marks: { bookedAt: string | null; signedAt: string | null },
): string {
  if (!quote) return NO_QUOTE_STAMP;
  return [quote.id, time(quote.updatedAt), time(marks.bookedAt), time(marks.signedAt)].join("|");
}

// The quote's own part of a stamp: the updated_at the save may overwrite.
export function stampedUpdatedAt(stamp: string): number | null {
  const parts = stamp.split("|");
  return parts.length === 4 ? Number(parts[1]) : null;
}
