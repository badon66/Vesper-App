import { describe, expect, it } from "vitest";
import { DECK_LINE_DEFAULTS, DEFAULT_LINES, fillLine } from "@/lib/deck";
import { UPPER_ACCESS_LABEL } from "@/lib/pricing";
import {
  choiceInSentence,
  choiceLabel,
  cleanSelection,
  customerChoice,
  customerChoiceInSentence,
  customerTotal,
  inTouchAbout,
  leavesRunsOut,
  lineAmount,
  linkOffers,
  offerChoice,
  openingOffer,
  optionName,
  parseCustomerQuote,
  phoneHref,
  priceHoldPassed,
  colourSectionLines,
  priceSelection,
  quoteFromRow,
  quoteLinkMessage,
  quoteLinkUrl,
  runDetail,
  smsWithBody,
  TOKEN_PATTERN,
  type CustomerQuote,
} from "@/lib/quote-link/view";

// The customer quote link's pure parts (2026-11-02; round 9, options):
// reading the database's answer, pricing each option, which option the
// page opens on, what happens next, naming a choice in words, the link and
// the text Keenan sends.

const live = {
  state: "live",
  first_name: "Todd",
  last_name: "Dean",
  address: "12 Example Street SW",
  city: "Calgary",
  valid_until: "2026-11-16",
  quote: {
    runs: [
      { name: "Front", feet: 64, level: "lower" },
      { name: "Front upper", feet: 52, level: "upper" },
      { name: "Garage", feet: 28, level: "lower" },
      { name: "", feet: 22, level: "upper" },
    ],
    runs_fingerprint: "abc",
    price_per_ft: 23,
    box_price: 500,
    box_count: 1,
    adders: [
      { label: "Extra height", amount: 150, upper_only: true },
      { label: "Garage corner", amount: 75 },
    ],
    discounts: [{ label: "Neighbour discount", amount: 150 }],
    colour_timing: "stock",
    rush_fee_per_ft: null,
    min_job_total: 2500,
    gst_enabled: false,
    gst_rate: 0.05,
  },
  warranty: "10 years parts.\n5 years labour.",
  company: { name: "Vesper Lighting, Inc.", phone: "(403) 895-9915", email: "info@vesperlighting.ca", address: "448 Strathcona Drive SW, Calgary, AB T3H 1M3" },
  mockup_path: "u1/p1.jpg",
  selection: [2],
  booked_at: null,
  booked_option: null,
};

describe("reading the database's answer", () => {
  it("reads a live quote into the page's shape", () => {
    const view = parseCustomerQuote(live);
    expect(view.state).toBe("live");
    if (view.state !== "live") return;
    expect(view.firstName).toBe("Todd");
    expect(view.quote.adders[0]).toEqual({ label: "Extra height", amount: 150, upperOnly: true });
    expect(view.quote.adders[1].upperOnly).toBe(false);
    expect(view.selection).toEqual([2]);
    expect(view.company.phone).toBe("(403) 895-9915");
  });

  it("treats anything that isn't a live quote as closed, keeping the company contact", () => {
    for (const data of [
      { state: "closed", company: live.company },
      { state: "expired", company: live.company },
      null,
      "nope",
      { state: "live" },
      { state: "live", first_name: 4 },
    ]) {
      const view = parseCustomerQuote(data);
      expect(view.state).toBe("closed");
      if (view.state === "closed") expect(view.company.phone).toBe("(403) 895-9915");
    }
  });

  it("falls back to Vesper's own contact when Settings has a blank", () => {
    const view = parseCustomerQuote({ state: "closed", company: { phone: " ", email: null } });
    expect(view.state === "closed" && view.company).toEqual({
      name: "Vesper Lighting",
      phone: "(403) 895-9915",
      email: "info@vesperlighting.ca",
      address: "448 Strathcona Drive SW, Calgary, AB T3H 1M3",
    });
  });

  it("reads a quotes row the same way, so the lead page and the link agree", () => {
    const row = quoteFromRow({ ...live.quote, runs_fingerprint: undefined });
    const view = parseCustomerQuote(live);
    expect(row && view.state === "live" && priceSelection(row, null)).toEqual(view.state === "live" && priceSelection(view.quote, null));
    expect(quoteFromRow("junk")).toBeNull();
  });
});

