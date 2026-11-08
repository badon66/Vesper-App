import { describe, expect, it } from "vitest";
import {
  chosenLead,
  exampleLayout,
  exampleSide,
  firstExamples,
  landingPage,
  looksLoaded,
  REHEARSAL_WORDS,
  rehearsalChoices,
  rehearsalHref,
  requestedLead,
  safeLink,
  scenarioLines,
  type ReferenceLinkRow,
  type UpcomingRow,
} from "@/app/(app)/app/(owner)/admin/settings/rehearsal/rehearsal";
import { DECK_PAGES, DECK_SLOTS, hasDash, hasExclamation, SLOT_BY_KEY, type DeckPageKey } from "@/lib/deck";
import { buildDeckPayload, deckPages } from "@/lib/meeting/deck-pages";
import { REHEARSAL_PAGE } from "@/lib/offline";
import { formatDay, formatTime } from "@/lib/time";

// The rehearsal view's pure rules (round 7, rehearsal_and_references):
// "Rehearse with", the examples, staying on the page after a switch, and
// how an example lays itself out in the box the deck gives it.

const LEAD_A = "3f1c2b7e-8a4d-4c1e-9b2a-1d2e3f4a5b6c";
const LEAD_B = "8b2d3c4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e";
const LEAD_C = "c4d5e6f7-0a1b-4c2d-9e3f-4a5b6c7d8e9f";

// Sunday, November 8, 2026 in Calgary (UTC-6 all year from November 1).
const TODAY = "2026-11-08";
const at = (day: string, hhmm: string) => `${day}T${hhmm}:00-06:00`;
const iso = (local: string) => new Date(local).toISOString();
const NOW = Date.parse(at(TODAY, "18:20"));

function meeting(
  leadId: string,
  starts: string,
  overrides: Partial<UpcomingRow> = {},
  lead: Partial<NonNullable<Exclude<UpcomingRow["lead"], unknown[]>>> = {},
): UpcomingRow {
  const startsAt = iso(starts);
  return {
    lead_id: leadId,
    starts_at: startsAt,
    ends_at: new Date(Date.parse(startsAt) + 45 * 60_000).toISOString(),
    status: "booked",
    lead: { first_name: "Jane", last_name: "Smith", address_line: "1 Test Crescent SW", neighbourhood: "Aspen Woods", ...lead },
    ...overrides,
  };
}

