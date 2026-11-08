import {
  BLOOM_ALPHA,
  HALO_ALPHA,
  coreColour,
  hexToRgb,
  rgbToCss,
  spriteRadii,
  washAlpha,
  type Rgb,
} from "@/lib/lights/glow";

// The light canvas's pre-drawn pieces (browser only; no React). Each light
// colour at each size is drawn once as a sprite (bloom, tight halo, then the
// core on top), and the wash once per look as small tiles. Nothing here uses
// shadowBlur, ctx.filter, getImageData or CSS blur: a radial falloff drawn
// into a sprite once is how a point of light is painted (light drawn on a
// photo is a picture of light, not interface chrome).

export type Sprite = { canvas: HTMLCanvasElement; half: number };
export type WashTile = { canvas: HTMLCanvasElement; ox: number; oy: number };

export function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.max(1, Math.ceil(height));
  return canvas;
}

// Gives the canvas's memory back at once (Safari keeps it until GC otherwise).
export function releaseCanvas(canvas: HTMLCanvasElement | null | undefined): void {
  if (!canvas) return;
  canvas.width = 0;
  canvas.height = 0;
}

function disc(ctx: CanvasRenderingContext2D, centre: number, radius: number, rgb: Rgb, stops: [number, number][]): void {
  if (!(radius > 0)) return;
  const gradient = ctx.createRadialGradient(centre, centre, 0, centre, centre, radius);
  for (const [at, alpha] of stops) gradient.addColorStop(at, rgbToCss(rgb, alpha));
  ctx.fillStyle = gradient;
  ctx.fillRect(centre - radius, centre - radius, radius * 2, radius * 2);
}

// One light of one colour, for an on-screen pitch (CSS px) at `dpr`.
export function makeLightSprite(hex: string, pitchCss: number, dpr: number): Sprite {
  const radii = spriteRadii(pitchCss);
  const core = radii.core * dpr;
  const halo = radii.halo * dpr;
  const bloom = radii.bloom * dpr;
  const half = Math.ceil(bloom) + 1;
  const canvas = makeCanvas(half * 2, half * 2);
  const ctx = canvas.getContext("2d");
  if (!ctx) return { canvas, half };
  const rgb = hexToRgb(hex);
  // The bloom and halo add up; the core then sits on top of them.
  ctx.globalCompositeOperation = "lighter";
  disc(ctx, half, bloom, rgb, [
    [0, BLOOM_ALPHA],
    [0.3, BLOOM_ALPHA * 0.7],
    [0.65, BLOOM_ALPHA * 0.25],
    [1, 0],
  ]);
  disc(ctx, half, halo, rgb, [
    [0, HALO_ALPHA],
    [0.35, HALO_ALPHA * 0.75],
    [0.7, HALO_ALPHA * 0.28],
    [1, 0],
  ]);
  ctx.globalCompositeOperation = "source-over";
  disc(ctx, half, core, coreColour(hex), [
    [0, 1],
    [0.55, 1],
    [1, 0],
  ]);
  return { canvas, half };
}

// The wash under one light, in the wash canvas's own pixels: a band
// `down` deep under the line and a glow `up` high on the soffit, as wide as
// two pitches with a triangular falloff each side, so neighbours a pitch
// apart add up to an even band. (ox, oy) is where the light sits in the tile.
export function makeWashTile(hex: string, pitch: number, down: number, up: number): WashTile {
  const half = Math.max(1, pitch);
  const width = Math.max(2, Math.ceil(half * 2));
  const top = Math.max(0.5, up);
  const height = Math.max(2, Math.ceil(top + Math.max(1, down)));
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return { canvas, ox: width / 2, oy: top };
  const rgb = hexToRgb(hex);
  const alpha = washAlpha(hex);
  const line = top / height;
  const below = (share: number) => line + (1 - line) * share;
  const vertical = ctx.createLinearGradient(0, 0, 0, height);
  vertical.addColorStop(0, rgbToCss(rgb, 0));
  vertical.addColorStop(line, rgbToCss(rgb, alpha));
  vertical.addColorStop(below(0.3), rgbToCss(rgb, alpha * 0.55));
  vertical.addColorStop(below(0.65), rgbToCss(rgb, alpha * 0.2));
  vertical.addColorStop(1, rgbToCss(rgb, 0));
  ctx.fillStyle = vertical;
  ctx.fillRect(0, 0, width, height);
  // Keep only a triangle across: 0 at the edges, full at the light.
  ctx.globalCompositeOperation = "destination-in";
  const across = ctx.createLinearGradient(0, 0, width, 0);
  across.addColorStop(0, "rgba(0, 0, 0, 0)");
  across.addColorStop(0.5, "rgba(0, 0, 0, 1)");
  across.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = across;
  ctx.fillRect(0, 0, width, height);
  return { canvas, ox: width / 2, oy: top };
}
