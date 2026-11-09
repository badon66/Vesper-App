import type { HouseCropName } from "@/lib/drawings/house";
import type { Size } from "@/lib/lights/place";

// The warm or cool pair's layout (round 7 review): two drawings of the same
// view, each with its caption, sized by the box so they fill it with equal
// margins. Side by side where that gives the bigger drawings (the photo
// pair's arrangement); one above the other in a tall box, where side by
// side would leave them small with the box empty above and below. Pure.
//
// CONTRACT
//   PAIR_CROP   the drawn pair's view of the house: the upper floor standing
//            on its band ("roofline", about 2.1:1), complete, so one above
//            the other each drawing can take the panel's width
//   PAIR_SPACE, PAIR_SPACE_MIN, pairSpace(box)
//            the drawn pair's margin and gap: 3% of the box's shorter side,
//            16 px at least (round 7 review: so stacked in a More's picture
//            panel each drawing takes about 90% of its width)
//   PAIR_CAPTION   a caption's height under its drawing: 12 px, then a
//            28 px line (the deck's small size, 20 to 22 px)
//   PairLayout, pairLayout(box, aspect, { caption, gap, margin })
//     box      the pair's box in CSS px
//     aspect   each drawing's width over height (its crop's)
//     caption  the height each caption takes under its drawing (0 for none)
//     gap      between the two figures
//     margin   at least this much on every side
//   returns { direction: "row" | "column", drawing: { width, height } }

export const PAIR_CROP = "roofline" satisfies HouseCropName;
export const PAIR_SPACE = 0.03;
export const PAIR_SPACE_MIN = 16;
export const PAIR_CAPTION = { gap: 12, line: 28 } as const;

export function pairSpace(box: Size): number {
  return Math.max(PAIR_SPACE_MIN, Math.min(box.width, box.height) * PAIR_SPACE);
}

export type PairLayout = { direction: "row" | "column"; drawing: Size };

// A column must give drawings at least this much wider than a row does.
const COLUMN_GAIN = 1.15;

export function pairLayout(box: Size, aspect: number, { caption, gap, margin }: { caption: number; gap: number; margin: number }): PairLayout {
  const width = Math.max(0, box.width - 2 * margin);
  const height = Math.max(0, box.height - 2 * margin);
  const row = Math.max(0, Math.min((width - gap) / 2, (height - caption) * aspect));
  const column = Math.max(0, Math.min(width, ((height - gap) / 2 - caption) * aspect));
  const direction = column > row * COLUMN_GAIN ? "column" : "row";
  const drawingWidth = direction === "row" ? row : column;
  return { direction, drawing: { width: drawingWidth, height: drawingWidth / aspect } };
}
