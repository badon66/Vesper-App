import { describe, expect, it } from "vitest";
import {
  RESUME_MS,
  defaultQuoteState,
  quoteFingerprint,
  quoteInputs,
  quoteStateFromDraft,
  startingPoint,
  type MeetingPayload,
  type MeetingStored,
  type QuoteUIState,
} from "@/lib/meeting/state";
import { priceQuote } from "@/lib/pricing";

const payload = (draft: MeetingPayload["draft"] = null): MeetingPayload => ({
  lead: {
    id: "lead-1",
    name: "Test",
    firstName: "Test",
    addressLine: "1 Test Street NW",
    neighbourhood: null,
    soffitColour: null,
    soffitNote: null,
    colourKind: "list",
    colourText: "White",
    initials: null,
    initialledAt: null,
  },
  pages: [],
  colours: { list: [], ralNames: {}, choice: null, ralCode: null },
  warrantyText: "",
  serviceCallFee: null,
  mockupUrl: null,
  pricing: {
    pricePerFt: 23,
    boxPrice: 500,
    neighbourDiscount: 150,
    gstEnabled: false,
    gstRate: 0.05,
    gstNumber: null,
    rushFee: 350,
    upperAccessFee: 200,
    upperGableAccessFee: 400,
    priceHoldDays: 120,
    minJobTotal: null,
  },
  draft,
  today: "2026-11-03",
});

const serverDraft = (updatedAt: string): NonNullable<MeetingPayload["draft"]> => ({
  quoteId: "quote-1",
  runs: [{ name: "Front", feet: 100, level: "lower" }],
  boxCount: 1,
  pricePerFt: 23,
  boxPrice: 500,
  adders: [],
  discounts: [{ label: "Neighbour discount", amount: 150 }],
  colourTiming: "stock",
  rushFee: null,
  upperAccessFee: null,
  upperGableAccessFee: null,
  financingOffered: false,
  validUntil: "2026-11-17",
  updatedAt,
});

const withFeet = (state: QuoteUIState, feet: number): QuoteUIState => ({
  ...state,
  runs: [{ name: "Front", feet, level: "lower" }],
});

const stored = (quote: QuoteUIState, extra: Partial<MeetingStored> = {}): MeetingStored => ({
  version: 1,
  quote,
  quoteId: "quote-1",
  savedAt: null,
  initialsDraft: "",
  ...extra,
});

describe("the quote fingerprint", () => {
  const base = withFeet(defaultQuoteState(payload()), 100);

  it("is the same for the same quote", () => {
    expect(quoteFingerprint(base)).toBe(quoteFingerprint(structuredClone(base)));
  });

  it("changes with anything the quote would save", () => {
    const fp = quoteFingerprint(base);
    expect(quoteFingerprint(withFeet(base, 101))).not.toBe(fp);
    expect(quoteFingerprint({ ...base, pricePerFt: "22" })).not.toBe(fp);
    expect(quoteFingerprint({ ...base, neighbourOn: true })).not.toBe(fp);
    expect(quoteFingerprint({ ...base, financingOffered: true })).not.toBe(fp);
    expect(quoteFingerprint({ ...base, validUntil: "2026-12-01" })).not.toBe(fp);
    expect(quoteFingerprint({ ...base, adders: [{ label: "Height", amount: "200" }] })).not.toBe(fp);
  });

  it("ignores empty rows and runs with no feet yet", () => {
    const fp = quoteFingerprint(base);
    expect(quoteFingerprint({ ...base, adders: [{ label: "", amount: "" }] })).toBe(fp);
    expect(quoteFingerprint({ ...base, customDiscounts: [{ label: "Promo", amount: "" }] })).toBe(fp);
    expect(quoteFingerprint({ ...base, runs: [...base.runs, { name: "Garage", feet: 0, level: "lower" }] })).toBe(fp);
    expect(quoteFingerprint({ ...base, pricePerFt: "23.00" })).toBe(fp);
  });
});

describe("a saved draft back on screen", () => {
  it("restores the neighbour discount as the toggle, not as a custom line", () => {
    const state = quoteStateFromDraft(serverDraft("2026-11-03T01:00:00+00:00"), payload());
    expect(state.neighbourOn).toBe(true);
    expect(state.neighbourAmount).toBe("150");
    expect(state.customDiscounts).toEqual([]);
    expect(priceQuote(quoteInputs(state, payload().pricing)).subtotal).toBe(2650);
  });

  it("reads junk jsonb as empty lists instead of failing at the table", () => {
    const state = quoteStateFromDraft(
      { ...serverDraft("2026-11-03T01:00:00+00:00"), runs: "nope", adders: [null, 4, { amount: 5 }], discounts: {} },
      payload(),
    );
    expect(state.runs).toEqual([{ name: "Front", feet: 0, level: "lower", part: "eave" }]);
    expect(state.adders).toEqual([]);
    expect(state.neighbourOn).toBe(false);
  });

  it("keeps extra work marked only with upper runs, and prices it only while an upper run is in", () => {
    const draft = {
      ...serverDraft("2026-11-03T01:00:00+00:00"),
      runs: [{ name: "Garage", feet: 40, level: "lower" }],
      adders: [{ label: "Extra height", amount: 150, upper_only: true }, { label: "Corner", amount: 50 }],
    };
    const state = quoteStateFromDraft(draft, payload());
    expect(state.adders).toEqual([
      { label: "Extra height", amount: "150", upperOnly: true },
      { label: "Corner", amount: "50" },
    ]);
    const lowerOnly = priceQuote(quoteInputs(state, payload().pricing)).lines.map((line) => line.label);
    expect(lowerOnly).not.toContain("Extra height");
    const withUpper = { ...state, runs: [...state.runs, { name: "Upper", feet: 20, level: "upper" as const }] };
    expect(priceQuote(quoteInputs(withUpper, payload().pricing)).lines.map((line) => line.label)).toContain("Extra height");
    expect(quoteFingerprint({ ...state, adders: state.adders.map((item) => ({ ...item, upperOnly: false })) })).not.toBe(
      quoteFingerprint(state),
    );
  });

  it("prices with the minimum job total from Settings", () => {
    const state = { ...withFeet(defaultQuoteState(payload()), 10) };
    const pricing = { ...payload().pricing, minJobTotal: 2500 };
    const priced = priceQuote(quoteInputs(state, pricing));
    expect(priced.subtotal).toBe(2500);
    expect(priced.minimumApplied).toBe(true);
    expect(priced.lines.map((line) => line.label)).toContain("To reach our $2,500 minimum");
  });

  it("names unnamed extra work plainly on the bill", () => {
    const state = { ...withFeet(defaultQuoteState(payload()), 10), adders: [{ label: "", amount: "75" }] };
    const lines = priceQuote(quoteInputs(state, payload().pricing)).lines;
    expect(lines.map((line) => line.label)).toContain("Extra work");
  });
});

