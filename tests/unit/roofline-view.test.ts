import { describe, expect, it } from "vitest";
import {
  FIT_PAD,
  LOUPE_GAP,
  LOUPE_SIZE,
  MAX_ZOOM,
  bandShare,
  clampView,
  fitPhoto,
  loupeSpot,
  loupeView,
  pinchView,
  visibleRect,
  zoomAt,
  zoomOf,
} from "@/components/roofline/view";

// Round 7 (light_picker.tracing): the tracer's view. A 3200 x 2400 photo
// (Keenan's own, kept at 3200 px) on the iPad Air's stage, about 1180 x 640.
const photo = { width: 3200, height: 2400 };
const stage = { width: 1180, height: 640 };
const base = fitPhoto(photo, stage);

describe("Fitting the photo", () => {
  it("shows the whole photo, centred, with a little room around it", () => {
    expect(base.scale).toBeCloseTo((640 - 2 * FIT_PAD) / 2400);
    expect(base.y).toBeCloseTo(FIT_PAD);
    expect(base.x).toBeCloseTo((1180 - 3200 * base.scale) / 2);
    expect(zoomOf(base, base)).toBe(1);
  });

  it("can't zoom out past the fit or in past 4x", () => {
    expect(clampView({ ...base, scale: base.scale / 2 }, base, photo, stage).scale).toBeCloseTo(base.scale);
    expect(zoomOf(clampView({ scale: base.scale * 9, x: 0, y: 0 }, base, photo, stage), base)).toBeCloseTo(MAX_ZOOM);
  });

  it("keeps a zoomed photo on the stage, never more than the pad away from an edge", () => {
    const zoomed = clampView({ scale: base.scale * 3, x: 400, y: -99999 }, base, photo, stage);
    expect(zoomed.x).toBeCloseTo(FIT_PAD);
    expect(zoomed.y).toBeCloseTo(stage.height - 2400 * zoomed.scale - FIT_PAD);
  });
});

describe("Pinching", () => {
  it("keeps the photo point under the fingers under them as they spread", () => {
    const from: [[number, number], [number, number]] = [
      [500, 300],
      [600, 300],
    ];
    const to: [[number, number], [number, number]] = [
      [450, 300],
      [650, 300],
    ];
    const view = pinchView(base, from, to, base, photo, stage);
    expect(zoomOf(view, base)).toBeCloseTo(2);
    const before = (550 - base.x) / base.scale;
    const after = (550 - view.x) / view.scale;
    expect(after).toBeCloseTo(before);
  });

  it("pans with two fingers moving together", () => {
    const zoomed = clampView({ scale: base.scale * 2, x: -400, y: -300 }, base, photo, stage);
    const view = pinchView(
      zoomed,
      [
        [400, 300],
        [500, 300],
      ],
      [
        [430, 320],
        [530, 320],
      ],
      base,
      photo,
      stage,
    );
    expect(view.scale).toBeCloseTo(zoomed.scale);
    expect(view.x - zoomed.x).toBeCloseTo(30);
    expect(view.y - zoomed.y).toBeCloseTo(20);
  });

  it("zooms a mouse wheel about the pointer", () => {
    const view = zoomAt(base, 2, [590, 320], base, photo, stage);
    expect(zoomOf(view, base)).toBeCloseTo(2);
    expect((590 - view.x) / view.scale).toBeCloseTo((590 - base.x) / base.scale);
  });

  it("knows which part of the photo is on screen", () => {
    expect(visibleRect(base, photo, stage)).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    const zoomed = clampView({ scale: base.scale * 4, x: -1000, y: -500 }, base, photo, stage);
    const visible = visibleRect(zoomed, photo, stage);
    expect(visible.width).toBeCloseTo(1180 / (3200 * zoomed.scale));
    expect(visible.x).toBeGreaterThan(0);
  });
});

describe("The loupe", () => {
  it("floats above the finger when there's room", () => {
    expect(loupeSpot([500, 400], stage)).toEqual({ left: 500 - LOUPE_SIZE / 2, top: 400 - LOUPE_GAP - LOUPE_SIZE, side: "above" });
  });

  it("moves beside the finger near the top, on the side with more room", () => {
    expect(loupeSpot([900, 60], stage).side).toBe("left");
    expect(loupeSpot([100, 60], stage)).toMatchObject({ left: 100 + LOUPE_GAP, side: "right" });
  });

  it("stays inside the stage", () => {
    const spot = loupeSpot([5, 300], stage);
    expect(spot.left).toBeGreaterThanOrEqual(0);
    expect(spot.left + LOUPE_SIZE).toBeLessThanOrEqual(stage.width);
    const tiny = loupeSpot([60, 40], { width: 150, height: 150 });
    expect(tiny.side).toBe("below");
    expect(tiny.top + LOUPE_SIZE).toBeLessThanOrEqual(150);
  });

  it("magnifies 3x with the finger's photo point at its centre", () => {
    const inner = loupeView(base, [600, 300]);
    expect(inner.scale).toBeCloseTo(base.scale * 3);
    const point = [(600 - base.x) / base.scale, (300 - base.y) / base.scale];
    expect(point[0] * inner.scale + inner.x).toBeCloseTo(LOUPE_SIZE / 2);
    expect(point[1] * inner.scale + inner.y).toBeCloseTo(LOUPE_SIZE / 2);
  });
});

describe("See it lit's frame", () => {
  it("leaves the deck's band under the photo: 30% at 820 tall, 28% at 1024", () => {
    expect(bandShare(820)).toBeCloseTo(0.3);
    expect(bandShare(1024)).toBeCloseTo(0.28);
    expect(bandShare(922)).toBeCloseTo(0.29);
    expect(bandShare(390)).toBeCloseTo(0.3);
    expect(bandShare(1366)).toBeCloseTo(0.28);
  });
});
