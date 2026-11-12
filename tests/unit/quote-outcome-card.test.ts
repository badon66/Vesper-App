import { describe, expect, it } from "vitest";
import { commissionFor, commissionQuoteFromRow } from "@/lib/pay/commission";
import { priceQuote } from "@/lib/pricing";
import { priceSelection, quoteFromRow } from "@/lib/quote-link/view";
import {
  acceptedOption,
  acceptOptions,
  bookedOfferId,
  currentCommission,
  installedWords,
  notInstalledWords,
  offerCommissionWords,
  optionWords,
  pickOutcomeQuote,
  previewCommission,
  quoteInputsFromRow,
  runsFromJson,
  standingCommission,
  startingChoice,
  choiceSources,
  voidWords,
  type BookedLink,
  type CommissionRow,
  type OfferQuoteRow,
} from "@/lib/quotes/outcome-card";
import { parseOffers } from "@/lib/quotes/offers";
import { commissionLine, type CommissionLine } from "@/lib/quotes/outcome";

// Keenan's outcome card on the lead page (round 8, 2026-11-09): which quote
// it is about, the offers Accepted lists (round 9, 2026-11-10), and the
// commission line.

const runs = runsFromJson([
  { name: "Front", feet: 100, level: "lower" },
  { name: "Garage", feet: 60, level: "lower" },
  { name: "Front upper", feet: 40, level: "upper" },
]);

const quoteRow = {
  runs: [
    { name: "Front", feet: 100, level: "lower" },
    { name: "Garage", feet: 60, level: "lower" },
  ],
  box_count: 1,
  price_per_ft: 23,
  box_price: 500,
  discounts: [{ label: "Neighbour", amount: 150 }],
};

const zane = { name: "Zane", role: "sales" };

function earning(over: Partial<CommissionRow>): CommissionRow {
  return {
    id: "e1",
    profile_id: "p-zane",
    amount: 201.5,
    status: "pending",
    payable_at: null,
    paid_at: null,
    note: null,
    quote_id: "q1",
    source_quote_id: "q1",
    created_at: "2026-11-09T20:00:00Z",
    ...over,
  };
}

describe("runs as stored", () => {
  it("keeps each run in its place, so positions still point at the right one", () => {
    expect(runsFromJson([{ name: "Front", feet: 80, level: "upper" }, "junk", { feet: "12" }])).toEqual([
      { name: "Front", feet: 80, level: "upper" },
      { name: "", feet: 0, level: "lower" },
      { name: "", feet: 0, level: "lower" },
    ]);
    expect(runsFromJson(null)).toEqual([]);
    expect(runsFromJson({ runs: [] })).toEqual([]);
  });

  it("keeps a run's part when it is one of the parts, so an upper gable is priced as one", () => {
    expect(
      runsFromJson([
        { name: "Peak", feet: 20, level: "upper", part: "gable" },
        { name: "Roof", feet: 10, level: "upper", part: "roof" },
      ]),
    ).toEqual([
      { name: "Peak", feet: 20, level: "upper", part: "gable" },
      { name: "Roof", feet: 10, level: "upper" },
    ]);
  });
});

describe("the runs in words", () => {
  it("names the full quote and fewer runs with how many runs and the feet, never a price", () => {
    expect(optionWords(runs, null)).toEqual({ label: "Full quote", detail: "3 runs, 200 ft" });
    expect(optionWords(runs, [0, 1, 2])).toEqual({ label: "Full quote", detail: "3 runs, 200 ft" });
    expect(optionWords(runs, [1])).toEqual({ label: "Garage only", detail: "1 run, 60 ft" });
    expect(optionWords(runs, [0, 1])).toEqual({ label: "Front and Garage", detail: "2 runs, 160 ft" });
    // Runs no longer on the quote read as the full quote, as round 8 did.
    expect(optionWords(runs, [2, 5])).toEqual({ label: "Full quote", detail: "3 runs, 200 ft" });
    expect(optionWords(runsFromJson([{ name: "Front", feet: 90 }]), null)).toEqual({
      label: "Full quote",
      detail: "1 run, 90 ft",
    });
  });
});

