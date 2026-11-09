"use client";

import { CornerPair } from "@/components/drawings/corner-pair";
import { EaveSection } from "@/components/drawings/eave-section";
import { HouseDayDrawing, type DrawingGround } from "@/components/drawings/house-drawing";
import { LitHouse } from "@/components/drawings/lit-house";
import { PhoneDrawing } from "@/components/drawings/phone-drawing";
import { useBoxSize } from "@/components/lights/light-canvas";
import type { Look, SlotFallback } from "@/lib/deck";
import type { EaveSectionVariant, EaveVariant } from "@/lib/drawings/eave";
import { eaveFit } from "@/lib/drawings/eave";
import type { DrawingFit, HouseCropName } from "@/lib/drawings/house";
import { COOL_WHITE, WARM_WHITE } from "@/lib/lights/looks";
import { cn } from "@/lib/utils";

// The drawing a deck slot shows while Keenan's photo is missing (round 7,
// lib/deck.ts DECK_SLOTS' fallback), in one place:
//   drawing_house        the shared house, lit warm white (crop "whole")
//   drawing_house_entry  its garage and entry, lit warm white (crop "entry")
//   drawing_eave         the eave in section with one light (What's in it,
//                        eave="lit"), or unlit with Fascia, Track and Soffit
//                        (eave="colour"); or, with eave="day", the main
//                        floor's eave close up by day, as an elevation: the
//                        roof's last courses, the fascia, the slim white
//                        track tucked under it, the soffit and a little wall,
//                        navy on the paper tone filling the box like a photo
//                        (Up close: HouseDayDrawing crop "eave")
//   drawing_corners      the same view (the upper floor on its band,
//                        PAIR_CROP) lit warm and lit cool, captioned with
//                        the two looks' names
//   drawing_phone        phone in hand, the lit house behind
//   drawing_day_night    the night half (lit); Hidden by day's slider pairs
//                        <HouseDayDrawing /> with <LitHouse /> itself
// "words" and "skip" have no drawing: the page shows its words, or is skipped.
//
// CONTRACT
//   <DeckDrawing kind warm? cool? fit? ground? crop? eave? className? />
//     kind         a DrawingFallback
//     warm, cool   the meeting's own whites (warmWhiteOf / coolWhiteOf of
//                  deck.looks); default the seeded ones
//     fit          the house drawings: "contain" (default) | "cover" (fills
//                  the box edge to edge, clipped exactly to it); the eave by
//                  day is always "cover"
//     ground       "navy" (default) | "none": no ground of its own, for a
//                  More layer's Night Card. The eave by day always fills its
//                  box with its paper tone, like a photo, whatever this says
//     crop         the house drawings: a HOUSE_CROPS name in place of the
//                  kind's own ("whole", or "entry" for drawing_house_entry)
//     eave         drawing_eave's variant: "lit" (default) | "colour" (unlit,
//                  in section) | "day" (the close elevation by day)
//     className    size it with this; every drawing fills its box (the eave
//                  in section, the pair and the phone fit themselves inside it)

export type DrawingFallback = Exclude<SlotFallback, "words" | "skip">;

export function isDrawingFallback(fallback: SlotFallback): fallback is DrawingFallback {
  return fallback !== "words" && fallback !== "skip";
}

export function DeckDrawing({
  kind,
  warm = WARM_WHITE,
  cool = COOL_WHITE,
  fit = "contain",
  ground = "navy",
  crop,
  eave = "lit",
  className,
}: {
  kind: DrawingFallback;
  warm?: Look;
  cool?: Look;
  fit?: DrawingFit;
  ground?: DrawingGround;
  crop?: HouseCropName;
  eave?: EaveVariant;
  className?: string;
}) {
  switch (kind) {
    case "drawing_house":
    case "drawing_day_night":
      return <LitHouse crop={crop ?? "whole"} fit={fit} ground={ground} look={warm} className={className} />;
    case "drawing_house_entry":
      return <LitHouse crop={crop ?? "entry"} fit={fit} ground={ground} look={warm} className={className} />;
    case "drawing_eave":
      if (eave === "day") return <HouseDayDrawing crop="eave" fit="cover" className={className} />;
      return <FittedEave variant={eave} look={warm} ground={ground} className={className} />;
    case "drawing_corners":
      return <CornerPair warm={warm} cool={cool} captions={[warm.name, cool.name]} ground={ground} className={className} />;
    case "drawing_phone":
      return <PhoneDrawing look={warm} ground={ground} className={className} />;
  }
}

// The eave in section takes its height from its width; in a box, it is
// fitted whole and centred, with a margin.
function FittedEave({
  variant,
  look,
  ground,
  className,
}: {
  variant: EaveSectionVariant;
  look: Look;
  ground: DrawingGround;
  className?: string;
}) {
  const [boxRef, box] = useBoxSize<HTMLDivElement>();
  const width = eaveFit(box);
  return (
    <div ref={boxRef} className={cn("dark relative flex items-center justify-center overflow-hidden", ground === "navy" && "bg-background", className)}>
      {width > 0 ? <EaveSection variant={variant} look={look} ground="none" className="shrink-0" style={{ width }} /> : null}
    </div>
  );
}
