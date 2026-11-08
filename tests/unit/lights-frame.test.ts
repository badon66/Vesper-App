import { describe, expect, it } from "vitest";

import { IDENTITY, fitContain, screenBox, toScreen, traceFrame, type Transform } from "@/lib/lights/frame";
import type { Rect, Size } from "@/lib/lights/place";

const IPAD_AIR_PHOTO_AREA: Size = { width: 1180, height: 574 };
const PHOTO: Size = { width: 1600, height: 1200 };

// Where a content rect lands on screen.
function onScreen(t: Transform, rect: Rect) {
  const [x0, y0] = toScreen(t, [rect.x, rect.y]);
  const [x1, y1] = toScreen(t, [rect.x + rect.width, rect.y + rect.height]);
  return { x0, y0, x1, y1 };
}

function insideView(t: Transform, rect: Rect, view: Size) {
  const box = onScreen(t, rect);
  const tolerance = 1e-6;
  return box.x0 >= -tolerance && box.y0 >= -tolerance && box.x1 <= view.width + tolerance && box.y1 <= view.height + tolerance;
}

// How much of the view the photo leaves uncovered (Night Background).
function uncovered(t: Transform, photo: Size, view: Size) {
  const box = screenBox(t, photo);
  return {
    left: Math.max(0, box.left),
    top: Math.max(0, box.top),
    right: Math.max(0, view.width - (box.left + box.width)),
    bottom: Math.max(0, view.height - (box.top + box.height)),
  };
}

// The same pseudo-random numbers every run.
function random(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe("fitContain", () => {
  it("fits a rect whole and centres it, like an SVG viewBox with xMidYMid meet", () => {
    const t = fitContain({ x: 10, y: 20, width: 200, height: 100 }, { width: 800, height: 800 });
    expect(t.scale).toBe(4);
    const box = onScreen(t, { x: 10, y: 20, width: 200, height: 100 });
    expect(box).toEqual({ x0: 0, y0: 200, x1: 800, y1: 600 });
  });

  it("is the identity for an empty box", () => {
    expect(fitContain({ x: 0, y: 0, width: 10, height: 10 }, { width: 0, height: 0 })).toEqual(IDENTITY);
  });
});

describe("the light picker's frame", () => {
  it("never crops a wide roofline, and lets the photo fill the rest", () => {
    // Eaves across most of a 4:3 photo, a band about a fifth of its height.
    const bounds: Rect = { x: 200, y: 420, width: 1230, height: 230 };
    const t = traceFrame(bounds, PHOTO, IPAD_AIR_PHOTO_AREA);
    expect(insideView(t, bounds, IPAD_AIR_PHOTO_AREA)).toBe(true);
    // Wider than the view: fitted across with 10% either side.
    expect(t.scale).toBeCloseTo(1180 / (1230 * 1.2), 6);
    const gaps = uncovered(t, PHOTO, IPAD_AIR_PHOTO_AREA);
    expect(gaps).toEqual({ left: 0, top: 0, right: 0, bottom: 0 });
  });

  it("covers the view when that keeps the whole roofline in", () => {
    // A trace about the view's own shape.
    const bounds: Rect = { x: 500, y: 400, width: 600, height: 280 };
    const t = traceFrame(bounds, PHOTO, IPAD_AIR_PHOTO_AREA);
    expect(insideView(t, bounds, IPAD_AIR_PHOTO_AREA)).toBe(true);
    const target = { width: 600 + 2 * 60, height: 280 + 2 * 60 };
    expect(t.scale).toBeCloseTo(Math.max(1180 / target.width, 574 / target.height), 6);
  });

  it("keeps the roofline in when it sits at the photo's edge, with Night Background where the photo runs out", () => {
    const bounds: Rect = { x: 0, y: 30, width: 1600, height: 260 };
    const t = traceFrame(bounds, PHOTO, IPAD_AIR_PHOTO_AREA);
    expect(insideView(t, bounds, IPAD_AIR_PHOTO_AREA)).toBe(true);
    const gaps = uncovered(t, PHOTO, IPAD_AIR_PHOTO_AREA);
    expect(gaps.left + gaps.right).toBeGreaterThan(0);
  });

  it("gives a single straight line room above and below", () => {
    const bounds: Rect = { x: 300, y: 500, width: 800, height: 0 };
    const t = traceFrame(bounds, PHOTO, IPAD_AIR_PHOTO_AREA);
    expect(Number.isFinite(t.scale)).toBe(true);
    expect(insideView(t, bounds, IPAD_AIR_PHOTO_AREA)).toBe(true);
    expect(t.scale).toBeLessThanOrEqual(1180 / 800);
  });

  it("shows the whole photo when there is no trace", () => {
    const t = traceFrame(null, PHOTO, IPAD_AIR_PHOTO_AREA);
    expect(t).toEqual(fitContain({ x: 0, y: 0, width: PHOTO.width, height: PHOTO.height }, IPAD_AIR_PHOTO_AREA));
  });

  it("never crops any trace, on either iPad, on any photo shape", () => {
    const next = random(7);
    const views: Size[] = [IPAD_AIR_PHOTO_AREA, { width: 1366, height: 737 }, { width: 844, height: 280 }];
    const photos: Size[] = [PHOTO, { width: 3200, height: 2400 }, { width: 1600, height: 900 }, { width: 1200, height: 1600 }];
    for (let n = 0; n < 2000; n++) {
      const photo = photos[n % photos.length];
      const view = views[n % views.length];
      const x0 = next() * photo.width;
      const y0 = next() * photo.height;
      const bounds: Rect = {
        x: x0,
        y: y0,
        width: next() * (photo.width - x0),
        height: next() * (photo.height - y0) * (next() < 0.2 ? 0 : 1),
      };
      const t = traceFrame(bounds, photo, view);
      expect(insideView(t, bounds, view), JSON.stringify({ bounds, photo, view })).toBe(true);
      expect(t.scale).toBeGreaterThan(0);
    }
  });
});

describe("screenBox", () => {
  it("is where the photo's layers sit, sharing the canvas's transform", () => {
    const t: Transform = { scale: 0.5, x: -20, y: 10 };
    expect(screenBox(t, PHOTO)).toEqual({ left: -20, top: 10, width: 800, height: 600 });
    expect(toScreen(t, [100, 100])).toEqual([30, 60]);
  });
});
