import { describe, expect, it } from "vitest";

import {
  DUSK_TARGET,
  TOO_DARK_LINE,
  duskBrightness,
  duskFilter,
  isTooDark,
  lumaOf,
  meanLuma,
  navyKeep,
  traceBounds01,
} from "@/lib/lights/dusk";

// RGBA pixels, width x height, all one grey, with an optional block of
// another grey.
function pixels(width: number, height: number, grey: number, block?: { x: number; y: number; w: number; h: number; grey: number }) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inside = block && x >= block.x && x < block.x + block.w && y >= block.y && y < block.y + block.h;
      const value = inside ? block.grey : grey;
      const at = (y * width + x) * 4;
      data[at] = value;
      data[at + 1] = value;
      data[at + 2] = value;
      data[at + 3] = 255;
    }
  }
  return data;
}

describe("luminance", () => {
  it("is Rec. 709 luma on the photo's own values, 0 to 1", () => {
    expect(lumaOf(0, 0, 0)).toBe(0);
    expect(lumaOf(255, 255, 255)).toBeCloseTo(1, 9);
    expect(lumaOf(0, 255, 0)).toBeCloseTo(0.7152, 9);
    expect(lumaOf(51, 51, 51)).toBeCloseTo(0.2, 9);
  });

  it("averages inside the trace's bounds only", () => {
    const data = pixels(10, 10, 255, { x: 2, y: 2, w: 4, h: 4, grey: 0 });
    expect(meanLuma(data, 10, 10, { x: 2, y: 2, width: 4, height: 4 })).toBe(0);
    expect(meanLuma(data, 10, 10)).toBeCloseTo(84 / 100, 9);
    // A rect partly off the image counts only what's on it.
    expect(meanLuma(data, 10, 10, { x: 8, y: 8, width: 10, height: 10 })).toBeCloseTo(1, 9);
    expect(meanLuma(data, 10, 10, { x: 20, y: 20, width: 2, height: 2 })).toBe(0);
  });
});

describe("the dusk grade", () => {
  it("keeps about two thirds of the photo under the navy layer", () => {
    expect(navyKeep()).toBeGreaterThan(0.66);
    expect(navyKeep()).toBeLessThan(0.7);
  });

  it("lands a daytime house at about 20% as the customer sees it", () => {
    for (const mean of [0.35, 0.45, 0.6, 0.8]) {
      const brightness = duskBrightness(mean);
      expect(brightness).toBeLessThan(1);
      expect(mean * brightness * navyKeep()).toBeCloseTo(DUSK_TARGET, 2);
    }
  });

  it("never brightens a photo that is already dusky", () => {
    for (const mean of [0.07, 0.12, 0.2, 0.25]) expect(duskBrightness(mean)).toBe(1);
    expect(duskBrightness(0)).toBe(1);
    expect(duskBrightness(Number.NaN)).toBe(1);
  });

  it("stores a factor the database accepts (over 0, at most 1)", () => {
    for (const mean of [0.0001, 0.06, 0.5, 1]) {
      const brightness = duskBrightness(mean);
      expect(brightness).toBeGreaterThan(0);
      expect(brightness).toBeLessThanOrEqual(1);
    }
  });

  it("refuses a photo taken after dark", () => {
    expect(isTooDark(0.05)).toBe(true);
    expect(isTooDark(0.06)).toBe(false);
    expect(isTooDark(Number.NaN)).toBe(true);
    expect(TOO_DARK_LINE).toBe("This photo is too dark to light. Upload a daytime front photo.");
  });

  it("is one fixed CSS filter, never brightened", () => {
    expect(duskFilter(0.587)).toBe("brightness(0.587) saturate(0.65)");
    expect(duskFilter(4)).toBe("brightness(1) saturate(0.65)");
    expect(duskFilter(0)).toBe("brightness(1) saturate(0.65)");
  });
});

describe("the measured area", () => {
  it("is the trace's bounds", () => {
    expect(
      traceBounds01([
        [
          [0.1, 0.4],
          [0.5, 0.2],
        ],
        [
          [0.3, 0.5],
          [0.9, 0.5],
        ],
      ]),
    ).toEqual({ x: 0.1, y: 0.2, width: 0.8, height: 0.3 });
  });

  it("is never thinner than 4% of the photo, so a straight line has a wall to measure", () => {
    const flat = traceBounds01([
      [
        [0.2, 0.5],
        [0.8, 0.5],
      ],
    ]);
    expect(flat?.height).toBeCloseTo(0.04, 9);
    expect(flat?.y).toBeCloseTo(0.48, 9);
    const corner = traceBounds01([
      [
        [0.99, 0.99],
        [0.99, 0.99],
      ],
    ]);
    expect(corner?.x).toBeCloseTo(0.96, 9);
    expect((corner?.x ?? 0) + (corner?.width ?? 0)).toBeLessThanOrEqual(1);
    expect(traceBounds01([])).toBeNull();
  });
});
