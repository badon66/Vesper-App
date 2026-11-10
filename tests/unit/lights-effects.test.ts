import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { EFFECTS, parseLooks, type Effect, type Look } from "@/lib/deck";
import {
  CHASE_BAND,
  CHASE_BASE,
  CHASE_STEP_MS,
  MAX_CHANGES_PER_SECOND,
  OFF_FADE_MS,
  TWINKLE_CYCLE_MS,
  TWINKLE_DIP_MS,
  TWINKLE_LOW,
  blockColour,
  chaseStepMs,
  effectAnimates,
  frameRgb,
  lightFrame,
  twinkleDipStart,
  twinkleLevel,
} from "@/lib/lights/effects";
import { hexToRgb } from "@/lib/lights/glow";

// The looks as seeded in production (the migration itself, not a copy).
const seedSql = readFileSync(new URL("../../supabase/migrations/20261108080527_round7_deck_words_and_looks.sql", import.meta.url), "utf8");
const SEEDED = parseLooks(JSON.parse(/\$looks\$([\s\S]*?)\$looks\$/.exec(seedSql)?.[1] ?? "[]"));

// Looks Settings could hold, at the edges of what it allows, plus one it
// shouldn't (blocks of 1 with two colours) to prove the cap holds anyway.
const look = (key: string, hexes: string[], block: number): Look => ({
  key,
  name: key,
  words: "",
  colours: hexes.map((hex) => ({ hex, name: hex })),
  block,
  active: true,
});
const EDGES: Look[] = [
  look("four_by_two", ["#FF0000", "#00FF00", "#0000FF", "#FFFFFF"], 2),
  look("two_by_six", ["#FF2A1F", "#FFB000"], 6),
  look("one_colour", ["#8F3BFF"], 1),
  look("two_by_one", ["#FF2A1F", "#FFB000"], 1),
];
const ALL = [...SEEDED, ...EDGES];

const DT = 5;

// When each change starts for one light: the light starts moving from rest,
// or turns back (a dip's way down, then its way up, counts twice).
function changeStarts(effect: Effect, subject: Look, line: number, i: number, ms: number): number[] {
  const rgbs = subject.colours.map((colour) => hexToRgb(colour.hex));
  const at = (t: number) => frameRgb(lightFrame(effect, subject, { line, i }, t), rgbs);
  const starts: number[] = [];
  let before = at(0);
  let moving: number[] | null = null;
  for (let t = DT; t <= ms; t += DT) {
    const now = at(t);
    const delta = [now[0] - before[0], now[1] - before[1], now[2] - before[2]];
    const isMoving = Math.hypot(delta[0], delta[1], delta[2]) > 1e-6;
    if (isMoving) {
      const turned = moving !== null && delta[0] * moving[0] + delta[1] * moving[1] + delta[2] * moving[2] < 0;
      if (moving === null || turned) starts.push(t);
    }
    moving = isMoving ? delta : null;
    before = now;
  }
  return starts;
}

// No four change starts inside any one second.
function worstSecond(starts: number[]): number {
  let worst = 0;
  for (let at = 0; at < starts.length; at++) {
    let n = 1;
    while (at + n < starts.length && starts[at + n] - starts[at] < 1000 - 2 * DT) n += 1;
    worst = Math.max(worst, n);
  }
  return worst;
}

describe("the seeded looks", () => {
  it("are the five Keenan approved, every one drawable", () => {
    expect(SEEDED.map((item) => item.key)).toEqual(["warm_white", "cool_white", "christmas", "game_night", "halloween"]);
    expect(SEEDED.map((item) => item.block)).toEqual([1, 1, 3, 3, 3]);
  });
});

describe("the hard cap: no light changes more than 3 times a second", () => {
  for (const subject of ALL) {
    for (const { key: effect } of EFFECTS) {
      it(`${subject.key}, ${effect}`, () => {
        for (const line of [0, 1]) {
          for (let i = 0; i < 36; i++) {
            const starts = changeStarts(effect, subject, line, i, 12_000);
            expect(worstSecond(starts), `light ${line}:${i}`).toBeLessThanOrEqual(MAX_CHANGES_PER_SECOND);
          }
        }
      });
    }
  }

  it("holds for twinkle however the seeded dips fall, over many cycles", () => {
    // Back to back dips across a cycle's edge are the worst case: down, up,
    // down, up inside 1.8 s, never four starts in one second.
    for (let line = 0; line < 3; line++) {
      for (let i = 0; i < 400; i++) {
        let lastEnd = -Infinity;
        for (let cycle = 0; cycle < 40; cycle++) {
          const start = twinkleDipStart(line, i, cycle);
          expect(start).toBeGreaterThanOrEqual(cycle * TWINKLE_CYCLE_MS);
          expect(start + TWINKLE_DIP_MS).toBeLessThanOrEqual((cycle + 1) * TWINKLE_CYCLE_MS + 1e-6);
          expect(start).toBeGreaterThanOrEqual(lastEnd - 1e-6);
          lastEnd = start + TWINKLE_DIP_MS;
        }
      }
    }
    const starts = changeStarts("twinkle", SEEDED[0], 2, 77, 120_000);
    expect(worstSecond(starts)).toBeLessThanOrEqual(MAX_CHANGES_PER_SECOND);
  });

  it("slows the chase only for a look that would break it", () => {
    for (const subject of SEEDED) expect(chaseStepMs(subject)).toBe(CHASE_STEP_MS);
    expect(chaseStepMs(EDGES[0])).toBe(CHASE_STEP_MS);
    expect(chaseStepMs(EDGES[3])).toBe(334);
  });
});

