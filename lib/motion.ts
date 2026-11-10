import { useSyncExternalStore } from "react";

// Quiet motion for every customer surface (round 7, the settled spec's
// motion section; lifted from the quote link, which keeps its own copy on
// its parked branch). Almost nothing moves on its own: one easing, only
// opacity and transform ever animate, and the iPad's Reduce Motion setting
// is honoured as the spec says.
//
// CONTRACT (used by meeting mode, the light picker, Settings and prep):
//   EASE_QUIET            the one easing, as a CSS timing function
//   easeQuiet(t)          the same curve as a number, for canvas fades (0..1 -> 0..1)
//   MOTION                every duration the spec gives, in ms (and the More layer's 16 px rise)
//   transition(prop, ms)  "opacity 300ms cubic-bezier(...)" (or "none" at 0 ms)
//   useReducedMotion()    true while the device asks for less motion
//
// Client components only: this module imports a React hook, so a server
// component must not import it (pass durations down as props instead).

export const EASE_QUIET = "cubic-bezier(0.22, 1, 0.36, 1)";

// Every duration in the spec, in one place.
export const MOTION = {
  // The light picker's first arrival: the photo as taken holds, dusk falls,
  // then every light fades up together.
  dayHoldMs: 500,
  duskFallMs: 1200,
  fadeUpMs: 400,
  // A new look cross-fades every light together; Off fades out.
  lookFadeMs: 300,
  offFadeMs: 400,
  // With Reduce Motion on, a fade that remains is this short or shorter.
  reducedFadeMs: 100,
  // The More layer: fades in rising 16 px, closes faster.
  moreInMs: 220,
  moreOutMs: 180,
  moreRisePx: 16,
  // The gallery's contact sheet, and a gallery photo's cross-fade.
  sheetFadeMs: 200,
  galleryFadeMs: 200,
  // Hidden by day: a tap moves the line there.
  sliderMs: 250,
  // Leaving: holding the exit fills a ring.
  exitHoldMs: 600,
} as const;

// A CSS transition on one property with the quiet easing; "none" at 0 ms.
export function transition(property: "opacity" | "transform", ms: number): string {
  return ms > 0 ? `${property} ${Math.round(ms)}ms ${EASE_QUIET}` : "none";
}

// cubic-bezier(x1, y1, x2, y2) as a function of progress, solved the way
// browsers do (Newton's method, then bisection), so a canvas fade follows
// exactly the curve its CSS neighbours use.
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (s: number) => ((ax * s + bx) * s + cx) * s;
  const sampleY = (s: number) => ((ay * s + by) * s + cy) * s;
  const slopeX = (s: number) => (3 * ax * s + 2 * bx) * s + cx;
  const solve = (x: number) => {
    let s = x;
    for (let n = 0; n < 8; n++) {
      const error = sampleX(s) - x;
      if (Math.abs(error) < 1e-7) return s;
      const slope = slopeX(s);
      if (Math.abs(slope) < 1e-7) break;
      s -= error / slope;
    }
    let lo = 0;
    let hi = 1;
    s = x;
    for (let n = 0; n < 40; n++) {
      const value = sampleX(s);
      if (Math.abs(value - x) < 1e-7) return s;
      if (value < x) lo = s;
      else hi = s;
      s = (lo + hi) / 2;
    }
    return s;
  };
  return (t: number) => {
    if (!(t > 0)) return 0;
    if (t >= 1) return 1;
    return sampleY(solve(t));
  };
}

// EASE_QUIET as a number: fast at first, settling gently.
export const easeQuiet = cubicBezier(0.22, 1, 0.36, 1);

const REDUCE = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => undefined;
  const query = window.matchMedia(REDUCE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

// Whether the device asks for less motion (the iPad's Reduce Motion). The
// server renders as if it does not; nothing moves before the page is alive.
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(REDUCE).matches : false),
    () => false,
  );
}
