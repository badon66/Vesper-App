import type { Rect, Size, Vec } from "@/lib/lights/place";

// One explicit crop transform, shared by every layer of a lit picture
// (round 7, light_picker.controls and performance): the day photo, its
// dusk copy, the navy layer and the light canvas all sit on it, never on
// object-fit, so the lights land exactly on the roofline. Pure.
//
// CONTRACT
//   Transform                 screen = content x scale + (x, y), in CSS px
//                             within the picture's box (its top-left is 0, 0)
//   traceFrame(bounds, photo, view, margin?)
//                             the light picker's framing: the trace's bounds
//                             plus 10%, never cropping the roofline
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

// The light picker's frame. The trace's bounds plus `margin` (10%, of the
// bounds' larger side, so a single straight line still gets room above and
// below) is the target. The target (as far as the photo reaches) covers the
// view, like object-fit cover, unless that would crop the traced roofline;
// then the whole target is fitted instead, margin and all, and where the
// photo runs out the box's Night Background shows at the sides. The photo is
// never stretched and the roofline never cut.
export function traceFrame(bounds: Rect | null, photo: Size, view: Size, margin = TRACE_MARGIN): Transform {
  const whole: Rect = { x: 0, y: 0, width: photo.width, height: photo.height };
  if (!(view.width > 0) || !(view.height > 0) || !(photo.width > 0) || !(photo.height > 0)) return IDENTITY;
  if (!bounds || (bounds.width <= 0 && bounds.height <= 0)) return fitContain(whole, view);
  const pad = margin * Math.max(bounds.width, bounds.height);
  const full: Rect = { x: bounds.x - pad, y: bounds.y - pad, width: bounds.width + 2 * pad, height: bounds.height + 2 * pad };
  const x0 = Math.max(0, full.x);
  const y0 = Math.max(0, full.y);
  const x1 = Math.min(photo.width, full.x + full.width);
  const y1 = Math.min(photo.height, full.y + full.height);
  let target: Rect = { x: x0, y: y0, width: Math.max(1e-6, x1 - x0), height: Math.max(1e-6, y1 - y0) };
  let scale = Math.max(view.width / target.width, view.height / target.height);
  if (bounds.width * scale > view.width + 1e-6 || bounds.height * scale > view.height + 1e-6) {
    target = full;
    scale = Math.min(view.width / target.width, view.height / target.height);
  }
  const cx = target.x + target.width / 2;
  const cy = target.y + target.height / 2;
  return {
    scale,
    x: settleAxis(view.width / 2 - cx * scale, scale, photo.width, view.width, bounds.x, bounds.x + bounds.width),
    y: settleAxis(view.height / 2 - cy * scale, scale, photo.height, view.height, bounds.y, bounds.y + bounds.height),
  };
}