describe("steady", () => {
  it("repeats the colours in blocks along each line, restarting at each line", () => {
    const christmas = SEEDED[2];
    const colours = Array.from({ length: 10 }, (_, i) => lightFrame("steady", christmas, { line: 4, i }, 5000).from);
    expect(colours).toEqual([0, 0, 0, 1, 1, 1, 2, 2, 2, 0]);
    // i restarts at 0 on every line, so every line starts on the first colour.
    expect(lightFrame("steady", christmas, { line: 9, i: 0 }, 0).from).toBe(0);
    expect(blockColour(-1, christmas)).toBe(2);
  });

  it("is full and never moves", () => {
    for (const t of [0, 1234, 99_999]) {
      expect(lightFrame("steady", SEEDED[0], { line: 0, i: 3 }, t)).toEqual({ from: 0, to: 0, mix: 0, level: 1 });
    }
    expect(effectAnimates("steady")).toBe(false);
    expect(effectAnimates("off")).toBe(false);
    expect(effectAnimates("twinkle")).toBe(true);
    expect(effectAnimates("chase")).toBe(true);
  });
});

describe("twinkle", () => {
  it("dips about 1 light in 8 at any moment, to 35% and back over 900 ms", () => {
    let dipping = 0;
    let samples = 0;
    let lowest = 1;
    for (let i = 0; i < 300; i++) {
      for (let t = 0; t < 60_000; t += 997) {
        const level = twinkleLevel(1, i, t);
        lowest = Math.min(lowest, level);
        if (level < 0.999) dipping += 1;
        samples += 1;
      }
    }
    expect(dipping / samples).toBeGreaterThan(0.1);
    expect(dipping / samples).toBeLessThan(0.15);
    expect(lowest).toBeGreaterThanOrEqual(TWINKLE_LOW - 1e-9);
    expect(lowest).toBeLessThan(TWINKLE_LOW + 0.05);
  });

  it("takes 300 ms down and 600 ms up, softly", () => {
    const start = twinkleDipStart(0, 5, 3);
    expect(twinkleLevel(0, 5, start + 300)).toBeCloseTo(TWINKLE_LOW, 6);
    expect(twinkleLevel(0, 5, start + 150)).toBeCloseTo((1 + TWINKLE_LOW) / 2, 6);
    expect(twinkleLevel(0, 5, start + 600)).toBeCloseTo((1 + TWINKLE_LOW) / 2, 6);
    expect(twinkleLevel(0, 5, start + 900)).toBe(1);
  });

  it("is the same pattern at every meeting, and never all at once", () => {
    const run = () => Array.from({ length: 50 }, (_, i) => twinkleLevel(0, i, 4321));
    expect(run()).toEqual(run());
    // No light is mid-dip the moment it is tapped on.
    for (let i = 0; i < 200; i++) expect(twinkleLevel(0, i, 0)).toBe(1);
    for (let t = 1000; t < 30_000; t += 1000) {
      const down = Array.from({ length: 200 }, (_, i) => twinkleLevel(0, i, t)).filter((level) => level < 0.999).length;
      expect(down).toBeLessThan(60);
    }
  });
});

describe("chase", () => {
  it("moves a multi-colour look's blocks one light every 200 ms", () => {
    const game = SEEDED[3];
    for (let step = 0; step < 12; step++) {
      const t = step * CHASE_STEP_MS + 150;
      for (let i = 0; i < 12; i++) {
        const frame = lightFrame("chase", game, { line: 0, i }, t);
        expect(frame.mix === 0 ? frame.from : frame.to).toBe(blockColour(i - step, game));
        expect(frame.level).toBe(1);
      }
    }
  });

  it("blends each step over 120 ms", () => {
    const game = SEEDED[3];
    // Light 3 changes at step 1 (from block 1 to block 0).
    const halfway = lightFrame("chase", game, { line: 0, i: 3 }, CHASE_STEP_MS + 60);
    expect(halfway.from).not.toBe(halfway.to);
    expect(halfway.mix).toBeCloseTo(0.5, 6);
    const done = lightFrame("chase", game, { line: 0, i: 3 }, CHASE_STEP_MS + 120);
    expect(done.mix).toBe(1);
  });

  it("opens exactly as steady, so nothing jumps under a finger", () => {
    for (const subject of SEEDED.slice(2)) {
      for (let i = 0; i < 20; i++) {
        expect(lightFrame("chase", subject, { line: 0, i }, 0)).toEqual(lightFrame("steady", subject, { line: 0, i }, 0));
      }
    }
  });

  it("sends bands of 6 at full along a 45% base on a one-colour look", () => {
    const warm = SEEDED[0];
    const t = 10 * CHASE_STEP_MS + 150;
    const levels = Array.from({ length: 30 }, (_, i) => lightFrame("chase", warm, { line: 0, i }, t).level);
    expect(levels.filter((level) => level === 1)).toHaveLength(CHASE_BAND);
    expect(levels.filter((level) => level === CHASE_BASE)).toHaveLength(30 - CHASE_BAND);
    // The band is lights 5 to 10 at step 10, moving forward.
    expect(levels.slice(5, 11)).toEqual([1, 1, 1, 1, 1, 1]);
  });
});

describe("off", () => {
  it("fades out over 400 ms and stays out", () => {
    const at = (t: number) => lightFrame("off", SEEDED[2], { line: 0, i: 0 }, t).level;
    expect(at(0)).toBe(1);
    expect(at(OFF_FADE_MS)).toBe(0);
    expect(at(5000)).toBe(0);
    let previous = 1;
    for (let t = 10; t <= OFF_FADE_MS; t += 10) {
      expect(at(t)).toBeLessThanOrEqual(previous);
      previous = at(t);
    }
  });
});