describe("what they switched on", () => {
  const quote = (parseCustomerQuote(live) as Extract<ReturnType<typeof parseCustomerQuote>, { state: "live" }>).quote;

  it("cleans positions: on the quote, sorted, no repeats; every run or none is the Recommended package", () => {
    expect(cleanSelection(4, [2, 0, 2, 9, -1])).toEqual([0, 2]);
    expect(cleanSelection(4, [0, 1, 2, 3])).toBeNull();
    expect(cleanSelection(4, [])).toBeNull();
    expect(cleanSelection(4, null)).toBeNull();
  });

  it("prices the Recommended package and a smaller start from the quote's own prices", () => {
    expect(customerTotal(quote, null)).toBe("$4,393");
    // Front and Garage: 92 ft, no upper run so no Extra height.
    expect(customerTotal(quote, [0, 2])).toBe("$2,541");
    // Garage alone rises to the minimum.
    expect(customerTotal(quote, [2])).toBe("$2,500");
  });

  it("shows + GST on the total only while the quote has GST on", () => {
    expect(customerTotal({ ...quote, gstEnabled: true }, null)).toBe("$4,393 + GST");
  });

  it("names the option in words, never a price, the way the database does", () => {
    expect(optionName(quote.runs, null)).toBe("Recommended package");
    expect(optionName(quote.runs, [0, 1, 2, 3])).toBe("Recommended package");
    expect(optionName(quote.runs, [2, 0])).toBe("Start smaller: Front, Garage");
    expect(optionName(quote.runs, [3])).toBe("Start smaller: Run 4");
  });

  it("writes the choice the way people say it", () => {
    expect(choiceLabel("Recommended package")).toBe("Recommended package");
    expect(choiceLabel("Start smaller: Garage")).toBe("Garage only");
    expect(choiceLabel("Start smaller: Front, Garage")).toBe("Front and Garage");
    expect(choiceLabel("Start smaller: Front, Front upper, Garage")).toBe("Front, Front upper and Garage");
    expect(choiceInSentence("Recommended package")).toBe("the Recommended package");
    expect(choiceInSentence("Start smaller: Front, Garage")).toBe("Front and Garage");
  });

  it("describes a run with its feet and level", () => {
    expect(runDetail({ name: "Front", feet: 63.6, level: "lower" })).toBe("64 ft, lower level");
    expect(runDetail({ name: "Upper", feet: 22, level: "upper" })).toBe("22 ft, upper level");
  });
});

