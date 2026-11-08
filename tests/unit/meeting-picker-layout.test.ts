import { describe, expect, it } from "vitest";

import { BAND_HEIGHT_CSS, DOTS, LOOK_ROW_AT_MEETING, TRAY, bandHeight, controlsBottom } from "@/components/meeting/picker/layout";
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

  it("keeps its controls clear of the deck's dots, 24 px and more, even above the home indicator", () => {
    const dotsTop = bandHeight(AIR.height) - (DOTS.target + Math.max(DOTS.inset, HOME_INDICATOR));
    expect(dotsTop - controlsBottom()).toBeGreaterThanOrEqual(DOTS.clearance);
  });

  it("has the looks at 72 px and the effects at 56 px, 12 px apart", () => {
    expect(TRAY.lookHeight).toBe(72);
    expect(TRAY.effectHeight).toBe(56);
    expect(TRAY.lookGap).toBe(12);
  });

  it("measures the look row as Settings does, so a label Settings lets through never wraps here", () => {
    expect(LOOK_ROW_AT_MEETING).toEqual(LOOK_ROW);
  });

  it("gives each effect room for its tick and its widest label", () => {
    expect(TRAY.effectSegment).toBeGreaterThanOrEqual(20 + 8 + TRAY.effectLabelMax + 2 * 16);
  });

  it("leaves the seeded line under the headline one line at 1180 wide", () => {
    // "A preview drawn on our photo of your house. Tap a look." at 20 px
    // Manrope 400 measures 505 px in Chromium.
    const effects = 4 * TRAY.effectSegment - 3;
    const column = AIR.width - 2 * TRAY.sidePadding - TRAY.columnGap - effects;
    expect(column).toBeGreaterThanOrEqual(505);
  });
});
