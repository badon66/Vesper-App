// How one light looks (round 7, light_picker.dusk_and_points "POINTS"):
// light inside a photograph, never an interface gradient or a flat dot.
// Pure numbers and colours; lib/lights/paint.ts turns them into sprites.
// p is the on-screen pitch (CSS px between neighbouring lights).
//
//   1. Core: the light's colour mixed toward white, clamped to 1.5 to 4 px.
//      Whites: about 60% toward white, radius 0.2p (a tinted white like
//      Warm white about 45%, so it reads warmer beside Cool white). Colours
//      (round 7 review, every seat): about 30% toward white, radius 0.15p,
//      so at the 11 to 12 px pitch of a real photo at 1180 the hue carries
//      the light and red reads red, not salmon.
//   2. Tight halo: full colour, radius 0.6p, so each light reads as its own
//      point and neighbours touch without merging into a tube. About 55% for
//      whites, 70% for colours.
//   3. Bloom: full colour, radius 1.6p at about 10%, kept faint so red and
//      green blocks never add up to yellow.
//   4. Wash: a band about 0.6 m deep on the wall under the line with a soft
//      falloff, at 20% for whites and 26% for colours, plus a 0.08 m glow on
//      the soffit above (round 7 review: the light must visibly fall on the
//      wall under each run).

export type Rgb = [number, number, number];

export const CORE_WHITE_MIX = 0.6;
// A tinted white (Warm white): its core keeps a little more of its colour.
export const CORE_TINTED_WHITE_MIX = 0.45;
export const CORE_COLOUR_MIX = 0.3;
export const CORE_RATIO = 0.2;
export const CORE_COLOUR_RATIO = 0.15;
export const CORE_MIN_PX = 1.5;
export const CORE_MAX_PX = 4;
export const HALO_RATIO = 0.6;
export const HALO_ALPHA = 0.55;
export const HALO_COLOUR_ALPHA = 0.7;
export const BLOOM_RATIO = 1.6;
export const BLOOM_ALPHA = 0.1;
// Each disc's falloff, as (share of its radius, share of its strength):
// what paint.ts draws and what lightAt() samples, so the tests measure the
// light the canvas paints.
export const BLOOM_STOPS: readonly (readonly [number, number])[] = [
  [0, 1],
  [0.3, 0.7],
  [0.65, 0.25],
  [1, 0],
];
export const HALO_STOPS: readonly (readonly [number, number])[] = [
  [0, 1],
  [0.35, 0.75],
  [0.7, 0.28],
  [1, 0],
];
export const CORE_STOPS: readonly (readonly [number, number])[] = [
  [0, 1],
  [0.55, 1],
  [1, 0],
];
// The halo and bloom stop growing past this pitch, so a light drawn very
// large (one light in the eave drawing) stays a light, and a sprite stays
// small in memory.
export const GLOW_MAX_PITCH_PX = 40;

export const WASH_DEPTH_M = 0.6;
export const SOFFIT_GLOW_M = 0.08;
export const WASH_ALPHA_WHITE = 0.2;
export const WASH_ALPHA_COLOUR = 0.26;
// The wash's strength down the wall, as (share of its depth, share of its
// strength at the line): it stays near full for the first few inches, then
// eases out to nothing, so it reads as light on siding, never as a stripe.
export const WASH_FALLOFF: readonly (readonly [number, number])[] = [
  [0.12, 0.88],
  [0.3, 0.62],
  [0.55, 0.32],
  [0.8, 0.1],
  [1, 0],
];
// A colour whose weakest channel is at least this share of its strongest is
// a white (Warm white #FFB46B is 0.42, Cool white #E4EEFF 0.89; Christmas
// green is 0.11, purple 0.23).
export const WHITE_MIN_RATIO = 0.35;
// A white under this share is a tinted one (Warm white 0.42); over it, a
// near-neutral one (Cool white 0.89, pure white 1).
export const TINTED_WHITE_BELOW = 0.6;

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

// The weakest channel as a share of the strongest: 1 for a pure white,
// near 0 for a saturated colour.
function channelRatio(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  const max = Math.max(r, g, b);
  return max > 0 ? Math.min(r, g, b) / max : 0;
}