describe("the link and the text", () => {
  it("builds the link from the base address", () => {
    expect(quoteLinkUrl("https://quote.vesperlighting.ca/", "abcdefghijklmnopqrstuvwx")).toBe(
      "https://quote.vesperlighting.ca/q/abcdefghijklmnopqrstuvwx",
    );
    expect(TOKEN_PATTERN.test("abcdefghijklmnopqrstuvwx")).toBe(true);
    expect(TOKEN_PATTERN.test("short")).toBe(false);
    expect(TOKEN_PATTERN.test("abcdefghijklmnopqrstuv/=")).toBe(false);
  });

  it("writes a plain text Keenan can edit: their name, the link, the date, his number, no dashes", () => {
    const text = quoteLinkMessage({
      firstName: "Todd",
      link: "https://quote.vesperlighting.ca/q/abcdefghijklmnopqrstuvwx",
      validUntil: "2026-11-16",
      phone: "(403) 895-9915",
    });
    expect(text).toBe(
      "Hi Todd, here's your Vesper quote:\nhttps://quote.vesperlighting.ca/q/abcdefghijklmnopqrstuvwx\n\nYour price is held until Monday, November 16. When you're ready, tap Book my install, or call or text me with any questions.\n\nKeenan, Vesper Lighting\n(403) 895-9915",
    );
    expect(text).not.toMatch(/[–—]/);
    expect(quoteLinkMessage({ firstName: " ", link: "L", validUntil: null, phone: "P" }).startsWith("Here's your Vesper quote:\nL\n\nWhen you're ready")).toBe(true);
  });

  it("dials and texts Canadian numbers with the +1", () => {
    expect(phoneHref("(403) 895-9915", "tel")).toBe("tel:+14038959915");
    expect(phoneHref("1-403-895-9915", "sms")).toBe("sms:+14038959915");
  });

  it("opens a text with a first line they can keep or delete", () => {
    expect(smsWithBody("(403) 895-9915", "Hi Keenan, a question about the quote for 12 Example Street SW: ")).toBe(
      "sms:+14038959915?&body=Hi%20Keenan%2C%20a%20question%20about%20the%20quote%20for%2012%20Example%20Street%20SW%3A%20",
    );
  });
});

// The rework (2026-11-04): links that don't expire, the page's new parts,
// and the new prices as the customer's switches move them.
const rework = {
  ...live,
  valid_until: "2027-03-02",
  today: "2026-11-04",
  quote: {
    ...live.quote,
    price_per_ft: 24,
    runs: [
      { name: "Garage Gable", feet: 34, level: "lower", part: "gable" },
      { name: "Garage Eave", feet: 30, level: "lower" },
      { name: "Lower Porch Eave", feet: 13, level: "lower" },
      { name: "Upper Front Eave", feet: 32, level: "upper" },
      { name: "Two Upper Gables", feet: 30, level: "upper", part: "gable" },
      { name: "Upper & Lower Sides", feet: 26, level: "lower", part: "nonsense" },
    ],
    adders: [],
    discounts: [{ label: "Family & Friends Discount", amount: 300 }],
    colour_timing: "rush",
    rush_fee: 350,
    upper_access_fee: 200,
    upper_gable_access_fee: 400,
    track_colour_name: "Brown",
    track_custom: false,
  },
  service_call_fee: 200,
  christmas: {
    book_by_white: "2026-12-15",
    book_by_colour: "2026-12-08",
    season_end: "2026-12-24",
    words: { book_by: "Book by {date} to be lit up for Christmas.", white: "White line.", colour: "Colour line.", no_colour: "No colour.", after: "After." },
  },
  product_points: [
    { icon: "lightbulb", text: "RGBW lights with a dedicated white." },
    { icon: "rocket", text: "An icon Settings doesn't offer." },
    { icon: "plug", text: "  " },
  ],
  gallery: ["gallery/a.jpg", " "],
};

