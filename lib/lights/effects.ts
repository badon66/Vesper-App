import type { Effect, Look } from "@/lib/deck";
import { easeQuiet } from "@/lib/motion";

// What every light is doing at time t (round 7, light_picker.effects and
// motion). Pure and seeded, so the same look looks the same at every
// meeting, and so a unit test can prove the hard cap: no light ever changes
// more than 3 times a second, for any look Settings can hold.
//
// CONTRACT
//   lightFrame(effect, look, light, t, out?) -> LightFrame
//     light is { line, i } (lib/lights/place.ts Light), t is ms since the
//     effect was chosen, counting only time it was playing.
//   LightFrame { from, to, mix, level }: the light shows look.colours[from]
//     blended toward look.colours[to] by mix (0 to 1), at level (0 to 1).
//   blockColour(i, look)   the colour a light has when steady
//   effectAnimates(effect) true for Twinkle and Chase (they need frames)
//   frameRgb(frame, rgbs)  the light's colour as RGB x level, given the look's colours as RGB
//
// The effects (four fixed words; no look carries its own effect):
//   Steady   the look's colours in blocks along each line, restarting at
//            each line; drawn once.
//   Twinkle  a soft sparkle: about 1 light in 8 at any moment dips to 35%
//            and back, 300 ms down and 600 ms up, on a seeded pattern.
//            Never a flash, never everything at once. Up to 30 fps.
//   Chase    the pattern moves one light every 200 ms (1 m a second at the
//            real spacing), each step blended over 120 ms. Multi-colour
//            looks move their blocks; a one-colour look sends bands of 6
//            lights at full brightness along a 45% base.
//   Off      the lights fade out over 400 ms (EASE_QUIET). LightCanvas does
//            this with the canvas's own opacity, the same curve; this model
//            is for the tests and any other renderer.

export type LightId = { line: number; i: number };
export type LightFrame = { from: number; to: number; mix: number; level: number };
type LookColours = Pick<Look, "colours" | "block">;

export const MAX_CHANGES_PER_SECOND = 3;

export const TWINKLE_SHARE = 1 / 8;
export const TWINKLE_LOW = 0.35;
export const TWINKLE_DOWN_MS = 300;
export const TWINKLE_UP_MS = 600;
export const TWINKLE_DIP_MS = TWINKLE_DOWN_MS + TWINKLE_UP_MS;
// Each light dips once in every cycle, at a seeded moment, so 1 in 8 is
// dipping at any time: 900 ms of every 7,200.
export const TWINKLE_CYCLE_MS = TWINKLE_DIP_MS / TWINKLE_SHARE;
export const TWINKLE_FPS = 30;
// The watchdog's fallback when frames run slow.
export const TWINKLE_SLOW_FPS = 15;

export const CHASE_STEP_MS = 200;
export const CHASE_BLEND_MS = 120;
export const CHASE_FPS = 30;
export const CHASE_BAND = 6;
export const CHASE_BASE = 0.45;
// A one-colour look's bands repeat every 30 lights (6 m), so a short garage
// line shows one too.
export const CHASE_BAND_EVERY = 30;

export const OFF_FADE_MS = 400;

// The same pattern every meeting.
const SEED = 0x5eed7a11;

// A whole-number hash of three small integers, from 0 up to (not including) 1.
function hash01(a: number, b: number, c: number): number {
  let h = SEED ^ Math.imul(a + 0x9e37, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) ^ Math.imul(b + 0x7f4a, 0x27d4eb2f);
  h = Math.imul(h ^ (h >>> 15), 0x165667b1) ^ Math.imul(c + 0x1b87, 0x9e3779b1);
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const mod = (n: number, m: number) => ((n % m) + m) % m;

// Soft in and out, for the twinkle's dip and the chase's blend.
const easeInOut = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : 0.5 - 0.5 * Math.cos(Math.PI * x));

export function effectAnimates(effect: Effect): boolean {
  return effect === "twinkle" || effect === "chase";
}

// The colour a light has when steady: blocks of `block` along the line.
export function blockColour(i: number, look: LookColours): number {
  const n = look.colours.length;
  if (n <= 1) return 0;
  const block = Math.max(1, Math.floor(look.block) || 1);
  return Math.floor(mod(i, n * block) / block) % n;
}

