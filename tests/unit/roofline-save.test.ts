import { describe, expect, it } from "vitest";
import {
  NOT_TRACED,
  SCALE_NOT_SET,
  checkTraceSave,
  quoteRunFeet,
  readBackOf,
  readBackParts,
  sameTrace,
  storedForm,
  type TraceSave,
  type TraceShape,
} from "@/components/roofline/trace-save";
import type { Pt } from "@/lib/deck";
import { parseTrace } from "@/lib/deck";
import { TOO_DARK_LINE } from "@/lib/lights/dusk";
import { SCALE_LOOKS_WRONG } from "@/lib/lights/place";

// Round 7 (light_picker.tracing): what Save sends and the server checks
// before it writes a roofline_traces row.
//
// A 1600 x 1200 photo. The garage door's corners 400 px apart for a double
// (16 ft = 4.8768 m): 82.02 px a metre, a light every 16.4 px. The eave is
// 1000 px (12.19 m): 60 lights at 0.2 m.
const good: TraceSave = {
  leadId: "7d6d2f0e-3a0b-4c55-9a43-6d5f7d0c2b11",
  photoId: "0f6c3b49-2a3f-4b8e-9d0c-9a8e1f2b3c4d",
  photo: { width: 1600, height: 1200 },
  lines: [
    [
      [0.1, 0.3],
      [0.725, 0.3],
    ],
  ],
  lineFeet: [null],
  scale: { a: [0.4, 0.8], b: [0.65, 0.8], feet: 16, kind: "double" },
  luminance: 0.42,
  duskBrightness: 0.7,
};

describe("Saving a trace", () => {
  it("recounts the lights from the lines and the scale, not from the browser", () => {
    const check = checkTraceSave({ ...good, lightCount: 9999 });
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    expect(check.row.light_count).toBe(60);
    expect(check.readBack.feet).toBeCloseTo(40, 0);
    expect(check.row).toMatchObject({ dusk_brightness: 0.7, luminance: 0.42, line_feet: [null] });
  });

  it("stores what the meeting can read back", () => {
    const check = checkTraceSave(good);
    if (!check.ok) throw new Error(check.error);
    const stored = parseTrace({
      lines: check.row.lines,
      line_feet: check.row.line_feet,
      scale: check.row.scale,
      dusk_brightness: check.row.dusk_brightness,
      light_count: check.row.light_count,
    });
    expect(stored).toMatchObject({ lines: good.lines, lineFeet: [null], scale: good.scale, lightCount: 60 });
  });

  it("gives a measured line exactly round(feet x 1.524) lights", () => {
    const check = checkTraceSave({ ...good, lineFeet: [42] });
    expect(check.ok && check.row.light_count).toBe(64);
  });

  it("keeps points to five decimals", () => {
    const check = checkTraceSave({ ...good, lines: [[[0.1234567891, 0.3], [0.7, 0.30000001]]] });
    expect(check.ok && check.row.lines[0]).toEqual([
      [0.12346, 0.3],
      [0.7, 0.3],
    ]);
  });

  it("refuses over 1,500 lights: the scale looks wrong", () => {
    // The two handles 4 px apart: a door that small makes 5,000 lights.
    const check = checkTraceSave({ ...good, scale: { ...good.scale, b: [0.4025, 0.8] } });
    expect(check).toEqual({ ok: false, error: SCALE_LOOKS_WRONG });
  });

  it("refuses a photo taken after dark", () => {
    expect(checkTraceSave({ ...good, luminance: 0.04 })).toEqual({ ok: false, error: TOO_DARK_LINE });
    expect(checkTraceSave({ ...good, luminance: null }).ok).toBe(true);
  });

  it("refuses a scale with both handles on one spot", () => {
    expect(checkTraceSave({ ...good, scale: { ...good.scale, b: good.scale.a } })).toEqual({ ok: false, error: SCALE_NOT_SET });
  });

  it("refuses a door's feet that don't match its kind", () => {
    expect(checkTraceSave({ ...good, scale: { ...good.scale, feet: 40 } }).ok).toBe(false);
    expect(checkTraceSave({ ...good, scale: { ...good.scale, feet: 12, kind: "other" } }).ok).toBe(true);
  });

  it("refuses no lines, a one-point line, points off the photo, and feet that don't line up", () => {
    expect(checkTraceSave({ ...good, lines: [], lineFeet: [] })).toEqual({ ok: false, error: NOT_TRACED });
    expect(checkTraceSave({ ...good, lines: [[[0.1, 0.3]]] }).ok).toBe(false);
    expect(checkTraceSave({ ...good, lines: [[[0.1, 0.3], [1.2, 0.3]]] }).ok).toBe(false);
    expect(checkTraceSave({ ...good, lineFeet: [null, 20] }).ok).toBe(false);
    expect(checkTraceSave({ ...good, leadId: "not-a-lead" }).ok).toBe(false);
    expect(checkTraceSave({ ...good, duskBrightness: 0 }).ok).toBe(false);
    expect(checkTraceSave({ ...good, duskBrightness: 1.4 }).ok).toBe(false);
    expect(checkTraceSave(null).ok).toBe(false);
  });
});

