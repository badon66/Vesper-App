import type { Rect, Size } from "@/lib/lights/place";

// The phone (round 7): a plain phone in its own units, the body and the
// edge of its screen, nothing on the screen. Pure; no React.
//
// CONTRACT
//   PHONE_VIEW     [0, 0, 76, 156], about a phone's real shape
//   PHONE_BODY     { x, y, width, height, rx } of the body
//   PHONE_SCREEN   the same for the screen's edge, inset
//   PhoneScene, phoneScene(box, house)
//                  "phone in hand, house behind" in a box of CSS px. `house`
//                  is the house drawing's crop (drawing units). The house is
//                  large across the top, about page 2's scale, its ground
//                  line in view; the phone stands in the lower right in the
//                  foreground, over the house's right end from PHONE_OVER
//                  (drawing units) on, taller than its walls. The pair is
//                  centred across the box. Rects are { left, top, width,
//                  height } in CSS px.

export const PHONE_VIEW = [0, 0, 76, 156] as const;
export const PHONE_BODY = { x: 2, y: 2, width: 72, height: 152, rx: 11 } as const;
export const PHONE_SCREEN = { x: 6.5, y: 6.5, width: 63, height: 143, rx: 7 } as const;

export type BoxRect = { left: number; top: number; width: number; height: number };
export type PhoneScene = { house: BoxRect; phone: BoxRect; scale: number };

// The house: at most 84% of the box tall, 2% from its top. The phone: 60% of
// the box tall, its foot 4% above the box's, and its left edge on the
// house's right window (x 290 in drawing units), so it hides the corner
// and the side running back. The two together take at most 90% of the
// width.
const HOUSE_HEIGHT = 0.84;
const HOUSE_TOP = 0.02;
const PHONE_HEIGHT = 0.6;
const PHONE_BOTTOM = 0.04;
const PAIR_WIDTH = 0.9;
export const PHONE_OVER = 290;

export function phoneScene(box: Size, house: Rect): PhoneScene {
  const width = Math.max(0, box.width);
  const height = Math.max(0, box.height);
  const phoneHeight = height * PHONE_HEIGHT;
  const phoneWidth = phoneHeight * (PHONE_VIEW[2] / PHONE_VIEW[3]);
  const before = PHONE_OVER - house.x;
  const scale = Math.max(0, Math.min((height * HOUSE_HEIGHT) / house.height, (width * PAIR_WIDTH - phoneWidth) / before));
  const houseWidth = house.width * scale;
  const pairWidth = Math.max(houseWidth, before * scale + phoneWidth);
  const left = (width - pairWidth) / 2;
  return {
    scale,
    house: { left, top: height * HOUSE_TOP, width: houseWidth, height: house.height * scale },
    phone: {
      left: left + before * scale,
      top: height * (1 - PHONE_BOTTOM) - phoneHeight,
      width: phoneWidth,
      height: phoneHeight,
    },
  };
}