describe("Rehearse with: the upcoming meetings, by evening", () => {
  it("groups them under Tonight, Tomorrow and the day, in time order", () => {
    const rows = [
      meeting(LEAD_C, at("2026-11-11", "19:30"), {}, { first_name: "Sam", last_name: null, neighbourhood: null, address_line: "9 Elm Road NW" }),
      meeting(LEAD_B, at("2026-11-09", "18:00"), { status: "confirmed" }, { first_name: "Al", last_name: "Brown", neighbourhood: "Cougar Ridge" }),
      meeting(LEAD_A, at(TODAY, "19:30")),
    ];
    const groups = rehearsalChoices(rows, { today: TODAY, now: NOW });
    expect(groups.map((group) => group.label)).toEqual(["Tonight", "Tomorrow", formatDay("2026-11-11")]);
    expect(groups[0].options).toEqual([{ leadId: LEAD_A, label: `${formatTime(iso(at(TODAY, "19:30")))} Jane Smith, Aspen Woods` }]);
    expect(groups[1].options[0].label).toBe(`${formatTime(iso(at("2026-11-09", "18:00")))} Al Brown, Cougar Ridge`);
    // No neighbourhood: the street address instead.
    expect(groups[2].options[0].label).toBe(`${formatTime(iso(at("2026-11-11", "19:30")))} Sam, 9 Elm Road NW`);
  });

  it("offers only meetings still on: booked or confirmed, and not yet over", () => {
    const rows = [
      // Over: 5:00 to 5:45 pm, and it is 6:20.
      meeting(LEAD_A, at(TODAY, "17:00")),
      // Under way: 6:00 to 6:45 pm still counts.
      meeting(LEAD_B, at(TODAY, "18:00")),
      meeting(LEAD_C, at(TODAY, "19:30"), { status: "cancelled" }),
      meeting(LEAD_C, at(TODAY, "20:15"), { status: "moved" }),
      meeting(LEAD_C, at("2026-11-09", "18:00"), { status: "qualified" }),
    ];
    const groups = rehearsalChoices(rows, { today: TODAY, now: NOW });
    expect(groups.flatMap((group) => group.options.map((option) => option.leadId))).toEqual([LEAD_B]);
  });

  it("offers each lead once, at its first meeting, and skips a meeting whose lead can't be read", () => {
    const rows = [
      meeting(LEAD_A, at("2026-11-10", "18:00")),
      meeting(LEAD_A, at("2026-11-09", "18:45")),
      meeting(LEAD_B, at("2026-11-09", "19:30"), { lead: null }),
    ];
    const groups = rehearsalChoices(rows, { today: TODAY, now: NOW });
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe("Tomorrow");
    expect(groups[0].options.map((option) => option.leadId)).toEqual([LEAD_A]);
  });

  it("reads the lead whether the join comes back as an object or a one-row list", () => {
    const row = meeting(LEAD_A, at(TODAY, "19:30"));
    const listed = { ...row, lead: [row.lead as Exclude<UpcomingRow["lead"], null | unknown[]>] };
    expect(rehearsalChoices([listed], { today: TODAY, now: NOW })[0].options[0].label).toContain("Jane Smith, Aspen Woods");
    const unnamed = meeting(LEAD_B, at(TODAY, "20:15"), {}, { first_name: " ", last_name: null });
    expect(rehearsalChoices([unnamed], { today: TODAY, now: NOW })[0].options[0].label).toContain("No name, Aspen Woods");
  });

  it("is empty with no meetings ahead", () => {
    expect(rehearsalChoices([], { today: TODAY, now: NOW })).toEqual([]);
  });
});

describe("the lead to rehearse with", () => {
  const groups = rehearsalChoices([meeting(LEAD_A, at(TODAY, "19:30"))], { today: TODAY, now: NOW });

  it("is the one asked for only while it is offered", () => {
    expect(chosenLead(LEAD_A, groups)).toBe(LEAD_A);
    expect(chosenLead(LEAD_B, groups)).toBeNull();
    expect(chosenLead(null, groups)).toBeNull();
    expect(chosenLead(LEAD_A, [])).toBeNull();
  });

  it("comes from ?lead= only as one well-formed id", () => {
    expect(requestedLead(LEAD_A)).toBe(LEAD_A);
    expect(requestedLead([LEAD_B, LEAD_A])).toBe(LEAD_B);
    expect(requestedLead(undefined)).toBeNull();
    expect(requestedLead("")).toBeNull();
    expect(requestedLead("not-a-lead")).toBeNull();
    expect(requestedLead(`${LEAD_A}' or 1=1`)).toBeNull();
  });

  it("is carried in the view's own address", () => {
    expect(rehearsalHref(null)).toBe(REHEARSAL_PAGE);
    expect(rehearsalHref(LEAD_A)).toBe(`${REHEARSAL_PAGE}?lead=${LEAD_A}`);
    expect(requestedLead(new URL(rehearsalHref(LEAD_A), "https://vesper.example").searchParams.get("lead") ?? undefined)).toBe(LEAD_A);
  });
});

