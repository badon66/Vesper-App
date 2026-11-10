import { readFileSync } from "node:fs";
import { describe, expect, expectTypeOf, it } from "vitest";
import { parseDeckWords } from "@/lib/deck";
import { buildDeckPayload, deckPhotoPathsToSign, pickerFrom, type DeckPhotoRow } from "@/lib/meeting/deck-pages";
import type { DeckPayload, MeetingPayload } from "@/lib/meeting/state";
import { meetingFiles } from "@/lib/offline";

// Never in a meeting (round 7, rehearsal_and_references): reference shots
// live only in Settings and the rehearsal view. The meeting's payload type
// has no field for one, its loader never reads them, and a meeting page the
// iPad keeps for no signal holds only signed storage links.

// Every key anywhere in a type, through objects and arrays.
type DeepKeys<T> = T extends readonly (infer U)[]
  ? DeepKeys<U>
  : T extends (...args: never[]) => unknown
    ? never
    : T extends object
      ? { [K in keyof T & string]: K | DeepKeys<T[K]> }[keyof T & string]
      : never;

// Anything that could carry a reference shot or where it came from.
type ReferenceLike = `${string}eference${string}` | `${string}xample${string}` | "page_url" | "image_url" | "pageUrl" | "imageUrl" | "site" | "why" | "shot";

describe("the meeting's payload has no place for a reference shot", () => {
  it("in its type, at any depth", () => {
    expectTypeOf<Extract<DeepKeys<MeetingPayload>, ReferenceLike>>().toEqualTypeOf<never>();
    expectTypeOf<Extract<DeepKeys<DeckPayload>, ReferenceLike>>().toEqualTypeOf<never>();
    // The check itself works: it would find one.
    expectTypeOf<Extract<DeepKeys<{ deck: { references: { page_url: string }[] } }>, ReferenceLike>>().toEqualTypeOf<"references" | "page_url">();
  });

  it("in the source of its type and its loader", () => {
    const state = readFileSync(new URL("../../lib/meeting/state.ts", import.meta.url), "utf8");
    const payloadType = state.slice(state.indexOf("export type DeckPhoto"), state.indexOf("// ---------------------------------------------------------------- the quote"));
    expect(payloadType).toContain("export type MeetingPayload");
    // Comments may name references to say they are never here; fields may not.
    const fields = payloadType.replace(/\/\/.*$/gm, "");
    expect(fields).not.toMatch(/reference|example|page_?url|image_?url/i);
    const loader = readFileSync(new URL("../../lib/meeting/deck-payload.ts", import.meta.url), "utf8");
    expect(loader).not.toMatch(/presentation_references/);
    const builder = readFileSync(new URL("../../lib/meeting/deck-pages.ts", import.meta.url), "utf8");
    expect(builder).not.toMatch(/presentation_references/);
  });
});

// ---------------------------------------------------------------- a meeting page, as the iPad keeps it

const ORIGIN = "https://vesper.example";
const STORAGE = "https://abcd.supabase.co/storage/v1/object/sign";
const signedUrl = (bucket: string, path: string) => `${STORAGE}/${bucket}/${path}?token=eyJhbGciOiJIUzI1NiJ9.e30.sig-_${path.length}`;

const row = (id: string, slot: string, sort = 0): DeckPhotoRow => ({
  id,
  slot,
  path: `deck/${id}.jpg`,
  thumb_path: `deck/${id}-640.jpg`,
  focus_x: 0.5,
  focus_y: 0.4,
  caption: "Warm white",
  sort,
  created_at: "2026-11-08T00:00:00Z",
});

