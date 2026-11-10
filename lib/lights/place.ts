import type { Pt } from "@/lib/deck";

// Where every light goes (round 7, the settled spec's light_picker
// "five per metre on a photo"). Pure: no DOM and no React, so prep's server
// action can recount a trace and the tests can prove the spacing.
//
// CONTRACT
//   placeLights(trace, photo)       a stored or in-progress trace (points 0 to 1)
//                                   on a photo of `photo` pixels -> Placement
//   placeAlong(lines, pxPerMetre)   the same for lines already in content units
//                                   (the drawings use it with HOUSE_UNITS_PER_METRE)
//   traceReadBack(trace, photo)     prep's "About 102 ft traced, about 155 lights"
//   readBackLine(readBack)          that sentence (Keenan only, never a customer)
//   SCALE_LOOKS_WRONG               prep's line when a trace asks for over MAX_LIGHTS
//   boundsOf(lines)                 a rect around lines, in their own units
//
// Content pixels are the photo's own pixels (or a drawing's own units). The
// renderer maps them to the screen with one Transform (lib/lights/frame.ts)
// shared with the photo layers.
//
// The rules: trace points are turned into the photo's pixels before any
// measuring, so a gable's slope measures true. Pixels per metre is the
// marked garage door (or front door) in pixels over its width in metres; one
// scale for the whole photo. A light every 0.2 m along each line, carried
// continuously round corners within a line and restarting at each new line,
// starting 0.1 m in; whatever is left over (under 0.2 m) is split between
// the two ends, so both ends sit at least 0.1 m in and the line is
// symmetrical (judgment call, 2026-11-08: a gable's two ends match). A line
// given its own measured feet gets exactly round(feet x 1.524) lights,
// spread evenly. Never thinned or packed. Never more than MAX_LIGHTS drawn.

export type Vec = [number, number];
export type Size = { width: number; height: number };
export type Rect = { x: number; y: number; width: number; height: number };

// One light: where it sits in content pixels, which line it is on, and its
// place along that line (0 at the line's first point). The effects read
// `line` and `i`; the colours repeat in blocks along `i`.
export type Light = { x: number; y: number; line: number; i: number };

export type Placement = {
  // At most MAX_LIGHTS, in line order then along each line.
  lights: Light[];
  // The traced lines in content pixels, one for one with the trace's lines
  // (a line with fewer than two points has no lights). Light.line indexes it.
  lines: Vec[][];
  pxPerMetre: number;
  // Content pixels between neighbouring lights (0.2 m).
  pitch: number;
  // How many lights the trace asks for, before the cap.
  count: number;
  capped: boolean;
  // Around the lines, in content pixels; null when there is nothing to light.
  bounds: Rect | null;
};

// The parts of a trace placement needs. A stored Trace (lib/deck.ts) fits,
// and so does prep's trace while it is being drawn.
export type TraceGeometry = {
  lines: Pt[][];
  lineFeet?: (number | null)[];
  scale: { a: Pt; b: Pt; feet: number };
};

export const LIGHT_SPACING_M = 0.2;
export const EDGE_INSET_M = 0.1;
export const METRES_PER_FOOT = 0.3048;
// Lights per foot at 0.2 m: 0.3048 / 0.2.
export const LIGHTS_PER_FOOT = 1.524;
// Over this many, prep refuses the trace and the table never draws more.
export const MAX_LIGHTS = 1500;

export const SCALE_LOOKS_WRONG = "The scale looks wrong. Check the garage door.";

const EPSILON = 1e-9;

export function toPixels(lines: Pt[][], photo: Size): Vec[][] {
  return lines.map((line) => line.map(([x, y]) => [x * photo.width, y * photo.height] as Vec));
}

// The garage door's width in the photo's pixels over its width in metres;
// 0 when the two handles sit on the same spot or the feet are missing.
export function pixelsPerMetre(scale: TraceGeometry["scale"], photo: Size): number {
  const metres = scale.feet * METRES_PER_FOOT;
  if (!(metres > 0)) return 0;
  const px = Math.hypot((scale.b[0] - scale.a[0]) * photo.width, (scale.b[1] - scale.a[1]) * photo.height);
  return px > EPSILON ? px / metres : 0;
}

export function polylineLength(line: Vec[]): number {
  let length = 0;
  for (let at = 1; at < line.length; at++) {
    length += Math.hypot(line[at][0] - line[at - 1][0], line[at][1] - line[at - 1][1]);
  }
  return length;
}

// How many lights one line takes: exactly round(feet x 1.524) when its feet
// were measured, otherwise one every 0.2 m with at least 0.1 m at each end
// (a line too short for that still gets one, in its middle).
export function lightsOnLine(lengthPx: number, pxPerMetre: number, feet?: number | null): number {
  if (feet != null && Number.isFinite(feet) && feet > 0) return Math.max(1, Math.round(feet * LIGHTS_PER_FOOT));
  if (!(lengthPx > 0) || !(pxPerMetre > 0)) return 0;
  const metres = lengthPx / pxPerMetre;
  return Math.max(1, Math.floor(metres / LIGHT_SPACING_M + EPSILON));
}

