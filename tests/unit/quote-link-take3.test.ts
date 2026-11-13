import { describe, expect, it, vi } from "vitest";
import { DEFAULT_LINES } from "@/lib/deck";
import { signedAgreement, signedFileName } from "@/lib/quote-link/agreement";
import { documentFacts, isLeadUploadPath, isLibraryPath, leadUploadPath, libraryPath, nameFromFile } from "@/lib/quote-link/documents";
import {
  buildableRuns,
  customerChoice,
  customerChoiceInSentence,
  customerOffer,
  customOption,
  documentFileName,
  offerChoice,
  offersBuildYourOwn,
  parseLinkAgreement,
  parseLinkDocuments,
  quoteFromRow,
  tracksUsed,
  type CustomerQuote,
} from "@/lib/quote-link/view";
import { describeEvent, isCustomerEvent } from "@/lib/leads/timeline";
import { quoteStateFromDraft, type QuoteContext, type QuoteDraft } from "@/lib/meeting/state";
import { quoteSaveInput } from "@/lib/quotes/draft";
import { CUSTOMER_OFFER_ID, CUSTOMER_OFFER_NAME, customerOfferName, offersForSave, OWN_OPTION, parseOffers } from "@/lib/quotes/offers";

vi.mock("server-only", () => ({}));

// Quote link take 3 (Keenan, 2026-11-11): Build your own, About your track,
// documents and the agreement to sign.

const runs = [
  { name: "Front lower", feet: 64, level: "lower", area: "front" },
  { name: "Garage", feet: 28, level: "lower", area: "front" },
  { name: "Upper gables", feet: 22, level: "upper", area: "front", gable: true, track: "j", trackRate: 30 },
  { name: "Back lower", feet: 70, level: "lower", area: "back" },
  { name: "Back upper", feet: 0, level: "upper", area: "back" },
];

function quote(offers: unknown[], extra: Record<string, unknown> = {}): CustomerQuote["quote"] {
  const parsed = quoteFromRow({
    runs,
    offers,
    price_per_ft: 23,
    box_price: 500,
    box_count: 1,
    adders: [],
    discounts: [],
    colour_timing: "stock",
    rush_fee: null,
    upper_access_fee: 200,
    upper_gable_access_fee: 400,
    min_job_total: null,
    gst_enabled: false,
    gst_rate: 0.05,
    track_colour_name: "White",
    track_custom: false,
    ...extra,
  });
  if (!parsed) throw new Error("quote did not parse");
  return parsed;
}

const keenans = [
  { id: "full", name: "Full front", runs: [0, 1, 2], boxes: 1 },
  { id: "lower", name: "Front lower only", runs: [0, 1], boxes: 2 },
  { id: "back", name: "Front plus back", runs: [0, 1, 3, 4], hidden: true },
];