describe("the reworked page's answer", () => {
  const view = parseCustomerQuote(rework);
  const quote = view.state === "live" ? view.quote : null;

  it("reads the new parts: the hold date, banner, points, gallery and service call", () => {
    expect(view.state).toBe("live");
    if (view.state !== "live") return;
    expect([view.validUntil, view.today]).toEqual(["2027-03-02", "2026-11-04"]);
    expect(view.christmas).toMatchObject({ bookByWhite: "2026-12-15", bookByColour: "2026-12-08", seasonEnd: "2026-12-24" });
    // An unknown icon is a tick; a blank line is left out.
    expect(view.productPoints).toEqual([
      { icon: "lightbulb", text: "RGBW lights with a dedicated white." },
      { icon: "check", text: "An icon Settings doesn't offer." },
    ]);
    // An answer without the round 9 parts: nothing initialled, no day, nothing listed.
    expect(view.nextSteps).toEqual({ colourConfirmed: false, installOn: null, whatWeNeed: null });
    expect(view.gallery).toEqual(["gallery/a.jpg"]);
    expect(view.serviceCallFee).toBe(200);
    expect(view.quote.trackColourName).toBe("Brown");
  });

  it("gives every run a part: the stored one, or the guess from its name", () => {
    expect(quote?.runs.map((run) => run.part)).toEqual(["gable", "garage", "porch", "eave", "gable", "sides"]);
  });

  it("leaves out what Settings hasn't set, and reads a take 1 answer without the new parts", () => {
    const bare = parseCustomerQuote({ ...rework, christmas: null, service_call_fee: null, product_points: "junk", gallery: null });
    expect(bare.state === "live" && [bare.christmas, bare.serviceCallFee, bare.productPoints, bare.gallery]).toEqual([null, null, [], []]);
    const take1 = parseCustomerQuote(live);
    expect(take1.state === "live" && [take1.today, take1.christmas, take1.quote.rushFee, take1.quote.upperAccessFee]).toEqual([null, null, null, null]);
  });

  it("prices the full quote with the upper gable amount and the rush colour fee", () => {
    if (!quote) throw new Error("not live");
    const priced = priceSelection(quote, null);
    // Round 17: every area on its own line, the same $3,960 of lights.
    expect(priced.lines.map((line) => [line.label, line.amount])).toEqual([
      ["Garage Gable", 816],
      ["Garage Eave", 720],
      ["Lower Porch Eave", 312],
      ["Upper Front Eave", 768],
      ["Two Upper Gables", 720],
      ["Upper & Lower Sides", 624],
      ["Control box", 500],
      [UPPER_ACCESS_LABEL, 400],
      ["Rush colour fee", 350],
      ["Family & Friends Discount", -300],
    ]);
    expect(priced.lines.find((line) => line.label === "Rush colour fee")?.detail).toBe("Brown track, made to order this season");
    expect(customerTotal(quote, null)).toBe("$4,910");
  });

  it("moves upper access with their switches: the gable off drops it to $200, every upper run off drops it", () => {
    if (!quote) throw new Error("not live");
    const noGable = priceSelection(quote, [0, 1, 2, 3, 5]);
    expect(noGable.lines.find((line) => line.label === UPPER_ACCESS_LABEL)?.amount).toBe(200);
    const lowerOnly = priceSelection(quote, [0, 1, 2, 5]);
    expect(lowerOnly.lines.some((line) => line.label === UPPER_ACCESS_LABEL)).toBe(false);
    // Lower runs: 103 ft x $24 = $2,472 + $500 + $350 - $300 = $3,022.
    expect(customerTotal(quote, [0, 1, 2, 5])).toBe("$3,022");
  });

  it("never adds the new lines to a quote made before them", () => {
    const old = quoteFromRow({ ...rework.quote, rush_fee: null, upper_access_fee: null, upper_gable_access_fee: null });
    if (!old) throw new Error("unreadable");
    const labels = priceSelection(old, null).lines.map((line) => line.label);
    expect(labels).not.toContain(UPPER_ACCESS_LABEL);
    expect(labels).not.toContain("Rush colour fee");
  });

  it("words the track colour with one rule: white in stock, any other colour made to order, a rush fee only when charged (round 17)", () => {
    const words = DEFAULT_LINES;
    expect(colourSectionLines({ words, colourName: "White", custom: false, timing: "stock", rushFee: null })).toEqual({
      stock: "White is in stock and included.",
      // No cost claim: a colour this season may carry Keenan's rush fee.
      other: "Any other colour is made to order.",
      made: null,
      timing: null,
    });
    // No colour yet reads like white.
    expect(colourSectionLines({ words, colourName: null, custom: false, timing: null, rushFee: 350 }).other).toBe("Any other colour is made to order.");
    // This season is the default and included; a fee stored on a spring quote is never named.
    expect(colourSectionLines({ words, colourName: "Brown", custom: false, timing: "rush", rushFee: null })).toEqual({
      stock: null,
      other: null,
      made: "Brown is made to order.",
      timing: "Install this season, included.",
    });
    expect(colourSectionLines({ words, colourName: "Brown", custom: false, timing: "factory_order", rushFee: 350 }).timing).toBe(
      "Install in spring, included.",
    );
    // Keenan switched the fee on: named, exactly what the quote charges.
    expect(colourSectionLines({ words, colourName: "RAL 7016 Anthracite grey", custom: true, timing: "rush", rushFee: 350 })).toMatchObject({
      made: "RAL 7016 Anthracite grey is made to order.",
      timing: "Install this season, $350 rush colour fee.",
    });
    for (const timing of ["stock", "factory_order", "rush", null] as const) {
      for (const rushFee of [null, 0, 350]) {
        const lines = colourSectionLines({ words, colourName: "Brown", custom: false, timing, rushFee });
        const said = JSON.stringify(lines);
        if (!(timing === "rush" && rushFee === 350)) expect(said).not.toMatch(/rush|fee/i);
        expect(said).not.toMatch(/[\u2013\u2014!]|Christmas/);
      }
    }
  });

  it("holds prices until the date, and only says they may have changed after it", () => {
    expect(priceHoldPassed("2027-03-02", "2027-03-02")).toBe(false);
    expect(priceHoldPassed("2027-03-02", "2027-03-03")).toBe(true);
    expect(priceHoldPassed(null, "2027-03-03")).toBe(false);
    expect(priceHoldPassed("2027-03-02", null)).toBe(false);
  });

  it("calls the whole quote the full quote, in the customer's words", () => {
    expect(customerChoice("Recommended package")).toBe("The full quote");
    expect(customerChoiceInSentence("Recommended package")).toBe("the full quote");
    expect(customerChoice("Start smaller: Front, Garage")).toBe("Front and Garage");
  });

  it("reads one of Keenan's options by its own name, commas and all, never as runs", () => {
    for (const name of ["Main floor", "Full wrap", "Front, no gables", "Garage"]) {
      expect(choiceLabel(name)).toBe(name);
      expect(choiceInSentence(name)).toBe(name);
      expect(customerChoice(name)).toBe(name);
      expect(customerChoiceInSentence(name)).toBe(name);
    }
  });

  it("writes a discount with a true minus sign", () => {
    expect(lineAmount(-300)).toBe("\u2212$300");
    expect(lineAmount(400)).toBe("$400");
  });
});

