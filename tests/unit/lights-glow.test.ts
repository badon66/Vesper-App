import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { parseLooks } from "@/lib/deck";
import { lookSignature } from "@/lib/lights/engine";
import {
  BLOOM_ALPHA,
  CORE_MAX_PX,
  CORE_MIN_PX,
  WASH_ALPHA_COLOUR,
  WASH_ALPHA_WHITE,
  WASH_DEPTH_M,
  WASH_FALLOFF,
  coreColour,
  coreMix,
  haloAlpha,
  hexToRgb,
  isWhiteLight,
  lightAt,
  lightOver,
  rgbToCss,
  spriteRadii,
  washAlpha,
  type Rgb,
} from "@/lib/lights/glow";
import { COOL_WHITE, WARM_WHITE, coolWhiteOf, lookLabel, pickerCanvasLabel, warmWhiteOf } from "@/lib/lights/looks";
import { EASE_QUIET, MOTION, cubicBezier, easeQuiet, transition } from "@/lib/motion";

const seedSql = readFileSync(new URL("../../supabase/migrations/20261108080527_round7_deck_words_and_looks.sql", import.meta.url), "utf8");
const SEEDED = parseLooks(JSON.parse(/\$looks\$([\s\S]*?)\$looks\$/.exec(seedSql)?.[1] ?? "[]"));

// Colour in the terms a person sees it: hue in degrees, saturation 0 to 1.
function hsv([r, g, b]: Rgb): { hue: number; sat: number } {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let hue = 0;
  if (d > 0) {
    if (max === r) hue = 60 * (((g - b) / d) % 6);
    else if (max === g) hue = 60 * ((b - r) / d + 2);
    else hue = 60 * ((r - g) / d + 4);
  }
  return { hue: (hue + 360) % 360, sat: max > 0 ? d / max : 0 };
}
const hueGap = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

// What one light looks like on the photo: its own patch (a disc half a
// pitch across each way), screen-blended over a wall at dusk, averaged by area.
const DUSK_WALL: Rgb = [51, 51, 51];
function patch(hex: string, pitch: number, backdrop: Rgb = DUSK_WALL): Rgb {
  const sum = [0, 0, 0];
  let weight = 0;
  for (let r = 0.05; r < pitch / 2; r += 0.1) {
    const colour = lightOver(hex, pitch, r, backdrop);
    for (let at = 0; at < 3; at++) sum[at] += colour[at] * r;
    weight += r;
  }
  return sum.map((value) => value / weight) as Rgb;
}

const SEEDED_COLOURS = [...new Set(SEEDED.flatMap((look) => look.colours.map((colour) => colour.hex.toUpperCase())))];
const COLOURS = SEEDED_COLOURS.filter((hex) => !isWhiteLight(hex));
// The 11 to 12 px pitch of a real front photo at 1180.
const PITCH = 11.5;

