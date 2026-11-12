import { describe, expect, it } from "vitest";
import {
  bookByHeadline,
  CHRISTMAS_WORD_DEFAULTS,
  christmasBanner,
  christmasPriceLine,
  countdownWords,
  daysBetween,
  trackColourKind,
  trackColourKindOf,
  type ChristmasSettings,
} from "@/lib/quote-link/christmas";
import { parseCustomerQuote } from "@/lib/quote-link/view";

// Round 17 (Keenan, 2026-11-12): the Christmas banner by real dates.
const SEASON: ChristmasSettings = {
  bookByWhite: "2026-12-15",
  bookByColour: "2026-12-08",
  seasonEnd: "2026-12-24",
  words: CHRISTMAS_WORD_DEFAULTS,
};

describe("the Christmas banner", () => {
  it("names a white-track customer's date, says the white line and counts the days", () => {
    const banner = christmasBanner({ today: "2026-12-06", christmas: SEASON, track: "white" });
    expect(banner).toEqual({
      state: "before",
      date: "2026-12-15",
      headline: "Book by Tuesday, December 15 to be lit up for Christmas.",
      line: "White track is in stock and we install on any good-weather day.",
      note: null,
      daysLeft: 9,
      countdown: "9 days left",
    });
  });

  it("gives a colour-matched track its own earlier date and line, never both dates", () => {
    const banner = christmasBanner({ today: "2026-11-12", christmas: SEASON, track: "colour" });
    expect(banner?.state === "before" && [banner.headline, banner.line, banner.note, banner.countdown]).toEqual([
      "Book by Tuesday, December 8 to be lit up for Christmas.",
      "Your colour-matched track takes about a week to prepare, and we install on any good-weather day.",
      null,
      "26 days left",
    ]);
    expect(JSON.stringify(banner)).not.toContain("December 15");
  });

  it("reads the white date for no colour yet, with the note that a custom colour needs about a week more", () => {
    const banner = christmasBanner({ today: "2026-12-01", christmas: SEASON, track: "none" });
    expect(banner?.state === "before" && [banner.date, banner.note]).toEqual(["2026-12-15", "A custom track colour needs about a week more."]);
  });

  it("counts down to the last day, then switches to the line that promises nothing until the season ends", () => {
    expect(christmasBanner({ today: "2026-12-14", christmas: SEASON, track: "white" })).toMatchObject({ countdown: "1 day left" });
    expect(christmasBanner({ today: "2026-12-15", christmas: SEASON, track: "white" })).toMatchObject({ countdown: "Last day to book" });
    expect(christmasBanner({ today: "2026-12-16", christmas: SEASON, track: "white" })).toEqual({ state: "after", text: CHRISTMAS_WORD_DEFAULTS.after });
    expect(christmasBanner({ today: "2026-12-09", christmas: SEASON, track: "colour" })?.state).toBe("after");
    expect(christmasBanner({ today: "2026-12-24", christmas: SEASON, track: "white" })?.state).toBe("after");
  });

  it("has no banner from December 25, while it is off, or without a date", () => {
    expect(christmasBanner({ today: "2026-12-25", christmas: SEASON, track: "white" })).toBeNull();
    expect(christmasBanner({ today: "2027-03-01", christmas: SEASON, track: "colour" })).toBeNull();
    expect(christmasBanner({ today: "2026-12-01", christmas: null, track: "white" })).toBeNull();
    expect(christmasBanner({ today: null, christmas: SEASON, track: "white" })).toBeNull();
  });

  it("leaves off a line Keenan cleared, and never shows an empty after line", () => {
    const words = { ...CHRISTMAS_WORD_DEFAULTS, white: " ", after: "" };
    expect(christmasBanner({ today: "2026-12-01", christmas: { ...SEASON, words }, track: "white" })).toMatchObject({ line: null });
    expect(christmasBanner({ today: "2026-12-20", christmas: { ...SEASON, words }, track: "white" })).toBeNull();
  });

  it("writes the date as a customer reads it", () => {
    expect(bookByHeadline("Book by {date} to be lit up for Christmas.", "2026-12-15")).toBe("Book by Tuesday, December 15 to be lit up for Christmas.");
    expect(daysBetween("2026-11-30", "2026-12-08")).toBe(8);
    expect([0, 1, 2].map(countdownWords)).toEqual(["Last day to book", "1 day left", "2 days left"]);
    for (const words of Object.values(CHRISTMAS_WORD_DEFAULTS)) expect(words).not.toMatch(/[–—]/);
  });

  it("calls only White the stock track, the way meeting mode does", () => {
    expect(trackColourKind({ name: "White", custom: false })).toBe("white");
    expect(trackColourKind({ name: "Off-white", custom: false })).toBe("colour");
    expect(trackColourKind({ name: "Brown", custom: false })).toBe("colour");
    expect(trackColourKind({ name: "RAL 9010 Pure white", custom: true })).toBe("colour");
    expect(trackColourKind({ name: null, custom: false })).toBe("none");
    expect([trackColourKindOf("list", "White"), trackColourKindOf("custom", "RAL 7016"), trackColourKindOf("none", "")]).toEqual(["white", "colour", "none"]);
  });

  it("puts the same date on Your price in the meeting as one line, and nothing once it has passed", () => {
    expect(christmasPriceLine({ today: "2026-12-06", christmas: SEASON, track: "white" })).toBe("Book by Tuesday, December 15 to be lit up for Christmas.");
    expect(christmasPriceLine({ today: "2026-12-10", christmas: SEASON, track: "colour" })).toBeNull();
  });
});

describe("the link reads the banner from the database", () => {
  const base = {
    state: "live",
    first_name: "Pat",
    last_name: null,
    address: "1 Test St",
    city: null,
    valid_until: null,
    today: "2026-12-01",
    quote: { runs: [], offers: [], price_per_ft: 24, box_price: 500, box_count: 1, adders: [], discounts: [], gst_enabled: false, gst_rate: 0.05 },
    warranty: "",
    product_points: [],
    gallery: [],
    company: {},
    mockup_path: null,
    selection: null,
    selection_offer: null,
    booked_offer: null,
    booked_at: null,
    booked_option: null,
  };

  it("takes the dates and words, and falls back to the white date for colour", () => {
    const view = parseCustomerQuote({
      ...base,
      christmas: { book_by_white: "2026-12-15", book_by_colour: null, season_end: "2026-12-24", words: { book_by: "By {date}.", white: "W", colour: "C", no_colour: "N", after: "A" } },
    });
    expect(view.state === "live" && view.christmas).toEqual({
      bookByWhite: "2026-12-15",
      bookByColour: "2026-12-15",
      seasonEnd: "2026-12-24",
      words: { bookBy: "By {date}.", white: "W", colour: "C", noColour: "N", after: "A" },
    });
  });

  it("shows nothing for the old heading-and-words banner or anything unreadable", () => {
    for (const christmas of [{ title: "Want them up for Christmas?", text: "Book now." }, { book_by_white: "soon" }, "junk", null]) {
      const view = parseCustomerQuote({ ...base, christmas });
      expect(view.state === "live" && view.christmas).toBeNull();
    }
  });
});