describe("where a meeting starts", () => {
  const now = Date.parse("2026-11-03T02:00:00Z");

  it("with nothing saved anywhere: a fresh quote at the cover", () => {
    const start = startingPoint(payload(), null, now);
    expect(start.quoteId).toBeNull();
    expect(start.savedQuote).toBeNull();
    expect(start.index).toBe(0);
    // Prices held 120 days from today (2026-11-03 in this payload).
    expect(start.quote.validUntil).toBe("2027-03-03");
  });

  it("the server draft when the iPad has no copy, counted as saved", () => {
    const draft = serverDraft("2026-11-03T01:00:00.123456+00:00");
    const start = startingPoint(payload(draft), null, now);
    expect(start.quoteId).toBe("quote-1");
    expect(start.savedAt).toBe(draft.updatedAt);
    expect(start.savedQuote).toBe(quoteFingerprint(start.quote));
  });

  it("keeps edits made without signal after the iPad's own last save", () => {
    const draft = serverDraft("2026-11-03T01:00:00.123456+00:00");
    const saved = quoteStateFromDraft(draft, payload(draft));
    const edited = withFeet(saved, 140);
    const start = startingPoint(
      payload(draft),
      stored(edited, { savedAt: draft.updatedAt, savedQuote: quoteFingerprint(saved) }),
      now,
    );
    expect(start.quote.runs[0].feet).toBe(140);
    expect(start.savedQuote).not.toBe(quoteFingerprint(start.quote));
  });

  it("takes the server's draft when it holds a save the iPad never saw", () => {
    const draft = serverDraft("2026-11-03T01:30:00+00:00");
    const old = withFeet(defaultQuoteState(payload()), 60);
    const start = startingPoint(payload(draft), stored(old, { savedAt: "2026-11-02T23:00:00.000Z" }), now);
    expect(start.quote.runs[0].feet).toBe(100);
    expect(start.savedAt).toBe(draft.updatedAt);
  });

  it("compares save times as moments, whatever their written form", () => {
    const draft = serverDraft("2026-11-03T01:00:00+00:00");
    const local = withFeet(defaultQuoteState(payload()), 77);
    const start = startingPoint(payload(draft), stored(local, { savedAt: "2026-11-03T01:00:00.000Z" }), now);
    expect(start.quote.runs[0].feet).toBe(77);
  });

  it("a copy that was never saved gives way to a server draft", () => {
    const draft = serverDraft("2026-11-03T01:00:00+00:00");
    const local = withFeet(defaultQuoteState(payload()), 12);
    expect(startingPoint(payload(draft), stored(local), now).quote.runs[0].feet).toBe(100);
  });

  it("a never-saved copy with no server draft is kept, and counts as unsaved", () => {
    const local = withFeet(defaultQuoteState(payload()), 12);
    const start = startingPoint(payload(), stored(local, { quoteId: null }), now);
    expect(start.quote.runs[0].feet).toBe(12);
    expect(start.savedQuote).toBeNull();
  });

  it("an older copy without a saved fingerprint compares against the server draft", () => {
    const draft = serverDraft("2026-11-03T01:00:00+00:00");
    const same = quoteStateFromDraft(draft, payload(draft));
    const start = startingPoint(payload(draft), stored(same, { savedAt: draft.updatedAt }), now);
    expect(start.savedQuote).toBe(quoteFingerprint(same));
  });

  it("picks up on the same screen within the same evening, and at the cover after", () => {
    const local = defaultQuoteState(payload());
    expect(startingPoint(payload(), stored(local, { screen: { index: 7, at: now - 60_000 } }), now).index).toBe(7);
    expect(startingPoint(payload(), stored(local, { screen: { index: 7, at: now - RESUME_MS - 1 } }), now).index).toBe(0);
  });

  it("opened fresh from Tonight or the lead page, starts at the cover but keeps the quote", () => {
    const local = withFeet(defaultQuoteState(payload()), 33);
    const start = startingPoint(payload(), stored(local, { screen: { index: 7, at: now - 60_000 } }), now, true);
    expect(start.index).toBe(0);
    expect(start.quote.runs[0].feet).toBe(33);
  });

  it("keeps initials typed but not yet confirmed", () => {
    const local = defaultQuoteState(payload());
    expect(startingPoint(payload(), stored(local, { initialsDraft: "MB" }), now).initialsDraft).toBe("MB");
  });
});