describe("Build your own", () => {
  it("offers only measured areas from the options Keenan shows, never a hidden one's", () => {
    // Back lower (3) is only in a hidden offer; Back upper (4) has no feet.
    expect(buildableRuns(quote(keenans))).toEqual([0, 1, 2]);
  });

  it("isn't offered with fewer than two areas, or once accepted", () => {
    expect(offersBuildYourOwn(quote(keenans))).toBe(true);
    expect(offersBuildYourOwn(quote([{ id: "one", name: "One", runs: [0] }]))).toBe(false);
    expect(offersBuildYourOwn(quote(keenans, { accepted: true }))).toBe(false);
  });

  it("prices their ticks like any option: the quote's prices, the track's price, the starting option's boxes", () => {
    const built = customOption(quote(keenans), [0, 2], "lower");
    expect(built?.offer).toMatchObject({ id: CUSTOMER_OFFER_ID, name: CUSTOMER_OFFER_NAME, runs: [0, 2], boxes: 2, fromCustomer: true });
    // 64 ft at $23, 22 ft of J track at $30, two boxes, upper access with an upper gable.
    expect(built?.totals.subtotal).toBe(64 * 23 + 22 * 30 + 2 * 500 + 400);
    // Round 18: a line per track, each area under its track.
    expect(built?.totals.lines.map((line) => line.label)).toEqual([
      "Standard track",
      "L track (back track)",
      "Smart controller and power supply (2)",
      "Upper roof access",
    ]);
    expect(built?.totals.lines.flatMap((line) => line.areas ?? []).map((area) => area.label)).toEqual(["Front lower", "Upper gables"]);
  });

  it("drops areas they can't pick, and nothing ticked is no option", () => {
    expect(customOption(quote(keenans), [3, 4, 9], "full")).toBeNull();
    expect(customOption(quote(keenans), [1, 3], "full")?.offer.runs).toEqual([1]);
  });

  it("applies the minimum and a percent deal the same way as everywhere else", () => {
    const withMinimum = customOption(quote(keenans, { min_job_total: 2500 }), [1], "full");
    expect(withMinimum?.totals.subtotal).toBe(2500);
    const withDeal = customOption(quote(keenans, { discounts: [{ label: "Black Friday", amount: 0, percent: 10 }] }), [0], "full");
    expect(withDeal?.totals.subtotal).toBe(Math.round((64 * 23 + 500) * 0.9 * 100) / 100);
  });

  it("keeps their saved build apart from Keenan's options, and names it kindly to them", () => {
    const saved = quote([...keenans, { id: "customer", name: CUSTOMER_OFFER_NAME, runs: [0, 2], from_customer: true }]);
    expect(customerOffer(saved)?.runs).toEqual([0, 2]);
    expect(buildableRuns(saved)).toEqual([0, 1, 2]);
    expect(customerChoice(CUSTOMER_OFFER_NAME)).toBe("Your own option");
    expect(customerChoiceInSentence(CUSTOMER_OFFER_NAME)).toBe("your own option");
    // 64 ft at $23, 22 ft of J track at $30, one box, upper access with an upper gable.
    expect(offerChoice(saved, "customer")?.total).toBe("$3,032");
  });

  it("saves the customer's one beside Keenan's four, never counting toward them", () => {
    const five = parseOffers(
      [
        { id: "a", name: "A", runs: [0] },
        { id: "b", name: "B", runs: [1] },
        { id: "c", name: "C", runs: [2] },
        { id: "d", name: "D", runs: [3] },
        { id: "e", name: "E", runs: [0, 1] },
        { id: "customer", name: CUSTOMER_OFFER_NAME, runs: [0, 2], from_customer: true },
      ],
      runs.length,
    );
    const saved = offersForSave(five, runs.length);
    expect(saved.map((offer) => offer.id)).toEqual(["a", "b", "c", "d", "customer"]);
    expect(saved.at(-1)?.fromCustomer).toBe(true);
  });
});

describe("About your track", () => {
  it("names each track the shown options use, Hat first", () => {
    expect(tracksUsed(quote(keenans))).toEqual(["hat", "j"]);
    expect(tracksUsed(quote([{ id: "lower", name: "Lower", runs: [0, 1] }]))).toEqual(["hat"]);
  });

  it("leaves out a track only a hidden option uses", () => {
    const hiddenDouble = quote([
      { id: "lower", name: "Lower", runs: [0] },
      { id: "j", name: "J", runs: [2], hidden: true },
    ]);
    expect(tracksUsed(hiddenDouble)).toEqual(["hat"]);
  });

  it("has words for every track, in Settings", () => {
    // Round 18: Hat track reads Standard track, J track reads L track (back track).
    expect(DEFAULT_LINES.link_track_hat).toMatch(/standard track/i);
    expect(DEFAULT_LINES.link_track_double).toMatch(/Double track/);
    expect(DEFAULT_LINES.link_track_j).toMatch(/L track \(back track\)/);
    expect(Object.values(DEFAULT_LINES).join(" ")).not.toMatch(/\b(Hat|J) track\b/);
  });
});