describe("The read-back, for Keenan only", () => {
  it("says the feet and lights, and the draft quote's feet beside them", () => {
    expect(readBackParts({ feet: 101.6, lights: 155, tooMany: false, scaleSet: true }, 140)).toEqual({
      traced: "About 102 ft traced, about 155 lights",
      quote: "Draft quote: 140 ft",
    });
    expect(readBackParts({ feet: 0.4, lights: 1, tooMany: false, scaleSet: true }, null)).toEqual({
      traced: "About 0 ft traced, about 1 light",
      quote: null,
    });
  });

  it("adds up a quote's runs as stored", () => {
    expect(quoteRunFeet([{ name: "Front", feet: 60, level: "lower" }, { name: "Garage", feet: "22" }, { feet: -4 }, null])).toBe(82);
    expect(quoteRunFeet(null)).toBe(0);
  });
});

describe("One count for the tracer, the save and prep", () => {
  // A small seeded random walk, so the run is the same every time.
  function rng(seed: number) {
    let state = seed >>> 0;
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 2 ** 32;
    };
  }
  function randomTrace(random: () => number): TraceShape {
    const lines: Pt[][] = Array.from({ length: 1 + Math.floor(random() * 3) }, () =>
      Array.from({ length: 2 + Math.floor(random() * 4) }, (): Pt => [0.05 + random() * 0.9, 0.1 + random() * 0.5]),
    );
    const left = 0.2 + random() * 0.3;
    return {
      lines,
      lineFeet: lines.map(() => (random() < 0.2 ? Math.round(random() * 4000) / 100 + 5 : null)),
      scale: { a: [left, 0.8], b: [left + 0.12 + random() * 0.1, 0.8 + random() * 0.002], feet: 16, kind: "double" },
    };
  }

  it("gives the tracer's read-back the count Save stores, for any trace as drawn", () => {
    const random = rng(7);
    for (let run = 0; run < 300; run++) {
      const trace = randomTrace(random);
      const photo = random() < 0.5 ? { width: 3200, height: 2400 } : { width: 1600, height: 1200 };
      const check = checkTraceSave({ ...good, ...trace, photo });
      if (!check.ok) continue;
      expect(readBackOf(trace, photo).lights).toBe(check.row.light_count);
    }
  });

  it("reads a reopened trace back at the count prep shows", () => {
    const random = rng(11);
    for (let run = 0; run < 100; run++) {
      const trace = randomTrace(random);
      const check = checkTraceSave({ ...good, ...trace });
      if (!check.ok) continue;
      const stored = parseTrace({
        lines: check.row.lines,
        line_feet: check.row.line_feet,
        scale: check.row.scale,
        dusk_brightness: check.row.dusk_brightness,
        light_count: check.row.light_count,
      });
      if (!stored) throw new Error("stored trace didn't parse");
      expect(readBackOf(stored, good.photo).lights).toBe(stored.lightCount);
    }
  });

  it("stores a trace once: storing it again changes nothing", () => {
    const trace: TraceShape = { lines: [[[0.1234567891, 0.3], [0.7, 0.30000001]]], lineFeet: [0], scale: good.scale };
    const once = storedForm(trace);
    expect(once.lines[0]).toEqual([
      [0.12346, 0.3],
      [0.7, 0.3],
    ]);
    expect(once.lineFeet).toEqual([null]);
    expect(storedForm(once)).toEqual(once);
  });

  it("knows when the trace on screen is the one saved", () => {
    const saved = { photoId: good.photoId, trace: { lines: good.lines, lineFeet: good.lineFeet, scale: good.scale } };
    const drawn: TraceShape = { lines: [[[0.1000000004, 0.3], [0.725, 0.3]]], lineFeet: [null], scale: good.scale };
    expect(sameTrace({ photoId: good.photoId, trace: drawn }, saved)).toBe(true);
    expect(sameTrace({ photoId: good.photoId, trace: { ...drawn, lines: [[[0.11, 0.3], [0.725, 0.3]]] } }, saved)).toBe(false);
    expect(sameTrace({ photoId: good.photoId, trace: { ...drawn, lineFeet: [40] } }, saved)).toBe(false);
    expect(sameTrace({ photoId: good.photoId, trace: { ...drawn, scale: { ...good.scale, feet: 9, kind: "single" } } }, saved)).toBe(false);
    expect(sameTrace({ photoId: "another", trace: drawn }, saved)).toBe(false);
    expect(sameTrace({ photoId: good.photoId, trace: drawn }, { photoId: good.photoId, trace: null })).toBe(false);
    expect(sameTrace({ photoId: good.photoId, trace: null }, { photoId: good.photoId, trace: null })).toBe(true);
  });
});
