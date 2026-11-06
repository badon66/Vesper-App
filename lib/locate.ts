import { GPS_MAX_ACCURACY_M, inCalgaryArea, type DevicePosition } from "@/lib/geo";

// "Use where I'm standing" (round 3, Keenan, 2026-11-05: it seemed to do
// nothing in the field). An iPhone's first reading is usually a rough one
// from Wi-Fi or cell towers (65 m or more) before GPS settles, and the old
// button turned that first reading away. Now the phone is listened to for
// up to 15 seconds and the first reading within 50 m is taken; every way it
// can end says so in words. Kept pure so it is unit tested; the button does
// the listening.

export const LOCATE_WINDOW_MS = 15_000;
// Readings this rough all the way through mean Precise Location is off: the
// phone gives an area of several kilometres, never a house.
export const APPROXIMATE_M = 1000;

export type Reading = { lat: number; lng: number; accuracy: number };

export type LocateFailure =
  // No location in this browser at all.
  | "unsupported"
  // Location is off for Vesper (or for Safari Websites) on this phone.
  | "denied"
  // Nothing came back in 15 seconds: often a permission prompt that never
  // showed, which the browser's own timeout doesn't count.
  | "no_answer"
  // Readings came, but none within 50 m.
  | "rough"
  // Only area-sized readings: Precise Location is off.
  | "approximate"
  // A good reading, but not in the Calgary area.
  | "outside"
  // The app went to the background, which stops location on an iPhone.
  | "background";

export type LocateState =
  | { kind: "idle" }
  | { kind: "finding"; best: number | null }
  | { kind: "found"; position: DevicePosition }
  | { kind: "failed"; reason: LocateFailure; best: number | null };

export const IDLE: LocateState = { kind: "idle" };
export const FINDING: LocateState = { kind: "finding", best: null };

const tidy = (accuracy: number) => Math.round(accuracy * 10) / 10;

// One reading while finding: good enough ends it, otherwise the best so far
// is kept and shown.
export function withReading(state: LocateState, reading: Reading): LocateState {
  if (state.kind !== "finding") return state;
  if (reading.accuracy <= GPS_MAX_ACCURACY_M) {
    if (!inCalgaryArea(reading.lat, reading.lng)) return { kind: "failed", reason: "outside", best: tidy(reading.accuracy) };
    return { kind: "found", position: { lat: reading.lat, lng: reading.lng, accuracy: tidy(reading.accuracy) } };
  }
  const best = state.best === null ? reading.accuracy : Math.min(state.best, reading.accuracy);
  return { kind: "finding", best };
}

// The 15 seconds are up without a good reading.
export function atDeadline(state: LocateState): LocateState {
  if (state.kind !== "finding") return state;
  if (state.best === null) return { kind: "failed", reason: "no_answer", best: null };
  return { kind: "failed", reason: state.best >= APPROXIMATE_M ? "approximate" : "rough", best: Math.round(state.best) };
}

// An error from the phone. Denied ends it at once; the phone not finding a
// position yet (or its own timeout) doesn't: the 15 seconds keep going.
export function withError(state: LocateState, code: number): LocateState {
  if (state.kind !== "finding") return state;
  return code === 1 ? { kind: "failed", reason: "denied", best: state.best } : state;
}

// What the screen says while finding: at once, then how close it is.
export function findingText(best: number | null): string {
  if (best === null) return "Finding where you are...";
  if (best >= APPROXIMATE_M) return `Finding where you are... only a rough area so far (about ${formatDistance(best)}).`;
  return `Finding where you are... about ${Math.round(best)} m so far, getting closer.`;
}

export function formatDistance(metres: number): string {
  return metres >= 1000 ? `${(metres / 1000).toFixed(metres >= 10_000 ? 0 : 1)} km` : `${Math.round(metres)} m`;
}

// Turning location on for Vesper, for an iPhone or iPad (iOS 18 and 26; on
// iOS 17 and earlier the Safari setting is Settings, Safari, Location). The
// home-screen app has no entry of its own in Settings: Safari's settings
// cover it.
export const LOCATION_ON_STEPS = [
  "Open Settings, tap Privacy & Security, then Location Services, and make sure it's on.",
  "In that list, tap Safari Websites. Choose While Using the App and turn on Precise Location.",
  "Go back to the first Settings screen, tap Apps, then Safari, then Location, and choose Allow.",
  "Close Vesper (swipe up and swipe it away), open it again from the home screen and tap the button again. If it asks, tap Allow.",
];

export const PRECISE_STEPS = [
  "Open Settings, tap Privacy & Security, then Location Services.",
  "Tap Safari Websites and turn on Precise Location.",
  "Come back to Vesper and tap the button again.",
];

export type LocateMessage = { title: string; detail?: string; steps?: string[] };

// keeps: the screen keeps what was entered on the phone (the booking sheet,
// and New lead outside View as), so the note can say so before its steps,
// which end by closing Vesper. Other screens never say it.
export function failureMessage(reason: LocateFailure, best: number | null, device: "phone" | "device", keeps = false): LocateMessage {
  const kept = keeps ? "What you've entered stays here. " : "";
  const The = device === "phone" ? "The phone" : "This device";
  switch (reason) {
    case "unsupported":
      return { title: `${The} can't share where it is.`, detail: "Type the address instead." };
    case "denied":
      return { title: "Location is off for Vesper.", detail: `${kept}To turn it on:`, steps: LOCATION_ON_STEPS };
    case "no_answer":
      return {
        title: `${The} didn't answer with a position.`,
        detail: "If it asked to use your location, tap Allow. If it never asked, close Vesper and open it again, then try once more. Still nothing? Location may be off:",
        steps: LOCATION_ON_STEPS,
      };
    case "rough":
      return {
        title: `It only got to about ${best ?? "?"} m. It needs 50 m or better.`,
        detail: "Step out to the sidewalk, away from the house and trees, wait a few seconds and try again.",
      };
    case "approximate":
      return {
        title: `${The} is only giving a rough area (about ${formatDistance(best ?? APPROXIMATE_M)}), not where you're standing.`,
        detail: `Precise Location is off. ${kept}To turn it on:`,
        steps: PRECISE_STEPS,
      };
    case "outside":
      return { title: "That position isn't in the Calgary area.", detail: "Type the address instead." };
    case "background":
      return { title: "It stopped when Vesper went to the background.", detail: "Tap the button again with Vesper open." };
  }
}