// Round 9 (the five seats, 2026-11-10): Keenan's options in place of Start
// smaller, priced with the quote's own prices and each option's own box
// count; the page opens on the booked option, else the meeting's, else the
// biggest; What happens next in the meeting's words; after Accepted, only
// what was agreed.
const withOffers = {
  ...rework,
  quote: {
    ...rework.quote,
    offers: [
      { id: "full", name: "Full wrap", runs: [0, 1, 2, 3, 4, 5] },
      { id: "front", name: "Front only", runs: [] },
      { id: "garage", name: "Garage", runs: [1, 0], boxes: 2 },
      { id: "main", name: "Main floor", runs: [0, 1, 2, 5], boxes: null },
    ],
    financing_offered: true,
    meeting_offer: "main",
    accepted: false,
    accepted_offer: null,
  },
  next_steps: { colour_confirmed: true, install_on: "2026-11-21", what_we_need: "  An outlet near the box.\nYour Wi-Fi name.  " },
  selection_offer: "garage",
  booked_offer: null,
};

const liveOf = (data: unknown): CustomerQuote => {
  const view = parseCustomerQuote(data);
  if (view.state !== "live") throw new Error("not live");
  return view;
};

describe("the options", () => {
  const view = liveOf(withOffers);
  const { quote } = view;

  it("reads the options, the meeting's choice, financing and the next steps", () => {
    expect(quote.offers.map((offer) => [offer.id, offer.name, offer.runs, offer.boxes])).toEqual([
      ["full", "Full wrap", [0, 1, 2, 3, 4, 5], null],
      ["front", "Front only", [], null],
      ["garage", "Garage", [0, 1], 2],
      ["main", "Main floor", [0, 1, 2, 5], null],
    ]);
    expect([quote.meetingOffer, quote.financingOffered, quote.accepted, quote.acceptedOffer]).toEqual(["main", true, false, null]);
    expect([view.selectionOffer, view.bookedOffer]).toEqual(["garage", null]);
    expect(view.nextSteps).toEqual({ colourConfirmed: true, installOn: "2026-11-21", whatWeNeed: "An outlet near the box.\nYour Wi-Fi name." });
  });

  it("shows the options biggest first, leaving out one with no runs", () => {
    // Full wrap: 165 ft x $24 = $3,960 + $500 + $400 upper gable + $350 rush - $300 = $4,910.
    // Main floor: 103 ft x $24 = $2,472 + $500 + $350 - $300 = $3,022 (no upper run, no access).
    // Garage: 64 ft x $24 = $1,536 + two boxes $1,000 + $350 - $300 = $2,586.
    expect(linkOffers(quote).map((priced) => [priced.offer.name, priced.totals?.subtotal, priced.everyRun])).toEqual([
      ["Full wrap", 4910, true],
      ["Main floor", 3022, false],
      ["Garage", 2586, false],
    ]);
  });

  it("prices an option from the stored quote and its own box count, in the iPad's rows and words", () => {
    const garage = offerChoice(quote, "garage");
    expect([garage?.name, garage?.total]).toEqual(["Garage", "$2,586"]);
    expect(garage?.totals.lines.map((line) => [line.label, line.detail, line.amount])).toEqual([
      ["Garage Gable", "34 ft", 816],
      ["Garage Eave", "30 ft", 720],
      ["Control boxes (2)", "2 at $500", 1000],
      ["Rush colour fee", "Brown track, made to order this season", 350],
      ["Family & Friends Discount", null, -300],
    ]);
    expect(offerChoice({ ...quote, gstEnabled: true }, "main")?.total).toBe("$3,022 + GST");
    // An option with no runs, one that isn't on the quote, or none at all.
    expect([offerChoice(quote, "front"), offerChoice(quote, "gone"), offerChoice(quote, null)]).toEqual([null, null, null]);
  });

  it("raises an option under the minimum to it, with the line saying so", () => {
    const porch = offerChoice({ ...quote, offers: [{ id: "porch", name: "Porch", runs: [2] }] }, "porch");
    // 13 ft x $24 = $312 + $500 + $350 - $300 = $862, raised to $2,500.
    expect([porch?.totals.minimumApplied, porch?.totals.beforeMinimum, porch?.total]).toEqual([true, 862, "$2,500"]);
    expect(porch?.totals.lines.at(-1)).toEqual({ label: "To reach our $2,500 minimum", detail: null, amount: 1638 });
  });

  it("opens on the booked option, else the meeting's, else the biggest", () => {
    const shown = linkOffers(quote);
    expect(openingOffer(shown, { booked: "garage", meeting: "main" })).toBe("garage");
    expect(openingOffer(shown, { booked: null, meeting: "main" })).toBe("main");
    expect(openingOffer(shown, { booked: null, meeting: null })).toBe("full");
    // An option since taken off, or one with no runs, is passed over.
    expect(openingOffer(shown, { booked: "gone", meeting: "front" })).toBe("full");
    expect(openingOffer([], { booked: "garage", meeting: "main" })).toBeNull();
  });

  it("reads a quote made before options as one Full wrap covering every run, priced like the whole quote", () => {
    const before = liveOf(rework).quote;
    const shown = linkOffers(before);
    expect(shown.map((priced) => [priced.offer.id, priced.offer.name, priced.everyRun])).toEqual([["full", "Full wrap", true]]);
    expect(offerChoice(before, "full")?.total).toBe(customerTotal(before, null));
    expect(linkOffers(liveOf({ ...rework, quote: { ...rework.quote, runs: [] } }).quote)).toEqual([]);
  });

  it("knows the agreed option only once the quote is accepted", () => {
    const agreed = liveOf({ ...withOffers, quote: { ...withOffers.quote, accepted: true, accepted_offer: "main" } }).quote;
    expect([agreed.accepted, agreed.acceptedOffer, offerChoice(agreed, agreed.acceptedOffer)?.total]).toEqual([true, "main", "$3,022"]);
    const open = liveOf({ ...withOffers, quote: { ...withOffers.quote, accepted: false, accepted_offer: "main" } }).quote;
    expect(open.acceptedOffer).toBeNull();
  });
});

