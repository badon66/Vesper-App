"use client";

import { useEffect, useState } from "react";
import { LOOK_ROW, type MeasureLabel } from "@/lib/settings/deck-schema";

// Measures a look's name and colour words the way the meeting draws them:
// Manrope (the app's own font, so it is already on the iPad), 22 px
// semibold and 20 px regular, with a canvas measureText. Null until the
// font has loaded, so a fallback font never refuses a label that fits.
export function useLabelMeasure(): MeasureLabel | null {
  const [measure, setMeasure] = useState<MeasureLabel | null>(null);

  useEffect(() => {
    let cancelled = false;
    const context = document.createElement("canvas").getContext("2d");
    if (!context || !document.fonts) return;
    const family = getComputedStyle(document.body).fontFamily;
    const fonts = {
      name: `${LOOK_ROW.name.weight} ${LOOK_ROW.name.size}px ${family}`,
      words: `${LOOK_ROW.words.weight} ${LOOK_ROW.words.size}px ${family}`,
    };
    Promise.all([document.fonts.load(fonts.name), document.fonts.load(fonts.words)])
      .then(() => {
        if (cancelled || !document.fonts.check(fonts.name) || !document.fonts.check(fonts.words)) return;
        const cache = new Map<string, number>();
        setMeasure(() => (text: string, kind: "name" | "words") => {
          const key = `${kind}:${text}`;
          const known = cache.get(key);
          if (known !== undefined) return known;
          context.font = fonts[kind];
          const width = context.measureText(text).width;
          cache.set(key, width);
          return width;
        });
      })
      .catch(() => {
        // No measuring: the check is skipped rather than guessed.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return measure;
}