describe("one light", () => {
  it("has a core of 0.2p clamped to 1.5 to 4 px, a halo of 0.6p and a bloom of 1.6p", () => {
    expect(spriteRadii(15)).toEqual({ core: 3, halo: 9, bloom: 24 });
    expect(spriteRadii(5).core).toBe(CORE_MIN_PX);
    expect(spriteRadii(30).core).toBe(CORE_MAX_PX);
  });

  it("gives a colour a smaller core, 0.15p with the same 1.5 px floor, so its halo carries the hue", () => {
    expect(spriteRadii(20, false)).toEqual({ core: 3, halo: 12, bloom: 32 });
    expect(spriteRadii(PITCH, false).core).toBeCloseTo(1.725, 6);
    expect(spriteRadii(8, false).core).toBe(CORE_MIN_PX);
    expect(spriteRadii(PITCH, false).halo).toBe(spriteRadii(PITCH, true).halo);
  });

  it("never draws a halo smaller than its core, or a glow wider than 40 px pitch allows", () => {
    const tiny = spriteRadii(1);
    expect(tiny.halo).toBeGreaterThanOrEqual(tiny.core);
    expect(tiny.bloom).toBeGreaterThanOrEqual(tiny.halo);
    expect(spriteRadii(400)).toEqual({ core: 4, halo: 24, bloom: 64 });
    expect(spriteRadii(Number.NaN)).toEqual({ core: CORE_MIN_PX, halo: CORE_MIN_PX, bloom: CORE_MIN_PX });
  });

  it("mixes a white's core about 60% toward white, and Warm white's about 45% so it reads warmer", () => {
    expect(coreMix("#E4EEFF")).toBe(0.6);
    expect(coreColour("#E4EEFF").every((channel) => channel > 240)).toBe(true);
    expect(coreMix("#FFB46B")).toBe(0.45);
    const [r, g, b] = coreColour("#FFB46B");
    expect(r).toBe(255);
    expect(g).toBeCloseTo(213.75, 6);
    expect(b).toBeCloseTo(173.6, 6);
    // Warm beside cool: the warm core keeps clearly more of its colour.
    expect(hsv(coreColour("#FFB46B")).sat).toBeGreaterThan(hsv(coreColour("#E4EEFF")).sat + 0.2);
  });

  it("mixes a colour's core only about 30% toward white, with a 70% halo, for every seeded colour", () => {
    expect(COLOURS.length).toBeGreaterThanOrEqual(5);
    for (const hex of COLOURS) {
      expect(coreMix(hex), hex).toBe(0.3);
      expect(haloAlpha(hex), hex).toBe(0.7);
      // The centre of the light is the colour, not a near-white dot.
      expect(hsv(lightAt(hex, PITCH, 0).rgb).sat, hex).toBeGreaterThan(0.5);
    }
    for (const hex of ["#FFB46B", "#E4EEFF"]) expect(haloAlpha(hex)).toBe(0.55);
  });

  it("reads as its own colour on a wall at dusk at the real pitch: red reads red, amber reads amber, never pastel", () => {
    for (const hex of COLOURS) {
      const seen = hsv(patch(hex, PITCH));
      const own = hsv(hexToRgb(hex));
      expect(hueGap(seen.hue, own.hue), hex).toBeLessThan(10);
      expect(seen.sat, hex).toBeGreaterThan(0.45);
    }
    // Red and amber (Game night) stay apart: red under 15 degrees, amber over 35.
    expect(hsv(patch("#FF2A1F", PITCH)).hue).toBeLessThan(15);
    expect(hsv(patch("#FFB000", PITCH)).hue).toBeGreaterThan(35);
  });

  it("keeps the bloom faint, so red and green blocks never add up to yellow between them", () => {
    expect(BLOOM_ALPHA).toBeLessThanOrEqual(0.1);
    for (const hex of SEEDED_COLOURS) {
      // Halfway to the next light, each gives under a fifth of its strength.
      expect(lightAt(hex, PITCH, PITCH / 2).alpha, hex).toBeLessThan(0.2);
      expect(lightAt(hex, PITCH, 0).alpha).toBe(1);
    }
    // Where a red block meets a green one, the two together stay dimmer
    // than either light's own patch.
    const lift = (rgb: Rgb) => Math.max(...rgb.map((c, at) => c - DUSK_WALL[at]));
    const between = lightOver("#16C83C", PITCH, PITCH / 2, lightOver("#FF2D20", PITCH, PITCH / 2, DUSK_WALL));
    expect(lift(between)).toBeLessThan(Math.min(lift(patch("#FF2D20", PITCH)), lift(patch("#16C83C", PITCH))));
  });

  it("reads colours safely", () => {
    expect(hexToRgb("#132E3F")).toEqual([19, 46, 63]);
    expect(hexToRgb("nonsense")).toEqual([255, 255, 255]);
    expect(rgbToCss([255, 180, 107], 0.55)).toBe("rgba(255, 180, 107, 0.55)");
  });
});

describe("the wash", () => {
  it("is 20% under the whites and 26% under colours, for every seeded colour", () => {
    const whites = new Set(["#FFB46B", "#E4EEFF"]);
    for (const look of SEEDED) {
      for (const colour of look.colours) {
        expect(isWhiteLight(colour.hex), colour.hex).toBe(whites.has(colour.hex));
        expect(washAlpha(colour.hex)).toBe(whites.has(colour.hex) ? WASH_ALPHA_WHITE : WASH_ALPHA_COLOUR);
      }
    }
    expect(WASH_ALPHA_WHITE).toBeCloseTo(0.2, 6);
    expect(WASH_ALPHA_COLOUR).toBeCloseTo(0.26, 6);
  });

  it("falls about 0.6 m down the wall, softly, to nothing", () => {
    expect(WASH_DEPTH_M).toBeCloseTo(0.6, 6);
    let previous: readonly [number, number] = [0, 1];
    for (const stop of WASH_FALLOFF) {
      expect(stop[0]).toBeGreaterThan(previous[0]);
      expect(stop[1]).toBeLessThan(previous[1]);
      previous = stop;
    }
    expect(WASH_FALLOFF[WASH_FALLOFF.length - 1]).toEqual([1, 0]);
    // Still more than half its strength a third of the way down, so it reads
    // as light on the siding, not a thin line under the lights.
    expect(WASH_FALLOFF.find(([at]) => at >= 0.3)?.[1]).toBeGreaterThan(0.5);
  });
});

