"use client";

import { CornerPair } from "@/components/drawings/corner-pair";
import { EaveSection } from "@/components/drawings/eave-section";
import { LitHouse } from "@/components/drawings/lit-house";
import { PhoneDrawing } from "@/components/drawings/phone-drawing";
import type { Look, SlotFallback } from "@/lib/deck";
import { COOL_WHITE, WARM_WHITE } from "@/lib/lights/looks";

// The drawing a deck slot shows while Keenan's photo is missing (round 7,
// lib/deck.ts DECK_SLOTS' fallback), in one place:
//   drawing_house        the shared house, lit warm white
//   drawing_house_entry  its garage and entry, lit warm white
//   drawing_eave         the eave in section with one light
//   drawing_corners      the same corner lit warm and lit cool
//   drawing_phone        a plain phone beside a lit roofline
//   drawing_day_night    the night half (lit); Hidden by day's slider pairs
//                        <HouseDayDrawing /> with <LitHouse /> itself
// "words" and "skip" have no drawing: the page shows its words, or is skipped.
//
// CONTRACT
//   <DeckDrawing kind warm? cool? className? />
//     kind         a DrawingFallback
//     warm, cool   the meeting's own whites (warmWhiteOf / coolWhiteOf of
//                  deck.looks); default the seeded ones
//     className    size it with this; every drawing fills its box

export type DrawingFallback = Exclude<SlotFallback, "words" | "skip">;

export function isDrawingFallback(fallback: SlotFallback): fallback is DrawingFallback {
  return fallback !== "words" && fallback !== "skip";
}

export function DeckDrawing({
  kind,
  warm = WARM_WHITE,
  cool = COOL_WHITE,
  className,
}: {
  kind: DrawingFallback;
  warm?: Look;
  cool?: Look;
  className?: string;
}) {
  switch (kind) {
    case "drawing_house":
    case "drawing_day_night":
      return <LitHouse crop="whole" look={warm} className={className} />;
    case "drawing_house_entry":
      return <LitHouse crop="entry" look={warm} className={className} />;
    case "drawing_eave":
      return <EaveSection variant="lit" look={warm} className={className} />;
    case "drawing_corners":
      return <CornerPair warm={warm} cool={cool} className={className} />;
    case "drawing_phone":
      return <PhoneDrawing look={warm} className={className} />;
  }
}
