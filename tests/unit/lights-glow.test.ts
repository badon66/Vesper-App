import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { parseLooks } from "@/lib/deck";
import { lookSignature } from "@/lib/lights/engine";
import {
  CORE_MAX_PX,
  CORE_MIN_PX,
  WASH_ALPHA_COLOUR,
  WASH_ALPHA_WHITE,
  coreColour,
  hexToRgb,
  isWhiteLight,
  rgbToCss,
  spriteRadii,
  washAlpha,
} from "@/lib/lights/glow";
import { COOL_WHITE, WARM_WHITE, coolWhiteOf, lookLabel, pickerCanvasLabel, warmWhiteOf } from "@/lib/lights/looks";
import { EASE_QUIET, MOTION, cubicBezier, easeQuiet, transition } from "@/lib/motion";

const seedSql = readFileSync(new URL("../../supabase/migrations/20261108080527_round7_deck_words_and_looks.sql", import.meta.url), "utf8");
const SEEDED = parseLooks(JSON.parse(/\$looks\$([\s\S]*?)\$looks\$/.exec(seedSql)?.[1] ?? "[]"));

describe("one light", () => {
  it("has a core of 0.2p clamped to 1.5 to 4 px, a halo of 0.6p and a bloom of 1.6p", () => {
    expect(spriteRadii(15)).toEqual({ core: 3, halo: 9, bloom: 24 });
    expect(spriteRadii(5).core).toBe(CORE_MIN_PX);
    expect(spriteRadii(30).core).toBe(CORE_MAX_PX);
  });

  it("never draws a halo smaller than its core, or a glow wider than 40 px pitch allows", () => {
    const tiny = spriteRadii(1);
    expect(tiny.halo).toBeGreaterThanOrEqual(tiny.core);
    expect(tiny.bloom).toBeGreaterThanOrEqual(tiny.halo);
    expect(spriteRadii(400)).toEqual({ core: 4, halo: 24, bloom: 64 });
    expect(spriteRadii(Number.NaN)).toEqual({ core: CORE_MIN_PX, halo: CORE_MIN_PX, bloom: CORE_MIN_PX });
  });

  it("mixes the core about 60% toward white", () => {
    const [r, g, b] = coreColour("#FFB46B");
    expect(r).toBe(255);
    expect(g).toBeCloseTo(225, 6);
    expect(b).toBeCloseTo(195.8, 6);
    expect(coreColour("#E4EEFF").every((channel) => channel > 240)).toBe(true);
  });

  it("reads colours safely", () => {
    expect(hexToRgb("#132E3F")).toEqual([19, 46, 63]);
    expect(hexToRgb("nonsense")).toEqual([255, 255, 255]);
    expect(rgbToCss([255, 180, 107], 0.55)).toBe("rgba(255, 180, 107, 0.55)");
  });
});

describe("the wash", () => {
  it("is 12% under the whites and 18% under colours, for every seeded colour", () => {
    const whites = new Set(["#FFB46B", "#E4EEFF"]);
    for (const look of SEEDED) {
      for (const colour of look.colours) {
        expect(isWhiteLight(colour.hex), colour.hex).toBe(whites.has(colour.hex));
        expect(washAlpha(colour.hex)).toBe(whites.has(colour.hex) ? WASH_ALPHA_WHITE : WASH_ALPHA_COLOUR);
      }
    }
    expect(WASH_ALPHA_WHITE).toBeGreaterThanOrEqual(0.1);
    expect(WASH_ALPHA_WHITE).toBeLessThanOrEqual(0.14);
    expect(WASH_ALPHA_COLOUR).toBeGreaterThanOrEqual(0.16);
    expect(WASH_ALPHA_COLOUR).toBeLessThanOrEqual(0.2);
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
