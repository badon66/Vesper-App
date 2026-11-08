import type { Size, Vec } from "@/lib/lights/place";

// The eave in section (round 7): an original line drawing of the edge of a
// roof cut through, so a customer can see which surface is the soffit, the
// fascia and the track, and where the light sits. Night Text hairlines, no
// fills, no text in the drawing: the labels are HTML beside it. Pure
// geometry in the drawing's own units (520 x 440, the outside on the right);
// no React.
//
// CONTRACT
//   EAVE_VIEW                   [0, 0, 520, 440]
//   EAVE_SHAPES                 every hairline, as polylines
//   EAVE_TRACK                  the track's channel, as a polyline
//   EAVE_LIGHT                  where the one light sits (the bottom of the track)
//   EAVE_LIGHT_PITCH            the pitch its sprite is drawn at, in drawing units
//   EAVE_LABELS                 each label's words, what it points at, and
//                               the leader line from that point to the
//                               drawing's right edge, where the HTML label sits
//   eaveLabelsFor(variant)      "lit": Roof edge, Fascia, Track, Light, Soffit;
//                               "colour": Fascia, Track, Soffit (no light)
//   EAVE_LABEL_COLUMN           the labels' column beside the drawing (7.5 rem)
//   eaveFit(box)                the width that fits the drawing and its labels
//                               whole inside a box, with a margin all round

export const EAVE_VIEW = [0, 0, 520, 440] as const;

// The roof: shingles on top, the deck's underside below, and the drip edge.
const ROOF_TOP: Vec[] = [
  [-10, 52],
  [428, 186],
];
const ROOF_UNDER: Vec[] = [
  [-10, 70],
  [392, 192],
];
const DRIP: Vec[] = [
  [428, 186],
  [428, 198],
];
// The fascia board across the rafter ends, its top following the roof.
const FASCIA: Vec[] = [
  [392, 192],
  [410, 197.5],
  [410, 292],
  [392, 292],
  [392, 192],
];
// The soffit: a thin panel from the wall to the fascia.
const SOFFIT_TOP: Vec[] = [
  [74, 268],
  [392, 268],
];
const SOFFIT_UNDER: Vec[] = [
  [74, 276],
  [392, 276],
];
// The wall, in section, from the roof down; its outside face carries on
// below the soffit.
const WALL_INSIDE: Vec[] = [
  [56, 89],
  [56, 440],
];
const WALL_FACE: Vec[] = [
  [74, 94.5],
  [74, 440],
];

// The track: a slim channel tucked under the soffit, just in from the fascia.
export const EAVE_TRACK: Vec[] = [
  [346, 276],
  [346, 290],
  [378, 290],
  [378, 276],
];

export const EAVE_SHAPES: Vec[][] = [ROOF_TOP, ROOF_UNDER, DRIP, FASCIA, SOFFIT_TOP, SOFFIT_UNDER, WALL_INSIDE, WALL_FACE];

export const EAVE_LIGHT: Vec = [362, 292];
// The light's sprite is drawn as if lights were this far apart, which gives
// one soft point the size of the track (core 4 px, halo and bloom clamped).
export const EAVE_LIGHT_PITCH = 34;

export type EaveLabelKey = "roof_edge" | "fascia" | "track" | "light" | "soffit";
export type EaveLabel = {
  key: EaveLabelKey;
  text: string;
  // The leader: from the part, to the drawing's right edge at the label's height.
  leader: Vec[];
};

const RIGHT = EAVE_VIEW[2];

export const EAVE_LABELS: EaveLabel[] = [
  {
    key: "roof_edge",
    text: "Roof edge",
    leader: [
      [432, 184],
      [462, 140],
      [RIGHT, 140],
    ],
  },
  {
    key: "fascia",
    text: "Fascia",
    leader: [
      [414, 222],
      [RIGHT, 222],
    ],
  },
  {
    key: "track",
    text: "Track",
    leader: [
      [380, 288],
      [396, 306],
      [RIGHT, 306],
    ],
  },
  {
    key: "light",
    text: "Light",
    leader: [
      [362, 302],
      [362, 352],
      [RIGHT, 352],
    ],
  },
  {
    key: "soffit",
    text: "Soffit",
    leader: [
      [200, 280],
      [200, 398],
      [RIGHT, 398],
    ],
  },
];

export type EaveVariant = "lit" | "colour";

// The colour page labels only Soffit, Fascia and Track, with no light.
export function eaveLabelsFor(variant: EaveVariant): EaveLabel[] {
  if (variant === "lit") return EAVE_LABELS;
  return EAVE_LABELS.filter((label) => label.key === "fascia" || label.key === "track" || label.key === "soffit");
}

// The labels sit in a 7.5 rem column right of the drawing, whose height
// follows its width (520 x 440).
export const EAVE_LABEL_COLUMN = 120;

export function eaveFit(box: Size): number {
  const margin = Math.max(24, Math.min(box.width, box.height) * 0.06);
  const width = box.width - 2 * margin;
  const height = box.height - 2 * margin;
  if (!(width > EAVE_LABEL_COLUMN) || !(height > 0)) return 0;
  return Math.min(width, height * (EAVE_VIEW[2] / EAVE_VIEW[3]) + EAVE_LABEL_COLUMN);
}
