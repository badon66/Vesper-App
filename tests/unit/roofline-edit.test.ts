import { describe, expect, it } from "vitest";
import {
  EMPTY_DRAFT,
  HIT_PX,
  SNAP_PX,
  canFinish,
  canStartNewLine,
  canUndo,
  changePhoto,
  clearLines,
  commit,
  defaultHandles,
  draftFrom,
  finishedTrace,
  hitHandle,
  hitPoint,
  historyOf,
  movePoint,
  newLine,
  nextHandle,
  parseFeet,
  placeHandle,
  placePoint,
  placeSnap,
  ptToScreen,
  scaleFromStored,
  scaleOf,
  scaleProblem,
  screenDistance,
  screenToPt,
  setActive,
  setOtherFeet,
  setScaleKind,
  startScale,
  undo,
  type Geo,
  type TraceDraft,
} from "@/components/roofline/trace-edit";
import type { Pt } from "@/lib/deck";

// Round 7 (light_picker.tracing): the tracer's editing rules. A 1000 x 500
// photo shown at 1:1, so a screen pixel is a photo pixel: 0.001 across,
// 0.002 down.
const geo: Geo = { photo: { width: 1000, height: 500 }, view: { scale: 1, x: 0, y: 0 } };
const at = (x: number, y: number): Pt => [x / 1000, y / 500];
const start: TraceDraft = { ...EMPTY_DRAFT, photoId: "photo-1" };

function trace(points: Pt[], draft: TraceDraft = start): TraceDraft {
  return points.reduce((now, point) => placePoint(now, point, geo), draft);
}

describe("Placing points", () => {
  it("starts a line with the first point and joins the rest to it with straight lines", () => {
    const draft = trace([at(100, 100), at(400, 100), at(400, 300)]);
    expect(draft.lines).toHaveLength(1);
    expect(draft.lines[0].points).toEqual([at(100, 100), at(400, 100), at(400, 300)]);
    expect(draft.active).toBe(draft.lines[0].id);
  });

  it("keeps a point on the photo", () => {
    const draft = trace([[-0.2, 0.5], [1.4, 2]]);
    expect(draft.lines[0].points).toEqual([
      [0, 0.5],
      [1, 1],
    ]);
  });

  it("adds nothing for a second tap on the same spot", () => {
    const once = trace([at(100, 100), at(300, 100)]);
    expect(placePoint(once, at(300, 100), geo)).toBe(once);
  });

  it("converts between the photo and the screen through the view", () => {
    const zoomed: Geo = { photo: geo.photo, view: { scale: 2, x: -100, y: 20 } };
    expect(ptToScreen([0.5, 0.5], zoomed)).toEqual([900, 520]);
    expect(screenToPt([900, 520], zoomed)).toEqual([0.5, 0.5]);
    expect(screenDistance([0, 0], [0.01, 0], zoomed)).toBeCloseTo(20);
  });
});

describe("Snapping to an open line's end within 20 px", () => {
  const eave = newLine(trace([at(100, 200), at(500, 200)]));

  it("joins a new line's first point to an eave's end, with no gap", () => {
    const gable = placePoint(eave, at(500 + SNAP_PX - 1, 200), geo);
    expect(gable.lines).toHaveLength(2);
    expect(gable.lines[1].points[0]).toEqual(at(500, 200));
  });

  it("leaves a point 21 px away where it was put", () => {
    const apart = placePoint(eave, at(500, 200 + SNAP_PX + 1), geo);
    expect(apart.lines[1].points[0]).toEqual(at(500, 221));
  });

  it("brings a gable back down onto the other end of the eave", () => {
    const gable = trace([at(500, 200), at(300, 60), at(112, 195)], eave);
    expect(gable.lines[1].points.at(-1)).toEqual(at(100, 200));
    // Still its own line: separate runs stay separate.
    expect(gable.lines).toHaveLength(2);
  });

  it("can close a line on its own first point, never on its own last", () => {
    const open = trace([at(100, 100), at(300, 100), at(300, 300)]);
    expect(placeSnap(open, at(108, 104), geo).pt).toEqual(at(100, 100));
    expect(placeSnap(open, at(305, 305), geo).snapped).toBeNull();
  });

  it("measures the 20 px on screen, so zooming in makes it finer", () => {
    const zoomed: Geo = { photo: geo.photo, view: { scale: 4, x: 0, y: 0 } };
    // 10 photo px is 40 screen px at 4x: too far to join.
    expect(placeSnap(eave, at(510, 200), zoomed).snapped).toBeNull();
    expect(placeSnap(eave, at(504, 200), zoomed).snapped).not.toBeNull();
  });
});