// Where along a line (as a distance from its first point) each of its n
// lights sits.
function stations(lengthPx: number, pxPerMetre: number, n: number, measured: boolean): number[] {
  const out: number[] = [];
  if (n <= 0) return out;
  if (measured) {
    const gap = lengthPx / n;
    for (let k = 0; k < n; k++) out.push((k + 0.5) * gap);
    return out;
  }
  const pitch = LIGHT_SPACING_M * pxPerMetre;
  const start = (lengthPx - (n - 1) * pitch) / 2;
  for (let k = 0; k < n; k++) out.push(start + k * pitch);
  return out;
}

export function boundsOf(lines: Vec[][]): Rect | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const line of lines) {
    for (const [x, y] of line) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  return Number.isFinite(minX) ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY } : null;
}

// Lights along lines already in content units, `pxPerMetre` of them to the
// metre. `lineFeet[n]`, when set, is line n's measured feet.
export function placeAlong(lines: Vec[][], pxPerMetre: number, lineFeet: (number | null)[] = [], cap = MAX_LIGHTS): Placement {
  const lengths = lines.map((line) => (line.length >= 2 ? polylineLength(line) : 0));
  const feetOf = (at: number) => {
    const feet = lineFeet[at];
    return feet != null && Number.isFinite(feet) && feet > 0 ? feet : null;
  };
  const counts = lines.map((line, at) => (line.length >= 2 ? lightsOnLine(lengths[at], pxPerMetre, feetOf(at)) : 0));
  const count = counts.reduce((sum, n) => sum + n, 0);
  const lights: Light[] = [];
  lines.forEach((line, lineAt) => {
    if (counts[lineAt] === 0 || lights.length >= cap) return;
    const along = stations(lengths[lineAt], pxPerMetre, counts[lineAt], feetOf(lineAt) != null);
    // Walk the line once, segment by segment, so corners carry the spacing.
    let segment = 1;
    let segmentStart = 0;
    let segmentLength = Math.hypot(line[1][0] - line[0][0], line[1][1] - line[0][1]);
    for (let k = 0; k < along.length && lights.length < cap; k++) {
      const s = along[k];
      while (segment < line.length - 1 && s > segmentStart + segmentLength) {
        segmentStart += segmentLength;
        segment += 1;
        segmentLength = Math.hypot(line[segment][0] - line[segment - 1][0], line[segment][1] - line[segment - 1][1]);
      }
      const [ax, ay] = line[segment - 1];
      const [bx, by] = line[segment];
      const u = segmentLength > EPSILON ? Math.min(1, Math.max(0, (s - segmentStart) / segmentLength)) : 0;
      lights.push({ x: ax + (bx - ax) * u, y: ay + (by - ay) * u, line: lineAt, i: k });
    }
  });
  return {
    lights,
    lines,
    pxPerMetre,
    pitch: LIGHT_SPACING_M * pxPerMetre,
    count,
    capped: count > cap,
    bounds: boundsOf(lines),
  };
}

// A trace on a photo of `photo` pixels (the photo's natural size; any size
// with the same shape gives the same picture).
export function placeLights(trace: TraceGeometry, photo: Size): Placement {
  const ppm = pixelsPerMetre(trace.scale, photo);
  const lines = toPixels(trace.lines, photo);
  // No scale yet: nothing is lit (spacing is never faked).
  if (!(ppm > 0)) return { lights: [], lines, pxPerMetre: 0, pitch: 0, count: 0, capped: false, bounds: boundsOf(lines) };
  return placeAlong(lines, ppm, trace.lineFeet ?? []);
}

export type ReadBack = {
  // Feet traced: measured feet where Keenan typed them, otherwise the line's
  // length at the scale.
  feet: number;
  // Lights the trace asks for (before any cap).
  lights: number;
  // Over MAX_LIGHTS: prep refuses it and says SCALE_LOOKS_WRONG.
  tooMany: boolean;
  // False until the scale has been set (no spacing is ever faked).
  scaleSet: boolean;
};

export function traceReadBack(trace: TraceGeometry, photo: Size): ReadBack {
  const ppm = pixelsPerMetre(trace.scale, photo);
  if (!(ppm > 0)) return { feet: 0, lights: 0, tooMany: false, scaleSet: false };
  const lines = toPixels(trace.lines, photo);
  let feet = 0;
  let lights = 0;
  lines.forEach((line, at) => {
    if (line.length < 2) return;
    const length = polylineLength(line);
    const measured = trace.lineFeet?.[at] ?? null;
    feet += measured != null && measured > 0 ? measured : length / ppm / METRES_PER_FOOT;
    lights += lightsOnLine(length, ppm, measured);
  });
  return { feet, lights, tooMany: lights > MAX_LIGHTS, scaleSet: true };
}

// "About 102 ft traced, about 155 lights" (Keenan only).
export function readBackLine(readBack: Pick<ReadBack, "feet" | "lights">): string {
  const feet = Math.round(readBack.feet);
  const lights = readBack.lights;
  return `About ${feet} ft traced, about ${lights} ${lights === 1 ? "light" : "lights"}`;
}
