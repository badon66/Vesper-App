// How one light looks (round 7, light_picker.dusk_and_points "POINTS"):
// light inside a photograph, never an interface gradient or a flat dot.
// Pure numbers and colours; lib/lights/paint.ts turns them into sprites.
// p is the on-screen pitch (CSS px between neighbouring lights).
//
//   1. Core: the light's colour mixed about 60% toward white, radius 0.2p,
//      clamped to 1.5 to 4 px.
//   2. Tight halo: full colour, radius 0.6p at about 55%, so each light reads
//      as its own point and neighbours touch without merging into a tube.
//   3. Bloom: full colour, radius 1.6p at about 10%, kept faint so red and
//      green blocks never add up to yellow.
//   4. Wash: a band 0.35 m deep on the wall just under the line, at 12% for
//      whites and 18% for colours, plus a 0.08 m glow on the soffit above.

export type Rgb = [number, number, number];

export const CORE_WHITE_MIX = 0.6;
export const CORE_RATIO = 0.2;
export const CORE_MIN_PX = 1.5;
export const CORE_MAX_PX = 4;
export const HALO_RATIO = 0.6;
export const HALO_ALPHA = 0.55;
export const BLOOM_RATIO = 1.6;
export const BLOOM_ALPHA = 0.1;
// The halo and bloom stop growing past this pitch, so a light drawn very
// large (one light in the eave drawing) stays a light, and a sprite stays
// small in memory.
export const GLOW_MAX_PITCH_PX = 40;

export const WASH_DEPTH_M = 0.35;
export const SOFFIT_GLOW_M = 0.08;
export const WASH_ALPHA_WHITE = 0.12;
export const WASH_ALPHA_COLOUR = 0.18;
// A colour whose weakest channel is at least this share of its strongest is
// a white (Warm white #FFB46B is 0.42, Cool white #E4EEFF 0.89; Christmas
// green is 0.11, purple 0.23).
export const WHITE_MIN_RATIO = 0.35;

export function hexToRgb(hex: string): Rgb {
  const clean = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!clean) return [255, 255, 255];
  const n = parseInt(clean[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToCss([r, g, b]: Rgb, alpha = 1): string {
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${Math.round(alpha * 1000) / 1000})`;
}

export function mixToWhite([r, g, b]: Rgb, k: number): Rgb {
  return [r + (255 - r) * k, g + (255 - g) * k, b + (255 - b) * k];
}

// The core's colour: the light's colour about 60% toward white.
export function coreColour(hex: string): Rgb {
  return mixToWhite(hexToRgb(hex), CORE_WHITE_MIX);
}

// The three radii of one light, in CSS px, for an on-screen pitch.
export function spriteRadii(pitch: number): { core: number; halo: number; bloom: number } {
  const p = Number.isFinite(pitch) && pitch > 0 ? pitch : 0;
  const glow = Math.min(p, GLOW_MAX_PITCH_PX);
  const core = Math.min(CORE_MAX_PX, Math.max(CORE_MIN_PX, CORE_RATIO * p));
  // The halo is never smaller than the core, so a tiny pitch still glows.
  const halo = Math.max(core, HALO_RATIO * glow);
  const bloom = Math.max(halo, BLOOM_RATIO * glow);
  return { core, halo, bloom };
}

export function isWhiteLight(hex: string): boolean {
  const [r, g, b] = hexToRgb(hex);
  const max = Math.max(r, g, b);
  return max > 0 && Math.min(r, g, b) / max >= WHITE_MIN_RATIO;
}

// The wash's strength under a light of this colour.
export function washAlpha(hex: string): number {
  return isWhiteLight(hex) ? WASH_ALPHA_WHITE : WASH_ALPHA_COLOUR;
}
