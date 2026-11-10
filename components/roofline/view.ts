import type { Transform } from "@/lib/lights/frame";
import type { Size, Vec } from "@/lib/lights/place";

// The tracer's view (round 7, light_picker.tracing): the photo fitted whole
// in the stage, two fingers pinching to 4x and panning, and the loupe that
// floats above the finger. Pure, so it is unit tested. Screen = photo px x
// scale + (x, y), the same Transform the light renderer uses.

export const MAX_ZOOM = 4;
// Room around the fitted photo, so a corner point isn't under the edge.
export const FIT_PAD = 12;
export const LOUPE_SIZE = 120;
export const LOUPE_ZOOM = 3;
// The loupe's edge sits this far from the finger.
export const LOUPE_GAP = 40;

// The whole photo, fitted inside the stage with FIT_PAD around it, centred.
export function fitPhoto(photo: Size, stage: Size, pad = FIT_PAD): Transform {
  if (!(photo.width > 0) || !(photo.height > 0) || !(stage.width > 0) || !(stage.height > 0)) return { scale: 1, x: 0, y: 0 };
  const room = { width: Math.max(1, stage.width - 2 * pad), height: Math.max(1, stage.height - 2 * pad) };
  const scale = Math.min(room.width / photo.width, room.height / photo.height);
  return { scale, x: (stage.width - photo.width * scale) / 2, y: (stage.height - photo.height * scale) / 2 };
}

const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));

// One axis: a photo bigger than the stage can't leave more than FIT_PAD
// of gap at either side (so its edge can still be traced); one that fits
// stays centred.
function settle(offset: number, content: number, stage: number, pad = FIT_PAD): number {
  if (content + 2 * pad <= stage) return (stage - content) / 2;
  return clamp(offset, stage - content - pad, pad);
}

// Zoom kept between the fitted size and MAX_ZOOM times it, and the photo
// kept on the stage.
export function clampView(view: Transform, base: Transform, photo: Size, stage: Size): Transform {
  const scale = clamp(view.scale, base.scale, base.scale * MAX_ZOOM);
  const width = photo.width * scale;
  const height = photo.height * scale;
  return {
    scale,
    x: settle(view.x, width, stage.width),
    y: settle(view.y, height, stage.height),
  };
}

export function zoomOf(view: Transform, base: Transform): number {
  return base.scale > 0 ? view.scale / base.scale : 1;
}

const mid = (a: Vec, b: Vec): Vec => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const dist = (a: Vec, b: Vec) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// Two fingers: the photo point that was under their midpoint stays under
// it, scaled by how far apart they've moved, and carried with the midpoint.
export function pinchView(start: Transform, from: [Vec, Vec], to: [Vec, Vec], base: Transform, photo: Size, stage: Size): Transform {
  const d0 = dist(from[0], from[1]);
  const d1 = dist(to[0], to[1]);
  const ratio = d0 > 1 && d1 > 0 ? d1 / d0 : 1;
  const scale = clamp(start.scale * ratio, base.scale, base.scale * MAX_ZOOM);
  const m0 = mid(from[0], from[1]);
  const m1 = mid(to[0], to[1]);
  const cx = (m0[0] - start.x) / start.scale;
  const cy = (m0[1] - start.y) / start.scale;
  return clampView({ scale, x: m1[0] - cx * scale, y: m1[1] - cy * scale }, base, photo, stage);
}

// A mouse wheel or trackpad: zoom by `factor` about the pointer.
export function zoomAt(view: Transform, factor: number, at: Vec, base: Transform, photo: Size, stage: Size): Transform {
  const scale = clamp(view.scale * (factor > 0 ? factor : 1), base.scale, base.scale * MAX_ZOOM);
  const cx = (at[0] - view.x) / view.scale;
  const cy = (at[1] - view.y) / view.scale;
  return clampView({ scale, x: at[0] - cx * scale, y: at[1] - cy * scale }, base, photo, stage);
}

// The part of the photo on screen, 0 to 1 across and down.
export function visibleRect(view: Transform, photo: Size, stage: Size): { x: number; y: number; width: number; height: number } {
  if (!(photo.width > 0) || !(photo.height > 0) || !(view.scale > 0)) return { x: 0, y: 0, width: 1, height: 1 };
  const x0 = clamp(-view.x / view.scale / photo.width, 0, 1);
  const y0 = clamp(-view.y / view.scale / photo.height, 0, 1);
  const x1 = clamp((stage.width - view.x) / view.scale / photo.width, 0, 1);
  const y1 = clamp((stage.height - view.y) / view.scale / photo.height, 0, 1);
  return { x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) };
}

export type LoupeSpot = { left: number; top: number; side: "above" | "left" | "right" | "below" };

// Where the loupe floats: above the finger, so the hand doesn't cover it;
// beside it when the finger is near the top; below only when nothing else
// fits. Always inside the stage.
export function loupeSpot(finger: Vec, stage: Size, size = LOUPE_SIZE, gap = LOUPE_GAP): LoupeSpot {
  const [fx, fy] = finger;
  const keepX = (left: number) => clamp(left, 0, Math.max(0, stage.width - size));
  const keepY = (top: number) => clamp(top, 0, Math.max(0, stage.height - size));
  const aboveTop = fy - gap - size;
  if (aboveTop >= 0) return { left: keepX(fx - size / 2), top: aboveTop, side: "above" };
  const sideTop = keepY(fy - size / 2);
  // Beside the finger, on the side with more room.
  const leftRoom = fx - gap - size;
  const rightRoom = stage.width - (fx + gap + size);
  if (leftRoom >= 0 && (leftRoom >= rightRoom || rightRoom < 0)) return { left: leftRoom, top: sideTop, side: "left" };
  if (rightRoom >= 0) return { left: fx + gap, top: sideTop, side: "right" };
  return { left: keepX(fx - size / 2), top: keepY(fy + gap), side: "below" };
}

// Inside the loupe: the photo at LOUPE_ZOOM times the view, with the photo
// point under the finger at the loupe's centre.
export function loupeView(view: Transform, finger: Vec, size = LOUPE_SIZE, zoom = LOUPE_ZOOM): Transform {
  const scale = view.scale * zoom;
  const cx = (finger[0] - view.x) / view.scale;
  const cy = (finger[1] - view.y) / view.scale;
  return { scale, x: size / 2 - cx * scale, y: size / 2 - cy * scale };
}

// The light picker's band (the deck's rhythm): about 30% of the height at
// 1180x820 and 28% at 1366x1024. See it lit frames the photo in the space
// above it, so Keenan sees exactly the customer's frame.
export function bandShare(viewportHeight: number): number {
  const lo = 820;
  const hi = 1024;
  if (!(viewportHeight > lo)) return 0.3;
  if (viewportHeight >= hi) return 0.28;
  return 0.3 - ((viewportHeight - lo) / (hi - lo)) * 0.02;
}
