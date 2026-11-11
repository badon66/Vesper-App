import { describe, expect, it } from "vitest";

import { DEFAULT_LINES, priceSubLine } from "@/lib/deck";
import { breakdownRows, coverageLine, minimumSentence, money, NO_PAYMENT, screenOptions } from "@/lib/meeting/price-screen";
import { defaultQuoteState, quoteFingerprint, type MeetingPayload, type QuoteUIState } from "@/lib/meeting/state";
import { priceQuote, type QuoteInputs, type QuoteRun } from "@/lib/pricing";
import { QUOTE_LOCKED_LEAD, QUOTE_LOCKED_MEETING, quoteLockedWords, quoteSaveInput } from "@/lib/quotes/draft";
import {
  addQuickStart,
  editorOffers,
  editorOrder,
  LEVEL_WARNING,
  nameHasLevel,
  offerNameIssue,
  offerWarnings,
  quoteSummary,
  toggleOfferRun,
} from "@/lib/quotes/editor";
import type { QuoteOffer } from "@/lib/quotes/offers";

// Round 9 (Keenan, 2026-11-10; the five seats' spec, 3.4, 3.5 and 3.7): the
// price page's options, the quote editor's warnings and quick starts, the
// save's shape, and the house drawing's runs.

const RUNS: QuoteRun[] = [
  { name: "Front", feet: 60, level: "lower", part: "eave" },
  { name: "Garage", feet: 30, level: "lower", part: "garage" },
  { name: "Upper front", feet: 40, level: "upper", part: "eave" },
  { name: "Upper gable", feet: 20, level: "upper", part: "gable" },
];

const inputs = (over: Partial<QuoteInputs> = {}): QuoteInputs => ({
  runs: RUNS,
  boxCount: 1,
  pricePerFt: 23,
  boxPrice: 500,
  adders: [],
  discounts: [],
  colourTiming: null,
  rushFee: 350,
  upperAccessFee: 200,
  upperGableAccessFee: 400,
  minJobTotal: 2500,
  gstEnabled: false,
  gstRate: 0.05,
  ...over,
});

const FULL: QuoteOffer = { id: "full", name: "Full wrap", runs: [0, 1, 2, 3], boxes: null, upperAccess: null };
const MAIN: QuoteOffer = { id: "main", name: "Main floor", runs: [0, 1], boxes: null, upperAccess: null };
const FRONT: QuoteOffer = { id: "front", name: "Front only", runs: [0], boxes: null, upperAccess: null };

const pricing: MeetingPayload["pricing"] = {
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
  minJobTotal: 2500,
  blackFriday: null,
};
const context = { pricing, today: "2026-11-10", lead: { colourKind: "list" as const, colourText: "White" } };

describe("the price page's options", () => {
  it("shows the options biggest first, never one without measured feet", () => {
    const empty: QuoteOffer = { id: "empty", name: "Porch", runs: [], boxes: null };
    const unmeasured: QuoteOffer = { id: "later", name: "Later", runs: [4], boxes: null };
    const runs = [...RUNS, { name: "Porch", feet: 0, level: "lower" as const, part: "porch" as const }];
    const shown = screenOptions(inputs({ runs }), [FRONT, empty, FULL, unmeasured, MAIN]);
    expect(shown.map((option) => option.offer.id)).toEqual(["full", "main", "front"]);
  });

  it("names what an option covers from its measured runs only", () => {
    expect(coverageLine(RUNS, FULL)).toBe("Front, garage and gable, upper and lower: 150 ft");
    const runs = [...RUNS, { name: "Porch", feet: 0, level: "lower" as const }];
    expect(coverageLine(runs, { runs: [0, 4] })).toBe("Front, lower: 60 ft");
    expect(coverageLine(RUNS, { runs: [] })).toBe("");
  });

  it("lists the breakdown in the link's rows, with the sum before the minimum and a true minus", () => {
    const front = priceQuote(inputs({ runs: [RUNS[0]], discounts: [{ label: "Neighbour discount", amount: 150 }] }));
    const rows = breakdownRows(front);
    expect(rows.map((row) => row.label)).toEqual([
      "Track and lights",
      "Control box",
      "Neighbour discount",
      "Before the minimum",
      "To reach our $2,500 minimum",
    ]);
    expect(rows[0]).toMatchObject({ kind: "line", detail: "60 ft at $23 a foot", amount: "$1,380" });
    expect(rows[2]).toMatchObject({ amount: "−$150" });
    expect(rows[3]).toMatchObject({ kind: "sum", amount: "$1,730" });
    expect(rows[4]).toMatchObject({ kind: "line", minimum: true, amount: "$770" });
    expect(minimumSentence(front.subtotal)).toBe("That's under our $2,500 minimum, so this option comes to $2,500.");
    expect(money(-12.5)).toBe("−$12.50");
    expect(NO_PAYMENT).toBe("No payment until your install is complete.");
  });

  it("says how many options and the colour, or leaves the colour out when none is set", () => {
    expect(priceSubLine(DEFAULT_LINES, 3, "White")).toBe("Three options, all with White track.");
    expect(priceSubLine(DEFAULT_LINES, 1, "Brown")).toBe("With Brown track.");
    expect(priceSubLine(DEFAULT_LINES, 2, null)).toBe("Two options.");
    expect(priceSubLine(DEFAULT_LINES, 1, null)).toBe("");
  });
});

