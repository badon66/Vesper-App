import { SCALE_FEET, type Pt, type ScaleKind, type TraceScale } from "@/lib/deck";
import type { Transform } from "@/lib/lights/frame";
import type { Size, Vec } from "@/lib/lights/place";

// Tracing the roofline in prep (round 7, light_picker.tracing): the editing
// model behind the tracer, pure so every rule is unit tested. Points are
// stored 0 to 1 on the photo (lib/deck.ts Pt); every distance a person
// feels (the 20 px snap, grabbing a point) is measured in screen pixels at
// the current zoom, through `geo`.
//
// CONTRACT
//   TraceDraft                  the photo, its lines (each with a stable id),
//                               and the line new points join (or none)
//   placePoint(draft, pt, geo)  a point where a press lifted: joins the line
//                               being drawn, or starts one; snaps to an open
//                               line's end within SNAP_PX
//   movePoint(draft, ref, pt, geo)  a dragged point, snapped the same way
//   hitPoint(draft, at, geo)    the point under a finger, if any
//   newLine, clearLines, changePhoto, setActive
//   finishedTrace(draft, feet)  the lines worth saving (2 points or more),
//                               with their measured feet, in order
//   History, commit, undo       Undo walks back the last point, then the
//                               last line (and a Clear, and a photo change)
//   ScaleDraft, scaleOf, ...    the garage door's two handles and its width
//
// A point placed within 20 px of an open line's end takes that end's exact
// spot, so a gable meets its eave with no gap. It still belongs to the line
// being drawn (or starts a new one after New line): separate runs stay
// separate lines, and the lights restart on each.

export const SNAP_PX = 20;
// How near a finger must land to grab a point or a handle.
export const HIT_PX = 22;
export const HANDLE_HIT_PX = 32;
// A press that moves less than this is a tap.
export const SLOP_PX = 8;
// Sanity limits, far above any real roofline.
export const MAX_LINES = 40;
export const MAX_POINTS_PER_LINE = 200;
const HISTORY_LIMIT = 200;
const SAME_SPOT = 1e-9;

export type TraceLine = { id: number; points: Pt[] };

export type TraceDraft = {
  // The lead_photos row the lines are drawn on.
  photoId: string | null;
  lines: TraceLine[];
  // The id of the line new points join; null: the next point starts a line.
  active: number | null;
  // The next line's id.
  nextId: number;
};

// What the editing functions need to measure in screen pixels: the photo's
// own size, and the view (photo px -> screen px).
export type Geo = { photo: Size; view: Transform };

export type PointRef = { line: number; index: number };

export const EMPTY_DRAFT: TraceDraft = { photoId: null, lines: [], active: null, nextId: 1 };

export function draftFrom(photoId: string | null, lines: Pt[][]): TraceDraft {
  const kept = lines.filter((line) => line.length > 0);
  return {
    photoId,
    lines: kept.map((points, at) => ({ id: at + 1, points: points.map(copyPt) })),
    active: null,
    nextId: kept.length + 1,
  };
}

const copyPt = ([x, y]: Pt): Pt => [x, y];
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export function clampPt([x, y]: Pt): Pt {
  return [clamp01(x), clamp01(y)];
}

// A photo point (0 to 1) on screen.
export function ptToScreen([x, y]: Pt, geo: Geo): Vec {
  return [x * geo.photo.width * geo.view.scale + geo.view.x, y * geo.photo.height * geo.view.scale + geo.view.y];
}

// A screen point on the photo (0 to 1), kept on the photo.
export function screenToPt([sx, sy]: Vec, geo: Geo): Pt {
  const { photo, view } = geo;
  if (!(photo.width > 0) || !(photo.height > 0) || !(view.scale > 0)) return [0, 0];
  return clampPt([(sx - view.x) / view.scale / photo.width, (sy - view.y) / view.scale / photo.height]);
}

// Two photo points' distance on screen, in px.
export function screenDistance(a: Pt, b: Pt, geo: Geo): number {
  return Math.hypot((a[0] - b[0]) * geo.photo.width, (a[1] - b[1]) * geo.photo.height) * geo.view.scale;
}

const samePt = (a: Pt, b: Pt) => Math.abs(a[0] - b[0]) < SAME_SPOT && Math.abs(a[1] - b[1]) < SAME_SPOT;

