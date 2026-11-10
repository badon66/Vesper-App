import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TalkingPoints } from "@/components/meeting/talking-points";
import { serviceCallShort, WarrantyPage } from "@/components/meeting/warranty-page";
import {
  cleanTalking,
  deckWithTalking,
  parseTalkingInput,
  parseTalkingPoints,
  sameTalking,
  TALKING_MAX,
  TALKING_PAGES,
  talkingIssue,
} from "@/lib/meeting/talking-points";

// Round 10 (Keenan, 2026-11-10): talking points per page, private to him,
// and the warranty made visual.

describe("parseTalkingPoints", () => {
  it("reads settings.deck.talking, trimmed, deck page keys only", () => {
    const deck = {
      version: 1,
      pages: {},
      talking: { cover: "  Say hello.  ", quote: "Full wrap first.", nonsense: "dropped", warranty: 12, hidden_by_day: "   " },
    };
    expect(parseTalkingPoints(deck)).toEqual({ cover: "Say hello.", quote: "Full wrap first." });
  });

  it("reads nothing from a missing or odd deck", () => {
    expect(parseTalkingPoints(null)).toEqual({});
    expect(parseTalkingPoints(undefined)).toEqual({});
    expect(parseTalkingPoints("deck")).toEqual({});
    expect(parseTalkingPoints({ talking: ["cover"] })).toEqual({});
    expect(parseTalkingPoints({ pages: {} })).toEqual({});
  });

  it("cuts a hand-edited row to the most a page may hold", () => {
    const long = "a".repeat(TALKING_MAX + 50);
    expect(parseTalkingPoints({ talking: { cover: long } }).cover).toHaveLength(TALKING_MAX);
    expect(cleanTalking(long)).toHaveLength(TALKING_MAX);
    expect(cleanTalking(" ")).toBeNull();
    expect(cleanTalking(7)).toBeNull();
  });

  it("asks for the eight pages of the deck, in its order, by their names", () => {
    expect(TALKING_PAGES.map((page) => page.key)).toEqual([
      "cover",
      "what_vesper_is",
      "hidden_by_day",
      "phone_control",
      "warranty",
      "light_picker",
      "quote",
      "next_steps",
    ]);
    expect(TALKING_PAGES.find((page) => page.key === "quote")?.name).toBe("Your price");
  });
});

describe("the Settings save's check", () => {
  it("keeps what was written, trimmed, and drops empty boxes", () => {
    expect(parseTalkingInput({ cover: " Hello ", quote: "", warranty: null })).toEqual({ ok: true, talking: { cover: "Hello" } });
  });

  it("refuses a page over the limit, by page", () => {
    const result = parseTalkingInput({ cover: "x".repeat(TALKING_MAX + 1), quote: "fine" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors)).toEqual(["cover"]);
    expect(talkingIssue("x".repeat(TALKING_MAX))).toBeNull();
    expect(talkingIssue("x".repeat(TALKING_MAX + 3))).toMatch(/Cut 3/);
  });

  it("refuses unknown pages and anything that isn't text", () => {
    expect(parseTalkingInput({ gallery: "no" }).ok).toBe(false);
    expect(parseTalkingInput({ cover: 5 }).ok).toBe(false);
    expect(parseTalkingInput("cover").ok).toBe(false);
    expect(parseTalkingInput(null).ok).toBe(false);
  });

  it("writes into settings.deck beside the words, keeping everything else", () => {
    const stored = { version: 1, pages: { warranty: { headline: "Ours" } }, lines: { cover_line: "Hi" }, talking: { cover: "old", gallery: "kept" } };
    const next = deckWithTalking(stored, { quote: "new" });
    expect(next).toEqual({ version: 1, pages: { warranty: { headline: "Ours" } }, lines: { cover_line: "Hi" }, talking: { gallery: "kept", quote: "new" } });
    expect(deckWithTalking(null, { cover: "a" })).toEqual({ talking: { cover: "a" } });
  });

  it("tells unsaved changes apart, ignoring spaces at the ends", () => {
    expect(sameTalking({ cover: "a" }, { cover: " a " })).toBe(true);
    expect(sameTalking({ cover: "" }, {})).toBe(true);
    expect(sameTalking({ cover: "a" }, { cover: "b" })).toBe(false);
  });
});

describe("TalkingPoints", () => {
  it("draws nothing for a page with no talking points", () => {
    expect(renderToStaticMarkup(createElement(TalkingPoints, { text: null }))).toBe("");
    expect(renderToStaticMarkup(createElement(TalkingPoints, { text: "   " }))).toBe("");
  });

  it("draws only the quiet mark until it is held: the words are not in the page", () => {
    const html = renderToStaticMarkup(createElement(TalkingPoints, { text: "Ask about the garage." }));
    expect(html).toContain('data-testid="talking-mark"');
    expect(html).not.toContain("talking-panel");
    expect(html).not.toContain("Ask about the garage");
    expect(html).not.toContain("tabindex");
    expect(html).not.toContain("<button");
  });
});

describe("WarrantyPage", () => {
  it("names the service call fee only when it is set", () => {
    expect(serviceCallShort(200)).toBe("$200 service call");
    expect(serviceCallShort(200, true)).toBe("Service call $200 + GST");
    expect(serviceCallShort(null)).toBeNull();
    expect(serviceCallShort(Number.NaN)).toBeNull();
  });

  it("shows the ten years, what is covered and that it transfers", () => {
    const html = renderToStaticMarkup(
      createElement(WarrantyPage, { headline: "Our 10-year warranty", text: "Line one.\nLine two.", serviceCallFee: 200 }),
    );
    expect(html).toContain("Parts and labour");
    expect(html).toContain("Years 6 to 10");
    expect(html).toContain("$200 service call");
    for (const part of ["Lights", "Track", "Control box", "Our workmanship"]) expect(html).toContain(part);
    expect(html).toContain("It transfers with the home.");
    expect(html).toContain('data-testid="warranty-full"');
    expect(html).not.toMatch(/—|!/);
  });

  it("hides the fee line when it isn't set, and the full warranty button without warranty text", () => {
    const html = renderToStaticMarkup(createElement(WarrantyPage, { headline: "", text: "", serviceCallFee: null }));
    expect(html).not.toContain("service call");
    expect(html).not.toContain("warranty-full");
    expect(html).toContain("10-year</span> warranty");
  });
});