function meetingPayload(): MeetingPayload {
  const rows = [
    row("hero", "what_vesper_is.hero"),
    row("day", "hidden_by_day.day"),
    row("night", "hidden_by_day.night"),
    row("g1", "gallery.two_storey", 0),
    row("g2", "gallery.snow", 1),
  ];
  const signed = new Map(deckPhotoPathsToSign(rows).map((path) => [path, signedUrl("presentation", path)]));
  const trace = {
    photo_id: "p1",
    photo_slot: "front",
    lines: [[[0.1, 0.5], [0.5, 0.3], [0.9, 0.5]]],
    line_feet: [null],
    scale: { a: [0.4, 0.8], b: [0.6, 0.8], feet: 16, kind: "double" },
    dusk_brightness: 0.42,
    light_count: 140,
  };
  const leadPhotos = [
    { id: "p1", slot: "front" as const, storage_path: "u1/p1.jpg" },
    { id: "m1", slot: "mockup" as const, storage_path: "u1/m1.jpg" },
  ];
  const leadSigned = new Map(leadPhotos.map((photo) => [photo.storage_path, signedUrl("lead-photos", photo.storage_path)]));
  const deck = buildDeckPayload({
    settings: {
      deck: { pages: { what_vesper_is: { headline: "Up once, there all year", words: "A slim track." } } },
      light_looks: [{ key: "warm_white", name: "Warm white", words: "Like a porch light", colours: [{ hex: "#FFB46B", name: "Warm white" }] }],
      company: { name: "Vesper Lighting, Inc.", phone: "(403) 895-9915", address: "448 Strathcona Drive SW, Calgary, AB T3H 1M3" },
      warranty_text: "10 years parts.",
      service_call_fee: null,
    },
    photos: rows,
    signed,
    picker: pickerFrom(trace, leadPhotos, leadSigned),
  });
  return {
    lead: {
      id: "lead-1",
      name: "Test",
      firstName: "Test",
      addressLine: "1 Test Crescent SW",
      neighbourhood: "Aspen Woods",
      soffitColour: "white",
      soffitColour2: "off_white",
      colourKind: "list",
      colourText: "White",
      initials: null,
      initialledAt: null,
    },
    deck,
    colours: { list: [], ralNames: { "9010": "Pure white" }, choice: null, ralCode: null },
    mockupUrl: leadSigned.get("u1/m1.jpg") ?? null,
    mockups: [],
    pricing: {
      pricePerFt: 23,
      boxPrice: 500,
      neighbourDiscount: 150,
      gstEnabled: false,
      gstRate: 0.05,
      gstNumber: null,
      rushFee: null,
      upperAccessFee: null,
      upperGableAccessFee: null,
      priceHoldDays: 120,
      minJobTotal: null,
    },
    draft: null,
    today: "2026-11-08",
  };
}

// Shaped like the page the build serves: tags for its files, and the page's
// data (the payload) inside the framework's script, JSON in a string.
function renderedPage(payload: MeetingPayload): string {
  const data = JSON.stringify(JSON.stringify({ payload })).slice(1, -1);
  return `<!DOCTYPE html><html><head>
<link rel="stylesheet" href="/_next/static/chunks/3x0fgeylw--zy.css" data-precedence="next"/>
<script src="/_next/static/chunks/turbopack-3-ry682tkyiqk.js" async=""></script>
</head><body><div class="dark fixed inset-0 z-50"><p>1 Test Crescent SW, Aspen Woods</p></div>
<script>self.__next_f.push([1,"6:[\\"$\\",\\"$L7\\",null,${data}]"])</script>
</body></html>`;
}

// Every absolute address anywhere in a string.
const ADDRESS = /https?:(?:\\\/|\/){2}[^\s"'\\<>)]+/g;

describe("a meeting page the iPad keeps for no signal", () => {
  const payload = meetingPayload();
  const html = renderedPage(payload);
  const { images } = meetingFiles(html, ORIGIN);

  it("holds every photo the deck needs, the picker's and the mockup included", () => {
    expect(payload.deck.picker?.photoUrl).toBe(signedUrl("lead-photos", "u1/p1.jpg"));
    expect(images).toContain(signedUrl("lead-photos", "u1/p1.jpg"));
    expect(images).toContain(signedUrl("lead-photos", "u1/m1.jpg"));
    expect(images).toContain(signedUrl("presentation", "deck/hero.jpg"));
    expect(images).toContain(signedUrl("presentation", "deck/g2-640.jpg"));
  });

  it("holds only signed storage links, and no other site's address at all", () => {
    expect(images.length).toBeGreaterThan(0);
    for (const image of images) expect(image.startsWith(`${STORAGE}/`)).toBe(true);
    const addresses = (html.match(ADDRESS) ?? []).map((address) => address.replace(/\\\//g, "/"));
    for (const address of addresses) expect(address.startsWith(`${STORAGE}/`), address).toBe(true);
  });

  it("would catch a hotlinked example if one ever slipped into the payload", () => {
    const leaked = renderedPage({ ...payload, deck: { ...payload.deck, words: parseDeckWords({}) }, mockupUrl: "https://images.example-site.com/house.jpg" });
    const addresses = leaked.match(ADDRESS) ?? [];
    expect(addresses.some((address) => !address.startsWith(STORAGE))).toBe(true);
  });
});
