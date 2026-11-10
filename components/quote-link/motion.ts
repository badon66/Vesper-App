"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

// The quote link's quiet motion (2026-11-04, decisions.md): one easing, a
// total that counts to its new value, and nothing at all that counts or
// slides while the phone's reduce motion setting is on.

export const EASE_QUIET = "cubic-bezier(0.22, 1, 0.36, 1)";
const COUNT_MS = 450;

const REDUCE = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => undefined;
  const query = window.matchMedia(REDUCE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

// Whether the phone asks for less motion. The server renders as if it does
// not; nothing moves before the page is alive anyway.
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(REDUCE).matches : false),
    () => false,
  );
}

// Close to cubic-bezier(0.22, 1, 0.36, 1): fast at first, settling gently.
const easeOut = (t: number) => 1 - Math.pow(1 - t, 4);

// A figure counting to its new value over 450 ms, from wherever it is
// now, so a second switch mid-count carries on smoothly. It always lands
// exactly on the value. With reduce motion on it is simply the value.
export function useCountTo(target: number): number {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(target);
  const current = useRef(target);
  useEffect(() => {
    if (reduce) {
      current.current = target;
      return;
    }
    const from = current.current;
    if (from === target) return;
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / COUNT_MS);
      const value = t >= 1 ? target : from + (target - from) * easeOut(t);
      current.current = value;
      setShown(value);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, reduce]);
  return reduce ? target : shown;
}
