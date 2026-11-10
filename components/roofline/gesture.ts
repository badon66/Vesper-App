import type { Pt } from "@/lib/deck";
import type { Transform } from "@/lib/lights/frame";
import type { Size, Vec } from "@/lib/lights/place";
import {
  SLOP_PX,
  hitHandle,
  hitPoint,
  movePoint,
  moveSnap,
  nextHandle,
  placeHandle,
  placeSnap,
  screenToPt,
  type End,
  type Geo,
  type PointRef,
  type ScaleDraft,
  type TraceDraft,
} from "@/components/roofline/trace-edit";
import { pinchView } from "@/components/roofline/view";

// The tracer's fingers (round 7, light_picker.tracing), as a pure state
// machine so every rule is unit tested:
//   - one finger: press, slide with the loupe, lift to place a point;
//   - a press that starts on a point and slides past SLOP_PX drags that
//     point instead; a tap on a point joins it when it's an open line's
//     end, and otherwise does nothing;
//   - two fingers pinch (to 4x) and pan; one finger never pans, and
//     whatever the first finger was doing is dropped, so a pinch never
//     leaves a stray point;
//   - fingers still down after a pinch do nothing until they lift (or a
//     second one comes back down for another pinch);
//   - in the scale step, a press on a handle drags it, and a press away
//     from both places the next handle not yet placed.
// Pointer positions are screen px within the stage.

export type Step = "trace" | "scale";

export type PointerInput = { type: "down" | "move" | "up" | "cancel"; id: number; at: Vec };

export type Gesture =
  | { kind: "idle" }
  | { kind: "press"; id: number; start: Vec; at: Vec; grab: PointRef | null }
  | { kind: "drag"; id: number; ref: PointRef; at: Vec }
  | { kind: "handle"; id: number; which: 0 | 1; at: Vec }
  | { kind: "pinch"; ids: [number, number]; from: [Vec, Vec]; to: [Vec, Vec]; startView: Transform }
  | { kind: "rest"; pts: Record<number, Vec> };

export const IDLE: Gesture = { kind: "idle" };

export type GestureContext = {
  step: Step;
  draft: TraceDraft;
  scale: ScaleDraft | null;
  geo: Geo;
  base: Transform;
  stage: Size;
};

export type GestureResult = {
  gesture: Gesture;
  // A point to place (trace step): already snapped.
  place?: Pt;
  // A dragged point to keep where it was let go.
  move?: { ref: PointRef; pt: Pt };
  // A scale handle put down.
  handle?: { which: 0 | 1; pt: Pt };
  // The view after a pinch moved.
  view?: Transform;
};

const dist = (a: Vec, b: Vec) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// The finger a one-finger gesture follows, if any.
function oneFinger(gesture: Gesture): { id: number; at: Vec } | null {
  if (gesture.kind === "press" || gesture.kind === "drag" || gesture.kind === "handle") return { id: gesture.id, at: gesture.at };
  return null;
}

function startPinch(a: { id: number; at: Vec }, b: { id: number; at: Vec }, view: Transform): Gesture {
  return { kind: "pinch", ids: [a.id, b.id], from: [a.at, b.at], to: [a.at, b.at], startView: view };
}

function withoutPt(pts: Record<number, Vec>, id: number): Record<number, Vec> {
  const next = { ...pts };
  delete next[id];
  return next;
}

