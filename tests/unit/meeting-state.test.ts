import { describe, expect, it } from "vitest";
import { parseDeckWords } from "@/lib/deck";
import { COOL_WHITE, WARM_WHITE } from "@/lib/lights/looks";
import {
  RESUME_MS,
  colourTimingFor,
  defaultQuoteState,
  pickEditableQuote,
  pickerFromStored,
  quoteMinimum,
  storedQuote,
  quoteFingerprint,
  quoteInputs,
  quoteStateFromDraft,
  withColourTiming,
  withColourRule,
  startingPoint,
  type MeetingPayload,
  type MeetingStored,
  type QuoteUIState,
} from "@/lib/meeting/state";
import { priceQuote } from "@/lib/pricing";
import { priceOffer, type QuoteOffer } from "@/lib/quotes/offers";

const payload = (draft: MeetingPayload["draft"] = null): MeetingPayload => ({
  lead: {
    id: "lead-1",
    name: "Test",
    firstName: "Test",
    addressLine: "1 Test Street NW",
    neighbourhood: null,
    soffitColour: null,
    soffitColour2: null,
    colourKind: "list",
    colourText: "White",
    initials: null,
    initialledAt: null,
  },
  deck: {
    words: parseDeckWords({}),
    photos: {},
    gallery: [],
    looks: [WARM_WHITE, COOL_WHITE],
    picker: null,
    company: { name: "", place: null, phone: "" },
    warranty: { text: "", serviceCallFee: null, gstEnabled: false },
    talking: {},
  },
  colours: { list: [], ralNames: {}, choice: null, ralCode: null },
  mockupUrl: null,
  mockups: [],
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
    blackFriday: null,
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
  offers: [],
  meetingOffer: null,
  meetingInstallOn: null,
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

describe("the page and the light picker, picked up again", () => {
  const now = Date.parse("2026-11-03T02:00:00Z");
  const local = defaultQuoteState(payload());
  const lit = { look: "cool_white", effect: "chase" as const, played: true };

  it("finds the page by its key, so pages added before it don't move it", () => {
    const start = startingPoint(payload(), stored(local, { screen: { index: 7, at: now - 60_000, key: "colour" } }), now);
    expect(start.screenKey).toBe("colour");
    expect(startingPoint(payload(), stored(local, { screen: { index: 7, at: now - 60_000 } }), now).screenKey).toBeNull();
    expect(startingPoint(payload(), stored(local, { screen: { index: 7, at: now - 60_000, key: "colour" } }), now, true).screenKey).toBeNull();
  });

  it("keeps the look, effect and played light-up through a reload or auto-lock mid-meeting", () => {
    const within = stored(local, { screen: { index: 4, at: now - 60_000 }, picker: lit });
    expect(startingPoint(payload(), within, now).picker).toEqual(lit);
  });

  it("opened fresh, opens the picker on Warm white, Steady, with the light-up to play, even an hour after a check", () => {
    // Keenan pressed Start from prep at 5:30 to check the picker, left it on
    // Cool white chasing, and opens the meeting fresh at the table an hour later.
    const checked = stored(local, { screen: { index: 4, at: now - 60 * 60_000, key: "light_picker" }, picker: lit });
    const start = startingPoint(payload(), checked, now, true);
    expect(start.picker).toBeNull();
    expect(start.index).toBe(0);
    // The quote is still kept: only the screen and the picker start over.
    expect(start.quote).toEqual(local);
  });

  it("starts a later meeting on the first look, Steady, with the light-up to play", () => {
    const later = stored(local, { screen: { index: 4, at: now - RESUME_MS - 1 }, picker: lit });
    expect(startingPoint(payload(), later, now).picker).toBeNull();
    expect(startingPoint(payload(), stored(local, { picker: lit }), now).picker).toBeNull();
  });

  it("drops a stored look no longer on offer, or an effect the control doesn't have", () => {
    const looks = [WARM_WHITE];
    expect(pickerFromStored(lit, looks)).toBeNull();
    expect(pickerFromStored({ look: "warm_white", effect: "strobe", played: true }, looks)).toBeNull();
    expect(pickerFromStored({ look: "warm_white", effect: "off" }, looks)).toEqual({ look: "warm_white", effect: "off", played: false });
    expect(pickerFromStored("warm_white", looks)).toBeNull();
    expect(pickerFromStored(null, looks)).toBeNull();
  });
});

// Round 9 (2026-11-10): the quote the meeting and the lead page's editor
// open, an accepted quote read only, and the quote's own minimum.
describe("the quote both screens open", () => {
  const now = Date.parse("2026-11-03T02:00:00Z");

  it("is the accepted quote while there is one, otherwise the newest draft", () => {
    const rows = [
      { id: "new-draft", status: "draft" },
      { id: "declined", status: "declined" },
      { id: "accepted", status: "accepted" },
    ];
    expect(pickEditableQuote(rows)?.id).toBe("accepted");
    expect(pickEditableQuote(rows.filter((row) => row.status !== "accepted"))?.id).toBe("new-draft");
    expect(pickEditableQuote([{ id: "x", status: "cancelled" }])).toBeNull();
  });

  it("opens an accepted quote from the server, whatever the iPad holds, with the option they said yes to", () => {
    const draft = {
      ...serverDraft("2026-11-03T01:00:00+00:00"),
      offers: [{ id: "full", name: "Full wrap", runs: [0] }],
      meetingOffer: "full",
      accepted: true,
      acceptedOffer: "full",
    };
    const iPad = withFeet(defaultQuoteState(payload()), 140);
    const start = startingPoint(payload(draft), stored(iPad, { savedAt: "2026-11-03T01:30:00Z" }), now);
    expect(start.quote.runs[0].feet).toBe(100);
    expect(start.quote.chosenOffer).toBe("full");
    expect(start.savedQuote).toBe(quoteFingerprint(start.quote));
  });

  it("reads an iPad copy from before round 9 as one full wrap with no choice", () => {
    const old = { ...defaultQuoteState(payload()) } as Partial<QuoteUIState>;
    delete old.offers;
    delete old.chosenOffer;
    delete old.installOn;
    const read = storedQuote(old as QuoteUIState);
    expect(read.offers).toEqual([]);
    expect(read.chosenOffer).toBeNull();
    expect(read.installOn).toBeNull();
  });

  it("keeps the quote's own minimum once saved, so a later change in Settings never alters it", () => {
    const draft = { ...serverDraft("2026-11-03T01:00:00+00:00"), minJobTotal: null };
    const state = quoteStateFromDraft(draft, payload(draft));
    expect(state.minJobTotal).toBe("");
    expect(quoteMinimum(state, { minJobTotal: 2500 })).toBeNull();
    // A draft read without the column, and a new quote, use Settings'.
    expect(quoteMinimum(quoteStateFromDraft(serverDraft("2026-11-03T01:00:00+00:00"), payload()), { minJobTotal: 2500 })).toBe(2500);
    expect(quoteMinimum(defaultQuoteState(payload()), { minJobTotal: 2500 })).toBe(2500);
    const own = quoteStateFromDraft({ ...draft, minJobTotal: 1800 }, payload());
    expect(priceQuote(quoteInputs(withFeet(own, 10), { ...payload().pricing, minJobTotal: 2500 })).subtotal).toBe(1800);
  });
});

// Round 17 (Keenan, 2026-11-12): a colour-matched track is installed this
// season at no extra cost by default. Round 18: the rush fee is each offer's
// own switch, off to start, and no longer about the colour.
describe("the rush fee is each offer's own (round 18), off by default", () => {
  const brown = (draft: MeetingPayload["draft"] = null) => ({ ...payload(draft), lead: { ...payload(draft).lead, colourText: "Brown" } });
  const RUSH_LINE = "Rush fee";
  const full = { id: "full", name: "Full wrap", runs: [0], boxes: null };
  const labels = (state: QuoteUIState, offer: QuoteOffer) => priceOffer(quoteInputs(state, brown().pricing), offer)?.lines.map((line) => line.label) ?? [];

  it("starts a colour-matched quote on This season, included, with no rush fee on the quote or its offers", () => {
    const state = withFeet(defaultQuoteState(brown()), 100);
    expect([state.colourTiming, state.rushFee]).toEqual(["rush", ""]);
    expect(state.offers.some((offer) => offer.rushFee)).toBe(false);
    expect(priceQuote(quoteInputs(state, brown().pricing)).lines.map((line) => line.label)).not.toContain(RUSH_LINE);
    expect(quoteInputs(state, brown().pricing).rushFee).toBeNull();
    expect(colourTimingFor("list", "Brown", null)).toBe("rush");
    expect(colourTimingFor("custom", "RAL 7016", "factory_order")).toBe("factory_order");
    expect(colourTimingFor("list", "White", "rush")).toBe("stock");
  });

  it("charges an offer's own fee as one Rush fee line, whatever the colour timing", () => {
    const state = withFeet(defaultQuoteState(brown()), 100);
    const on = { ...full, rushFee: 350 };
    expect(priceOffer(quoteInputs(state, brown().pricing), on)?.lines.find((line) => line.label === RUSH_LINE)).toEqual({ label: RUSH_LINE, detail: null, amount: 350 });
    expect(priceOffer(quoteInputs(state, brown().pricing), { ...on, rushFee: 275 })?.lines.find((line) => line.label === RUSH_LINE)?.amount).toBe(275);
    expect(labels(state, full)).not.toContain(RUSH_LINE);
    // Spring and a White track charge it too: it is a rush fee, not a colour fee.
    expect(labels({ ...state, ...withColourTiming("factory_order") }, on)).toContain(RUSH_LINE);
    expect(labels(withColourRule(state, "list", "White"), on)).toContain(RUSH_LINE);
  });

  it("keeps a saved quote's total exactly: a this-season fee goes onto every offer, a spring quote's unused fee is never named", () => {
    const rushDraft = { ...serverDraft("2026-11-10T00:00:00Z"), colourTiming: "rush", rushFee: 350 };
    const kept = quoteStateFromDraft(rushDraft, brown(rushDraft));
    expect([kept.colourTiming, kept.rushFee]).toEqual(["rush", ""]);
    // The one full wrap the empty list stood for is made real, with the fee.
    expect(kept.offers).toEqual([{ id: "full", name: "Full wrap", runs: [0], boxes: null, upperAccess: null, rushFee: 350 }]);
    // 100 ft x $23 + $500 - $150 + $350, as before round 18.
    expect(priceOffer(quoteInputs(kept, brown().pricing), kept.offers[0])?.subtotal).toBe(3000);
    // Offers of Keenan's each get it; offers with their own fee are left be.
    const twoDraft = { ...rushDraft, offers: [{ id: "a", name: "Front", runs: [0] }, { id: "b", name: "Front again", runs: [0], rush_fee: 100 }] };
    expect(quoteStateFromDraft(twoDraft, brown(twoDraft)).offers.map((offer) => offer.rushFee)).toEqual([undefined, 100]);
    const oneDraft = { ...rushDraft, offers: [{ id: "a", name: "Front", runs: [0] }, { id: "b", name: "Front again", runs: [0] }] };
    expect(quoteStateFromDraft(oneDraft, brown(oneDraft)).offers.map((offer) => offer.rushFee)).toEqual([350, 350]);
    const springDraft = { ...serverDraft("2026-11-10T00:00:00Z"), colourTiming: "factory_order", rushFee: 350 };
    const spring = quoteStateFromDraft(springDraft, brown(springDraft));
    expect(spring.offers).toEqual([]);
    expect(priceQuote(quoteInputs(spring, brown().pricing)).lines.map((line) => line.label)).not.toContain(RUSH_LINE);
  });

  it("carries an iPad copy's fee the same way: only a this-season copy had one", () => {
    // Before round 17 every copy held Settings' fee whatever its timing.
    const old = (colourTiming: QuoteUIState["colourTiming"]) => storedQuote({ ...withFeet(defaultQuoteState(payload()), 100), colourTiming, rushFee: "350" });
    expect(old(null).offers.some((offer) => offer.rushFee)).toBe(false);
    expect(old("stock").offers.some((offer) => offer.rushFee)).toBe(false);
    expect(old("factory_order").offers.some((offer) => offer.rushFee)).toBe(false);
    expect(old("rush").offers.map((offer) => offer.rushFee)).toEqual([350]);
    expect(old("rush").rushFee).toBe("");
    // A copy with no fee at all reads as none.
    const none = { ...withFeet(defaultQuoteState(payload()), 100), colourTiming: "rush" } as Partial<QuoteUIState>;
    delete none.rushFee;
    expect(storedQuote(none as QuoteUIState).offers.some((offer) => offer.rushFee)).toBe(false);
  });

  it("names the fee and each extra charge in the fingerprint, so a change asks to be saved", () => {
    const state = withFeet(defaultQuoteState(brown()), 100);
    const base = { ...state, offers: [full] };
    const fee = { ...state, offers: [{ ...full, rushFee: 350 }] };
    const charge = { ...state, offers: [{ ...full, charges: [{ label: "Extra outlet", amount: 150 }] }] };
    expect(new Set([quoteFingerprint(base), quoteFingerprint(fee), quoteFingerprint(charge)]).size).toBe(3);
    expect(priceOffer(quoteInputs(charge, brown().pricing), charge.offers[0])?.lines.find((line) => line.label === "Extra outlet")?.amount).toBe(150);
  });
});