describe("Moving a point", () => {
  const draft = trace([at(100, 100), at(400, 100), at(400, 300)]);

  it("finds the point under a finger, within reach", () => {
    expect(hitPoint(draft, [405, 104], geo)).toEqual({ line: 0, index: 1 });
    expect(hitPoint(draft, [400 + HIT_PX + 5, 100], geo)).toBeNull();
  });

  it("drags a point to where it's let go", () => {
    const moved = movePoint(draft, { line: 0, index: 1 }, at(420, 90), geo);
    expect(moved.lines[0].points[1]).toEqual(at(420, 90));
    expect(draft.lines[0].points[1]).toEqual(at(400, 100));
  });

  it("snaps a dragged end onto another line's end, but never onto its own neighbour", () => {
    const two = trace([at(600, 100), at(800, 100)], newLine(draft));
    const joined = movePoint(two, { line: 1, index: 0 }, at(410, 290), geo);
    expect(joined.lines[1].points[0]).toEqual(at(400, 300));
    const folded = movePoint(two, { line: 0, index: 2 }, at(405, 112), geo);
    expect(folded.lines[0].points[2]).toEqual(at(405, 112));
  });
});

describe("New line, Clear and Undo", () => {
  it("starts the next point on a new line", () => {
    const first = trace([at(100, 100), at(300, 100)]);
    expect(canStartNewLine(first)).toBe(true);
    const second = trace([at(100, 300), at(300, 300)], newLine(first));
    expect(second.lines.map((line) => line.points.length)).toEqual([2, 2]);
    expect(second.lines[0].id).not.toBe(second.lines[1].id);
  });

  it("drops a lone point when a new line starts, since one point isn't a line", () => {
    const lone = trace([at(100, 100)]);
    expect(canStartNewLine(lone)).toBe(false);
    expect(newLine(lone).lines).toEqual([]);
  });

  it("can carry on an earlier line", () => {
    const two = trace([at(100, 300), at(300, 300)], newLine(trace([at(100, 100), at(300, 100)])));
    const back = placePoint(setActive(newLine(two), two.lines[0].id), at(500, 100), geo);
    expect(back.lines[0].points).toHaveLength(3);
  });

  it("undoes the last point, then the last line", () => {
    let history = historyOf(start);
    for (const point of [at(100, 100), at(300, 100)]) history = commit(history, placePoint(history.present, point, geo));
    history = commit(history, newLine(history.present));
    for (const point of [at(100, 300), at(300, 300)]) history = commit(history, placePoint(history.present, point, geo));
    expect(history.present.lines).toHaveLength(2);
    history = undo(history);
    expect(history.present.lines[1].points).toHaveLength(1);
    history = undo(history);
    expect(history.present.lines).toHaveLength(1);
    history = undo(history);
    // Back on the first line: the next point joins it again.
    expect(history.present.active).toBe(history.present.lines[0].id);
    history = undo(undo(history));
    expect(history.present.lines).toEqual([]);
    expect(canUndo(history)).toBe(false);
    expect(undo(history)).toBe(history);
  });

  it("clears every line, and Undo brings them back", () => {
    const traced = trace([at(100, 100), at(300, 100)]);
    let history = commit(historyOf(start), traced);
    history = commit(history, clearLines(history.present));
    expect(history.present.lines).toEqual([]);
    expect(undo(history).present).toBe(traced);
  });

  it("doesn't remember a change that changed nothing", () => {
    const history = historyOf(start);
    expect(commit(history, history.present)).toBe(history);
    expect(clearLines(start)).toBe(start);
  });

  it("starts a fresh trace on another photo, which Undo takes back", () => {
    const traced = trace([at(100, 100), at(300, 100)]);
    const history = commit(commit(historyOf(start), traced), changePhoto(traced, "photo-2"));
    expect(history.present).toMatchObject({ photoId: "photo-2", lines: [], active: null });
    expect(undo(history).present.photoId).toBe("photo-1");
  });
});

