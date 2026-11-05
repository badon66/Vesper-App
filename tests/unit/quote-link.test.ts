import { describe, expect, it } from "vitest";
import { UPPER_ACCESS_LABEL } from "@/lib/pricing";
import {
  choiceInSentence,
  choiceLabel,
  cleanSelection,
  customerChoice,
  customerChoiceInSentence,
  customerTotal,
  lineAmount,
  optionName,
  parseCustomerQuote,
  phoneHref,
  priceHoldPassed,
  christmasSeason,
  otherColoursLine,
  priceSelection,
  quoteFromRow,
  quoteLinkMessage,
  quoteLinkUrl,
  runDetail,
  smsWithBody,
  TOKEN_PATTERN,
} from "@/lib/quote-link/view";

// The customer quote link's pure parts (2026-11-02): reading the database's
// answer, pricing what the customer switched on, naming the option in
// words, the link and the text Keenan sends.

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
  christmas: { title: "Want them up for Christmas?", text: "We install every day the weather allows." },
  product_points: [
    { icon: "lightbulb", text: "RGBW lights with a dedicated white." },
    { icon: "rocket", text: "An icon Settings doesn't offer." },
    { icon: "plug", text: "  " },
  ],
  install_day: { title: "How install day works", body: "We confirm the plan." },
  gallery: ["gallery/a.jpg", " "],
};

describe("the reworked page's answer", () => {
  const view = parseCustomerQuote(rework);
  const quote = view.state === "live" ? view.quote : null;

  it("reads the new parts: the hold date, banner, points, install day, gallery and service call", () => {
    expect(view.state).toBe("live");
    if (view.state !== "live") return;
    expect([view.validUntil, view.today]).toEqual(["2027-03-02", "2026-11-04"]);
    expect(view.christmas).toEqual({ title: "Want them up for Christmas?", text: "We install every day the weather allows." });
    // An unknown icon is a tick; a blank line is left out.
    expect(view.productPoints).toEqual([
      { icon: "lightbulb", text: "RGBW lights with a dedicated white." },
      { icon: "check", text: "An icon Settings doesn't offer." },
    ]);
    expect(view.installDay).toEqual({ title: "How install day works", body: "We confirm the plan." });
    expect(view.gallery).toEqual(["gallery/a.jpg"]);
    expect(view.serviceCallFee).toBe(200);
    expect(view.quote.trackColourName).toBe("Brown");
  });

  it("gives every run a part: the stored one, or the guess from its name", () => {
    expect(quote?.runs.map((run) => run.part)).toEqual(["gable", "garage", "porch", "eave", "gable", "sides"]);
  });

  it("leaves out what Settings hasn't set, and reads a take 1 answer without the new parts", () => {
    const bare = parseCustomerQuote({ ...rework, christmas: null, install_day: { title: "x", body: " " }, service_call_fee: null, product_points: "junk", gallery: null });
    expect(bare.state === "live" && [bare.christmas, bare.installDay, bare.serviceCallFee, bare.productPoints, bare.gallery]).toEqual([null, null, null, [], []]);
    const take1 = parseCustomerQuote(live);
    expect(take1.state === "live" && [take1.today, take1.christmas, take1.quote.rushFee, take1.quote.upperAccessFee]).toEqual([null, null, null, null]);
  });

  it("prices the full quote with the upper gable amount and the rush colour fee", () => {
    if (!quote) throw new Error("not live");
    const priced = priceSelection(quote, null);
    expect(priced.lines.map((line) => [line.label, line.amount])).toEqual([
      ["Track and lights", 3960],
      ["Control box", 500],
      [UPPER_ACCESS_LABEL, 400],
      ["Rush colour fee", 350],
      ["Family & Friends Discount", -300],
    ]);
    expect(priced.lines[3].detail).toBe("Brown track, powder coated this season");
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

  it("keeps the Christmas season to September 1 to November 30, like the banner", () => {
    expect(["2026-08-31", "2026-09-01", "2026-11-30", "2026-12-01", "2027-01-15", null].map((day) => christmasSeason(day))).toEqual([
      false,
      true,
      true,
      false,
      false,
      false,
    ]);
  });

  it("words the other track colours for the time of year, never promising Christmas after November", () => {
    expect(otherColoursLine({ season: true, rushFee: 350, rush: false })).toBe(
      "Any other colour is powder coated: nothing extra if it can wait for spring, or the $350 rush colour fee to have it before Christmas.",
    );
    expect(otherColoursLine({ season: true, rushFee: null, rush: false })).toBe(
      "Any other colour is powder coated: nothing extra if it can wait for spring.",
    );
    expect(otherColoursLine({ season: false, rushFee: 350, rush: false })).toBe(
      "Any other colour is powder coated for a spring install, with colour matching included at no extra cost.",
    );
    expect(otherColoursLine({ season: false, rushFee: 350, rush: true })).toBe(
      "Any other colour is powder coated: nothing extra if it can wait for spring, or the $350 rush colour fee to have it sooner.",
    );
    expect(otherColoursLine({ season: false, rushFee: null, rush: true })).toBe(
      "Any other colour is powder coated for a spring install, with colour matching included at no extra cost.",
    );
    for (const season of [false]) {
      for (const rush of [true, false]) expect(otherColoursLine({ season, rushFee: 350, rush })).not.toMatch(/Christmas/);
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

  it("writes a discount with a true minus sign", () => {
    expect(lineAmount(-300)).toBe("\u2212$300");
    expect(lineAmount(400)).toBe("$400");
  });
});