describe("the examples", () => {
  const row = (slot: string, rank: number, extra: Partial<ReferenceLinkRow> = {}): ReferenceLinkRow => ({
    slot,
    rank,
    image_url: `https://images.example-site.com/${slot}-${rank}.jpg`,
    page_url: `https://example-site.com/${slot}`,
    site: `Site ${rank}`,
    ...extra,
  });

  it("are each slot's first, whatever order they arrive in", () => {
    const examples = firstExamples([row("what_vesper_is.hero", 2), row("what_vesper_is.hero", 1), row("gallery.snow", 3)]);
    expect(examples["what_vesper_is.hero"]).toEqual({
      imageUrl: "https://images.example-site.com/what_vesper_is.hero-1.jpg",
      pageUrl: "https://example-site.com/what_vesper_is.hero",
      site: "Site 1",
    });
    expect(examples["gallery.snow"].site).toBe("Site 3");
  });

  it("only for the deck's own slots", () => {
    const examples = firstExamples([row("what_vesper_is.hero", 1), row("cover.hero", 1), row("constructor", 1), row("__proto__", 1)]);
    expect(Object.keys(examples)).toEqual(["what_vesper_is.hero"]);
    for (const key of Object.keys(firstExamples(DECK_SLOTS.map((slot) => row(slot.key, 1))))) expect(SLOT_BY_KEY.has(key)).toBe(true);
  });

  it("keep only links the view may load or open", () => {
    const examples = firstExamples([
      row("hidden_by_day.day", 1, { image_url: "http://example-site.com/day.jpg", page_url: "javascript:alert(1)", site: "  " }),
      row("hidden_by_day.night", 1, { image_url: "data:image/png;base64,AAAA", page_url: "http://example-site.com/night" }),
      row("whites_first.hero", 1, { image_url: null, page_url: null, site: null }),
    ]);
    expect(examples["hidden_by_day.day"]).toEqual({ imageUrl: null, pageUrl: null, site: null });
    expect(examples["hidden_by_day.night"]).toEqual({ imageUrl: null, pageUrl: "http://example-site.com/night", site: "Site 1" });
    expect(examples["whites_first.hero"]).toEqual({ imageUrl: null, pageUrl: null, site: null });
  });

  it("links are web addresses only, and pictures https only", () => {
    expect(safeLink(" https://example-site.com/a.jpg ")).toBe("https://example-site.com/a.jpg");
    expect(safeLink("http://example-site.com/page")).toBe("http://example-site.com/page");
    expect(safeLink("http://example-site.com/a.jpg", { picture: true })).toBeNull();
    expect(safeLink("javascript:alert(1)")).toBeNull();
    expect(safeLink("JAVASCRIPT:alert(1)")).toBeNull();
    expect(safeLink("data:text/html,hi")).toBeNull();
    expect(safeLink("example-site.com/a.jpg")).toBeNull();
    expect(safeLink("")).toBeNull();
    expect(safeLink(null)).toBeNull();
    expect(safeLink(undefined)).toBeNull();
  });
});

describe("staying on the page after a switch", () => {
  const keys = (...list: DeckPageKey[]) => list;
  const withLead = keys(...DECK_PAGES);
  const noLead = DECK_PAGES.filter((key) => !["light_picker", "mockup", "colour", "quote"].includes(key));

  it("keeps the page when it still shows", () => {
    expect(landingPage(withLead, "warranty")).toBe("warranty");
    expect(landingPage(noLead, "gallery")).toBe("gallery");
  });

  it("starts at the first page before any page was seen", () => {
    expect(landingPage(withLead, null)).toBe("cover");
  });

  it("moves to the next page that shows, else the last", () => {
    expect(landingPage(noLead, "light_picker")).toBe("phone_control");
    expect(landingPage(noLead, "mockup")).toBe("warranty");
    expect(landingPage(noLead, "quote")).toBe("warranty");
    expect(landingPage(keys("cover", "what_vesper_is", "warranty"), "hidden_by_day")).toBe("warranty");
  });

  it("has nothing to land on in an empty deck", () => {
    expect(landingPage([], "cover")).toBeNull();
  });

  it("lands where the deck itself would show, for a deck with no lead and no photos", () => {
    const deck = buildDeckPayload({
      settings: {
        deck: { pages: { what_vesper_is: { headline: "Up once, there all year", words: "A slim track." } } },
        light_looks: [],
        company: { name: "Vesper Lighting, Inc.", phone: "(403) 555-0100", address: "1 Main Street SW, Calgary, AB T2P 1A1" },
        warranty_text: "Ten years on parts.",
        service_call_fee: null,
      },
      photos: [],
      signed: new Map(),
      picker: null,
    });
    // Rehearsal fills the empty gallery with examples; the Customer view skips it.
    const rehearsal = deckPages({ deck, lead: null, fillEmpty: true }).map((page) => page.key);
    const customer = deckPages({ deck, lead: null }).map((page) => page.key);
    expect(rehearsal).toContain("gallery");
    expect(customer).not.toContain("gallery");
    expect(landingPage(customer, "gallery")).toBe("warranty");
    expect(landingPage(rehearsal, "colour")).toBe("warranty");
  });
});