// When light (line, i) starts its dip in a twinkle cycle, in ms from the
// start of the effect. Every dip ends inside its own cycle.
export function twinkleDipStart(line: number, i: number, cycle: number): number {
  return cycle * TWINKLE_CYCLE_MS + hash01(line, i, cycle) * (TWINKLE_CYCLE_MS - TWINKLE_DIP_MS);
}

export function twinkleLevel(line: number, i: number, t: number): number {
  if (!(t >= 0)) return 1;
  const cycle = Math.floor(t / TWINKLE_CYCLE_MS);
  const u = t - twinkleDipStart(line, i, cycle);
  if (u < 0 || u >= TWINKLE_DIP_MS) return 1;
  if (u < TWINKLE_DOWN_MS) return 1 - (1 - TWINKLE_LOW) * easeInOut(u / TWINKLE_DOWN_MS);
  return TWINKLE_LOW + (1 - TWINKLE_LOW) * easeInOut((u - TWINKLE_DOWN_MS) / TWINKLE_UP_MS);
}

// How many chase steps pass between two changes of one light, at the most
// frequent: a block's length for a multi-colour look; for a one-colour look,
// the band (or the gap between bands, if shorter).
function chaseStepsPerChange(look: LookColours): number {
  if (look.colours.length <= 1) return Math.min(CHASE_BAND, CHASE_BAND_EVERY - CHASE_BAND);
  return Math.max(1, Math.floor(look.block) || 1);
}

// The chase's step, slowed only if a look in Settings would otherwise
// change a light more than 3 times a second (blocks of 1). With blocks of
// 2 or more it is always 200 ms.
export function chaseStepMs(look: LookColours): number {
  return Math.max(CHASE_STEP_MS, Math.ceil(1000 / MAX_CHANGES_PER_SECOND / chaseStepsPerChange(look)));
}

function chaseColour(i: number, step: number, look: LookColours): number {
  return blockColour(i - step, look);
}

function bandLevel(i: number, step: number): number {
  return mod(step - i, CHASE_BAND_EVERY) < CHASE_BAND ? 1 : CHASE_BASE;
}

export function lightFrame(effect: Effect, look: LookColours, light: LightId, t: number, out?: LightFrame): LightFrame {
  const frame = out ?? { from: 0, to: 0, mix: 0, level: 1 };
  const steady = blockColour(light.i, look);
  frame.from = steady;
  frame.to = steady;
  frame.mix = 0;
  frame.level = 1;
  const time = Number.isFinite(t) && t > 0 ? t : 0;
  switch (effect) {
    case "twinkle":
      frame.level = twinkleLevel(light.line, light.i, time);
      return frame;
    case "chase": {
      const stepMs = chaseStepMs(look);
      const step = Math.floor(time / stepMs);
      const blend = Math.min(1, (time - step * stepMs) / Math.min(CHASE_BLEND_MS, stepMs));
      const e = easeInOut(blend);
      if (look.colours.length <= 1) {
        // From steady (full) into the first bands, then step by step.
        const before = step === 0 ? 1 : bandLevel(light.i, step - 1);
        const now = bandLevel(light.i, step);
        frame.level = e >= 1 ? now : before + (now - before) * e;
        return frame;
      }
      const before = step === 0 ? steady : chaseColour(light.i, step - 1, look);
      const now = chaseColour(light.i, step, look);
      frame.from = before;
      frame.to = now;
      frame.mix = before === now ? 0 : e;
      return frame;
    }
    case "off":
      frame.level = 1 - easeQuiet(Math.min(1, time / OFF_FADE_MS));
      return frame;
    default:
      return frame;
  }
}

// The light's colour, mixed and dimmed, as RGB from 0 to 255.
export function frameRgb(frame: LightFrame, rgbs: [number, number, number][]): [number, number, number] {
  const a = rgbs[frame.from] ?? [0, 0, 0];
  const b = rgbs[frame.to] ?? a;
  const m = frame.mix;
  return [
    (a[0] + (b[0] - a[0]) * m) * frame.level,
    (a[1] + (b[1] - a[1]) * m) * frame.level,
    (a[2] + (b[2] - a[2]) * m) * frame.level,
  ];
}