// A quote with offers, priced like tests/unit/offers.test.ts: the full wrap
// is $4,200; Lower level and Garage both rise to the $2,500 minimum, Lower
// level with more feet; Front only has no runs yet, so it isn't listed.
const offerQuote: OfferQuoteRow = {
  runs: [
    { name: "Front", feet: 60, level: "lower", part: "eave" },
    { name: "Garage", feet: 30, level: "lower", part: "garage" },
    { name: "Upper front", feet: 40, level: "upper", part: "eave" },
    { name: "Upper gable", feet: 20, level: "upper", part: "gable" },
  ],
  offers: [
    { id: "front", name: "Front only", runs: [] },
    { id: "lower", name: "Lower level", runs: [0, 1] },
    { id: "full", name: "Full wrap", runs: [0, 1, 2, 3] },
    { id: "garage", name: "Garage", runs: [1] },
  ],
  box_count: 1,
  price_per_ft: 23,
  box_price: 500,
  adders: [],
  discounts: [{ label: "Neighbour discount", amount: 150 }],
  colour_timing: null,
  rush_fee: 350,
  upper_access_fee: 200,
  upper_gable_access_fee: 400,
  min_job_total: 2500,
  gst_enabled: false,
  gst_rate: 0.05,
};

const bookedOn = (over: Partial<BookedLink>): BookedLink => ({
  booked_at: "2026-11-10T21:00:00Z",
  booked_option: null,
  booked_offer: null,
  booked_selection: null,
  ...over,
});

describe("the quote's own prices", () => {
  it("are read the way the customer's link reads them, so the sheet and the link agree", () => {
    for (const row of [
      offerQuote,
      { ...offerQuote, colour_timing: "rush", gst_enabled: true },
      {
        ...offerQuote,
        adders: [
          { label: "Extra outlet", amount: 150 },
          { label: "Ladder work", amount: 250, upper_only: true },
        ],
        discounts: [{ label: "Referral credit", amount: "75" }],
        min_job_total: null,
        upper_access_fee: null,
        upper_gable_access_fee: null,
      },
    ] as OfferQuoteRow[]) {
      const link = quoteFromRow(row)!;
      // Round 17: the link lists every area on its own line; the same cents.
      expect(priceQuote({ ...quoteInputsFromRow(row), perArea: true })).toEqual(priceSelection(link, null));
      expect(priceQuote(quoteInputsFromRow(row)).total).toBe(priceSelection(link, null).total);
    }
  });

  it("charge the rush colour fee only on a rush quote, and keep an upper-only line upper-only", () => {
    expect(quoteInputsFromRow(offerQuote).rushFee).toBeNull();
    expect(quoteInputsFromRow({ ...offerQuote, colour_timing: "rush" }).rushFee).toBe(350);
    expect(quoteInputsFromRow({ ...offerQuote, colour_timing: "someday" }).colourTiming).toBeNull();
    expect(
      quoteInputsFromRow({ ...offerQuote, adders: [{ label: "Ladder work", amount: 250, upper_only: true }, "junk"] }).adders,
    ).toEqual([{ label: "Ladder work", amount: 250, upperOnly: true }]);
  });
});

describe("the offer they booked on their link", () => {
  const offers = parseOffers(offerQuote.offers, 4);

  it("is the one they booked by its id while it is on the quote with runs", () => {
    expect(bookedOfferId(offers, 4, bookedOn({ booked_offer: "lower", booked_option: "Lower level", booked_selection: [0, 1] }))).toBe(
      "lower",
    );
  });

  it("is otherwise the offer with exactly the runs they booked", () => {
    // An offer taken off since: its runs still name one.
    expect(bookedOfferId(offers, 4, bookedOn({ booked_offer: "gone", booked_selection: [1] }))).toBe("garage");
    // A booking from before offers: every run is the full wrap.
    expect(bookedOfferId(offers, 4, bookedOn({ booked_option: "Recommended package", booked_selection: [0, 1, 2, 3] }))).toBe("full");
    expect(bookedOfferId(parseOffers([], 4), 4, bookedOn({ booked_selection: [0, 1, 2, 3] }))).toBe("full");
    expect(bookedOfferId(offers, 4, bookedOn({ booked_selection: [1, 0] }))).toBe("lower");
  });

  it("is none with no booking, runs from an older quote, or runs no offer has", () => {
    expect(bookedOfferId(offers, 4, null)).toBeNull();
    expect(bookedOfferId(offers, 4, bookedOn({ booked_at: null, booked_offer: "lower", booked_selection: [0, 1] }))).toBeNull();
    expect(bookedOfferId(offers, 4, bookedOn({ booked_selection: [1, 7] }))).toBeNull();
    expect(bookedOfferId(offers, 4, bookedOn({ booked_selection: [1, 1] }))).toBeNull();
    expect(bookedOfferId(offers, 4, bookedOn({ booked_selection: [0, 2] }))).toBeNull();
    // An offer with no runs yet can't have been booked.
    expect(bookedOfferId(offers, 4, bookedOn({ booked_offer: "front", booked_selection: [] }))).toBeNull();
  });
});

