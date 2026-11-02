import { describe, expect, it } from "vitest";
import {
  cleanSelection,
  customerTotal,
  optionName,
  parseCustomerQuote,
  phoneHref,
  priceSelection,
  quoteFromRow,
  quoteLinkMessage,
  quoteLinkUrl,
  runDetail,
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

  it("treats anything that isn't a live quote as expired, keeping the company contact", () => {
    for (const data of [{ state: "expired", company: live.company }, null, "nope", { state: "live" }, { state: "live", first_name: 4 }]) {
      const view = parseCustomerQuote(data);
      expect(view.state).toBe("expired");
      if (view.state === "expired") expect(view.company.phone).toBe("(403) 895-9915");
    }
  });

  it("falls back to Vesper's own contact when Settings has a blank", () => {
    const view = parseCustomerQuote({ state: "expired", company: { phone: " ", email: null } });
    expect(view.state === "expired" && view.company).toEqual({
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
      "Hi Todd, here's your Vesper quote:\nhttps://quote.vesperlighting.ca/q/abcdefghijklmnopqrstuvwx\n\nIt's good until Monday, November 16. When you're ready, tap Book my install, or call or text me with any questions.\n\nKeenan, Vesper Lighting\n(403) 895-9915",
    );
    expect(text).not.toMatch(/[–—]/);
    expect(quoteLinkMessage({ firstName: " ", link: "L", validUntil: null, phone: "P" }).startsWith("Here's your Vesper quote:\nL\n\nWhen you're ready")).toBe(true);
  });

  it("dials and texts Canadian numbers with the +1", () => {
    expect(phoneHref("(403) 895-9915", "tel")).toBe("tel:+14038959915");
    expect(phoneHref("1-403-895-9915", "sms")).toBe("sms:+14038959915");
  });
});
