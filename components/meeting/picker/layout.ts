import { DECK_ROW, fluidPx, fluidValue } from "@/lib/meeting/deck-pages";

// The light picker's tray, in numbers (round 7, light_picker.controls).
// Pure, so the arithmetic the layout depends on is unit tested.
//
// The tray is the height of every page's band, so the deck's rhythm never
// jumps: about 30% of the page at 1180 x 820 and 28% at 1366 x 1024, unless
// its controls need more (round 9: the line under the headline takes up to
// two lines, "Most nights, warm white." having joined it, so at 1180 x 820
// the tray is its floor, 268 px, and the photo gives the 22 px). Your house
// (round 9) draws its band at this same height, so the photo stays put on
// the turn to the picker. One
// straight line through both: 82 px plus 20% of the page's height (246 px,
// 30.0%; 286.8 px, 28.0%). The deck can set --deck-band on any ancestor to
// give every band one value; the picker's tray follows it. On a shorter
// deck (the installed app's 1180 x 796 and 1366 x 1000, the rehearsal
// frame's 1180 x 764) the tray keeps a floor, its controls plus the clear
// space under them, so the photo gives way, never the tray's contents
// (round 7 after-review).
//
// CONTRACT
//   bandHeight(pageHeight)   the band in px for a page that tall
//   BAND_HEIGHT_CSS          the same as a CSS height (inside the page box)
//   TRAY                     the tray's sizes in px at 1180 x 820 (row 1: the
//                            looks, 72 px, 12 px apart; row 2: the headline
//                            and its line of up to two lines beside the 56 px
//                            Steady, Twinkle, Chase, Off control). The look row's padding and tick match
//                            Settings' LOOK_ROW (lib/settings/deck-schema.ts),
//                            which refuses a label that would wrap in it; a
//                            test keeps the two in step.
//   TRAY_AT_PRO              the sizes that grow at 1366 x 1024 (round 7
//                            review), so the iPad Pro leaves no dead navy
//   TRAY_CSS                 TRAY to TRAY_AT_PRO as the deck's fluid sizes
//                            (fluidPx), for the page's styles
//   DOTS                     the deck's bottom row as the tray sees it: its
//                            targets' top over its foot, the foot's least
//                            inset, and the 24 px the spec keeps clear of
//                            anything tappable above the dots
//   DOTS_RESERVE_CSS         the space the tray keeps clear at its bottom for
//                            that row: its foot (20 px, or above the home
//                            indicator) + 50 + 24 px (94 px at 1180 x 820)
//   trayContent(width)       the tray's controls, top padding included, in px
//                            at that deck width (174 at 1180, 190 at 1366)
//   trayFloor(width, foot?)  the least the tray is: its controls plus the
//                            reserve (268 px at 1180, 284 at 1366)
//   TRAY_HEIGHT_CSS          the tray's height: the band, never under the floor

export const BAND_FIXED_PX = 82;
export const BAND_SHARE = 0.2;

export function bandHeight(pageHeight: number): number {
  return BAND_FIXED_PX + BAND_SHARE * Math.max(0, pageHeight);
}

export const BAND_HEIGHT_CSS = `var(--deck-band, calc(${BAND_FIXED_PX}px + ${BAND_SHARE * 100}%))`;

// The most lines the line under the headline takes (Settings refuses more:
// lib/settings/deck-schema.ts PICKER_LINE_FIT).
export const TRAY_WORDS_LINES = 2;

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
  padTop: 12,
  rowGap: 12,
  // Row 2: "Try it on your house" at 32/34 px semibold with the line
  // directly under it at 20/22 px, beside the 56 px effects on the right.
  // Round 7 kept the line to one (56 px together, the effects' height);
  // round 9 lets it take two (78 px), and the tray grows to hold them.
  headlineSize: 32,
  headlineLeading: 34,
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
// the headline 22/24 px (the deck's secondary size), the headline 36/38 px
// (with its line, 62 px: the effects' height again), the effects 62 px with
// 22 px labels. Widths grow faster than type between 1180 and 1366, so a
// label Settings lets through at 1180 never wraps here.
export const TRAY_AT_PRO = {
  lookHeight: 80,
  nameSize: 24,
  nameLeading: 28,
  wordsSize: 22,
  wordsLeading: 24,
  headlineSize: 36,
  headlineLeading: 38,
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
// controls on the tray's navy. The row's targets' top stands `target` px
// above its foot, its foot sits at max(`inset` px, the home indicator), and
// nothing tappable in the tray comes within `clearance` px of them: the
// spec's 24 px around the dots (light_picker.controls), more than the 8 px a
// picture keeps (--deck-clear), because the tray's controls are tappable
// and a low tap on Twinkle must never turn the page or jump to the price.
const ROW_TOP_OVER_FOOT = (DECK_ROW.height + Math.max(DECK_ROW.chevron, DECK_ROW.dotHeight)) / 2;
export const DOTS = { target: ROW_TOP_OVER_FOOT, inset: DECK_ROW.bottom, clearance: 24 } as const;
export const DOTS_RESERVE_CSS = `calc(var(--deck-row-bottom, ${DOTS.inset}px) + ${DOTS.target + DOTS.clearance}px)`;

// Row 2: the effects, or the headline and its two lines beside them,
// whichever is taller.
const rowTwo = (size: { effectHeight: number; headlineLeading: number; wordsLeading: number }) =>
  Math.max(size.effectHeight, size.headlineLeading + TRAY_WORDS_LINES * size.wordsLeading);

// The lowest a tappable control in the tray reaches, measured from the tray's
// top, when row 1 and the effects sit as high as they can (at 1180).
export function controlsBottom(): number {
  return TRAY.padTop + TRAY.lookHeight + TRAY.rowGap + rowTwo(TRAY);
}

// The tray's controls at a deck that wide, top padding included: what the
// fluid sizes give there (TRAY at 1180, TRAY_AT_PRO at 1366).
export function trayContent(width: number): number {
  const at = (key: keyof typeof TRAY_AT_PRO) => fluidValue(TRAY[key], TRAY_AT_PRO[key], width);
  const two = rowTwo({ effectHeight: at("effectHeight"), headlineLeading: at("headlineLeading"), wordsLeading: at("wordsLeading") });
  return TRAY.padTop + at("lookHeight") + TRAY.rowGap + two;
}

// The least the tray is: its controls and the clear space under them, with
// the row's foot at `foot` px (20, or the home indicator's height).
export function trayFloor(width: number, foot: number = DOTS.inset): number {
  return trayContent(width) + Math.max(DOTS.inset, foot) + DOTS.target + DOTS.clearance;
}

// The tray's height: the band, but never less than the floor, so on a
// shorter deck the photo above gives way.
const ROW_TWO_CSS = `max(${TRAY_CSS.effectHeight}, calc(${TRAY_CSS.headlineLeading} + ${TRAY_WORDS_LINES} * ${TRAY_CSS.wordsLeading}))`;
export const TRAY_HEIGHT_CSS = `max(${BAND_HEIGHT_CSS}, calc(${TRAY.padTop + TRAY.rowGap}px + ${TRAY_CSS.lookHeight} + ${ROW_TWO_CSS} + ${DOTS_RESERVE_CSS}))`;

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