export function lineIndex(draft: TraceDraft, id: number | null): number {
  return id == null ? -1 : draft.lines.findIndex((line) => line.id === id);
}

export function activeLine(draft: TraceDraft): TraceLine | null {
  const at = lineIndex(draft, draft.active);
  return at >= 0 ? draft.lines[at] : null;
}

// An open line's ends: its first and last points (one point when the line
// has only one). `skip` leaves out points that must not be snapped to.
export type End = { line: number; index: number; pt: Pt };

export function lineEnds(draft: TraceDraft, skip: (ref: PointRef) => boolean = () => false): End[] {
  const out: End[] = [];
  draft.lines.forEach((line, lineAt) => {
    const last = line.points.length - 1;
    if (last < 0) return;
    const indexes = last === 0 ? [0] : [0, last];
    for (const index of indexes) {
      if (!skip({ line: lineAt, index })) out.push({ line: lineAt, index, pt: line.points[index] });
    }
  });
  return out;
}

// The nearest end within SNAP_PX of `pt` on screen, or null.
export function nearestEnd(ends: End[], pt: Pt, geo: Geo, radius = SNAP_PX): End | null {
  let best: End | null = null;
  let bestDistance = radius;
  for (const end of ends) {
    const distance = screenDistance(end.pt, pt, geo);
    if (distance <= bestDistance) {
      best = end;
      bestDistance = distance;
    }
  }
  return best;
}

// The ends a new point may snap to: every line's ends, except the end of the
// line being drawn that the point would join (it can't join itself).
export function placeTargets(draft: TraceDraft): End[] {
  const at = lineIndex(draft, draft.active);
  const last = at >= 0 ? draft.lines[at].points.length - 1 : -1;
  return lineEnds(draft, (ref) => ref.line === at && ref.index === last);
}

// Where a press lifting at `pt` would put its point: the snapped end, or
// the spot itself. The tracer draws this ring while the finger is down.
export function placeSnap(draft: TraceDraft, pt: Pt, geo: Geo): { pt: Pt; snapped: End | null } {
  const target = nearestEnd(placeTargets(draft), clampPt(pt), geo);
  return target ? { pt: copyPt(target.pt), snapped: target } : { pt: clampPt(pt), snapped: null };
}

// A point placed where a press lifted.
export function placePoint(draft: TraceDraft, pt: Pt, geo: Geo): TraceDraft {
  const { pt: spot } = placeSnap(draft, pt, geo);
  const at = lineIndex(draft, draft.active);
  if (at < 0) {
    if (draft.lines.length >= MAX_LINES) return draft;
    const line: TraceLine = { id: draft.nextId, points: [spot] };
    return { ...draft, lines: [...draft.lines, line], active: line.id, nextId: draft.nextId + 1 };
  }
  const line = draft.lines[at];
  const last = line.points[line.points.length - 1];
  // A second tap on the same spot adds nothing.
  if (last && samePt(last, spot)) return draft;
  if (line.points.length >= MAX_POINTS_PER_LINE) return draft;
  const lines = draft.lines.slice();
  lines[at] = { ...line, points: [...line.points, spot] };
  return { ...draft, lines };
}

// The point under a finger at `at` (screen px), the nearest within HIT_PX.
// The line being drawn wins a tie, so its own end is easy to grab.
export function hitPoint(draft: TraceDraft, at: Vec, geo: Geo, radius = HIT_PX): PointRef | null {
  let best: PointRef | null = null;
  let bestDistance = radius;
  const active = lineIndex(draft, draft.active);
  for (let lineAt = 0; lineAt < draft.lines.length; lineAt++) {
    const points = draft.lines[lineAt].points;
    for (let index = 0; index < points.length; index++) {
      const [sx, sy] = ptToScreen(points[index], geo);
      const distance = Math.hypot(sx - at[0], sy - at[1]);
      if (distance < bestDistance || (distance === bestDistance && lineAt === active)) {
        best = { line: lineAt, index };
        bestDistance = distance;
      }
    }
  }
  return best;
}

// The ends a dragged point may snap to: any line's end except the point
// itself and its neighbours on its own line (which would fold a segment
// to nothing).
export function moveTargets(draft: TraceDraft, ref: PointRef): End[] {
  return lineEnds(draft, (end) => end.line === ref.line && Math.abs(end.index - ref.index) <= 1);
}

