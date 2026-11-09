import { describe, expect, it } from "vitest";
import { photoSlotLabel } from "@/lib/leads/door";
import {
  parseSoffitCode,
  SOFFIT_CODE_ERROR,
  soffitCodeBlocks,
  soffitCodeLabel,
  soffitCodeReadBack,
  soffitCodes,
  trackChoiceFor,
  trackChoiceForm,
  trackChoiceIsSet,
  trackChoiceText,
  trackFormKey,
} from "@/lib/leads/soffit-code";
import type { TrackColour } from "@/lib/leads/track-colour";

// Soffit colour code (Keenan, 2026-11-09).

const white: TrackColour = { id: "11111111-1111-4111-8111-111111111111", name: "White", ral_code: "9016", sort_order: 1, active: true };
const offWhite: TrackColour = { id: "22222222-2222-4222-8222-222222222222", name: "Off-white", ral_code: "9010", sort_order: 2, active: true };
const retiredCream: TrackColour = { id: "33333333-3333-4333-8333-333333333333", name: "Cream", ral_code: "9001", sort_order: 3, active: false };
const laterOffWhite: TrackColour = { id: "44444444-4444-4444-8444-444444444444", name: "Off-white (spring)", ral_code: "9010", sort_order: 9, active: true };
const black: TrackColour = { id: "55555555-5555-4555-8555-555555555555", name: "Black", ral_code: null, sort_order: 4, active: true };
const colours = [laterOffWhite, black, retiredCream, offWhite, white];
const ralNames = new Map([
  ["9001", "Cream"],
  ["9010", "Pure white"],
  ["9016", "Traffic white"],
]);
const ralRecord = Object.fromEntries(ralNames);

describe("what is typed for a soffit code", () => {
  it("takes the four digits, with or without RAL in front", () => {
    for (const typed of ["9010", "RAL 9010", "ral9010", " 9010 ", "RAL-9010", "Ral  9010"]) {
      expect(parseSoffitCode(typed)).toEqual({ ok: true, code: "9010" });
    }
  });

  it("reads an empty box as clearing the code", () => {
    expect(parseSoffitCode("")).toEqual({ ok: true, code: null });
    expect(parseSoffitCode("   ")).toEqual({ ok: true, code: null });
  });

  it("refuses anything else with a plain message", () => {
    for (const typed of ["901", "90100", "RAL", "R9010", "9010a", "90 10", "ral 9010 white", "RAL K7"]) {
      expect(parseSoffitCode(typed)).toEqual({ ok: false, error: SOFFIT_CODE_ERROR });
    }
    expect(SOFFIT_CODE_ERROR).toBe("Type the four digits after RAL in the colour book, like 9010.");
  });
});

describe("the code's name", () => {
  it("is shown the way the track colour shows a RAL code", () => {
    expect(soffitCodeLabel("9010", ralNames)).toBe("RAL 9010 Pure white");
    expect(soffitCodeLabel("9010", ralRecord)).toBe("RAL 9010 Pure white");
    expect(soffitCodeLabel("1234", ralNames)).toBe("RAL 1234");
  });

  it("is read back as it is typed, once four digits are in", () => {
    expect(soffitCodeReadBack("", ralRecord)).toEqual({ tone: "hint", text: "The four digits after RAL, like 9010." });
    expect(soffitCodeReadBack("90", ralRecord)).toEqual({ tone: "hint", text: "Four digits, like 9010." });
    expect(soffitCodeReadBack("RAL 9010", ralRecord)).toEqual({ tone: "name", text: "RAL 9010 Pure white" });
    expect(soffitCodeReadBack("1234", ralRecord)).toEqual({ tone: "hint", text: "That number isn't on the RAL Classic list." });
  });
});

describe("Use for the track", () => {
  it("picks the stock colour on Keenan's list with that RAL code", () => {
    expect(trackChoiceFor("9016", colours)).toEqual({ kind: "list", colour: white });
  });

  it("picks the first such colour in Keenan's order when two share a code", () => {
    expect(trackChoiceFor("9010", colours)).toEqual({ kind: "list", colour: offWhite });
  });

  it("never picks a retired colour: Custom with the code instead", () => {
    expect(trackChoiceFor("9001", colours)).toEqual({ kind: "custom", ralCode: "9001" });
  });

  it("is Custom with the code when no colour on the list has it", () => {
    expect(trackChoiceFor("7016", colours)).toEqual({ kind: "custom", ralCode: "7016" });
    expect(trackChoiceFor("9016", [])).toEqual({ kind: "custom", ralCode: "9016" });
  });

  it("sends what the track colour form sends", () => {
    expect(trackChoiceForm(trackChoiceFor("9016", colours))).toEqual({ choice: white.id, ral_code: "" });
    expect(trackChoiceForm(trackChoiceFor("7016", colours))).toEqual({ choice: "custom", ral_code: "7016" });
  });

  it("knows when the track colour is that already", () => {
    const stock = trackChoiceFor("9016", colours);
    expect(trackChoiceIsSet(stock, { track_colour_id: white.id, track_ral_code: null })).toBe(true);
    expect(trackChoiceIsSet(stock, { track_colour_id: null, track_ral_code: "9016" })).toBe(false);
    expect(trackChoiceIsSet(stock, { track_colour_id: null, track_ral_code: null })).toBe(false);
    const custom = trackChoiceFor("9001", colours);
    expect(trackChoiceIsSet(custom, { track_colour_id: null, track_ral_code: "9001" })).toBe(true);
    expect(trackChoiceIsSet(custom, { track_colour_id: retiredCream.id, track_ral_code: null })).toBe(false);
  });

  it("names the choice in the track colour card's words", () => {
    expect(trackChoiceText(trackChoiceFor("9016", colours), ralNames)).toBe("White, RAL 9016 Traffic white");
    expect(trackChoiceText(trackChoiceFor("9001", colours), ralNames)).toBe("Custom, RAL 9001 Cream");
    expect(trackChoiceText(trackChoiceFor("7016", colours), ralNames)).toBe("Custom, RAL 7016");
  });
});

