"use client";

import { useSyncExternalStore } from "react";

// The time this phone is holding, shared by the time picker, the booking
// screens and the hold keeper in the app layout. The database is the truth;
// this only tells the screen which hold to keep alive.

export type HeldTime = { startsAt: string } | null;

let current: HeldTime = null;
const listeners = new Set<() => void>();

export const holdStore = {
  get: (): HeldTime => current,
  set(next: HeldTime) {
    if (current?.startsAt === next?.startsAt) return;
    current = next;
    listeners.forEach((listener) => listener());
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export function useHeldTime(): HeldTime {
  return useSyncExternalStore(holdStore.subscribe, holdStore.get, () => null);
}

// The screens a hold belongs to. Leaving them lets the hold go.
export function isBookingPath(pathname: string): boolean {
  return pathname === "/app/schedule/book" || pathname === "/app/leads/new";
}