describe("the offers Accepted lists", () => {
  const preview = (positions: number[] | null, boxes: number | null) =>
    previewCommission({ receiver: zane, existing: null, quote: offerQuote, positions, boxes, rate: 0.05 });
  const earningOf = (amount: number): CommissionLine => ({
    kind: "earning",
    amount,
    setterName: "Zane",
    status: "pending",
    payableAt: null,
    paidAt: null,
  });

  it("are biggest first, each with what it covers, its price and the commission on its own lights and boxes", () => {
    const options = acceptOptions({ quote: offerQuote, link: null, commission: preview });
    expect(options).toEqual([
      // 150 ft x $23 + $500 - $150 = $3,800; 5% is $190. Upper access and
      // the minimum never count.
      { id: "full", positions: null, boxes: null, label: "Full wrap", detail: "Front, garage and gable, upper and lower: 150 ft", total: "$4,200", booked: false, meeting: false, commission: earningOf(190) },
      // 90 ft x $23 + $500 - $150 = $2,420; 5% is $121.
      { id: "lower", positions: [0, 1], boxes: null, label: "Lower level", detail: "Front and garage, lower: 90 ft", total: "$2,500", booked: false, meeting: false, commission: earningOf(121) },
      // 30 ft x $23 + $500 - $150 = $1,040; 5% is $52.
      { id: "garage", positions: [1], boxes: null, label: "Garage", detail: "Garage, lower: 30 ft", total: "$2,500", booked: false, meeting: false, commission: earningOf(52) },
    ]);
    // The database's way: the same runs give the same amount.
    expect(commissionFor(commissionQuoteFromRow(offerQuote, [0, 1]), 0.05).amount).toBe(121);
    expect(startingChoice(options)).toBe(0);
  });

  it("count an offer's own control boxes, in its price and its commission", () => {
    const options = acceptOptions({
      quote: { ...offerQuote, offers: [{ id: "full", name: "Full wrap", runs: [0, 1, 2, 3], boxes: 2 }] },
      link: null,
      commission: preview,
    });
    // 150 ft x $23 + 2 x $500 + $400 - $150 = $4,700; the commission's
    // base is 150 ft x $23 + 2 x $500 - $150 = $4,300; 5% is $215.
    expect(options).toMatchObject([{ id: "full", positions: null, boxes: 2, total: "$4,700", commission: earningOf(215) }]);
    expect(commissionFor(commissionQuoteFromRow({ ...offerQuote, box_count: 2 }, null), 0.05).amount).toBe(215);
  });

  it("mark the one they booked and start on it", () => {
    const options = acceptOptions({
      quote: offerQuote,
      link: bookedOn({ booked_offer: "lower", booked_option: "Lower level", booked_selection: [0, 1] }),
      commission: preview,
    });
    expect(options.map((option) => [option.id, option.booked])).toEqual([
      ["full", false],
      ["lower", true],
      ["garage", false],
    ]);
    expect(startingChoice(options)).toBe(1);
  });

  it("show the total with + GST while GST is on, and no commission on Keenan's own lead", () => {
    const options = acceptOptions({
      quote: { ...offerQuote, gst_enabled: true },
      link: null,
      commission: (positions, boxes) =>
        previewCommission({ receiver: { name: "Keenan", role: "owner" }, existing: null, quote: offerQuote, positions, boxes, rate: 0.05 }),
    });
    expect(options[0].total).toBe("$4,200 + GST");
    expect(options.map((option) => offerCommissionWords(option.commission))).toEqual(["No commission", "No commission", "No commission"]);
    expect(offerCommissionWords(earningOf(121))).toBe("$121 commission");
  });

  it("read a quote made before offers as one full wrap", () => {
    const options = acceptOptions({ quote: { ...offerQuote, offers: [] }, link: null, commission: preview });
    expect(options).toEqual([
      { id: "full", positions: null, boxes: null, label: "Full wrap", detail: "Front, garage and gable, upper and lower: 150 ft", total: "$4,200", booked: false, meeting: false, commission: earningOf(190) },
    ]);
  });

  it("offer the full quote while no offer covers a run yet, so Accepted is never stuck", () => {
    const options = acceptOptions({
      quote: { ...offerQuote, offers: [{ id: "front", name: "Front only", runs: [] }] },
      link: null,
      commission: preview,
    });
    expect(options).toEqual([
      { id: "full", positions: null, boxes: null, label: "Full quote", detail: "4 runs, 150 ft", total: "$4,200", booked: false, meeting: false, commission: earningOf(190) },
    ]);
  });
});