describe("an example's box", () => {
  it("shows the least until it is measured", () => {
    expect(exampleLayout(null)).toBe("tiny");
  });

  it("is laid out for the box the deck gives it", () => {
    // A band page's photo at 1180 x 820, under the 56 px bar.
    expect(exampleLayout({ width: 1180, height: 518 })).toBe("full");
    // A split page's left side, and a More layer's picture.
    expect(exampleLayout({ width: 661, height: 764 })).toBe("full");
    // Half of the warm and cool pair: narrow, but tall enough for the words.
    expect(exampleLayout({ width: 328, height: 764 })).toBe("full");
    expect(exampleLayout({ width: 300, height: 480 })).toBe("full");
    expect(exampleLayout({ width: 299, height: 764 })).toBe("compact");
    // A contact-sheet tile at 1180 and 1366.
    expect(exampleLayout({ width: 392, height: 294 })).toBe("compact");
    expect(exampleLayout({ width: 340, height: 255 })).toBe("compact");
    expect(exampleLayout({ width: 640, height: 300 })).toBe("compact");
    // A tile on a phone.
    expect(exampleLayout({ width: 120, height: 90 })).toBe("tiny");
    expect(exampleLayout({ width: 600, height: 170 })).toBe("tiny");
  });

  it("holds whole lines of the scenario only, at most 12", () => {
    expect(scenarioLines(518)).toBe(8);
    expect(scenarioLines(574)).toBe(10);
    expect(scenarioLines(764)).toBe(12);
    expect(scenarioLines(326)).toBe(0);
    expect(scenarioLines(0)).toBe(0);
    expect(scenarioLines(Number.NaN)).toBe(0);
  });

  it("keeps the day and night examples on the half the slider shows", () => {
    // The night picture shows left of the line, the day picture right of it.
    expect(exampleSide({ role: "day" })).toBe("right");
    expect(exampleSide({ role: "night" })).toBe("left");
    const others = DECK_SLOTS.filter((item) => item.role !== "day" && item.role !== "night");
    expect(others.length).toBe(DECK_SLOTS.length - 2);
    for (const slot of others) expect(exampleSide(slot)).toBe("whole");
  });

  it("counts a placeholder pixel as not loaded", () => {
    expect(looksLoaded(1, 1)).toBe(false);
    expect(looksLoaded(47, 400)).toBe(false);
    expect(looksLoaded(400, 47)).toBe(false);
    expect(looksLoaded(48, 48)).toBe(true);
    expect(looksLoaded(2000, 1333)).toBe(true);
  });
});

describe("the view's own words", () => {
  it("say what the spec says, word for word", () => {
    expect(REHEARSAL_WORDS.bar).toBe("Rehearsal. Customers never see this view.");
    expect(REHEARSAL_WORDS.tag).toBe("Example to copy");
    expect(REHEARSAL_WORDS.from("Gemstone Lights")).toBe("From Gemstone Lights");
    expect(REHEARSAL_WORDS.open).toBe("Open the example");
  });

  it("follow the copy rules: no dashes and no exclamation marks", () => {
    const words = Object.values(REHEARSAL_WORDS).map((value) => (typeof value === "function" ? value("Site") : value));
    for (const text of words) {
      expect(hasDash(text), text).toBe(false);
      expect(hasExclamation(text), text).toBe(false);
    }
  });
});