describe("What gets saved", () => {
  it("keeps lines of two points or more, with each one's measured feet in order", () => {
    const one = trace([at(100, 100), at(300, 100)]);
    const two = trace([at(100, 300)], newLine(one));
    const three = trace([at(500, 300), at(700, 300)], newLine(trace([at(110, 310), at(200, 300)], two)));
    const ids = three.lines.map((line) => line.id);
    const result = finishedTrace(three, { [ids[0]]: 40, [ids[1]]: 0, [ids[2]]: null });
    expect(result.lines).toHaveLength(3);
    expect(result.lineFeet).toEqual([40, null, null]);
    expect(canFinish(three)).toBe(true);
    expect(canFinish(trace([at(1, 1)]))).toBe(false);
  });

  it("reopens a saved trace with its lines in order", () => {
    const draft = draftFrom("photo-1", [
      [at(1, 1), at(2, 2)],
      [at(3, 3), at(4, 4)],
    ]);
    expect(draft.lines.map((line) => line.id)).toEqual([1, 2]);
    expect(draft.active).toBeNull();
    expect(draft.nextId).toBe(3);
  });
});

describe("The scale", () => {
  const fresh = startScale(defaultHandles({ x: 0, y: 0, width: 1, height: 1 }));

  it("isn't set until both handles are placed (spacing is never faked)", () => {
    expect(scaleOf(fresh)).toBeNull();
    expect(scaleProblem(fresh)).toMatch(/both handles/);
    expect(nextHandle(fresh)).toBe(0);
    const one = placeHandle(fresh, 0, at(300, 400));
    expect(nextHandle(one)).toBe(1);
    expect(scaleOf(one)).toBeNull();
    const both = placeHandle(one, 1, at(600, 400));
    expect(nextHandle(both)).toBeNull();
    expect(scaleOf(both)).toEqual({ a: at(300, 400), b: at(600, 400), feet: 16, kind: "double" });
  });

  it("starts on Double 16 ft, and takes Single, Front door or the feet typed for Other", () => {
    const both = placeHandle(placeHandle(fresh, 0, at(300, 400)), 1, at(600, 400));
    expect(scaleOf(setScaleKind(both, "single"))?.feet).toBe(9);
    expect(scaleOf(setScaleKind(both, "door"))?.feet).toBe(3);
    const other = setScaleKind(both, "other");
    expect(scaleOf(other)).toBeNull();
    expect(scaleProblem(other)).toMatch(/feet/);
    expect(scaleOf(setOtherFeet(other, 12))?.feet).toBe(12);
    expect(scaleOf(setOtherFeet(other, 500))).toBeNull();
  });

  it("refuses both handles on one spot", () => {
    const same = placeHandle(placeHandle(fresh, 0, at(300, 400)), 1, at(300, 400));
    expect(scaleOf(same)).toBeNull();
    expect(scaleProblem(same)).toMatch(/one spot/);
  });

  it("grabs the nearer handle within reach", () => {
    const both = placeHandle(placeHandle(fresh, 0, at(300, 400)), 1, at(600, 400));
    expect(hitHandle(both, [310, 405], geo)).toBe(0);
    expect(hitHandle(both, [590, 395], geo)).toBe(1);
    expect(hitHandle(both, [450, 400], geo)).toBeNull();
  });

  it("reopens a saved scale as placed", () => {
    const stored = scaleFromStored({ a: [0.1, 0.8], b: [0.3, 0.8], feet: 12, kind: "other" });
    expect(stored.placed).toEqual([true, true]);
    expect(scaleOf(stored)?.feet).toBe(12);
  });

  it("reads a line's typed feet, or blank", () => {
    expect(parseFeet("")).toBeNull();
    expect(parseFeet(" 42 ")).toBe(42);
    expect(parseFeet("42.5")).toBe(42.5);
    expect(parseFeet("0")).toBe("invalid");
    expect(parseFeet("forty")).toBe("invalid");
    expect(parseFeet("-3")).toBe("invalid");
  });
});
