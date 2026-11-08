import type { Pt } from "@/lib/deck";

// Dusk (round 7, light_picker.dusk_and_points "DUSK"): one flat grade per
// photo, measured once in prep and never animated. At the table it is a
// second copy of the photo under a fixed CSS filter (the brightness from
// prep, saturate 0.65) plus one flat Vesper navy layer with multiply at 38%,
// cross-faded in by opacity over the day photo. No vignette, gradient, blur,
// new sky or painted glow; no ctx.filter and no getImageData at the table.
//
// CONTRACT
//   measureDusk(image, lines)  prep only (browser): the photo's mean
//                              luminance inside the trace's bounds, the
//                              brightness factor to store, and whether it
//                              is too dark. The image must be loaded with
//                              crossOrigin="anonymous"; null if it can't be read.
//   duskBrightness(mean)       the factor (0 to 1, never above 1: never brightened)
//   isTooDark(mean)            under about 6% (taken after dark)
//   TOO_DARK_LINE              prep's line for it (Keenan only)
//   duskFilter(brightness)     the CSS filter for the dusk copy
//   DUSK_NAVY, NAVY_MULTIPLY_OPACITY   the navy layer
//   lumaOf, meanLuma, traceBounds01    the pure parts, unit tested
//
// Luminance here is Rec. 709 luma on the photo's own (gamma-encoded) values,
// 0 to 1: the brightness a person reads, and the space CSS's brightness()
// works in.

export const DUSK_TARGET = 0.2;
export const TOO_DARK_BELOW = 0.06;
export const DUSK_SATURATE = 0.65;
export const DUSK_NAVY = "#132E3F";
export const NAVY_MULTIPLY_OPACITY = 0.38;

export const TOO_DARK_LINE = "This photo is too dark to light. Upload a daytime front photo.";

// The measured area is never thinner than this share of the photo, so a
// single straight line still has a sky and a wall to measure.
const MIN_REGION = 0.04;
// Measured from a small copy: plenty for a mean, and quick.
const SAMPLE_EDGE = 256;

const W_R = 0.2126;
const W_G = 0.7152;
const W_B = 0.0722;

export function lumaOf(r: number, g: number, b: number): number {
  return (W_R * r + W_G * g + W_B * b) / 255;
}

// The mean luma of RGBA pixels (Uint8ClampedArray from getImageData, or any
// array of 0 to 255), optionally inside a rect in those pixels.
export function meanLuma(
  data: ArrayLike<number>,
  width: number,
  height: number,
  rect: { x: number; y: number; width: number; height: number } = { x: 0, y: 0, width, height },
): number {
  const x0 = Math.max(0, Math.floor(rect.x));
  const y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(width, Math.ceil(rect.x + rect.width));
  const y1 = Math.min(height, Math.ceil(rect.y + rect.height));
  let sum = 0;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const at = (y * width + x) * 4;
      sum += lumaOf(data[at], data[at + 1], data[at + 2]);
      n += 1;
    }
  }
  return n > 0 ? sum / n : 0;
}

// How much of a photo's luma the navy multiply layer keeps (about 0.68):
// each channel keeps (1 - 0.38) + 0.38 x navy's channel.
export function navyKeep(): number {
  const n = parseInt(DUSK_NAVY.slice(1), 16);
  const keep = (channel: number) => 1 - NAVY_MULTIPLY_OPACITY + NAVY_MULTIPLY_OPACITY * (channel / 255);
  return W_R * keep((n >> 16) & 255) + W_G * keep((n >> 8) & 255) + W_B * keep(n & 255);
}

// The brightness factor that lands the house, as the customer sees it with
// the navy layer on, at about 20%. Never above 1: a photo already at or
// under that (a setter's 5 pm November photo is often dusky) is never
// brightened and gets only the desaturation and the navy layer. Desaturation
// keeps luma (CSS saturate() is luma-preserving), so only the navy counts.
export function duskBrightness(mean: number): number {
  if (!(mean > 0)) return 1;
  const factor = DUSK_TARGET / (mean * navyKeep());
  return Math.round(Math.min(1, Math.max(0.05, factor)) * 1000) / 1000;
}

export function isTooDark(mean: number): boolean {
  return !(mean >= TOO_DARK_BELOW);
}

// The dusk copy's fixed filter. Set once, never animated.
export function duskFilter(brightness: number): string {
  const b = Number.isFinite(brightness) && brightness > 0 ? Math.min(1, brightness) : 1;
  return `brightness(${Math.round(b * 1000) / 1000}) saturate(${DUSK_SATURATE})`;
}

// The trace's bounds on the photo, 0 to 1, at least MIN_REGION each way.
export function traceBounds01(lines: Pt[][]): { x: number; y: number; width: number; height: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const line of lines) {
    for (const [x, y] of line) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (!Number.isFinite(minX)) return null;
  const grow = (lo: number, hi: number): [number, number] => {
    if (hi - lo >= MIN_REGION) return [lo, hi];
    const mid = (lo + hi) / 2;
    const a = Math.min(1 - MIN_REGION, Math.max(0, mid - MIN_REGION / 2));
    return [a, a + MIN_REGION];
  };
  const [x0, x1] = grow(minX, maxX);
  const [y0, y1] = grow(minY, maxY);
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

export type DuskMeasure = { luminance: number; brightness: number; tooDark: boolean };

// Prep only, in the browser: measures the photo inside the trace's bounds.
// Uses a canvas and getImageData once, on a small copy; never at the table.
export function measureDusk(image: HTMLImageElement | HTMLCanvasElement | ImageBitmap, lines: Pt[][]): DuskMeasure | null {
  if (typeof document === "undefined") return null;
  const width = "naturalWidth" in image ? image.naturalWidth : image.width;
  const height = "naturalHeight" in image ? image.naturalHeight : image.height;
  const bounds = traceBounds01(lines);
  if (!bounds || !(width > 0) || !(height > 0)) return null;
  const sx = bounds.x * width;
  const sy = bounds.y * height;
  const sw = Math.max(1, bounds.width * width);
  const sh = Math.max(1, bounds.height * height);
  const k = Math.min(1, SAMPLE_EDGE / Math.max(sw, sh));
  const dw = Math.max(1, Math.round(sw * k));
  const dh = Math.max(1, Math.round(sh * k));
  const canvas = document.createElement("canvas");
  canvas.width = dw;
  canvas.height = dh;
  try {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, dw, dh);
    const luminance = meanLuma(ctx.getImageData(0, 0, dw, dh).data, dw, dh);
    return { luminance, brightness: duskBrightness(luminance), tooDark: isTooDark(luminance) };
  } catch {
    // A photo loaded without CORS taints the canvas: say nothing rather
    // than guess.
    return null;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}