describe("what they said yes to, on the card", () => {
  it("is the offer whose runs they accepted, by its name", () => {
    expect(acceptedOption(offerQuote, [0, 1])).toEqual({ label: "Lower level", detail: "Front and garage, lower: 90 ft" });
    expect(acceptedOption(offerQuote, null)).toEqual({ label: "Full wrap", detail: "Front, garage and gable, upper and lower: 150 ft" });
    expect(acceptedOption({ ...offerQuote, offers: [] }, null)).toEqual({ label: "Full wrap", detail: "Front, garage and gable, upper and lower: 150 ft" });
  });

  it("falls back to the runs in words when no offer matches", () => {
    expect(acceptedOption(offerQuote, [0, 2])).toEqual({ label: "Front and Upper front", detail: "2 runs, 100 ft" });
    expect(acceptedOption(offerQuote, [2])).toEqual({ label: "Upper front only", detail: "1 run, 40 ft" });
    expect(acceptedOption({ ...offerQuote, offers: [{ id: "lower", name: "Lower level", runs: [0, 1] }] }, null)).toEqual({
      label: "Full quote",
      detail: "4 runs, 150 ft",
    });
  });
});

describe("which quote the card is about", () => {
  it("is the accepted one while there is one, even under a newer draft", () => {
    const rows = [
      { id: "new-draft", status: "draft", created_at: "2026-11-10T01:00:00Z" },
      { id: "yes", status: "accepted", created_at: "2026-11-09T01:00:00Z" },
    ];
    expect(pickOutcomeQuote(rows)?.id).toBe("yes");
  });

  it("is otherwise the newest of any status, declined and cancelled included", () => {
    const rows = [
      { id: "old", status: "draft", created_at: "2026-11-01T01:00:00Z" },
      { id: "no", status: "declined", created_at: "2026-11-09T01:00:00Z" },
    ];
    expect(pickOutcomeQuote(rows)?.id).toBe("no");
    expect(pickOutcomeQuote([])).toBeNull();
  });
});

describe("the lead's commission", () => {
  it("is the pending or paid one first, else the newest voided one from this quote", () => {
    const voided = earning({ id: "v", status: "void", quote_id: null, created_at: "2026-11-10T00:00:00Z" });
    const pending = earning({ id: "p", amount: 180, quote_id: "q1", created_at: "2026-11-09T00:00:00Z" });
    expect(currentCommission([voided, pending], "q1")?.id).toBe("p");
    expect(currentCommission([voided], "q1")?.id).toBe("v");
    // A void from another quote on the lead says nothing about this one.
    expect(currentCommission([earning({ status: "void", quote_id: null, source_quote_id: "q0" })], "q1")).toBeNull();
    expect(currentCommission([], "q1")).toBeNull();
  });
});

describe("the Accepted sheet's preview", () => {
  const base = { quote: quoteRow, rate: 0.05, existing: null };

  it("is the commission rate of the lights and control boxes after discounts", () => {
    // (100 + 60) ft x $23 + $500 - $150 = $4,030; 5% is $201.50.
    const line = previewCommission({ ...base, receiver: zane, positions: null });
    expect(line).toEqual({ kind: "earning", amount: 201.5, setterName: "Zane", status: "pending", payableAt: null, paidAt: null });
    expect(commissionLine(line)).toBe("$201.50 to Zane, coming once installed.");
  });

  it("counts only the runs of a smaller offer", () => {
    // 60 ft x $23 + $500 - $150 = $1,730; 5% is $86.50.
    const line = previewCommission({ ...base, receiver: zane, positions: [1] });
    expect(line.kind === "earning" && line.amount).toBe(86.5);
  });

  it("is none on Keenan's own lead, and none new once one is paid", () => {
    const owner = previewCommission({ ...base, receiver: { name: "Keenan", role: "owner" }, positions: null });
    expect(commissionLine(owner)).toBe("No commission: the lead is yours.");
    const paid = previewCommission({ ...base, receiver: zane, positions: null, existing: earning({ status: "paid" }) });
    expect(paid).toEqual({ kind: "none", reason: "already_paid" });
    expect(previewCommission({ ...base, receiver: { name: "Crew", role: "crew" }, positions: null })).toEqual({
      kind: "none",
      reason: null,
    });
  });

  it("shows a commission still pending at its own amount", () => {
    const line = previewCommission({ ...base, receiver: zane, positions: null, existing: earning({ amount: 99 }) });
    expect(line.kind === "earning" && line.amount).toBe(99);
  });
});

