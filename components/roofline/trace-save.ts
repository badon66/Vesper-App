import { z } from "zod";
import type { Pt, TraceScale } from "@/lib/deck";
import { TOO_DARK_LINE, isTooDark } from "@/lib/lights/dusk";
import { MAX_LIGHTS, SCALE_LOOKS_WRONG, readBackLine, traceReadBack, type ReadBack, type Size } from "@/lib/lights/place";
import { MAX_LINES, MAX_POINTS_PER_LINE, OTHER_FEET_MAX, OTHER_FEET_MIN } from "@/components/roofline/trace-edit";
import { SCALE_FEET } from "@/lib/deck";

// Saving a traced roofline (round 7, light_picker.tracing): what the tracer
// sends, and the one check the server action runs on it before it writes a
// roofline_traces row. Pure (no server or browser code), so it is unit
// tested, and the browser can run the same check before it sends.
//
// Stored photo-relative (0 to 1): the lines, their measured feet, the scale
// from the garage door, the dusk numbers measured from that photo, and the
// light count, recounted here from the lines rather than trusted.

export type TraceSave = {
  leadId: string;
  photoId: string;
  // The photo's own size in px, as the tracer loaded it, to count lights.
  photo: Size;
  lines: Pt[][];
  lineFeet: (number | null)[];
  scale: TraceScale;
  // Measured from the photo inside the trace's bounds (lib/lights/dusk.ts);
  // null when it couldn't be read.
  luminance: number | null;
  duskBrightness: number;
};

const unit = z.number().finite().min(0).max(1);
const pt = z.tuple([unit, unit]);

export const traceSaveSchema = z
  .object({
    leadId: z.uuid(),
    photoId: z.uuid(),
    photo: z.object({ width: z.number().int().min(16).max(20000), height: z.number().int().min(16).max(20000) }),
    lines: z.array(z.array(pt).min(2).max(MAX_POINTS_PER_LINE)).min(1).max(MAX_LINES),
    lineFeet: z.array(z.number().finite().positive().max(2000).nullable()).max(MAX_LINES),
    scale: z.object({
      a: pt,
      b: pt,
      feet: z.number().finite().min(OTHER_FEET_MIN).max(OTHER_FEET_MAX),
      kind: z.enum(["double", "single", "door", "other"]),
    }),
    luminance: unit.nullable(),
    duskBrightness: z.number().finite().gt(0).max(1),
  })
  .refine((value) => value.lineFeet.length === value.lines.length, { message: "line feet must match the lines" })
  .refine((value) => value.scale.kind === "other" || SCALE_FEET[value.scale.kind] === value.scale.feet, {
    message: "the door's feet must match its kind",
  });

// What goes in the roofline_traces row (besides the lead, the photo and its
// slot, which the server reads from lead_photos).
export type TraceRow = {
  lines: Pt[][];
  line_feet: (number | null)[];
  scale: TraceScale;
  dusk_brightness: number;
  luminance: number | null;
  light_count: number;
};

export type TraceCheck =
  | { ok: true; row: TraceRow; readBack: ReadBack; leadId: string; photoId: string }
  | { ok: false; error: string };

// Points are kept to 5 decimals: a hundredth of a pixel on a 3200 px photo.
const round5 = (value: number) => Math.round(value * 1e5) / 1e5;
const roundPt = ([x, y]: Pt): Pt => [round5(x), round5(y)];

export const NOT_TRACED = "Trace at least one line along the roof edge.";
export const SCALE_NOT_SET = "Drag both handles to the garage door's bottom corners.";
export const DIDNT_SAVE = "The trace didn't save. Check your signal and try again.";

export function checkTraceSave(input: unknown): TraceCheck {
  const parsed = traceSaveSchema.safeParse(input);
  if (!parsed.success) {
    const lines = (input as { lines?: unknown } | null)?.lines;
    if (!Array.isArray(lines) || lines.length === 0) return { ok: false, error: NOT_TRACED };
    return { ok: false, error: "Something in the trace didn't look right. Check it and save again." };
  }
  const value = parsed.data;
  const lines = value.lines.map((line) => line.map((point) => roundPt(point as Pt)));
  const scale: TraceScale = { a: roundPt(value.scale.a as Pt), b: roundPt(value.scale.b as Pt), feet: value.scale.feet, kind: value.scale.kind };
  const readBack = traceReadBack({ lines, lineFeet: value.lineFeet, scale }, value.photo);
  if (!readBack.scaleSet) return { ok: false, error: SCALE_NOT_SET };
  if (readBack.lights > MAX_LIGHTS) return { ok: false, error: SCALE_LOOKS_WRONG };
  if (readBack.lights < 1) return { ok: false, error: NOT_TRACED };
  if (value.luminance != null && isTooDark(value.luminance)) return { ok: false, error: TOO_DARK_LINE };
  return {
    ok: true,
    leadId: value.leadId,
    photoId: value.photoId,
    readBack,
    row: {
      lines,
      line_feet: value.lineFeet,
      scale,
      dusk_brightness: Math.round(value.duskBrightness * 1000) / 1000,
      luminance: value.luminance == null ? null : Math.round(value.luminance * 10000) / 10000,
      light_count: readBack.lights,
    },
  };
}

// The read-back, for Keenan only: "About 102 ft traced, about 155 lights",
// and the draft quote's feet beside it when a quote has runs.
export function readBackParts(readBack: ReadBack, quoteFeet: number | null): { traced: string; quote: string | null } {
  return {
    traced: readBackLine(readBack),
    quote: quoteFeet != null && quoteFeet > 0 ? `Draft quote: ${Math.round(quoteFeet)} ft` : null,
  };
}

// The feet in a quote's runs (quotes.runs as stored).
export function quoteRunFeet(runs: unknown): number {
  if (!Array.isArray(runs)) return 0;
  let feet = 0;
  for (const run of runs) {
    const value = run && typeof run === "object" ? Number((run as { feet?: unknown }).feet) : NaN;
    if (Number.isFinite(value) && value > 0) feet += value;
  }
  return Math.round(feet * 100) / 100;
}

// When dusk can't be measured (it always can once the photo shows, since it
// loads with CORS; this is only a guard), the photo is graded as a typical
// daytime photo would be.
export const FALLBACK_DUSK_BRIGHTNESS = 0.65;