describe("the quote editor", () => {
  it("turns the full-wrap stand-in into a real offer under its own id", () => {
    expect(editorOffers(RUNS, [])).toEqual([FULL]);
    expect(editorOffers([], [])).toEqual([]);
    expect(editorOffers(RUNS, [MAIN])).toEqual([MAIN]);
  });

  it("adds presets: Front lower only, Full front and Custom, at most four", () => {
    const withMain = addQuickStart([FULL], "front_lower", RUNS, 1);
    expect(withMain[1]).toMatchObject({ name: "Front lower only", runs: [0, 1], boxes: null });
    const withFront = addQuickStart(withMain, "full_front", RUNS, 2);
    expect(withFront[2]).toMatchObject({ name: "Full front", runs: [0, 1, 2] });
    const withBlank = addQuickStart(withFront, "custom", RUNS, 3);
    expect(withBlank[3]).toMatchObject({ name: "", runs: [] });
    expect(new Set(withBlank.map((offer) => offer.id)).size).toBe(4);
    expect(addQuickStart(withBlank, "full_wrap", RUNS, 4)).toHaveLength(4);
    // A second Full wrap gets a name customers can tell apart.
    expect(addQuickStart([FULL], "full_wrap", RUNS, 5)[1].name).toBe("Full wrap 2");
  });

  it("taps runs on and off an offer, kept in order", () => {
    expect(toggleOfferRun(FRONT, 2).runs).toEqual([0, 2]);
    expect(toggleOfferRun({ ...FRONT, runs: [0, 2] }, 0).runs).toEqual([2]);
  });

  it("checks names with the deck's word rules", () => {
    expect(offerNameIssue("Main floor")).toBeNull();
    expect(offerNameIssue("Off-white wrap")).toBeNull();
    expect(offerNameIssue("Front — only")).toBe("No dashes. Use a comma or a full stop instead.");
    expect(offerNameIssue("Best deal!")).toBe("No exclamation marks.");
    expect(nameHasLevel("Lower level")).toBe(true);
    expect(nameHasLevel("Main floor")).toBe(false);
  });

  it("warns quietly about offers that repeat, tie, cost more for less, or sit at the minimum", () => {
    const words = (offers: QuoteOffer[], over: Partial<QuoteInputs> = {}) => offerWarnings(inputs(over), offers).map((warning) => warning.text);
    expect(words([FULL, { ...MAIN, id: "copy", name: "Copy", runs: [0, 1, 2, 3] }])).toContain("Copy covers the same runs as Full wrap.");
    expect(words([FULL, { id: "blank", name: "Porch", runs: [], boxes: null }])).toContain("Porch has no runs yet, so customers won't see it.");
    // Front only (60 ft) and Garage (30 ft) both rise to the minimum.
    expect(words([FRONT, { id: "garage", name: "Garage only", runs: [1], boxes: null }])).toContain(
      "Front only and Garage only both come to $2,500, our minimum.",
    );
    expect(words([FULL, MAIN], { minJobTotal: null })).not.toContain("Full wrap and Main floor come to the same price.");
    // The same price, not the minimum.
    const sameA: QuoteOffer = { id: "a", name: "Left", runs: [2], boxes: null };
    const sameB: QuoteOffer = { id: "b", name: "Right", runs: [2], boxes: 1 };
    expect(words([sameA, { ...sameB, runs: [0] }], { minJobTotal: null, runs: [RUNS[0], RUNS[1], { ...RUNS[0], name: "Back" }] })).toContain(
      "Left and Right come to the same price.",
    );
    // Fewer feet, more money: the upper gable's access and four boxes.
    const costly: QuoteOffer = { id: "costly", name: "Gable", runs: [3], boxes: 4 };
    expect(words([MAIN, costly], { minJobTotal: null })).toContain("Gable costs more than Main floor.");
    expect(words([FRONT, FULL])).toContain("Front only is under our $2,500 minimum, so it comes to $2,500.");
    expect(words([{ ...MAIN, name: "Lower level" }])).toContain(LEVEL_WARNING);
    expect(words([FULL, MAIN, FRONT].map((offer) => ({ ...offer })), { minJobTotal: null })).toEqual([]);
  });

  it("orders the cards biggest first, offers with no runs last", () => {
    expect(editorOrder(inputs(), [FRONT, { id: "none", name: "New", runs: [], boxes: null }, FULL, MAIN])).toEqual(["full", "main", "front", "none"]);
  });

  it("sums the quote up for the lead page", () => {
    const summary = quoteSummary(inputs({ minJobTotal: null }), [MAIN, FULL], "2027-03-04", (day) => `day ${day}`);
    expect(summary).toBe("Full wrap $4,350, Main floor $2,570. Price held until day 2027-03-04.");
    expect(quoteSummary(inputs({ gstEnabled: true, minJobTotal: null }), [FULL], null, (day) => day)).toBe("Full wrap $4,350 + GST.");
    expect(quoteSummary(inputs(), [], null, (day) => day)).toBe("Full wrap $4,350.");
  });
});

