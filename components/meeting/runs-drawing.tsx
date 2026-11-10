"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { useDeck } from "@/components/meeting/deck-parts";
import { DAY_PAPER, HouseDrawing } from "@/components/drawings/house-drawing";
import { housePlacement } from "@/components/drawings/lit-house";
import { LightCanvas, useBoxSize } from "@/components/lights/light-canvas";
import type { Look } from "@/lib/deck";
import { fitView, HOUSE_EAVES, HOUSE_RUNS, pathD, preserveAspect, viewOf, type HouseRun, type ViewTransform } from "@/lib/drawings/house";
import { MOTION, transition, useReducedMotion } from "@/lib/motion";
import type { QuoteRun } from "@/lib/pricing";
import { runLabels, runPartStates, runsDrawingWords, type DrawingState } from "@/lib/quotes/runs-drawing";
import { cn } from "@/lib/utils";

// A quote's runs on the shared house (round 9, 2026-11-10; the spec, 3.4):
// one house everywhere, the same eight-run geometry as the deck's drawings
// (lib/drawings/house.ts) and the link's house diagram. Each run is lit,
// dashed or the plain outline (lib/quotes/runs-drawing.ts):
//   night   Night Text hairlines on navy; lit runs carry the deck's own
//           warm white points (the light picker's renderer, LightCanvas, at
//           the real 0.2 m spacing), so they look like every other light in
//           the deck; measured runs left out are a dashed track
//   day     navy hairlines on the paper tone; lit runs are a navy track with
//           gold nodes, as on the customer's link
// Switching options cross-fades: a run dropped from the option fades to
// dashed over 300 ms (so walking down from the full wrap reads as runs going
// dark), and a run added fades up. With Reduce Motion the change is instant.
// It never shows a price.
//
// CONTRACT
//   <RunsDrawing
//     runs         the quote's measured runs (quotes.runs); a run with no
//                  feet isn't measured and lights nothing
//     lit          positions into runs to light (an option's runs), or null
//                  for every run
//     dashedRest?  measured runs not lit show as a dashed track (default
//                  false: the plain outline)
//     labels?      names each lit run with its feet beside it ("Front 64 ft"),
//                  on a solid chip so the lines never cross the words; a lit
//                  run drawn nowhere (part Other) is named along the foot.
//                  The labels read at the deck's small size (20 to 22 px)
//                  inside the deck and 14 px elsewhere; labelClassName
//                  overrides
//     tone?        "night" (default) | "day"
//     ground?      "navy" (default): its own ground fills the box (Night
//                  Background, or the paper tone by day); "none": lines only,
//                  for a More layer's Night Card
//     label?       what a screen reader hears; a plain default names the lit
//                  runs (never a price)
//     decorative?  hidden from screen readers (beside words that say it)
//     className?   size it with this; the house is fitted whole and centred
//   />

// The whole house with room around it: the deck's "whole" view.
const VIEW = viewOf("whole");

// How far each run's lights reach past its line, in drawing units: the
// wash on the wall under it (0.6 m, 9.4 units) and the bloom and soffit
// glow, with room to spare. Each run's lights draw on a canvas of its own,
// only that big, so a fade touches only its run.
const LIGHT_REACH = 14;

// Where a lit run's name sits, in drawing units: below a main-floor run, on
// its wall; above an upper eave, on its roof; under a gable, on its wall,
// so the chip never covers the gable's own lights. align says
// which edge of the chip the point is (labels near the right edge are
// right-aligned, so they stay in the box).
type LabelSpot = { x: number; y: number; align: "centre" | "right" };
const LABEL_SPOTS: Record<HouseRun, LabelSpot> = {
  "garage-gable": { x: 61, y: 114, align: "centre" },
  garage: { x: 64, y: 140, align: "centre" },
  "lower-eave": { x: 165, y: 134, align: "centre" },
  porch: { x: 237, y: 168, align: "centre" },
  "upper-eave": { x: 168, y: 54, align: "centre" },
  "upper-gable": { x: 253, y: 88, align: "centre" },
  "lower-sides": { x: 362, y: 136, align: "right" },
  "upper-sides": { x: 362, y: 84, align: "right" },
};

// The dashed track, in screen px, whatever the drawing's size.
const DASH_PX: [number, number] = [6, 5];