describe("documents on the link", () => {
  it("keeps the standard set and a customer's own files in their own places", () => {
    const id = "0f8fad5b-d9cb-469f-a165-70867728950e";
    const lead = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
    expect(libraryPath(id, "application/pdf")).toBe(`library/${id}.pdf`);
    expect(isLibraryPath(libraryPath(id, "image/png"))).toBe(true);
    expect(leadUploadPath(lead, id, "image/jpeg")).toBe(`leads/${lead}/${id}.jpg`);
    expect(isLeadUploadPath(lead, leadUploadPath(lead, id, "image/jpeg"))).toBe(true);
    expect(isLeadUploadPath(lead, leadUploadPath("8c9e6679-7425-40de-944b-e07fc1f90ae7", id, "image/jpeg"))).toBe(false);
  });

  it("names files and sizes in plain words", () => {
    expect(nameFromFile("Our_warranty.pdf")).toBe("Our warranty");
    expect(documentFacts("application/pdf", 1_234_567)).toBe("PDF, 1.2 MB");
    expect(documentFacts("image/jpeg", 340_000)).toBe("Photo, 340 KB");
    expect(documentFileName("Our warranty", "application/pdf")).toBe("Our warranty.pdf");
    expect(documentFileName("FAQ.pdf", "application/pdf")).toBe("FAQ.pdf");
    expect(documentFileName("Site: plan / v2", "image/png")).toBe("Site plan v2.png");
  });

  it("reads the database's list and drops anything without a file", () => {
    expect(
      parseLinkDocuments([
        { id: "1", name: " Our warranty ", path: "library/a.pdf", content_type: "application/pdf", size: 1000 },
        { id: "2", name: "", path: "leads/x/b.jpg", content_type: "image/jpeg", size: "2000" },
        { id: "3", name: "No file", path: "" },
        "nonsense",
      ]),
    ).toEqual([
      { id: "1", name: "Our warranty", path: "library/a.pdf", contentType: "application/pdf", size: 1000 },
      { id: "2", name: "Document", path: "leads/x/b.jpg", contentType: "image/jpeg", size: 2000 },
    ]);
    expect(parseLinkDocuments(null)).toEqual([]);
  });
});

describe("the agreement", () => {
  it("shows only with text, and says when it was signed", () => {
    expect(parseLinkAgreement(null)).toBeNull();
    expect(parseLinkAgreement({ text: "   " })).toBeNull();
    expect(parseLinkAgreement({ text: "We agree.", signed: null })).toEqual({ text: "We agree.", signed: null });
    expect(
      parseLinkAgreement({
        text: "We agree.",
        signed: { signer_name: "Jane Smith", signed_at: "2026-11-12T04:00:00Z", offer_id: "full", offer_name: "Full front" },
      })?.signed,
    ).toEqual({ signerName: "Jane Smith", signedAt: "2026-11-12T04:00:00Z", offerId: "full", offerName: "Full front" });
  });

  const record = {
    signer_name: " Jane Smith ",
    signed_at: "2026-11-12T04:41:00Z",
    offer_id: "full",
    offer_name: "Full front",
    signature_png: "data:image/png;base64,iVBORw0KGgo=",
    agreement_text: "Paragraph one.\n\nParagraph two.",
    quote: {
      runs,
      offers: keenans.filter((offer) => offer.hidden !== true),
      price_per_ft: 23,
      box_price: 500,
      box_count: 1,
      adders: [],
      discounts: [],
      colour_timing: "stock",
      rush_fee: null,
      upper_access_fee: 200,
      upper_gable_access_fee: 400,
      min_job_total: null,
      gst_enabled: true,
      gst_rate: 0.05,
      gst_number: "123456789 RT0001",
      track_colour_name: "White",
      track_custom: false,
      valid_until: "2027-03-01",
      company: { name: "Vesper Lighting", phone: "(403) 555-0100", email: "info@example.com", address: "Calgary" },
    },
    lead: { first_name: "Jane", last_name: "Smith", address: "1 Test St SW", city: "Calgary" },
  };

  it("prices the signed option from the saved quote, with GST as a formal document shows it", () => {
    const signed = signedAgreement(record);
    expect(signed).not.toBeNull();
    // 92 ft at $23 + 22 ft of J track at $30 + box + upper access with a gable.
    const subtotal = 92 * 23 + 22 * 30 + 500 + 400;
    expect(signed).toMatchObject({
      signerName: "Jane Smith",
      customerName: "Jane Smith",
      address: "1 Test St SW, Calgary",
      option: "Full front",
      subtotal: `$${subtotal.toLocaleString("en-CA")}`,
      gst: `$${(subtotal * 0.05).toLocaleString("en-CA", { minimumFractionDigits: 2 })}`,
      gstNumber: "123456789 RT0001",
      trackColour: "White",
      signedTime: expect.stringMatching(/10:41/),
    });
    // The same sections as the link, each track's areas listed under it.
    expect(signed?.lines.map((line) => line.label).slice(0, 2)).toEqual(["Standard track", "L track (back track)"]);
    expect(signed?.lines[1].areas).toEqual([{ label: "Upper gables", detail: "22 ft", amount: "$660" }]);
    expect(signedFileName(signed!, "2026-11-11")).toBe("Vesper agreement, Jane Smith, 2026-11-11.pdf");
  });

  it("with GST off, shows the total only and no GST", () => {
    const signed = signedAgreement({ ...record, quote: { ...record.quote, gst_enabled: false } });
    expect(signed?.gst).toBeNull();
    expect(signed?.gstNumber).toBeNull();
    expect(signed?.total).toBe(signed?.subtotal);
  });

  it("hands out nothing for an option the saved quote doesn't have", () => {
    expect(signedAgreement({ ...record, offer_id: "gone" })).toBeNull();
    expect(signedAgreement({ nonsense: true })).toBeNull();
  });

  it("makes a PDF", async () => {
    const { agreementPdf } = await import("@/lib/quote-link/agreement-pdf");
    const pdf = await agreementPdf(signedAgreement(record)!);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1000);
  });
});

