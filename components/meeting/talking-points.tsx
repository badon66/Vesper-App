"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { smartApostrophes } from "@/lib/typography";
import { cn } from "@/lib/utils";

// Keenan's talking points (round 10, 2026-11-10): a private peek on every
// page of meeting mode. A small quiet mark in the page's top right corner
// (the top left is the deck's way out, and the bottom row holds the page's
// button, the dots and Next): press and hold it and his notes for that page
// show in a panel under it; let go, slide off or lift and they are gone.
// Nothing shows on hover, the mark is never in the tab order, and with no
// text for the page there is no mark at all.
//
// A short hold (TALKING_HOLD_MS) before the panel shows, so a passing tap
// never flashes it. The panel is not rendered while it is not held, so
// nothing of it is in the page to read.
//
// It places itself in the top right of its nearest positioned box (a deck
// page's <section> is one), under the deck's layers (z-30) and its exit.
export const TALKING_HOLD_MS = 200;

export function TalkingPoints({ text }: { text: string | null }) {
  const [shown, setShown] = useState(false);
  const timer = useRef<number | null>(null);

  const hide = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setShown(false);
  }, []);

  // A page turned or unmounted mid-hold never leaves a timer behind.
  useEffect(() => hide, [hide]);

  const words = text?.trim() ?? "";
  if (!words) return null;

  return (
    <div
      data-talking=""
      className="absolute z-20"
      style={{ top: "max(20px, env(safe-area-inset-top, 0px))", right: "max(20px, env(safe-area-inset-right, 0px))" }}
    >
      <span
        aria-hidden="true"
        data-testid="talking-mark"
        data-holding={shown ? "true" : undefined}
        onPointerDown={(event) => {
          if (!event.isPrimary) return;
          if (timer.current !== null) window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => {
            timer.current = null;
            setShown(true);
          }, TALKING_HOLD_MS);
        }}
        onPointerUp={hide}
        onPointerLeave={hide}
        onPointerCancel={hide}
        onLostPointerCapture={hide}
        onContextMenu={(event) => event.preventDefault()}
        className="flex size-12 touch-none items-center justify-center select-none"
        style={{ WebkitTouchCallout: "none" }}
      >
        <span className={cn("size-2 rounded-full", shown ? "bg-foreground/60" : "bg-foreground/20")} />
      </span>
      {shown ? (
        <div
          aria-hidden="true"
          data-testid="talking-panel"
          className="pointer-events-none absolute top-12 right-0 flex w-[min(440px,calc(100vw-40px))] flex-col gap-2 rounded-md border border-border bg-card p-5 text-foreground"
        >
          {words
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line, at) => (
              <p key={at} className="text-[19px] leading-[1.4] text-pretty">
                {smartApostrophes(line)}
              </p>
            ))}
        </div>
      ) : null}
    </div>
  );
}
