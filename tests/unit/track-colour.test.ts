import { describe, expect, it } from "vitest";
import {
  leadTrackColour,
  needsPowderCoating,
  ralLabel,
  reorderTrackColours,
  sortTrackColours,
  trackColourChoiceSchema,
  trackColourFormSchema,
  trackColourText,
  type TrackColour,
} from "@/lib/leads/track-colour";

const white: TrackColour = { id: "11111111-1111-4111-8111-111111111111", name: "White", ral_code: "9016", sort_order: 1, active: true };
const brown: TrackColour = { id: "22222222-2222-4222-8222-222222222222", name: "Brown", ral_code: null, sort_order: 2, active: false };
const black: TrackColour = { id: "33333333-3333-4333-8333-333333333333", name: "Black", ral_code: null, sort_order: 3, active: true };
const colours = new Map([white, brown, black].map((colour) => [colour.id, colour]));
const ralNames = new Map([
  ["9016", "Traffic white"],
  ["7016", "Anthracite grey"],
]);

describe("a lead's track colour", () => {
  it("is not set until Keenan sets it", () => {
    const colour = leadTrackColour({ track_colour_id: null, track_ral_code: null }, colours, ralNames);
    expect(colour).toEqual({ kind: "none" });
    expect(trackColourText(colour)).toBe("Not set yet");
    expect(needsPowderCoating(colour)).toBe(false);
  });

  it("names a colour from the list, with its RAL code when it has one", () => {
    const colour = leadTrackColour({ track_colour_id: white.id, track_ral_code: null }, colours, ralNames);
    expect(trackColourText(colour)).toBe("White, RAL 9016 Traffic white");
    expect(needsPowderCoating(colour)).toBe(false);
    const plain = leadTrackColour({ track_colour_id: black.id, track_ral_code: null }, colours, ralNames);
    expect(trackColourText(plain)).toBe("Black");
  });

  it("keeps a retired colour on the lead and says so", () => {
    const colour = leadTrackColour({ track_colour_id: brown.id, track_ral_code: null }, colours, ralNames);
    expect(colour).toMatchObject({ kind: "list", name: "Brown", retired: true });
  });

  it("shows a custom colour by its RAL Classic name and as needing powder coating", () => {
    const colour = leadTrackColour({ track_colour_id: null, track_ral_code: "7016" }, colours, ralNames);
    expect(trackColourText(colour)).toBe("Custom, RAL 7016 Anthracite grey");
    expect(needsPowderCoating(colour)).toBe(true);
  });

  it("prints a RAL code alone when its name is not at hand", () => {
    expect(ralLabel("1234", undefined)).toBe("RAL 1234");
  });
});

describe("trackColourChoiceSchema", () => {
  it("clears the colour, picks one from the list, or takes a custom RAL number", () => {
    expect(trackColourChoiceSchema.parse({ choice: "", ral_code: "7016" })).toEqual({
      track_colour_id: null,
      track_ral_code: null,
    });
    expect(trackColourChoiceSchema.parse({ choice: white.id, ral_code: "7016" })).toEqual({
      track_colour_id: white.id,
      track_ral_code: null,
    });
    expect(trackColourChoiceSchema.parse({ choice: "custom", ral_code: " 7016 " })).toEqual({
      track_colour_id: null,
      track_ral_code: "7016",
    });
  });

  it("needs four digits for a custom colour and a real choice otherwise", () => {
    for (const ral_code of ["", "701", "70160", "RAL 7016"]) {
      const result = trackColourChoiceSchema.safeParse({ choice: "custom", ral_code });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.issues[0].path).toEqual(["ral_code"]);
    }
    const nonsense = trackColourChoiceSchema.safeParse({ choice: "purple", ral_code: "" });
    expect(nonsense.success).toBe(false);
    if (!nonsense.success) expect(nonsense.error.issues[0].path).toEqual(["choice"]);
  });
});

describe("trackColourFormSchema", () => {
  it("takes a name and an optional RAL code", () => {
    expect(trackColourFormSchema.parse({ name: "  Charcoal ", ral_code: "" })).toEqual({ name: "Charcoal", ral_code: null });
    expect(trackColourFormSchema.parse({ name: "Charcoal", ral_code: "7016" })).toEqual({ name: "Charcoal", ral_code: "7016" });
    expect(trackColourFormSchema.safeParse({ name: " ", ral_code: "" }).success).toBe(false);
    expect(trackColourFormSchema.safeParse({ name: "x".repeat(41), ral_code: "" }).success).toBe(false);
    expect(trackColourFormSchema.safeParse({ name: "Charcoal", ral_code: "70a6" }).success).toBe(false);
  });
});

describe("reorderTrackColours", () => {
  const list = [black, white, brown];

  it("sorts by the saved order", () => {
    expect(sortTrackColours(list).map((colour) => colour.name)).toEqual(["White", "Brown", "Black"]);
  });

  it("swaps a colour with its neighbour and returns only what moved", () => {
    expect(reorderTrackColours(list, black.id, "up")).toEqual([
      { id: black.id, sort_order: 2 },
      { id: brown.id, sort_order: 3 },
    ]);
    expect(reorderTrackColours(list, white.id, "down")).toEqual([
      { id: brown.id, sort_order: 1 },
      { id: white.id, sort_order: 2 },
    ]);
  });

  it("does nothing at either end or for a colour it doesn't know", () => {
    expect(reorderTrackColours(list, white.id, "up")).toEqual([]);
    expect(reorderTrackColours(list, black.id, "down")).toEqual([]);
    expect(reorderTrackColours(list, "nope", "up")).toEqual([]);
  });

  it("closes gaps left in the order", () => {
    const gappy = [
      { ...white, sort_order: 10 },
      { ...brown, sort_order: 20 },
    ];
    expect(reorderTrackColours(gappy, brown.id, "up")).toEqual([
      { id: brown.id, sort_order: 1 },
      { id: white.id, sort_order: 2 },
    ]);
  });
});
