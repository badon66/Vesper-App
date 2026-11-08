import type { Rect, Size, Vec } from "@/lib/lights/place";

// One explicit crop transform, shared by every layer of a lit picture
// (round 7, light_picker.controls and performance): the day photo, its
// dusk copy, the navy layer and the light canvas all sit on it, never on
// object-fit, so the lights land exactly on the roofline. Pure.
//
// CONTRACT
//   Transform                 screen = content x scale + (x, y), in CSS px
//                             within the picture's box (its top-left is 0, 0)
//   traceFrame(bounds, photo, view, margin?, include?)
//                             the light picker's framing: the trace's bounds
//                             joined with `include` (the scale handles), plus
//                             10%, never cropping the roofline
//   scaleHandles(scale, photo)  a trace's scale handles in the photo's pixels
//   fitContain(rect, view)    a drawing's crop fitted whole and centred
//                             (what an SVG viewBox does with xMidYMid meet)
//   screenBox(t, size)        where content of `size` sits on screen, as
//                             left, top, width and height for an img's style
//   toScreen(t, point)        one content point on screen

export type Transform = { scale: number; x: number; y: number };

export const IDENTITY: Transform = { scale: 1, x: 0, y: 0 };

// The light picker frames the trace's bounds plus this much on every side.
export const TRACE_MARGIN = 0.1;

export function toScreen(t: Transform, [x, y]: Vec): Vec {
  return [x * t.scale + t.x, y * t.scale + t.y];
}

export function screenBox(t: Transform, size: Size): { left: number; top: number; width: number; height: number } {
  return { left: t.x, top: t.y, width: size.width * t.scale, height: size.height * t.scale };
}

// A rect fitted whole inside the view and centred.
export function fitContain(rect: Rect, view: Size): Transform {
  if (!(rect.width > 0) || !(rect.height > 0) || !(view.width > 0) || !(view.height > 0)) return IDENTITY;
  const scale = Math.min(view.width / rect.width, view.height / rect.height);
  return {
    scale,
    x: (view.width - rect.width * scale) / 2 - rect.x * scale,
    y: (view.height - rect.height * scale) / 2 - rect.y * scale,
  };
}

const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));

// One axis: start from `t` (the target centred), keep the photo covering the
// view where it is big enough, then keep the trace in view whatever that
// costs. Returns the translation.
function settleAxis(t: number, scale: number, photo: number, view: number, lo: number, hi: number): number {
  let out = t;
  const content = photo * scale;
  if (content >= view) out = clamp(out, view - content, 0);
  // The trace (lo..hi in content units) stays inside the view.
  const span = (hi - lo) * scale;
  if (span <= view) out = clamp(out, -lo * scale, view - hi * scale);
  return out;
}

