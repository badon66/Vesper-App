"use client";

import { createContext, useContext } from "react";

// View as you can click through (round 2, Keenan, 2026-11-03). Screens that
// write from a tap read this: while Keenan views the app as someone, a step
// that needs a write to go on (a held time, a photo, a count) is acted out
// on screen only, and a final save says "View as: nothing was saved." The
// server refuses every write anyway; this keeps the screen calm.

export type ViewAsState = { viewingAs: boolean; name: string | null };

const ViewAsContext = createContext<ViewAsState>({ viewingAs: false, name: null });

export function ViewAsProvider({ viewingAs, name, children }: ViewAsState & { children: React.ReactNode }) {
  return <ViewAsContext.Provider value={{ viewingAs, name }}>{children}</ViewAsContext.Provider>;
}

export function useViewAs(): ViewAsState {
  return useContext(ViewAsContext);
}
