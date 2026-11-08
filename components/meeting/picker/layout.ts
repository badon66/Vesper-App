import { DECK_CLEAR_PX, DECK_ROW, fluidPx } from "@/lib/meeting/deck-pages";

// The light picker's tray, in numbers (round 7, light_picker.controls).
// Pure, so the arithmetic the layout depends on is unit tested.
//
// The tray is exactly the height of every page's band, so the deck's rhythm
// never jumps: about 30% of the page at 1180 x 820 and 28% at 1366 x 1024.
// One straight line through both: 82 px plus 20% of the page's height
// (246 px, 30.0%; 286.8 px, 28.0%). The deck can set --deck-band on any
// ancestor to give every band one value; the picker's tray follows it.
//
// CONTRACT
//   bandHeight(pageHeight)   the band in px for a page that tall
//   BAND_HEIGHT_CSS          the same as a CSS height (inside the page box)
//   TRAY                     the tray's sizes in px at 1180 x 820 (row 1: the
//                            looks, 72 px, 12 px apart; row 2: the headline
//                            and the 56 px Steady, Twinkle, Chase, Off
//                            control). The look row's padding and tick match
//                            Settings' LOOK_ROW (lib/settings/deck-schema.ts),
//                            which refuses a label that would wrap in it; a
//                            test keeps the two in step.
//   TRAY_AT_PRO              the sizes that grow at 1366 x 1024 (round 7
//                            review), so the iPad Pro leaves no dead navy
//   TRAY_CSS                 TRAY to TRAY_AT_PRO as the deck's fluid sizes
//                            (fluidPx), for the page's styles
//   DOTS_RESERVE_CSS         the space kept clear at the tray's bottom for the
//                            deck's dots: their 44 px targets, 4 px up (or above
//                            the home indicator), and 24 px with nothing
//                            tappable above them

export const BAND_FIXED_PX = 82;
export const BAND_SHARE = 0.2;

export function bandHeight(pageHeight: number): number {
  return BAND_FIXED_PX + BAND_SHARE * Math.max(0, pageHeight);
}

export const BAND_HEIGHT_CSS = `var(--deck-band, calc(${BAND_FIXED_PX}px + ${BAND_SHARE * 100}%))`;

export const TRAY = {
  // Row 1: equal-width look buttons across the tray.
  sidePadding: 48,
  lookGap: 12,
  lookHeight: 72,
  lookPadding: 16,
  // The tick after a chosen look's name: 20 px and an 8 px gap. Its room is
  // kept on every button, so neither line moves when a look is chosen.
  tick: 28,
  tickIcon: 20,
  nameSize: 22,
  nameLeading: 26,
  wordsSize: 20,
  // Secondary lines are 20/22 px.
  wordsLeading: 22,
  // Above row 1, and between the rows.
  padTop: 16,
  rowGap: 12,
  // Row 2: "Try it on your house" at 32 px semibold, the line under it at
  // 20/22 px, and the effects on the right.
  headlineSize: 32,
  headlineLeading: 38,
  effectHeight: 56,
  // One segment of the effects control. Its label is centred and never
  // moves; the chosen one's 16 px tick hangs 6 px after it, so with the
  // widest label ("Twinkle", 72 px at 20 px semibold) it keeps 8 px clear of
  // the edge.
  effectSegment: 132,
  effectLabelMax: 72,
  effectTick: 16,
  effectTickGap: 6,
  // Between the headline's column and the effects.
  columnGap: 24,
} as const;

// The sizes that grow at 1366 x 1024 (the spec's 1366 note and the review):
// look buttons 80 px with 24 px names, the colour words and the line under
// the headline 22 px (the deck's secondary size), the headline 36 px, the
// effects 62 px with 22 px labels. Widths grow faster than type between
// 1180 and 1366, so a label Settings lets through at 1180 never wraps here.
export const TRAY_AT_PRO = {
  lookHeight: 80,
  nameSize: 24,
  nameLeading: 28,
  wordsSize: 22,
  wordsLeading: 24,
  headlineSize: 36,
  headlineLeading: 42,
  effectHeight: 62,
  effectSegment: 144,
  effectLabelMax: 80,
  effectTick: 18,
} as const;

const grows = (key: keyof typeof TRAY_AT_PRO) => fluidPx(TRAY[key], TRAY_AT_PRO[key]);

export const TRAY_CSS = {
  lookHeight: grows("lookHeight"),
  nameSize: grows("nameSize"),
  nameLeading: grows("nameLeading"),
  wordsSize: grows("wordsSize"),
  wordsLeading: grows("wordsLeading"),
  headlineSize: grows("headlineSize"),
  headlineLeading: grows("headlineLeading"),
  effectHeight: grows("effectHeight"),
  effectSegment: grows("effectSegment"),
  effectTick: grows("effectTick"),
} as const;

// The deck's bottom row (the dots with a chevron either side) sits below the
// controls on the tray's navy. The tray keeps the same clear space every
// picture keeps above that row (--deck-clear): the row's top stands
// `target` px above its foot, its foot sits at max(`inset` px, the home
// indicator), and nothing tappable comes within `clearance` px of it.
const ROW_TOP_OVER_FOOT = (DECK_ROW.height + Math.max(DECK_ROW.chevron, DECK_ROW.dotHeight)) / 2;
export const DOTS = { target: ROW_TOP_OVER_FOOT, inset: DECK_ROW.bottom, clearance: DECK_ROW.clearance } as const;
export const DOTS_RESERVE_CSS = `var(--deck-clear, ${DECK_CLEAR_PX}px)`;

// The lowest a tappable control in the tray reaches, measured from the tray's
// top, when row 1 and the effects sit as high as they can.
export function controlsBottom(): number {
  return TRAY.padTop + TRAY.lookHeight + TRAY.rowGap + TRAY.effectHeight;
}

// The tray's sizes as Settings measures them, for the test that keeps
// LOOK_ROW and the meeting's row in step.
export const LOOK_ROW_AT_MEETING = {
  viewportWidth: 1180,
  sidePadding: TRAY.sidePadding,
  gap: TRAY.lookGap,
  buttonPadding: TRAY.lookPadding,
  tick: TRAY.tick,
  name: { weight: 600, size: TRAY.nameSize },
  words: { weight: 400, size: TRAY.wordsSize },
} as const;
