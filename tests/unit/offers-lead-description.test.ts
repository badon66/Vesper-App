import { describe, expect, it } from "vitest";
import { defaultQuoteState, quoteFingerprint, type MeetingPayload } from "@/lib/meeting/state";
import type { QuoteInputs, QuoteRun } from "@/lib/pricing";
import {
  cleanOfferDescription,
  leadOfferId,
  offersForSave,
  parseOffers,
  pricedOffers,
  setLeadOffer,
  setOfferHidden,
  shownOffers,
  type QuoteOffer,
} from "@/lib/quotes/offers";
import { openingOffer } from "@/lib/quote-link/view";

// Round 17 (Keenan, 2026-11-12): "Lead with this one" and each offer's description.
const runs: QuoteRun[] = [
  { name: "Front", feet: 64, level: "lower", part: "eave" },
  { name: "Front upper", feet: 40, level: "upper", part: "eave" },
  { name: "Back", feet: 50, level: "lower", part: "eave" },
];
const inputs: QuoteInputs = {
  runs,
  boxCount: 1,
  pricePerFt: 24,
  boxPrice: 500,
  adders: [],
  discounts: [],
  colourTiming: "stock",
  rushFee: null,
  gstEnabled: false,
  gstRate: 0.05,
};
const offers: QuoteOffer[] = [
  { id: "lower", name: "Front lower only", runs: [0] },
  { id: "full", name: "Full wrap", runs: [0, 1, 2] },
  { id: "front", name: "Full front", runs: [0, 1] },
];

describe("Lead with this one", () => {
  it("lists the starred offer first, then the rest biggest first; with no star, biggest first as before", () => {
    expect(pricedOffers(inputs, offers).map((priced) => priced.offer.id)).toEqual(["full", "front", "lower"]);
    const starred = setLeadOffer(offers, "front");
    expect(pricedOffers(inputs, starred).map((priced) => priced.offer.id)).toEqual(["front", "full", "lower"]);
    expect(shownOffers(inputs, starred)[0].offer.id).toBe("front");
  });

  it("keeps one star per quote, and taking it off goes back to biggest first", () => {
    const one = setLeadOffer(setLeadOffer(offers, "front"), "lower");
    expect(one.filter((offer) => offer.lead === true).map((offer) => offer.id)).toEqual(["lower"]);
    expect(leadOfferId(setLeadOffer(one, null))).toBeNull();
  });

  it("never stars a hidden offer or the customer's own build, and hiding an offer takes its star off", () => {
    const hidden = setOfferHidden(setLeadOffer(offers, "front"), "front", true);
    expect(leadOfferId(hidden)).toBeNull();
    expect(leadOfferId(setLeadOffer(hidden, "front"))).toBeNull();
    const theirs: QuoteOffer = { id: "customer", name: "Custom quote (from the customer)", runs: [0, 2], fromCustomer: true };
    expect(leadOfferId(setLeadOffer([...offers, theirs], "customer"))).toBeNull();
  });

  it("reads the first star the way the database keeps it, and saves it", () => {
    const parsed = parseOffers(
      [
        { id: "a", name: "A", runs: [0], lead: true, hidden: true },
        { id: "b", name: "B", runs: [1], lead: true },
        { id: "c", name: "C", runs: [2], lead: true },
      ],
      3,
    );
    expect(parsed.map((offer) => offer.lead === true)).toEqual([false, true, false]);
    expect(offersForSave(parsed, 3).filter((offer) => offer.lead).map((offer) => offer.id)).toEqual(["b"]);
  });

  it("opens the link on what they booked, else the starred offer, else the table's choice, else the biggest", () => {
    const shown = shownOffers(inputs, setLeadOffer(offers, "front"));
    expect(openingOffer(shown, { booked: "lower", meeting: "full" })).toBe("lower");
    expect(openingOffer(shown, { booked: null, meeting: "full" })).toBe("front");
    const plain = shownOffers(inputs, offers);
    expect(openingOffer(plain, { booked: null, meeting: "front" })).toBe("front");
    expect(openingOffer(plain, { booked: null, meeting: null })).toBe("full");
  });
});

describe("each offer's description", () => {
  it("is one paragraph, spaces tidied, up to 400 characters; empty is none", () => {
    expect(cleanOfferDescription("  does the whole front,\n\n both gables  ")).toBe("does the whole front, both gables");
    expect(cleanOfferDescription("   ")).toBeNull();
    expect(cleanOfferDescription(42)).toBeNull();
    expect(cleanOfferDescription("x".repeat(500))?.length).toBe(400);
  });

  it("travels with the offer when it saves and when it is read back", () => {
    const saved = offersForSave([{ ...offers[1], description: " Every roofline, lit.  " }], 3);
    expect(saved[0].description).toBe("Every roofline, lit.");
    expect(parseOffers(saved, 3)[0].description).toBe("Every roofline, lit.");
    expect("description" in offersForSave([offers[0]], 3)[0]).toBe(false);
  });

  it("marks the quote changed when the star or a description changes", () => {
    const payload = { pricing: { pricePerFt: 24, boxPrice: 500, neighbourDiscount: 150, gstEnabled: false, gstRate: 0.05, gstNumber: null, rushFee: 350, upperAccessFee: 200, upperGableAccessFee: 400, priceHoldDays: 120, minJobTotal: null, blackFriday: null } as MeetingPayload["pricing"], today: "2026-11-12", lead: { colourKind: "list" as const, colourText: "White" } };
    const base = { ...defaultQuoteState(payload), runs, offers };
    const print = quoteFingerprint(base);
    expect(quoteFingerprint({ ...base, offers: setLeadOffer(offers, "front") })).not.toBe(print);
    expect(quoteFingerprint({ ...base, offers: offers.map((offer) => (offer.id === "full" ? { ...offer, description: "Best value." } : offer)) })).not.toBe(print);
  });
});
