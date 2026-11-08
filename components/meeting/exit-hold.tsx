"use client";

import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { exitHoldMoved } from "@/lib/meeting/deck-pages";
import { MOTION } from "@/lib/motion";
import { cn } from "@/lib/utils";

// The way out of the deck (round 7, settled decision 37): hold the X for
// 600 ms while a ring fills around it; letting go early cancels it, and
// nothing on screen says how (a customer holding the iPad would do what a
// "Tap again to leave" said, and land on the lead page with its notes).
// Escape does the same from a keyboard (the deck listens for it).
//
// A hand holding the iPad is not a hold (round 7 review): the hold is
// cancelled when the finger moves more than 10 px from where it went down,
// and when a second touch lands anywhere while it is held (a hand gripping
// the iPad's corner usually has more than one finger on the glass).
//
// The ring fills by transform alone: two half rings, each turning 180
// degrees inside a half-width clip, the second starting as the first ends.
// It runs at an even pace, because it is a timer: the eased curve would
// make the halfway point jump.
const HALF_MS = MOTION.exitHoldMs / 2;

export function ExitHold({ onExit, label = "Hold to leave meeting mode" }: { onExit: () => void; label?: string }) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<number | null>(null);
  // The pointer holding it and where it went down; null for a key.
  const down = useRef<{ id: number; x: number; y: number } | null>(null);

  function start() {
    if (timer.current !== null) return;
    setHolding(true);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      down.current = null;
      setHolding(false);
      onExit();
    }, MOTION.exitHoldMs);
  }

  const cancel = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    down.current = null;
    setHolding(false);
  }, []);

  // While it is held, any other touch, anywhere, cancels it.
  useEffect(() => {
    if (!holding) return;
    function onOtherPointer(event: PointerEvent) {
      if (down.current === null || event.pointerId !== down.current.id) cancel();
    }
    function onTouches(event: TouchEvent) {
      if (event.touches.length > 1) cancel();
    }
    window.addEventListener("pointerdown", onOtherPointer, true);
    window.addEventListener("touchstart", onTouches, true);
    return () => {
      window.removeEventListener("pointerdown", onOtherPointer, true);
      window.removeEventListener("touchstart", onTouches, true);
    };
  }, [holding, cancel]);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const half = (delay: number) => ({
    transform: `rotate(${holding ? 180 : 0}deg)`,
    transition: holding ? `transform ${HALF_MS}ms linear ${delay}ms` : "none",
  });

  return (
    <button
      type="button"
      aria-label={label}
      data-holding={holding ? "true" : undefined}
      onPointerDown={(event) => {
        if (!event.isPrimary) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        down.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
        start();
      }}
      onPointerMove={(event) => {
        const from = down.current;
        if (from && event.pointerId === from.id && exitHoldMoved(from, { x: event.clientX, y: event.clientY })) cancel();
      }}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onLostPointerCapture={cancel}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        if (!event.repeat) start();
      }}
      onKeyUp={(event) => {
        if (event.key === "Enter" || event.key === " ") cancel();
      }}
      onContextMenu={(event) => event.preventDefault()}
      className={cn(
        "relative inline-flex size-12 touch-none items-center justify-center rounded-full bg-background text-muted-foreground outline-none select-none focus-visible:ring-2 focus-visible:ring-ring",
        holding && "text-foreground",
      )}
      style={{ WebkitTouchCallout: "none" }}
    >
      <X aria-hidden="true" className="size-5" />
      <span aria-hidden="true" className="pointer-events-none absolute inset-0.5 rounded-full border-2 border-foreground/15" />
      {/* The right half fills first (12 to 6 o'clock), then the left. */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-0.5" style={{ clipPath: "inset(0 0 0 50%)" }}>
        <span className="absolute inset-0 rounded-full border-2 border-foreground" style={{ clipPath: "inset(0 50% 0 0)", ...half(0) }} />
      </span>
      <span aria-hidden="true" className="pointer-events-none absolute inset-0.5" style={{ clipPath: "inset(0 50% 0 0)" }}>
        <span className="absolute inset-0 rounded-full border-2 border-foreground" style={{ clipPath: "inset(0 0 0 50%)", ...half(HALF_MS) }} />
      </span>
    </button>
  );
}
