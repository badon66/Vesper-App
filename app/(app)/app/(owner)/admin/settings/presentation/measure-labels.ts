"use client";

import { useEffect, useState } from "react";
import { LOOK_ROW, type MeasureLabel, type TextMeasure } from "@/lib/settings/deck-schema";

// Measures words the way the meeting draws them: Manrope (the app's own
// font, so it is already on the iPad) with a canvas measureText, at any
// weight and size. Used for the looks' labels (22 px semibold names, 20 px
// colour words), the band's words and the picker's line.
//
// Only the Manrope face is loaded and checked: the computed font-family is
// a whole stack (next/font's Manrope, its size-adjusted fallback, then the
// system fonts), and the fallback face may never count as loaded, which
// once left "Checking" on screen for good (round 7 review). The "Checking"
// line goes within a second either way. Until Manrope is confirmed nothing
// is measured and the checks are skipped rather than guessed; if it loads
// later (a slow first visit), the checks turn on then.

export const MEASURE_WAIT_MS = 1000;

// The first family in a computed font-family stack, as written ("__Manrope_a1b2c3"
// with its quotes), or null for an empty stack.
export function firstFamily(stack: string): string | null {
  const first = stack.split(",")[0]?.trim();
  return first ? first : null;
}

export type TextMeasureState = {
  // Null until Manrope is confirmed, and for good if it can't be.
  measure: TextMeasure | null;
  // True only while waiting for the font, at most MEASURE_WAIT_MS.
  checking: boolean;
};

export function useTextMeasure(): TextMeasureState {
  const [state, setState] = useState<TextMeasureState>({ measure: null, checking: true });

  useEffect(() => {
    let alive = true;
    // A measure whenever Manrope is confirmed, even after the wait; null ends
    // the wait without one.
    const settle = (measure: TextMeasure | null) => {
      if (!alive) return;
      setState((now) => (measure ? { measure, checking: false } : now.checking ? { ...now, checking: false } : now));
    };
    const timer = window.setTimeout(() => settle(null), MEASURE_WAIT_MS);
    const context = document.createElement("canvas").getContext("2d");
    const family = firstFamily(getComputedStyle(document.body).fontFamily);
    const fontFor = (font: { weight: number; size: number }) => `${font.weight} ${font.size}px ${family}`;
    const wanted = [fontFor(LOOK_ROW.name), fontFor(LOOK_ROW.words)];

    Promise.resolve()
      .then(() => {
        if (!context || !family || !document.fonts) throw new Error("No way to measure here.");
        return Promise.all(wanted.map((font) => document.fonts.load(font)));
      })
      .then(() => {
        if (!wanted.every((font) => document.fonts.check(font))) throw new Error("Manrope is not loaded.");
        const cache = new Map<string, number>();
        settle((text, font) => {
          const key = `${font.weight}:${font.size}:${text}`;
          const known = cache.get(key);
          if (known !== undefined) return known;
          (context as CanvasRenderingContext2D).font = fontFor(font);
          const width = (context as CanvasRenderingContext2D).measureText(text).width;
          cache.set(key, width);
          return width;
        });
      })
      .catch(() => settle(null))
      .finally(() => window.clearTimeout(timer));

    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, []);

  return state;
}

// The looks' labels at the meeting's row sizes (LOOK_ROW).
export function labelMeasure(measure: TextMeasure | null): MeasureLabel | null {
  return measure ? (text, kind) => measure(text, LOOK_ROW[kind]) : null;
}
