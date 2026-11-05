"use client";

import { useSyncExternalStore } from "react";

// Opens the booking sheet from anywhere in the app: a tapped time on
// Schedule, Session or Home, a lead's Book a meeting, New lead's Save and book, or a
// booking's Move. The sheet itself lives once, in the app layout.

// When a hold runs out, by the database's clock (round 2).
export type SheetTimer = { expiresAt: string; now: string };

export type SheetRequest =
  // A time someone just tapped, already held for them, with its timer. No
  // timer while Keenan views the app as someone: the hold is acted out.
  | { kind: "book"; startsAt: string; timer: SheetTimer | null }
  // A lead to book: the sheet opens on the times first. backTo: New lead's
  // Save and book while knocking returns to Session once it's booked
  // (2026-11-05).
  | { kind: "lead"; leadId: string; backTo?: "session" }
  // A booking to move: the sheet opens on the times, then confirms.
  | { kind: "move"; meetingId: string; leadId: string; leadName: string; from: string }
  // An unfinished booking from Home: the times first, then where it was left.
  | { kind: "draft"; draftId: string };

let current: SheetRequest | null = null;
const listeners = new Set<() => void>();

export const bookingSheet = {
  get: (): SheetRequest | null => current,
  open(request: SheetRequest) {
    current = request;
    listeners.forEach((listener) => listener());
  },
  close() {
    if (current === null) return;
    current = null;
    listeners.forEach((listener) => listener());
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export function useSheetRequest(): SheetRequest | null {
  return useSyncExternalStore(bookingSheet.subscribe, bookingSheet.get, () => null);
}