// The scale handles (the garage door's, or front door's, bottom corners,
// which every saved trace has) in the photo's own pixels: the points the
// light picker's frame brings in below the roofline, so the doors and some
// ground show (round 7 review). A handle off the photo, or unreadable, is
// left out.
export function scaleHandles(scale: { a: readonly number[]; b: readonly number[] } | null | undefined, photo: Size): Vec[] {
  if (!scale) return [];
  const out: Vec[] = [];
  for (const point of [scale.a, scale.b]) {
    const x = Number(point?.[0]);
    const y = Number(point?.[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) continue;
    out.push([x * photo.width, y * photo.height]);
  }
  return out;
}

// A rect grown to take in these points too.
function join(rect: Rect, points: Vec[]): Rect {
  let x0 = rect.x;
  let y0 = rect.y;
  let x1 = rect.x + rect.width;
  let y1 = rect.y + rect.height;
  for (const [x, y] of points) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

const grow = (rect: Rect, pad: number): Rect => ({
  x: rect.x - pad,
  y: rect.y - pad,
  width: rect.width + 2 * pad,
  height: rect.height + 2 * pad,
});

// The light picker's frame (round 7 review). The subject is the trace's
// bounds joined with `include` (the scale handles, scaleHandles above, so
// the garage door, the front door and some ground come in), plus `margin`
// (10%, of the subject's larger side, so a single straight line still gets
// room above and below) on every side: the target.
// - The target (as far as the photo reaches) is fitted whole, and the photo
//   fills the rest of the view: the photo always covers the view where it
//   is big enough, so it never letterboxes for a door or the ground.
// - Where the photo can't show the whole target at the view's shape, the
//   top keeps the margin above the roofline's top point (never less than
//   half of it) and the bottom gives way: first the ground, then the doors.
//   Where it shows more than the target, the extra goes below (the wall
//   and ground), never to the sky.
// - The roofline is never cropped: if covering the view would bring it
//   within half its own margin of the edges, the roofline and its whole
//   margin are fitted instead, and where the photo runs out the box's Night
//   Background shows at the sides. The photo is never stretched.
export function traceFrame(
  bounds: Rect | null,
  photo: Size,
  view: Size,
  margin = TRACE_MARGIN,
  include: Vec[] = [],
): Transform {
  const whole: Rect = { x: 0, y: 0, width: photo.width, height: photo.height };
  if (!(view.width > 0) || !(view.height > 0) || !(photo.width > 0) || !(photo.height > 0)) return IDENTITY;
  if (!bounds || (bounds.width <= 0 && bounds.height <= 0)) return fitContain(whole, view);
  const onPhoto = include.filter(
    ([x, y]) => Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= photo.width && y >= 0 && y <= photo.height,
  );
  const subject = join(bounds, onPhoto);
  const pad = margin * Math.max(subject.width, subject.height);
  const full = grow(subject, pad);
  const x0 = Math.max(0, full.x);
  const y0 = Math.max(0, full.y);
  const x1 = Math.min(photo.width, full.x + full.width);
  const y1 = Math.min(photo.height, full.y + full.height);
  const target: Rect = { x: x0, y: y0, width: Math.max(1e-6, x1 - x0), height: Math.max(1e-6, y1 - y0) };
  // The least scale at which the photo still covers the view.
  const cover = Math.max(view.width / photo.width, view.height / photo.height);
  let scale = Math.max(cover, Math.min(view.width / target.width, view.height / target.height));

  // The roofline's own margin, and the check that it keeps half of it.
  const roofPad = margin * Math.max(bounds.width, bounds.height);
  if ((bounds.width + roofPad) * scale > view.width + 1e-6 || (bounds.height + roofPad) * scale > view.height + 1e-6) {
    const roof = grow(bounds, roofPad);
    scale = Math.min(view.width / roof.width, view.height / roof.height);
    return {
      scale,
      x: settleAxis(view.width / 2 - (roof.x + roof.width / 2) * scale, scale, photo.width, view.width, bounds.x, bounds.x + bounds.width),
      y: settleAxis(view.height / 2 - (roof.y + roof.height / 2) * scale, scale, photo.height, view.height, bounds.y, bounds.y + bounds.height),
    };
  }

  // Top down: the margin above the top point, sliding down by up to half of
  // it when the bottom of the target would be lost. Where the photo has less
  // than the whole margin above the roofline (a peak near its top edge), the
  // slide never takes the roofline closer to the top than half the margin,
  // or than the photo allows, so the peak's light is never pushed onto the
  // edge.
  const shown = view.height / scale;
  const short = target.height - shown;
  const room = Math.max(0, bounds.y - target.y - pad / 2);
  const top = target.y + (short > 0 ? Math.min(pad / 2, short, room) : 0);
  const cx = target.x + target.width / 2;
  return {
    scale,
    x: settleAxis(view.width / 2 - cx * scale, scale, photo.width, view.width, bounds.x, bounds.x + bounds.width),
    y: settleAxis(-top * scale, scale, photo.height, view.height, bounds.y, bounds.y + bounds.height),
  };
}