describe("saving the quote", () => {
  const state = (over: Partial<QuoteUIState> = {}): QuoteUIState => ({ ...defaultQuoteState(context), runs: RUNS, ...over });

  it("sends the offers cleaned, the table's choice only while it names one, and the install day", () => {
    const sent = quoteSaveInput(state({ offers: [FULL, { ...MAIN, name: "  Main   floor $ " }], chosenOffer: "main", installOn: "2026-11-21" }), pricing, "lead-1", "lead");
    expect(sent.offers).toEqual([FULL, { ...MAIN, name: "Main floor" }]);
    expect(sent.meetingOffer).toBe("main");
    expect(sent.meetingInstallOn).toBe("2026-11-21");
    expect(sent.from).toBe("lead");
    expect(quoteSaveInput(state({ offers: [FULL], chosenOffer: "gone" }), pricing, "lead-1", "meeting").meetingOffer).toBeNull();
    // An empty list is one full wrap, "full".
    expect(quoteSaveInput(state({ chosenOffer: "full" }), pricing, "lead-1", "meeting").meetingOffer).toBe("full");
  });

  it("keeps the quote's own minimum once it has one, else Settings'", () => {
    expect(quoteSaveInput(state(), pricing, "lead-1", "meeting").minJobTotal).toBe(2500);
    expect(quoteSaveInput(state({ minJobTotal: "" }), pricing, "lead-1", "meeting").minJobTotal).toBeNull();
    expect(quoteSaveInput(state({ minJobTotal: "1800" }), pricing, "lead-1", "meeting").minJobTotal).toBe(1800);
    expect(quoteFingerprint(state({ minJobTotal: "1800" }))).not.toBe(quoteFingerprint(state()));
  });

  it("says plainly why an accepted quote can't change, and where to undo it", () => {
    expect(quoteLockedWords("lead")).toBe(QUOTE_LOCKED_LEAD);
    expect(QUOTE_LOCKED_LEAD).toBe("This quote is accepted, so its prices are locked. To change them, undo the acceptance under Outcome.");
    expect(quoteLockedWords("meeting")).toBe(QUOTE_LOCKED_MEETING);
    expect(QUOTE_LOCKED_MEETING).toBe(
      "This quote is accepted, so its prices are locked. To change them, undo the acceptance under Outcome on the lead page.",
    );
  });
});
