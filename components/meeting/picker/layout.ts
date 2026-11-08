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
//   TRAY                     the tray's sizes in px (row 1: the looks, 72 px,
//                            12 px apart; row 2: the headline and the 56 px
//                            Steady, Twinkle, Chase, Off control). The look
//                            row's padding and tick match Settings' LOOK_ROW
//                            (lib/settings/deck-schema.ts), which refuses a
//                            label that would wrap in it; a test keeps the
//                            two in step.
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
  // The tick beside a chosen look's name: 20 px and an 8 px gap.
  tick: 28,
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
  // One segment of the effects control: the widest label ("Twinkle", 72 px
  // at 20 px semibold), the tick and its gap, and 16 px either side.
  effectSegment: 132,
  effectLabelMax: 72,
  // Between the headline's column and the effects.
  columnGap: 24,
} as const;

// The deck's dots sit below the controls on the tray's navy.
export const DOTS = { target: 44, inset: 4, clearance: 24 } as const;
export const DOTS_RESERVE_CSS = `calc(${DOTS.target + DOTS.clearance}px + max(${DOTS.inset}px, env(safe-area-inset-bottom, 0px)))`;

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