// How far the core is mixed toward white: about 60% for a near-neutral
// white, 45% for a tinted white like Warm white, 30% for a colour.
export function coreMix(hex: string): number {
  if (!isWhiteLight(hex)) return CORE_COLOUR_MIX;
  return channelRatio(hex) < TINTED_WHITE_BELOW ? CORE_TINTED_WHITE_MIX : CORE_WHITE_MIX;
}

// The core's colour: the light's colour mixed toward white (coreMix).
export function coreColour(hex: string): Rgb {
  return mixToWhite(hexToRgb(hex), coreMix(hex));
}

// The tight halo's strength: about 55% for whites, 70% for colours.
export function haloAlpha(hex: string): number {
  return isWhiteLight(hex) ? HALO_ALPHA : HALO_COLOUR_ALPHA;
}

// The three radii of one light, in CSS px, for an on-screen pitch. A colour
// (white false) has the smaller core, so its halo carries the hue.
export function spriteRadii(pitch: number, white = true): { core: number; halo: number; bloom: number } {
  const p = Number.isFinite(pitch) && pitch > 0 ? pitch : 0;
  const glow = Math.min(p, GLOW_MAX_PITCH_PX);
  const core = Math.min(CORE_MAX_PX, Math.max(CORE_MIN_PX, (white ? CORE_RATIO : CORE_COLOUR_RATIO) * p));
  // The halo is never smaller than the core, so a tiny pitch still glows.
  const halo = Math.max(core, HALO_RATIO * glow);
  const bloom = Math.max(halo, BLOOM_RATIO * glow);
  return { core, halo, bloom };
}

export function isWhiteLight(hex: string): boolean {
  return channelRatio(hex) >= WHITE_MIN_RATIO;
}

// The wash's strength under a light of this colour.
export function washAlpha(hex: string): number {
  return isWhiteLight(hex) ? WASH_ALPHA_WHITE : WASH_ALPHA_COLOUR;
}

// A disc's strength at distance r from its centre (linear between stops, as
// a canvas radial gradient draws it).
function discAt(r: number, radius: number, stops: readonly (readonly [number, number])[]): number {
  if (!(radius > 0) || r >= radius) return 0;
  const t = Math.max(0, r) / radius;
  for (let at = 1; at < stops.length; at++) {
    const [t1, k1] = stops[at];
    const [t0, k0] = stops[at - 1];
    if (t <= t1) return t1 > t0 ? k0 + ((k1 - k0) * (t - t0)) / (t1 - t0) : k1;
  }
  return 0;
}

// One light's sprite at distance r (CSS px) from its centre, as the canvas
// holds it: the bloom and halo added ('lighter'), the core over them. The
// colour is unpremultiplied, 0 to 255; alpha 0 to 1. Pure, for the tests.
export function lightAt(hex: string, pitch: number, r: number): { rgb: Rgb; alpha: number } {
  const white = isWhiteLight(hex);
  const radii = spriteRadii(pitch, white);
  const rgb = hexToRgb(hex);
  const glow = Math.min(1, BLOOM_ALPHA * discAt(r, radii.bloom, BLOOM_STOPS) + haloAlpha(hex) * discAt(r, radii.halo, HALO_STOPS));
  const coreAlpha = discAt(r, radii.core, CORE_STOPS);
  const core = coreColour(hex);
  const alpha = coreAlpha + glow * (1 - coreAlpha);
  if (!(alpha > 0)) return { rgb: [0, 0, 0], alpha: 0 };
  const mix = (c: number, g: number) => (c * coreAlpha + g * glow * (1 - coreAlpha)) / alpha;
  return { rgb: [mix(core[0], rgb[0]), mix(core[1], rgb[1]), mix(core[2], rgb[2])], alpha };
}

// The sprite screen-blended over a backdrop (what the light canvas's
// mix-blend-mode screen shows on the photo), at distance r.
export function lightOver(hex: string, pitch: number, r: number, backdrop: Rgb): Rgb {
  const { rgb, alpha } = lightAt(hex, pitch, r);
  return [0, 1, 2].map((at) => {
    const b = backdrop[at] / 255;
    const screened = 1 - (1 - b) * (1 - rgb[at] / 255);
    return 255 * (b + alpha * (screened - b));
  }) as Rgb;
}