export function moveSnap(draft: TraceDraft, ref: PointRef, pt: Pt, geo: Geo): { pt: Pt; snapped: End | null } {
  const target = nearestEnd(moveTargets(draft, ref), clampPt(pt), geo);
  return target ? { pt: copyPt(target.pt), snapped: target } : { pt: clampPt(pt), snapped: null };
}

// A point dragged to `pt`.
export function movePoint(draft: TraceDraft, ref: PointRef, pt: Pt, geo: Geo): TraceDraft {
  const line = draft.lines[ref.line];
  if (!line || !line.points[ref.index]) return draft;
  const { pt: spot } = moveSnap(draft, ref, pt, geo);
  if (samePt(line.points[ref.index], spot)) return draft;
  const points = line.points.slice();
  points[ref.index] = spot;
  const lines = draft.lines.slice();
  lines[ref.line] = { ...line, points };
  return { ...draft, lines };
}

// New line: the next point starts a separate line. A lone point left on
// the line being drawn is not a line, so it goes.
export function newLine(draft: TraceDraft): TraceDraft {
  const at = lineIndex(draft, draft.active);
  if (at < 0) return draft;
  if (draft.lines[at].points.length < 2) {
    return { ...draft, lines: draft.lines.filter((_, index) => index !== at), active: null };
  }
  return { ...draft, active: null };
}

// Whether New line would do anything worth a button.
export function canStartNewLine(draft: TraceDraft): boolean {
  return (activeLine(draft)?.points.length ?? 0) >= 2;
}

// Carry on drawing an existing line (its last point is where the next one
// joins).
export function setActive(draft: TraceDraft, id: number | null): TraceDraft {
  if (id === draft.active) return draft;
  if (id !== null && lineIndex(draft, id) < 0) return draft;
  return { ...draft, active: id };
}

export function clearLines(draft: TraceDraft): TraceDraft {
  if (draft.lines.length === 0 && draft.active === null) return draft;
  return { ...draft, lines: [], active: null };
}

// Another photo: the lines belonged to the old one.
export function changePhoto(draft: TraceDraft, photoId: string): TraceDraft {
  if (photoId === draft.photoId) return draft;
  return { ...draft, photoId, lines: [], active: null };
}

export function pointCount(draft: TraceDraft): number {
  return draft.lines.reduce((sum, line) => sum + line.points.length, 0);
}

// The lines worth saving (two points or more), in order, with the feet
// Keenan measured for each (by line id), so a stored trace's line_feet
// lines up with its lines.
export function finishedTrace(draft: TraceDraft, feetById: Record<number, number | null | undefined> = {}): {
  lines: Pt[][];
  lineFeet: (number | null)[];
  ids: number[];
} {
  const kept = draft.lines.filter((line) => line.points.length >= 2);
  return {
    lines: kept.map((line) => line.points.map(copyPt)),
    lineFeet: kept.map((line) => {
      const feet = feetById[line.id];
      return feet != null && Number.isFinite(feet) && feet > 0 ? feet : null;
    }),
    ids: kept.map((line) => line.id),
  };
}

export function canFinish(draft: TraceDraft): boolean {
  return draft.lines.some((line) => line.points.length >= 2);
}

// ---------------------------------------------------------------- undo

export type History = { past: TraceDraft[]; present: TraceDraft };

export function historyOf(draft: TraceDraft): History {
  return { past: [], present: draft };
}

// Keeps the change and remembers what it replaced. A change that changes
// nothing isn't remembered.
export function commit(history: History, next: TraceDraft): History {
  if (next === history.present) return history;
  const past = [...history.past, history.present];
  return { past: past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past, present: next };
}

export function canUndo(history: History): boolean {
  return history.past.length > 0;
}

export function undo(history: History): History {
  if (history.past.length === 0) return history;
  return { past: history.past.slice(0, -1), present: history.past[history.past.length - 1] };
}

// ---------------------------------------------------------------- the scale

// The garage door (or front door): two handles dragged to its bottom
// corners, and its width. Spacing is never faked, so the scale counts only
// once both handles have been put in place by Keenan.
export type ScaleDraft = {
  a: Pt;
  b: Pt;
  placed: [boolean, boolean];
  kind: ScaleKind;
  // The feet typed for Other.
  otherFeet: number | null;
};

export const SCALE_CHOICES: { kind: ScaleKind; label: string }[] = [
  { kind: "double", label: "Double 16 ft" },
  { kind: "single", label: "Single 9 ft" },
  { kind: "door", label: "Front door 3 ft" },
  { kind: "other", label: "Other" },
];

