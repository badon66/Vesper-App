import { describe, expect, it } from "vitest";
import { IDLE, gestureStep, loupeFinger, pendingPlace, previewDraft, previewScale, type Gesture, type GestureContext, type PointerInput } from "@/components/roofline/gesture";
import { EMPTY_DRAFT, SLOP_PX, newLine, placePoint, startScale, type TraceDraft } from "@/components/roofline/trace-edit";
import { MAX_ZOOM } from "@/components/roofline/view";
import type { Pt } from "@/lib/deck";
import type { Vec } from "@/lib/lights/place";

// Round 7 (light_picker.tracing): the tracer's fingers. A 1000 x 500 photo
// on a 1000 x 500 stage at 1:1 (the fitted view), so screen px are photo px.
const photo = { width: 1000, height: 500 };
const stage = { width: 1000, height: 500 };
const base = { scale: 1, x: 0, y: 0 };
const at = (x: number, y: number): Pt => [x / 1000, y / 500];

function context(draft: TraceDraft, extra: Partial<GestureContext> = {}): GestureContext {
  return { step: "trace", draft, scale: null, geo: { photo, view: base }, base, stage, ...extra };
}

type Result = ReturnType<typeof gestureStep>;

// Feeds a run of pointer events, collecting what they asked for.
function run(inputs: PointerInput[], ctx: GestureContext, from: Gesture = IDLE): { gesture: Gesture; results: Result[] } {
  let gesture = from;
  const results: Result[] = [];
  for (const input of inputs) {
    const result = gestureStep(gesture, input, ctx);
    results.push(result);
    gesture = result.gesture;
  }
  return { gesture, results };
}

const down = (id: number, x: number, y: number): PointerInput => ({ type: "down", id, at: [x, y] });
const move = (id: number, x: number, y: number): PointerInput => ({ type: "move", id, at: [x, y] });
const up = (id: number, x: number, y: number): PointerInput => ({ type: "up", id, at: [x, y] });

const traced = [at(100, 200), at(500, 200)].reduce((draft, point) => placePoint(draft, point, { photo, view: base }), { ...EMPTY_DRAFT, photoId: "p" } as TraceDraft);

describe("One finger places a point", () => {
  it("places a point where a tap lifts", () => {
    const { gesture, results } = run([down(1, 250, 100), up(1, 250, 100)], context(EMPTY_DRAFT));
    expect(results.at(-1)?.place).toEqual(at(250, 100));
    expect(gesture).toBe(IDLE);
  });

  it("shows the loupe while the finger is down, and places where it lifts after sliding", () => {
    const ctx = context(EMPTY_DRAFT);
    const pressed = run([down(1, 250, 100), move(1, 262, 108)], ctx);
    expect(loupeFinger(pressed.gesture)).toEqual([262, 108]);
    expect(pendingPlace(pressed.gesture, ctx)?.pt).toEqual(at(262, 108));
    const lifted = gestureStep(pressed.gesture, up(1, 270, 110), ctx);
    expect(lifted.place).toEqual(at(270, 110));
    expect(loupeFinger(lifted.gesture)).toBeNull();
  });

  it("joins a tap near an open line's end to it exactly", () => {
    const ctx = context(newLine(traced));
    const { results } = run([down(1, 512, 190), up(1, 512, 190)], ctx);
    expect(results.at(-1)?.place).toEqual(at(500, 200));
  });

  it("does nothing for a tap on a point with nothing to join", () => {
    // The line being drawn ends at (500, 200): a tap on it can't join itself.
    const { results } = run([down(1, 502, 201), up(1, 502, 201)], context(traced));
    expect(results.at(-1)?.place).toBeUndefined();
  });

  it("drops the press when the system cancels it", () => {
    const { gesture, results } = run([down(1, 250, 100), { type: "cancel", id: 1, at: [250, 100] }], context(EMPTY_DRAFT));
    expect(results.some((result) => result.place)).toBe(false);
    expect(gesture).toBe(IDLE);
  });
});

describe("Dragging a point moves it", () => {
  it("turns a press on a point into a drag once it slides past the slop", () => {
    const ctx = context(traced);
    const still = run([down(1, 101, 201), move(1, 101 + SLOP_PX - 2, 201)], ctx);
    expect(still.gesture.kind).toBe("press");
    const dragged = run([move(1, 140, 240)], ctx, still.gesture);
    expect(dragged.gesture.kind).toBe("drag");
    expect(previewDraft(traced, dragged.gesture, ctx.geo).lines[0].points[0]).toEqual(at(140, 240));
    const done = gestureStep(dragged.gesture, up(1, 150, 250), ctx);
    expect(done.move).toEqual({ ref: { line: 0, index: 0 }, pt: at(150, 250) });
    expect(done.place).toBeUndefined();
  });

  it("slides freely from an empty spot without dragging anything", () => {
    const { gesture } = run([down(1, 300, 400), move(1, 340, 420)], context(traced));
    expect(gesture.kind).toBe("press");
  });
});

