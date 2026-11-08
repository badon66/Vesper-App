import { DECK_CLEAR_PX } from "@/lib/meeting/deck-pages";
import { describe, expect, it } from "vitest";

import {
  BAND_HEIGHT_CSS,
  DOTS,
  LOOK_ROW_AT_MEETING,
  TRAY,
  TRAY_AT_PRO,
  TRAY_CSS,
  bandHeight,
  controlsBottom,
} from "@/components/meeting/picker/layout";
import { fluidValue } from "@/lib/meeting/deck-pages";
import { LOOK_ROW } from "@/lib/settings/deck-schema";

// The two iPads meeting mode is designed for, landscape.
const AIR = { width: 1180, height: 820 };
const PRO = { width: 1366, height: 1024 };
// A home-screen app on an iPad without a home button keeps this much clear
// at the bottom, landscape.
const HOME_INDICATOR = 20;

describe("the tray", () => {
  it("is the band's height: about 30% at 1180 x 820 and 28% at 1366 x 1024", () => {
    expect(bandHeight(AIR.height) / AIR.height).toBeCloseTo(0.3, 3);
    expect(bandHeight(PRO.height) / PRO.height).toBeCloseTo(0.28, 3);
    expect(BAND_HEIGHT_CSS).toContain("calc(82px + 20%)");
  });

  it("keeps its controls clear of the deck's bottom row (dots and chevrons), even above the home indicator", () => {
    const dotsTop = bandHeight(AIR.height) - (DOTS.target + Math.max(DOTS.inset, HOME_INDICATOR));
    expect(dotsTop - controlsBottom()).toBeGreaterThanOrEqual(DOTS.clearance);
    // The same clear space every picture keeps above the row.
    expect(DOTS.target + DOTS.clearance + DOTS.inset).toBe(DECK_CLEAR_PX);
  });

  it("has the looks at 72 px and the effects at 56 px, 12 px apart", () => {
    expect(TRAY.lookHeight).toBe(72);
    expect(TRAY.effectHeight).toBe(56);
    expect(TRAY.lookGap).toBe(12);
  });

  it("measures the look row as Settings does, so a label Settings lets through never wraps here", () => {
    expect(LOOK_ROW_AT_MEETING).toEqual(LOOK_ROW);
  });

  it("keeps the tick's room on every look, so a chosen name never moves and still fits Settings' check", () => {
    expect(TRAY.tick).toBe(TRAY.tickIcon + 8);
    expect(LOOK_ROW.tick).toBe(TRAY.tick);
  });

  it("centres each effect's label and hangs the chosen one's tick after it, 8 px clear of the edge", () => {
    for (const size of [TRAY, { ...TRAY, ...TRAY_AT_PRO }]) {
      const side = (size.effectSegment - size.effectLabelMax) / 2;
      expect(side - TRAY.effectTickGap - size.effectTick).toBeGreaterThanOrEqual(8);
    }
  });

  it("grows at 1366 x 1024 so the iPad Pro leaves no dead navy, and still clears the dots", () => {
    expect(TRAY_AT_PRO).toMatchObject({ lookHeight: 80, nameSize: 24, headlineSize: 36, wordsSize: 22 });
    // The deck's fluid sizes: the 1180 numbers at 1180, the 1366 ones at 1366.
    expect(TRAY_CSS.lookHeight).toContain("cqw");
    expect(fluidValue(TRAY.lookHeight, TRAY_AT_PRO.lookHeight, AIR.width)).toBeCloseTo(72, 6);
    expect(fluidValue(TRAY.lookHeight, TRAY_AT_PRO.lookHeight, PRO.width)).toBeCloseTo(80, 6);
    const rowTwo = Math.max(TRAY_AT_PRO.effectHeight, TRAY_AT_PRO.headlineLeading + 4 + TRAY_AT_PRO.wordsLeading);
    const content = TRAY.padTop + TRAY_AT_PRO.lookHeight + TRAY.rowGap + rowTwo;
    const reserve = DOTS.target + DOTS.clearance + Math.max(DOTS.inset, HOME_INDICATOR);
    expect(content + reserve).toBeLessThanOrEqual(bandHeight(PRO.height));
    // The effects at 1366 leave the line under the headline one line at 22 px.
    const effects = 4 * TRAY_AT_PRO.effectSegment - 3;
    expect(PRO.width - 2 * TRAY.sidePadding - TRAY.columnGap - effects).toBeGreaterThanOrEqual(Math.ceil(505 * (22 / 20)));
  });

  it("grows the look row's widths faster than its type, so a label that fits at 1180 fits at 1366", () => {
    for (let n = 1; n <= 6; n++) {
      const text = (width: number) => (width - 2 * TRAY.sidePadding - (n - 1) * TRAY.lookGap) / n - 2 * TRAY.lookPadding;
      const roomGrows = text(PRO.width) / text(AIR.width);
      expect(roomGrows).toBeGreaterThanOrEqual(TRAY_AT_PRO.nameSize / TRAY.nameSize);
      expect(roomGrows).toBeGreaterThanOrEqual(TRAY_AT_PRO.wordsSize / TRAY.wordsSize);
    }
  });

  it("leaves the seeded line under the headline one line at 1180 wide", () => {
    // "A preview drawn on our photo of your house. Tap a look." at 20 px
    // Manrope 400 measures 505 px in Chromium.
    const effects = 4 * TRAY.effectSegment - 3;
    const column = AIR.width - 2 * TRAY.sidePadding - TRAY.columnGap - effects;
    expect(column).toBeGreaterThanOrEqual(505);
  });
});
