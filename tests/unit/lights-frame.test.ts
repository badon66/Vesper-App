import { describe, expect, it } from "vitest";

import { IDENTITY, TRACE_MARGIN, fitContain, scaleHandles, screenBox, toScreen, traceFrame, type Transform } from "@/lib/lights/frame";
import type { Rect, Size, Vec } from "@/lib/lights/place";

const IPAD_AIR_PHOTO_AREA: Size = { width: 1180, height: 574 };
const IPAD_PRO_PHOTO_AREA: Size = { width: 1366, height: 737 };
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

  it("fits the roofline and its margin whole, with the photo covering the rest of the view", () => {
    // A trace about the view's own shape.
    const bounds: Rect = { x: 500, y: 400, width: 600, height: 280 };
    const t = traceFrame(bounds, PHOTO, IPAD_AIR_PHOTO_AREA);
    const target: Rect = { x: 440, y: 340, width: 600 + 2 * 60, height: 280 + 2 * 60 };
    expect(insideView(t, target, IPAD_AIR_PHOTO_AREA)).toBe(true);
    expect(t.scale).toBeCloseTo(Math.min(1180 / target.width, 574 / target.height), 6);
    expect(uncovered(t, PHOTO, IPAD_AIR_PHOTO_AREA)).toEqual({ left: 0, top: 0, right: 0, bottom: 0 });
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

// The review's stand-in house (2400 x 1800): a two-storey with a gable and
// an attached garage, traced along its eaves, gable and garage line, and
// its double garage door's bottom corners marked as the scale.
const HOUSE: Size = { width: 2400, height: 1800 };
const HOUSE_ROOFLINE: Rect = { x: 200, y: 250, width: 1760, height: 700 };
const HOUSE_HANDLES: Vec[] = [
  [330, 1450],
  [820, 1450],
];

describe("the frame brings in the doors and some ground", () => {
  it("finds the scale handles on the photo, and leaves out one that is off it or unreadable", () => {
    expect(scaleHandles({ a: [0.25, 0.5], b: [0.75, 0.5] }, PHOTO)).toEqual([
      [400, 600],
      [1200, 600],
    ]);
    expect(scaleHandles({ a: [1.4, 0.5], b: [Number.NaN, 0.5] }, PHOTO)).toEqual([]);
    expect(scaleHandles(null, PHOTO)).toEqual([]);
  });

  it("shows the garage door and the ground under it when the photo has room", () => {
    // A front photo from across the street: the roofline in the upper half,
    // the garage door's bottom at 70% of the height.
    const bounds: Rect = { x: 300, y: 330, width: 1000, height: 300 };
    const handles: Vec[] = [
      [420, 840],
      [760, 840],
    ];
    for (const view of [IPAD_AIR_PHOTO_AREA, IPAD_PRO_PHOTO_AREA]) {
      const t = traceFrame(bounds, PHOTO, view, TRACE_MARGIN, handles);
      expect(insideView(t, bounds, view)).toBe(true);
      // The handles and some ground below them.
      const [, handleY] = toScreen(t, handles[0]);
      expect(handleY).toBeLessThan(view.height - 10);
      // Never letterboxed for them.
      expect(uncovered(t, PHOTO, view)).toEqual({ left: 0, top: 0, right: 0, bottom: 0 });
    }
  });

  it("keeps the margin above the roofline's top point, and gives the extra to the wall and ground below", () => {
    const bounds: Rect = { x: 300, y: 330, width: 1000, height: 300 };
    const handles: Vec[] = [
      [420, 840],
      [760, 840],
    ];
    const t = traceFrame(bounds, PHOTO, IPAD_AIR_PHOTO_AREA, TRACE_MARGIN, handles);
    const pad = TRACE_MARGIN * 1000;
    const [, peakY] = toScreen(t, [0, bounds.y]);
    expect(peakY).toBeCloseTo(pad * t.scale, 6);
    // A trace in the upper half of a 4:3 photo keeps more photo below it
    // than above it.
    const [, eaveY] = toScreen(t, [0, bounds.y + bounds.height]);
    expect(IPAD_AIR_PHOTO_AREA.height - eaveY).toBeGreaterThan(peakY);
  });

  it("on a house that fills the photo, keeps the whole margin above the peak and lets the bottom give way", () => {
    // The installed app's shorter decks too (1180 x 796, 1366 x 1000, and
    // the rehearsal frame's 1180 x 764): the photo area under the tray.
    const views: Size[] = [IPAD_AIR_PHOTO_AREA, IPAD_PRO_PHOTO_AREA, { width: 1180, height: 550 }, { width: 1366, height: 718 }, { width: 1180, height: 518 }];
    for (const view of views) {
      const t = traceFrame(HOUSE_ROOFLINE, HOUSE, view, TRACE_MARGIN, HOUSE_HANDLES);
      expect(insideView(t, HOUSE_ROOFLINE, view)).toBe(true);
      expect(uncovered(t, HOUSE, view)).toEqual({ left: 0, top: 0, right: 0, bottom: 0 });
      // The whole margin above the roofline's top point: it never slides
      // down to bring in the doors (round 7 after-review).
      const subjectPad = TRACE_MARGIN * Math.max(1760, 1450 - 250);
      const [, peakY] = toScreen(t, [0, HOUSE_ROOFLINE.y]);
      expect(peakY, JSON.stringify(view)).toBeGreaterThanOrEqual(subjectPad * t.scale - 1e-6);
      // Never less of the house below the garage line than the roofline
      // plus 10% alone gives, and on both iPads' full decks clearly more.
      const old = traceFrame(HOUSE_ROOFLINE, HOUSE, view);
      const below = (frame: Transform) => (view.height - frame.y) / frame.scale;
      expect(below(t)).toBeGreaterThanOrEqual(below(old) - 1e-6);
      if (view === IPAD_AIR_PHOTO_AREA || view === IPAD_PRO_PHOTO_AREA) expect(below(t)).toBeGreaterThan(below(old) + 100);
    }
    // On the 13-inch iPad most of the garage door shows: the frame's bottom
    // edge cuts it within a tenth of the picture's height of its bottom.
    const pro = traceFrame(HOUSE_ROOFLINE, HOUSE, IPAD_PRO_PHOTO_AREA, TRACE_MARGIN, HOUSE_HANDLES);
    expect(toScreen(pro, HOUSE_HANDLES[0])[1]).toBeLessThanOrEqual(IPAD_PRO_PHOTO_AREA.height * 1.1);
  });

  it("keeps the margin above the peak on a tall subject, the bottom giving way before the top", () => {
    // A close front photo: the roofline high, the door's bottom near the
    // photo's foot, so the view can't hold all of it at the cover scale.
    for (const view of [IPAD_AIR_PHOTO_AREA, IPAD_PRO_PHOTO_AREA]) {
      const bounds: Rect = { x: 200, y: 260, width: 1200, height: 360 };
      const handles: Vec[] = [
        [500, 1150],
        [900, 1150],
      ];
      const t = traceFrame(bounds, PHOTO, view, TRACE_MARGIN, handles);
      const pad = TRACE_MARGIN * Math.max(1200, 1150 - 260);
      const [, peakY] = toScreen(t, [0, bounds.y]);
      expect(peakY).toBeCloseTo(pad * t.scale, 6);
      // The handles fall below the bottom edge: the doors give way, not the sky.
      expect(toScreen(t, handles[0])[1]).toBeGreaterThan(view.height);
    }
  });

  it("keeps what the photo has above a peak near its top edge, never sliding the peak onto the edge", () => {
    // A front photo taken close: the peak 30 to 90 px from the photo's top,
    // the garage door's bottom far below, so the bottom has to give way.
    for (const view of [IPAD_AIR_PHOTO_AREA, IPAD_PRO_PHOTO_AREA]) {
      for (const y of [10, 30, 60, 90]) {
        const bounds: Rect = { x: 250, y, width: 1100, height: 420 };
        const handles: Vec[] = [
          [400, y + 750],
          [800, y + 750],
        ];
        const t = traceFrame(bounds, PHOTO, view, TRACE_MARGIN, handles);
        expect(insideView(t, bounds, view)).toBe(true);
        const subjectPad = TRACE_MARGIN * Math.max(1100, 750);
        const [, peakY] = toScreen(t, [0, y]);
        expect(peakY, `peak at ${y}`).toBeGreaterThanOrEqual(Math.min(subjectPad / 2, y) * t.scale - 1e-6);
      }
    }
  });

  it("never lets a handle off the photo, or unreadable, move the frame", () => {
    const bounds: Rect = { x: 300, y: 330, width: 1000, height: 300 };
    const plain = traceFrame(bounds, PHOTO, IPAD_AIR_PHOTO_AREA);
    expect(traceFrame(bounds, PHOTO, IPAD_AIR_PHOTO_AREA, TRACE_MARGIN, [[-50, 2000]])).toEqual(plain);
    expect(traceFrame(bounds, PHOTO, IPAD_AIR_PHOTO_AREA, TRACE_MARGIN, [[Number.NaN, 400]])).toEqual(plain);
  });

  it("never crops the roofline, whatever the handles, on either iPad, on any photo shape", () => {
    const next = random(11);
    const views: Size[] = [IPAD_AIR_PHOTO_AREA, IPAD_PRO_PHOTO_AREA, { width: 844, height: 280 }];
    const photos: Size[] = [PHOTO, HOUSE, { width: 1600, height: 900 }, { width: 1200, height: 1600 }];
    for (let n = 0; n < 2000; n++) {
      const photo = photos[n % photos.length];
      const view = views[n % views.length];
      const x0 = next() * photo.width;
      const y0 = next() * photo.height;
      const bounds: Rect = { x: x0, y: y0, width: next() * (photo.width - x0), height: next() * (photo.height - y0) };
      const handles: Vec[] = [
        [next() * photo.width, y0 + next() * (photo.height - y0)],
        [next() * photo.width, y0 + next() * (photo.height - y0)],
      ];
      const t = traceFrame(bounds, photo, view, TRACE_MARGIN, handles);
      expect(insideView(t, bounds, view), JSON.stringify({ bounds, handles, photo, view })).toBe(true);
      expect(t.scale).toBeGreaterThan(0);
      // The roofline's lowest point keeps half its margin above the bottom
      // edge, or all the photo has below it.
      const roofPad = TRACE_MARGIN * Math.max(bounds.width, bounds.height);
      const [, peakY] = toScreen(t, [0, bounds.y]);
      const [, lowY] = toScreen(t, [0, bounds.y + bounds.height]);
      const below = photo.height - (bounds.y + bounds.height);
      const label = JSON.stringify({ bounds, handles, photo, view });
      expect(view.height - lowY, label).toBeGreaterThanOrEqual(Math.min(roofPad / 2, below) * t.scale - 1e-6);
      // The roofline's own margin above its top point, or all the photo has
      // above it: never less to bring in a door. Only the roofline's lowest
      // point can take some of it, and never more than half.
      expect(peakY, label).toBeGreaterThanOrEqual(Math.min(roofPad / 2, bounds.y) * t.scale - 1e-6);
      if (peakY < Math.min(roofPad, bounds.y) * t.scale - 1e-6) {
        expect(view.height - lowY, label).toBeLessThanOrEqual((roofPad / 2) * t.scale + 1e-6);
      }
    }
  });

  it("keeps the roofline's lowest lights half its margin above the bottom edge, the top giving only that", () => {
    // A roofline about half the photo's height, its lowest eave near the
    // garage door's bottom: the whole margin above would put the lowest
    // lights on the tray's edge.
    const bounds: Rect = { x: 280, y: 480, width: 1300, height: 640 };
    const handles: Vec[] = [
      [600, 1180],
      [1400, 1180],
    ];
    for (const view of [IPAD_AIR_PHOTO_AREA, { width: 1180, height: 518 }]) {
      const t = traceFrame(bounds, PHOTO, view, TRACE_MARGIN, handles);
      const roofPad = TRACE_MARGIN * 1300;
      const [, peakY] = toScreen(t, [0, bounds.y]);
      const [, lowY] = toScreen(t, [0, bounds.y + bounds.height]);
      expect(view.height - lowY, JSON.stringify(view)).toBeGreaterThanOrEqual((roofPad / 2) * t.scale - 1e-6);
      expect(peakY, JSON.stringify(view)).toBeGreaterThanOrEqual((roofPad / 2) * t.scale - 1e-6);
    }
    // At 1180 x 574 the photo still covers the view, and the top gives only
    // what the lowest lights need: they sit exactly half the margin up.
    const t = traceFrame(bounds, PHOTO, IPAD_AIR_PHOTO_AREA, TRACE_MARGIN, handles);
    expect(uncovered(t, PHOTO, IPAD_AIR_PHOTO_AREA)).toEqual({ left: 0, top: 0, right: 0, bottom: 0 });
    const [, lowY] = toScreen(t, [0, bounds.y + bounds.height]);
    expect(IPAD_AIR_PHOTO_AREA.height - lowY).toBeCloseTo(65 * t.scale, 6);
  });
});

describe("screenBox", () => {
  it("is where the photo's layers sit, sharing the canvas's transform", () => {
    const t: Transform = { scale: 0.5, x: -20, y: 10 };
    expect(screenBox(t, PHOTO)).toEqual({ left: -20, top: 10, width: 800, height: 600 });
    expect(toScreen(t, [100, 100])).toEqual([30, 60]);
  });
});