export function RunsDrawing({
  runs,
  lit,
  dashedRest = false,
  labels = false,
  labelClassName,
  tone = "night",
  ground = "navy",
  label,
  decorative = false,
  className,
}: {
  runs: QuoteRun[];
  lit: number[] | null;
  dashedRest?: boolean;
  labels?: boolean;
  labelClassName?: string;
  tone?: "night" | "day";
  ground?: "navy" | "none";
  label?: string;
  decorative?: boolean;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const { warm } = useDeck();
  const [boxRef, box] = useBoxSize<HTMLDivElement>();
  const states = useMemo(() => runPartStates(runs, lit, dashedRest), [runs, lit, dashedRest]);
  const fadeMs = reduced ? 0 : MOTION.lookFadeMs;
  const { x: rx, y: ry, width: rw, height: rh } = VIEW.rect;
  const t = useMemo(() => fitView({ x: rx, y: ry, width: rw, height: rh }, box, "contain"), [rx, ry, rw, rh, box]);
  const measured = box.width > 0 && box.height > 0;
  const night = tone === "night";
  const words = label ?? runsDrawingWords(runs, lit);

  return (
    <div
      ref={boxRef}
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": words })}
      data-runs-drawing=""
      className={cn(
        "relative overflow-hidden select-none",
        night ? "dark text-foreground" : "text-navy",
        night && ground === "navy" && "bg-background",
        className,
      )}
      style={!night && ground === "navy" ? { backgroundColor: DAY_PAPER } : undefined}
    >
      <HouseDrawing tone={tone} crop="whole" fit="contain" ground="none" decorative className="absolute inset-0" />
      <PartsOverlay states={states} tone={tone} scale={measured ? t.scale : null} fadeMs={fadeMs} />
      {night && measured
        ? HOUSE_RUNS.map((part) => (
            <PartLights key={part} part={part} on={states[part] === "lit"} transform={t} box={box} look={warm} fadeMs={fadeMs} />
          ))
        : null}
      {labels && measured ? <Labels runs={runs} lit={lit} transform={t} box={box} className={labelClassName} night={night} /> : null}
    </div>
  );
}

// The dashed track under each measured run left out, and by day the lit
// runs' navy track and gold nodes: one SVG over the house, on the same view,
// each part's looks cross-fading by opacity.
function PartsOverlay({
  states,
  tone,
  scale,
  fadeMs,
}: {
  states: Record<HouseRun, DrawingState>;
  tone: "night" | "day";
  scale: number | null;
  fadeMs: number;
}) {
  const { rect, anchor } = VIEW;
  // Dashes and the day track in screen px, so they read the same at any size.
  const unit = scale && scale > 0 ? 1 / scale : 0.6;
  const fade = { transition: transition("opacity", fadeMs) };
  return (
    <svg
      viewBox={`${rect.x} ${rect.y} ${rect.width} ${rect.height}`}
      preserveAspectRatio={preserveAspect("contain", anchor)}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 block size-full"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {HOUSE_RUNS.map((part) => {
        const d = pathD(HOUSE_EAVES[part]);
        return (
          <g key={part} data-part={part} data-state={states[part]}>
            <path
              d={d}
              strokeWidth={1.5 * unit}
              strokeDasharray={`${DASH_PX[0] * unit} ${DASH_PX[1] * unit}`}
              opacity={states[part] === "dashed" ? 0.6 : 0}
              style={fade}
            />
            {tone === "day" ? (
              <g opacity={states[part] === "lit" ? 1 : 0} style={fade}>
                <path d={d} strokeWidth={4.5 * unit} />
                <path d={d} stroke="var(--gold)" strokeWidth={3.2 * unit} strokeDasharray={`0 ${5.5 * unit}`} />
              </g>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

// One run's lights, on its own small canvas over its line, mounted while it
// is lit and through its fade out. A run lit when the drawing first shows is
// simply there; one lit later fades up.
function PartLights({
  part,
  on,
  transform,
  box,
  look,
  fadeMs,
}: {
  part: HouseRun;
  on: boolean;
  transform: ViewTransform;
  box: { width: number; height: number };
  look: Look;
  fadeMs: number;
}) {
  const [previous, setPrevious] = useState(on);
  const [lingering, setLingering] = useState(false);
  const [entered, setEntered] = useState(on);
  if (on !== previous) {
    setPrevious(on);
    setLingering(!on);
    if (on) setEntered(false);
  }
  useEffect(() => {
    if (on) {
      let frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => setEntered(true));
      });
      return () => cancelAnimationFrame(frame);
    }
    const timer = window.setTimeout(() => {
      setLingering(false);
      setEntered(false);
    }, fadeMs);
    return () => window.clearTimeout(timer);
  }, [on, fadeMs]);

  const area = useMemo(() => partArea(part, transform, box), [part, transform, box]);
  const placement = useMemo(() => housePlacement([part]), [part]);
  if (!(on || lingering) || !area) return null;
  return (
    <div className="pointer-events-none absolute" style={{ left: area.left, top: area.top, width: area.width, height: area.height }}>
      <LightCanvas
        placement={placement}
        transform={{ scale: transform.scale, x: transform.x - area.left, y: transform.y - area.top }}
        width={area.width}
        height={area.height}
        look={look}
        lit={on && entered ? 1 : 0}
        fadeMs={fadeMs}
      />
    </div>
  );
}

// The box a run's lights need, in CSS px within the drawing's box.
function partArea(part: HouseRun, t: ViewTransform, box: { width: number; height: number }) {
  const line = HOUSE_EAVES[part];
  const xs = line.map(([x]) => x * t.scale + t.x);
  const ys = line.map(([, y]) => y * t.scale + t.y);
  const reach = LIGHT_REACH * t.scale;
  const left = Math.max(0, Math.floor(Math.min(...xs) - reach));
  const top = Math.max(0, Math.floor(Math.min(...ys) - reach));
  const right = Math.min(box.width, Math.ceil(Math.max(...xs) + reach));
  const bottom = Math.min(box.height, Math.ceil(Math.max(...ys) + reach));
  if (right <= left || bottom <= top) return null;
  return { left, top, width: right - left, height: bottom - top };
}

// The lit runs' names, each on a solid chip near its run. Placed once their
// sizes are known: a chip that would cover another moves down (or up) a
// step until it is clear, and every chip stays inside the box.
function Labels({
  runs,
  lit,
  transform,
  box,
  night,
  className,
}: {
  runs: QuoteRun[];
  lit: number[] | null;
  transform: ViewTransform;
  box: { width: number; height: number };
  night: boolean;
  className?: string;
}) {
  const { parts, loose } = useMemo(() => runLabels(runs, lit), [runs, lit]);
  const chips = useRef<(HTMLSpanElement | null)[]>([]);
  const key = parts.map((item) => `${item.part}:${item.lines.join("|")}`).join(";");

  useLayoutEffect(() => {
    const placed: { left: number; top: number; right: number; bottom: number }[] = [];
    const gap = 4;
    parts.forEach((item, at) => {
      const chip = chips.current[at];
      if (!chip) return;
      const spot = LABEL_SPOTS[item.part];
      const width = chip.offsetWidth;
      const height = chip.offsetHeight;
      const ax = spot.x * transform.scale + transform.x;
      const ay = spot.y * transform.scale + transform.y;
      const baseLeft = spot.align === "right" ? ax - width : ax - width / 2;
      const clampLeft = (left: number) => Math.min(Math.max(0, left), Math.max(0, box.width - width));
      const clampTop = (top: number) => Math.min(Math.max(0, top), Math.max(0, box.height - height));
      const tries = [0, 1, -1, 2, -2, 3, -3];
      let best = { left: clampLeft(baseLeft), top: clampTop(ay - height / 2) };
      for (const step of tries) {
        const candidate = { left: clampLeft(baseLeft), top: clampTop(ay - height / 2 + step * (height + gap)) };
        const clear = placed.every(
          (other) =>
            candidate.left + width + gap <= other.left ||
            other.right + gap <= candidate.left ||
            candidate.top + height + gap <= other.top ||
            other.bottom + gap <= candidate.top,
        );
        if (clear) {
          best = candidate;
          break;
        }
      }
      placed.push({ left: best.left, top: best.top, right: best.left + width, bottom: best.top + height });
      chip.style.left = `${Math.round(best.left)}px`;
      chip.style.top = `${Math.round(best.top)}px`;
      chip.style.visibility = "visible";
    });
  }, [key, parts, transform, box]);

  const chip = cn(
    "rounded-sm px-1.5 py-0.5 leading-tight font-semibold whitespace-nowrap tabular-nums",
    night ? "bg-background text-foreground" : "bg-white text-navy",
    className ?? "text-[length:var(--deck-small,14px)]",
  );
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {parts.map((item, at) => (
        <span
          key={item.part}
          ref={(element) => {
            chips.current[at] = element;
          }}
          data-run-label={item.part}
          className={cn("absolute flex flex-col", chip)}
          style={{ left: 0, top: 0, visibility: "hidden" }}
        >
          {item.lines.map((line, n) => (
            <span key={n}>{line}</span>
          ))}
        </span>
      ))}
      {loose.length > 0 ? (
        <div className="absolute inset-x-0 bottom-0 flex flex-wrap justify-center gap-2 p-2">
          {loose.map((line, n) => (
            <span key={n} data-run-label="other" className={chip}>
              {line}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
