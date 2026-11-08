import { describe, expect, it } from "vitest";
import { NOT_TRACED, SCALE_NOT_SET, checkTraceSave, quoteRunFeet, readBackParts, type TraceSave } from "@/components/roofline/trace-save";
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