describe("Keenan's side of the customer's build", () => {
  const context: QuoteContext = {
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
      trackPrices: { double: 28, j: 30 },
    },
    today: "2026-11-11",
    lead: { colourKind: "list", colourText: "White" },
  };
  const draft: QuoteDraft = {
    quoteId: "quote-1",
    runs,
    boxCount: 1,
    pricePerFt: 23,
    boxPrice: 500,
    adders: [],
    discounts: [],
    colourTiming: "stock",
    rushFee: null,
    upperAccessFee: 200,
    upperGableAccessFee: 400,
    financingOffered: false,
    validUntil: "2026-12-01",
    offers: [...keenans, { id: "customer", name: CUSTOMER_OFFER_NAME, runs: [0, 2], boxes: null, upper_access: null, from_customer: true }],
    meetingOffer: null,
    meetingInstallOn: null,
    updatedAt: "2026-11-12T04:00:00+00:00",
  };

  it("opens their build in the editor with his offers, and saving keeps it and each area's track", () => {
    const state = quoteStateFromDraft(draft, context);
    expect(state.offers.map((offer) => offer.id)).toEqual(["full", "lower", "back", "customer"]);
    expect(state.offers.at(-1)).toMatchObject({ name: CUSTOMER_OFFER_NAME, runs: [0, 2], fromCustomer: true });
    expect(state.runs[2]).toMatchObject({ track: "j", trackRate: 30 });

    const save = quoteSaveInput(state, context.pricing, "lead-1", "lead");
    expect(save.offers.map((offer) => offer.id)).toEqual(["full", "lower", "back", "customer"]);
    expect(save.offers.at(-1)).toMatchObject({ id: "customer", fromCustomer: true, runs: [0, 2] });
    expect(save.offers.find((offer) => offer.id === "back")?.hidden).toBe(true);
    expect(save.runs[2]).toMatchObject({ name: "Upper gables", track: "j", trackRate: 30 });
    expect(save.runs[0].track ?? null).toBeNull();
  });

  it("reads as the customer's own option to them, and as his name once he renames it", () => {
    expect(customerOfferName(CUSTOMER_OFFER_NAME)).toBe(OWN_OPTION);
    expect(customerOfferName("Front and gables")).toBe("Front and gables");
    expect(customerOfferName("Full wrap")).toBe("Full wrap");
  });

  it("puts the signing on the timeline as the customer's doing, with no price", () => {
    const event = { from_status: null, to_status: null, type: "agreement_signed" as const, payload: { option: "Full front", signer: "Jane Smith" } };
    expect(describeEvent(event)).toBe("Signed the agreement for Full front, as Jane Smith.");
    expect(describeEvent({ ...event, payload: {} })).toBe("Signed the agreement.");
    expect(isCustomerEvent("agreement_signed")).toBe(true);
    expect(describeEvent(event)).not.toMatch(/\$/);
  });
});