describe("the soffit code blocks", () => {
  const lead = {
    soffit_colour: "off_white" as const,
    soffit_colour_2: null,
    soffit_ral_code: "9001",
    soffit_ral_code_2: null,
    track_colour_id: null,
    track_ral_code: null,
  };

  it("one for a soffit of one colour, with no colour name, its code named and its photo", () => {
    const blocks = soffitCodeBlocks(lead, { isOwner: false, colours, ralNames, photoUrls: { soffit_book: "https://photo/1" } });
    expect(blocks).toEqual([
      { which: 1, colourName: null, code: "9001", codeLabel: "RAL 9001 Cream", slot: "soffit_book", photoUrl: "https://photo/1", track: null },
    ]);
  });

  it("one even before the soffit colour is answered, or when it's Not sure", () => {
    expect(soffitCodeBlocks({ ...lead, soffit_colour: null, soffit_ral_code: null }, { isOwner: false, colours, ralNames, photoUrls: {} })).toEqual([
      { which: 1, colourName: null, code: null, codeLabel: null, slot: "soffit_book", photoUrl: null, track: null },
    ]);
    expect(soffitCodeBlocks({ ...lead, soffit_colour: "not_sure" }, { isOwner: false, colours, ralNames, photoUrls: {} })).toHaveLength(1);
  });

  it("two for a split soffit, each named for its colour, with its own code and photo", () => {
    const split = { ...lead, soffit_colour_2: "white" as const, soffit_ral_code_2: "9016" };
    const blocks = soffitCodeBlocks(split, { isOwner: false, colours, ralNames, photoUrls: { soffit_book_2: "https://photo/2" } });
    expect(blocks.map((block) => [block.which, block.colourName, block.codeLabel, block.slot, block.photoUrl])).toEqual([
      [1, "Off-white or cream", "RAL 9001 Cream", "soffit_book", null],
      [2, "White", "RAL 9016 Traffic white", "soffit_book_2", "https://photo/2"],
    ]);
  });

  it("offers Use for the track to Keenan only, and only once a code is saved", () => {
    const split = { ...lead, soffit_colour_2: "white" as const, soffit_ral_code_2: "9016", track_colour_id: white.id };
    const owner = soffitCodeBlocks(split, { isOwner: true, colours, ralNames, photoUrls: {} });
    expect(owner.map((block) => block.track)).toEqual([
      { set: false, text: "Custom, RAL 9001 Cream", custom: true },
      { set: true, text: "White, RAL 9016 Traffic white", custom: false },
    ]);
    expect(soffitCodeBlocks(split, { isOwner: false, colours, ralNames, photoUrls: {} }).map((block) => block.track)).toEqual([null, null]);
    expect(soffitCodeBlocks({ ...lead, soffit_ral_code: null }, { isOwner: true, colours, ralNames, photoUrls: {} })[0].track).toBeNull();
  });

  it("lists the codes a lead carries, for reading their names", () => {
    expect(soffitCodes({ soffit_ral_code: "9001", soffit_ral_code_2: "9016" })).toEqual(["9001", "9016"]);
    expect(soffitCodes({ soffit_ral_code: null, soffit_ral_code_2: null })).toEqual([]);
  });
});

describe("the track colour form's key", () => {
  const lead = {
    soffit_colour: "off_white" as const,
    soffit_colour_2: "white" as const,
    soffit_ral_code: "9001" as string | null,
    soffit_ral_code_2: "9016" as string | null,
    track_colour_id: null as string | null,
    track_ral_code: null as string | null,
  };
  type Track = { track_colour_id: string | null; track_ral_code: string | null };
  const keyFor = (track: Track, codes: Partial<typeof lead> = {}) =>
    trackFormKey(soffitCodeBlocks({ ...lead, ...codes, ...track }, { isOwner: true, colours, ralNames, photoUrls: {} }));
  const none: Track = { track_colour_id: null, track_ral_code: null };

  it("changes when Use for the track would, so the form shows the colour it set", () => {
    expect(keyFor({ track_colour_id: white.id, track_ral_code: null })).not.toBe(keyFor(none));
    expect(keyFor({ track_colour_id: null, track_ral_code: "9001" })).not.toBe(keyFor(none));
  });

  it("stays put when the form saves a colour no code would set, so its Saved. stays", () => {
    expect(keyFor({ track_colour_id: offWhite.id, track_ral_code: null })).toBe(keyFor(none));
    expect(keyFor({ track_colour_id: null, track_ral_code: "7016" })).toBe(keyFor(none));
  });

  it("never changes for a lead with no code", () => {
    const noCodes = { soffit_ral_code: null, soffit_ral_code_2: null };
    expect(keyFor({ track_colour_id: white.id, track_ral_code: null }, noCodes)).toBe(keyFor(none, noCodes));
    expect(keyFor({ track_colour_id: null, track_ral_code: "9001" }, noCodes)).toBe(keyFor(none, noCodes));
  });
});

describe("the colour book photo slots", () => {
  it("are named wherever a slot is named", () => {
    expect(photoSlotLabel("soffit_book")).toBe("Colour book");
    expect(photoSlotLabel("soffit_book_2")).toBe("Second colour book");
    expect(photoSlotLabel("front")).toBe("Front");
  });
});