describe("the whites the drawings use", () => {
  it("are the seeded Warm white and Cool white", () => {
    expect(SEEDED.find((look) => look.key === "warm_white")).toEqual(WARM_WHITE);
    expect(SEEDED.find((look) => look.key === "cool_white")).toEqual(COOL_WHITE);
  });

  it("follow Settings when Keenan has changed them", () => {
    const edited = { ...WARM_WHITE, colours: [{ hex: "#FFC27A", name: "Warm white" }] };
    expect(warmWhiteOf([edited])).toBe(edited);
    expect(warmWhiteOf([])).toBe(WARM_WHITE);
    expect(coolWhiteOf([])).toBe(COOL_WHITE);
  });

  it("re-draw only when their colours or blocks change", () => {
    const renamed = { ...WARM_WHITE, name: "Renamed" };
    expect(lookSignature(WARM_WHITE)).toBe(lookSignature(renamed));
    expect(lookSignature(SEEDED[2])).not.toBe(lookSignature({ ...SEEDED[2], block: 4 }));
  });
});

describe("what a screen reader hears", () => {
  it("names each look with its colour words", () => {
    expect(lookLabel(SEEDED[3])).toBe("Game night, red and gold");
    expect(lookLabel(SEEDED[0])).toBe("Warm white, like a porch light");
    expect(lookLabel({ name: "Plain", words: "" })).toBe("Plain");
  });

  it("describes the lit photo", () => {
    expect(pickerCanvasLabel(WARM_WHITE, "steady")).toBe("Your house at dusk, lit in Warm white, steady.");
    expect(pickerCanvasLabel(SEEDED[4], "chase")).toBe("Your house at dusk, lit in Halloween, chase.");
    expect(pickerCanvasLabel(WARM_WHITE, "off")).toBe("Your house at dusk, with the lights off.");
  });

  it("never uses a dash or an exclamation mark", () => {
    const words = [
      ...SEEDED.map(lookLabel),
      ...SEEDED.flatMap((look) => (["steady", "twinkle", "chase", "off"] as const).map((effect) => pickerCanvasLabel(look, effect))),
    ];
    for (const text of words) {
      expect(text).not.toMatch(/[‒-―−!]/);
      expect(text).not.toMatch(/\s-\s/);
    }
  });
});

describe("quiet motion", () => {
  it("is one easing, as CSS and as a number that matches it", () => {
    expect(EASE_QUIET).toBe("cubic-bezier(0.22, 1, 0.36, 1)");
    expect(easeQuiet(0)).toBe(0);
    expect(easeQuiet(1)).toBe(1);
    expect(easeQuiet(-1)).toBe(0);
    expect(easeQuiet(2)).toBe(1);
    // Fast at first, settling gently.
    expect(easeQuiet(0.25)).toBeGreaterThan(0.6);
    let previous = 0;
    for (let t = 0.01; t <= 1; t += 0.01) {
      const value = easeQuiet(t);
      expect(value).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = value;
    }
    // A straight bezier is a straight line.
    const linear = cubicBezier(0.25, 0.25, 0.75, 0.75);
    expect(linear(0.3)).toBeCloseTo(0.3, 6);
  });

  it("carries every duration the spec gives", () => {
    expect(MOTION).toMatchObject({ dayHoldMs: 500, duskFallMs: 1200, fadeUpMs: 400, lookFadeMs: 300, offFadeMs: 400, moreInMs: 220, moreOutMs: 180 });
    expect(MOTION.reducedFadeMs).toBeLessThanOrEqual(100);
    expect(transition("opacity", 300)).toBe("opacity 300ms cubic-bezier(0.22, 1, 0.36, 1)");
    expect(transition("opacity", 0)).toBe("none");
  });
});