// Other's feet: more than a foot, at most 100.
export const OTHER_FEET_MIN = 1;
export const OTHER_FEET_MAX = 100;

// Where the two handles wait before they're placed: low in the middle of
// what's on screen, a fifth of its width apart.
export function defaultHandles(visible: { x: number; y: number; width: number; height: number }): [Pt, Pt] {
  const y = visible.y + visible.height * 0.72;
  return [clampPt([visible.x + visible.width * 0.4, y]), clampPt([visible.x + visible.width * 0.6, y])];
}

export function startScale(handles: [Pt, Pt]): ScaleDraft {
  return { a: copyPt(handles[0]), b: copyPt(handles[1]), placed: [false, false], kind: "double", otherFeet: null };
}

export function scaleFromStored(scale: TraceScale): ScaleDraft {
  return {
    a: copyPt(scale.a),
    b: copyPt(scale.b),
    placed: [true, true],
    kind: scale.kind,
    otherFeet: scale.kind === "other" ? scale.feet : null,
  };
}

// The handle a press away from both would place: the first not yet placed.
export function nextHandle(scale: ScaleDraft): 0 | 1 | null {
  if (!scale.placed[0]) return 0;
  if (!scale.placed[1]) return 1;
  return null;
}

export function placeHandle(scale: ScaleDraft, which: 0 | 1, pt: Pt): ScaleDraft {
  const spot = clampPt(pt);
  const placed: [boolean, boolean] = [scale.placed[0], scale.placed[1]];
  placed[which] = true;
  return which === 0 ? { ...scale, a: spot, placed } : { ...scale, b: spot, placed };
}

export function hitHandle(scale: ScaleDraft, at: Vec, geo: Geo, radius = HANDLE_HIT_PX): 0 | 1 | null {
  const [ax, ay] = ptToScreen(scale.a, geo);
  const [bx, by] = ptToScreen(scale.b, geo);
  const da = Math.hypot(ax - at[0], ay - at[1]);
  const db = Math.hypot(bx - at[0], by - at[1]);
  if (da > radius && db > radius) return null;
  return da <= db ? 0 : 1;
}

export function setScaleKind(scale: ScaleDraft, kind: ScaleKind): ScaleDraft {
  return kind === scale.kind ? scale : { ...scale, kind };
}

export function setOtherFeet(scale: ScaleDraft, feet: number | null): ScaleDraft {
  return { ...scale, otherFeet: feet };
}

export function scaleFeet(scale: Pick<ScaleDraft, "kind" | "otherFeet">): number | null {
  if (scale.kind !== "other") return SCALE_FEET[scale.kind];
  const feet = scale.otherFeet;
  return feet != null && Number.isFinite(feet) && feet >= OTHER_FEET_MIN && feet <= OTHER_FEET_MAX ? feet : null;
}

// The scale to measure with, or null while it isn't set: a handle not yet
// placed, the two on one spot, or Other with no usable feet.
export function scaleOf(scale: ScaleDraft | null | undefined): TraceScale | null {
  if (!scale || !scale.placed[0] || !scale.placed[1]) return null;
  if (samePt(scale.a, scale.b)) return null;
  const feet = scaleFeet(scale);
  if (feet == null) return null;
  return { a: copyPt(scale.a), b: copyPt(scale.b), feet, kind: scale.kind };
}

// What the scale step says while the scale isn't usable yet, or null.
export function scaleProblem(scale: ScaleDraft | null | undefined): string | null {
  if (!scale || !scale.placed[0] || !scale.placed[1]) return "Drag both handles to the garage door's bottom corners.";
  if (samePt(scale.a, scale.b)) return "The two handles are on one spot. Drag them to the door's two corners.";
  if (scaleFeet(scale) == null) return `Type the door's width in feet, from ${OTHER_FEET_MIN} to ${OTHER_FEET_MAX}.`;
  return null;
}

// "This line is __ ft": a measured line's feet, typed. Blank clears it.
export function parseFeet(text: string): number | null | "invalid" {
  const value = text.trim();
  if (!value) return null;
  if (!/^\d{1,4}(\.\d{0,2})?$/.test(value)) return "invalid";
  const feet = Number(value);
  return feet > 0 && feet <= 2000 ? feet : "invalid";
}