describe("the commission as it stands", () => {
  const names = new Map([["p-zane", "Zane Lee"]]);

  it("reads from the earning, named by who it went to", () => {
    expect(commissionLine(standingCommission(earning({}), zane, names))).toBe("$201.50 to Zane Lee, coming once installed.");
    expect(commissionLine(standingCommission(earning({ payable_at: "2026-11-20T18:00:00Z" }), zane, names))).toBe(
      "$201.50 to Zane Lee, owed now. Mark it paid in Pay.",
    );
    expect(
      commissionLine(standingCommission(earning({ status: "paid", paid_at: "2026-11-27T18:00:00Z" }), zane, names)),
    ).toBe("$201.50 to Zane Lee, paid Nov 27.");
    expect(commissionLine(standingCommission(earning({ status: "void" }), zane, names))).toBe("$201.50 to Zane Lee, voided.");
  });

  it("says why there is none", () => {
    expect(standingCommission(null, { name: "Keenan", role: "owner" }, names)).toEqual({ kind: "none", reason: "owner_lead" });
    expect(standingCommission(null, zane, names)).toEqual({ kind: "none", reason: null });
  });
});

describe("what a tap does to the commission", () => {
  const names = new Map([["p-zane", "Zane"]]);
  const line = (over: Partial<CommissionRow>) => standingCommission(earning(over), zane, names);

  it("voids an unpaid one on Cancelled and Undo, and leaves a paid one paid", () => {
    expect(voidWords(line({}))).toBe("The $201.50 commission to Zane is voided.");
    expect(voidWords(line({ payable_at: "2026-11-20T18:00:00Z" }))).toBe("The $201.50 commission to Zane is voided.");
    expect(voidWords(line({ status: "paid", paid_at: "2026-11-27T18:00:00Z" }))).toBe(
      "The $201.50 commission to Zane is already paid, so it stays paid.",
    );
    expect(voidWords(line({ status: "void" }))).toBeNull();
    expect(voidWords({ kind: "none", reason: "owner_lead" })).toBeNull();
  });

  it("makes one still coming owed on Installed", () => {
    expect(installedWords(line({}))).toBe("The $201.50 commission to Zane becomes owed, ready to mark paid in Pay.");
    expect(installedWords(line({ payable_at: "2026-11-20T18:00:00Z" }))).toBeNull();
    expect(installedWords(line({ status: "paid" }))).toBeNull();
    expect(installedWords({ kind: "none", reason: null })).toBeNull();
  });

  it("makes an owed one wait for the install again on Not installed yet, and leaves a paid one paid", () => {
    expect(notInstalledWords(line({ payable_at: "2026-11-20T18:00:00Z" }))).toBe(
      "The $201.50 commission to Zane waits for the install again.",
    );
    expect(notInstalledWords(line({ status: "paid", paid_at: "2026-11-27T18:00:00Z" }))).toBe(
      "The $201.50 commission to Zane is already paid, so it stays paid.",
    );
    expect(notInstalledWords(line({ status: "void" }))).toBeNull();
    expect(notInstalledWords({ kind: "none", reason: "owner_lead" })).toBeNull();
  });
});

describe("where Accepted starts", () => {
  const option = (label: string, booked: boolean, meeting: boolean) => ({ label, booked, meeting });
  it("starts on the option they booked on their link, else the one chosen at the table, else the biggest (round 13)", () => {
    // Booked on the link and a different choice at the table: the booking wins.
    expect(startingChoice([option("Full wrap", false, false), option("Main floor", true, false), option("Front only", false, true)])).toBe(1);
    expect(startingChoice([option("Full wrap", false, false), option("Main floor", true, false)])).toBe(1);
    // Nothing booked: the table's choice.
    expect(startingChoice([option("Full wrap", false, false), option("Main floor", false, false), option("Front only", false, true)])).toBe(2);
    expect(startingChoice([option("Full wrap", false, false), option("Main floor", false, false)])).toBe(0);
  });

  it("says where the choice came from, both when they differ", () => {
    expect(choiceSources([option("Full wrap", false, false), option("Main floor", true, true)])).toEqual([
      "Chosen at the meeting: Main floor",
      "Booked on their link: Main floor",
    ]);
    expect(choiceSources([option("Full wrap", true, false), option("Main floor", false, true)])).toEqual([
      "Chosen at the meeting: Main floor",
      "Booked on their link: Full wrap",
    ]);
    expect(choiceSources([option("Full wrap", false, false)])).toEqual([]);
  });
});