describe("Two fingers pinch and pan; one finger never pans", () => {
  it("zooms about the fingers and places no point", () => {
    const ctx = context(EMPTY_DRAFT);
    const { gesture, results } = run([down(1, 400, 250), down(2, 600, 250), move(2, 800, 250)], ctx);
    expect(gesture.kind).toBe("pinch");
    const view = results.at(-1)?.view;
    expect(view?.scale).toBeCloseTo(2);
    // The photo point under the first midpoint (500, 250) is now under the
    // fingers' midpoint (600, 250).
    expect((600 - (view?.x ?? 0)) / (view?.scale ?? 1)).toBeCloseTo(500);
    const lifted = run([up(2, 800, 250), up(1, 400, 250)], ctx, gesture);
    expect(lifted.results.some((result) => result.place)).toBe(false);
    expect(lifted.gesture).toBe(IDLE);
  });

  it("drops what the first finger was doing when a second comes down", () => {
    const ctx = context(traced);
    const { gesture, results } = run([down(1, 101, 201), move(1, 160, 240), down(2, 700, 300), up(1, 160, 240), up(2, 700, 300)], ctx);
    expect(results.some((result) => result.move || result.place)).toBe(false);
    expect(gesture).toBe(IDLE);
  });

  it("stops at 4x", () => {
    const { results } = run([down(1, 490, 250), down(2, 510, 250), move(2, 1000, 250)], context(EMPTY_DRAFT));
    expect(results.at(-1)?.view?.scale).toBeCloseTo(MAX_ZOOM);
  });

  it("lets a finger left down after a pinch do nothing, until another comes back for a new pinch", () => {
    const ctx = context(EMPTY_DRAFT);
    const pinched = run([down(1, 400, 250), down(2, 600, 250), up(2, 600, 250), move(1, 300, 200)], ctx);
    expect(pinched.gesture.kind).toBe("rest");
    expect(pinched.results.some((result) => result.view && result.view.x !== 0)).toBe(false);
    const again = run([down(3, 700, 300)], ctx, pinched.gesture);
    expect(again.gesture.kind).toBe("pinch");
  });

  it("ignores a third finger", () => {
    const ctx = context(EMPTY_DRAFT);
    const { gesture } = run([down(1, 400, 250), down(2, 600, 250), down(3, 500, 400)], ctx);
    expect(gesture.kind).toBe("pinch");
  });
});

describe("The scale step's two handles", () => {
  const scale = startScale([at(400, 360), at(600, 360)]);
  const ctx = context(traced, { step: "scale", scale });

  it("places the first handle where a press away from both lifts", () => {
    const { results } = run([down(1, 120, 420), move(1, 130, 425), up(1, 130, 425)], ctx);
    expect(results.at(-1)?.handle).toEqual({ which: 0, pt: at(130, 425) });
  });

  it("drags a handle by pressing on it", () => {
    const pressed = run([down(1, 602, 362), move(1, 650, 380)], ctx);
    expect(previewScale(scale, pressed.gesture, ctx.geo)?.b).toEqual(at(650, 380));
    expect(gestureStep(pressed.gesture, up(1, 650, 380), ctx).handle).toEqual({ which: 1, pt: at(650, 380) });
  });

  it("never places a trace point in the scale step", () => {
    const { results } = run([down(1, 120, 420), up(1, 120, 420)], ctx);
    expect(results.some((result) => result.place)).toBe(false);
  });

  it("does nothing with a press away from both once both are placed", () => {
    const placed = { ...scale, placed: [true, true] as [boolean, boolean] };
    const { gesture, results } = run([down(1, 120, 100), up(1, 120, 100)], { ...ctx, scale: placed });
    expect(results.some((result) => result.handle)).toBe(false);
    expect(gesture).toBe(IDLE);
  });
});

describe("Movement the tracer never makes", () => {
  it("never moves the view for one finger", () => {
    const strokes: [number, number][] = [
      [100, 100],
      [600, 400],
      [900, 50],
    ];
    const inputs: PointerInput[] = [down(1, 50, 50), ...strokes.map(([x, y]) => move(1, x, y)), up(1, 900, 50)];
    const { results } = run(inputs, context(traced));
    expect(results.some((result) => result.view)).toBe(false);
  });

  it("keeps the finger's spot for the loupe exactly", () => {
    const point: Vec = [333, 222];
    const { gesture } = run([down(1, ...point)], context(EMPTY_DRAFT));
    expect(loupeFinger(gesture)).toEqual(point);
  });
});