describe("what happens next", () => {
  it("reads where they're at from the database: the site visit and Installed, safely when missing or odd", () => {
    expect(liveOf(withOffers).progress).toEqual({ siteVisitOn: null, siteVisitDone: false, installed: false });
    expect(liveOf({ ...withOffers, progress: { site_visit_on: "2026-12-02", site_visit_done: true, installed: true } }).progress).toEqual({
      siteVisitOn: "2026-12-02",
      siteVisitDone: true,
      installed: true,
    });
    expect(liveOf({ ...withOffers, progress: { site_visit_on: "next week", site_visit_done: "yes", installed: 1 } }).progress).toEqual({
      siteVisitOn: null,
      siteVisitDone: false,
      installed: false,
    });
    expect(liveOf({ ...withOffers, progress: "nonsense" }).progress).toEqual({ siteVisitOn: null, siteVisitDone: false, installed: false });
  });

  it("after Book my install, Keenan confirms a day already planned, or sets one", () => {
    expect(inTouchAbout("2026-11-21")).toBe("to confirm your install day");
    expect(inTouchAbout(null)).toBe("to set your install date");
    const planned = liveOf(withOffers);
    expect(planned.nextSteps.installOn).toBe("2026-11-21");
    expect(inTouchAbout(planned.nextSteps.installOn)).toBe("to confirm your install day");
  });

  it("captions the mockup only for an option that leaves a run out", () => {
    expect(leavesRunsOut(4, [0, 1, 2, 3])).toBe(false);
    expect(leavesRunsOut(4, [3, 2, 1, 0, 0])).toBe(false);
    expect(leavesRunsOut(4, [0, 2])).toBe(true);
    expect(leavesRunsOut(4, [0, 1, 2, 2, 9])).toBe(true);
    expect(leavesRunsOut(4, null)).toBe(false);
    expect(leavesRunsOut(0, [])).toBe(false);
  });

  it("uses Keenan's words from settings.deck.lines when the database hands them over, ours otherwise", () => {
    const view = liveOf({ ...withOffers, lines: { link_meeting_tag: "Chosen at the table", step_on_day: " ", nonsense: "x" } });
    expect(view.words.link_meeting_tag).toBe("Chosen at the table");
    expect(view.words.step_on_day).toBe(DECK_LINE_DEFAULTS.step_on_day);
    expect(liveOf(withOffers).words.link_drawing_caption).toBe("Gold marks the lights in {name}.");
  });

  it("keeps every line the link shows plain: no dashes and no exclamation marks", () => {
    const view = liveOf(withOffers);
    const keys = [
      "price_includes",
      "price_empty",
      "colour_stock",
      "whats_in",
      "link_mockup_caption",
      "link_drawing_caption",
      "link_meeting_tag",
      "link_something_else",
      "tracker_title",
      "tracker_meeting",
      "tracker_choose",
      "tracker_visit",
      "tracker_install",
      "tracker_pay",
    ] as const;
    const lines = keys.map((key) => fillLine(view.words[key], { name: "Main floor", colour: "Brown" }));
    for (const line of lines) expect(line).not.toMatch(/[–—!]/);
    expect(fillLine(view.words.link_drawing_caption, { name: "Main floor" })).toBe("Gold marks the lights in Main floor.");
  });
});