export function gestureStep(gesture: Gesture, input: PointerInput, ctx: GestureContext): GestureResult {
  const { type, id, at } = input;
  const finger = oneFinger(gesture);

  if (type === "down") {
    if (gesture.kind === "idle") {
      if (ctx.step === "trace") {
        return { gesture: { kind: "press", id, start: at, at, grab: hitPoint(ctx.draft, at, ctx.geo) } };
      }
      const which = ctx.scale ? (hitHandle(ctx.scale, at, ctx.geo) ?? nextHandle(ctx.scale)) : null;
      if (which === null) return { gesture: { kind: "rest", pts: { [id]: at } } };
      return { gesture: { kind: "handle", id, which, at } };
    }
    // A second finger: pinch, and drop whatever the first was doing.
    if (finger && finger.id !== id) return { gesture: startPinch(finger, { id, at }, ctx.geo.view) };
    if (gesture.kind === "rest") {
      const pts = { ...gesture.pts, [id]: at };
      const ids = Object.keys(pts).map(Number);
      if (ids.length === 2) return { gesture: startPinch({ id: ids[0], at: pts[ids[0]] }, { id: ids[1], at: pts[ids[1]] }, ctx.geo.view) };
      return { gesture: { kind: "rest", pts } };
    }
    // A third finger during a pinch is ignored.
    return { gesture };
  }

  if (type === "move") {
    if (gesture.kind === "press" && gesture.id === id) {
      if (gesture.grab && dist(gesture.start, at) > SLOP_PX) return { gesture: { kind: "drag", id, ref: gesture.grab, at } };
      return { gesture: { ...gesture, at } };
    }
    if ((gesture.kind === "drag" || gesture.kind === "handle") && gesture.id === id) return { gesture: { ...gesture, at } };
    if (gesture.kind === "pinch") {
      const k = gesture.ids.indexOf(id);
      if (k < 0) return { gesture };
      const to: [Vec, Vec] = k === 0 ? [at, gesture.to[1]] : [gesture.to[0], at];
      const next: Gesture = { ...gesture, to };
      return { gesture: next, view: pinchView(gesture.startView, gesture.from, to, ctx.base, ctx.geo.photo, ctx.stage) };
    }
    if (gesture.kind === "rest" && gesture.pts[id]) return { gesture: { kind: "rest", pts: { ...gesture.pts, [id]: at } } };
    return { gesture };
  }

  // up or cancel
  const lifted = type === "up";
  if (gesture.kind === "press" && gesture.id === id) {
    if (!lifted) return { gesture: IDLE };
    const spot = placeSnap(ctx.draft, screenToPt(at, ctx.geo), ctx.geo);
    // A tap on a point that isn't an open line's end has nothing to join.
    if (gesture.grab && !spot.snapped) return { gesture: IDLE };
    return { gesture: IDLE, place: spot.pt };
  }
  if (gesture.kind === "drag" && gesture.id === id) {
    return lifted ? { gesture: IDLE, move: { ref: gesture.ref, pt: screenToPt(at, ctx.geo) } } : { gesture: IDLE };
  }
  if (gesture.kind === "handle" && gesture.id === id) {
    return lifted ? { gesture: IDLE, handle: { which: gesture.which, pt: screenToPt(at, ctx.geo) } } : { gesture: IDLE };
  }
  if (gesture.kind === "pinch") {
    const k = gesture.ids.indexOf(id);
    if (k < 0) return { gesture };
    const other = k === 0 ? 1 : 0;
    return { gesture: { kind: "rest", pts: { [gesture.ids[other]]: gesture.to[other] } } };
  }
  if (gesture.kind === "rest") {
    const pts = withoutPt(gesture.pts, id);
    return { gesture: Object.keys(pts).length === 0 ? IDLE : { kind: "rest", pts } };
  }
  return { gesture };
}

// ---------------------------------------------------------------- what to draw meanwhile

// Where the finger is, for the loupe.
export function loupeFinger(gesture: Gesture): Vec | null {
  return oneFinger(gesture)?.at ?? null;
}

// Where a press would put its point if it lifted now, and the end it would
// join (drawn as a ring).
export function pendingPlace(gesture: Gesture, ctx: Pick<GestureContext, "draft" | "geo">): { pt: Pt; snapped: End | null } | null {
  if (gesture.kind !== "press") return null;
  const spot = placeSnap(ctx.draft, screenToPt(gesture.at, ctx.geo), ctx.geo);
  if (gesture.grab && !spot.snapped) return null;
  return spot;
}

// The lines as they look mid-drag.
export function previewDraft(draft: TraceDraft, gesture: Gesture, geo: Geo): TraceDraft {
  return gesture.kind === "drag" ? movePoint(draft, gesture.ref, screenToPt(gesture.at, geo), geo) : draft;
}

// The end a dragged point would join, for its ring.
export function pendingMoveSnap(draft: TraceDraft, gesture: Gesture, geo: Geo): End | null {
  return gesture.kind === "drag" ? moveSnap(draft, gesture.ref, screenToPt(gesture.at, geo), geo).snapped : null;
}

// The handles as they look mid-drag.
export function previewScale(scale: ScaleDraft | null, gesture: Gesture, geo: Geo): ScaleDraft | null {
  return scale && gesture.kind === "handle" ? placeHandle(scale, gesture.which, screenToPt(gesture.at, geo)) : scale;
}
