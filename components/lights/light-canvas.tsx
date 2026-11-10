"use client";

import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";

import type { Effect, Look } from "@/lib/deck";
import { LightEngine } from "@/lib/lights/engine";
import type { Transform } from "@/lib/lights/frame";
import type { Placement, Size } from "@/lib/lights/place";
import { MOTION, transition } from "@/lib/motion";

// The light renderer (round 7, light_picker.performance). Every light in the
// deck is drawn by this one component: the light picker on the customer's
// photo, prep's See it lit, and the original drawings' warm white, so every
// light looks like the same light.
//
// CONTRACT
//   <LightCanvas
//     placement   Placement from placeLights / placeAlong (content px), or null
//     transform   content -> CSS px in this box (lib/lights/frame.ts), the
//                 same one the photo layers use
//     width, height  the box in CSS px (useBoxSize below measures it)
//     look        the look to show (lib/deck.ts Look)
//     effect?     "steady" (default) | "twinkle" | "chase" | "off"
//     lit?        0 to 1, the whole canvas's opacity: the first fade-up
//     fadeMs?     how long lit and Off take to change (default 400)
//     lookFadeMs? a new look cross-fades over this (default 300; pass 100 or
//                 less with Reduce Motion)
//     playing?    Twinkle and Chase may run (the page is current, the app is
//                 visible, no layer is open); false holds the frame. Default false.
//     wash?       draw the wash on the wall under the lines (default true)
//     label?      the screen reader's words for it; without one it is hidden
//                 from screen readers (its stage carries the label)
//     className?, style?
//   />
// It sits at the top-left of its positioned parent, sized width x height,
// with mix-blend-mode screen over whatever is under it. It never takes a
// touch. On unmount its canvas is released (width and height 0).
//
//   useBoxSize()  [ref, { width, height }] of an element, kept current with
//                 a ResizeObserver (layout size, so a More layer's rise
//                 doesn't move it)

export type LightCanvasProps = {
  placement: Placement | null;
  transform: Transform;
  width: number;
  height: number;
  look: Look;
  effect?: Effect;
  lit?: number;
  fadeMs?: number;
  lookFadeMs?: number;
  playing?: boolean;
  wash?: boolean;
  label?: string;
  className?: string;
  style?: CSSProperties;
};

export function LightCanvas({
  placement,
  transform,
  width,
  height,
  look,
  effect = "steady",
  lit = 1,
  fadeMs = MOTION.offFadeMs,
  lookFadeMs = MOTION.lookFadeMs,
  playing = false,
  wash = true,
  label,
  className,
  style,
}: LightCanvasProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<LightEngine | null>(null);
  const { scale, x, y } = transform;

  // Effects run in this order on mount: the engine, then its scene, look,
  // effect and playing.
  useEffect(() => {
    if (!canvas.current) return;
    const created = new LightEngine(canvas.current);
    engine.current = created;
    return () => {
      created.destroy();
      engine.current = null;
    };
  }, []);

  useEffect(() => {
    engine.current?.setScene({ placement, transform: { scale, x, y }, width, height, wash });
  }, [placement, scale, x, y, width, height, wash]);

  useEffect(() => {
    engine.current?.setLook(look, Math.max(0, lookFadeMs));
  }, [look, lookFadeMs]);

  useEffect(() => {
    engine.current?.setEffect(effect);
  }, [effect]);

  useEffect(() => {
    engine.current?.setPlaying(playing);
  }, [playing]);

  const opacity = effect === "off" ? 0 : Math.min(1, Math.max(0, lit));
  return (
    <canvas
      ref={canvas}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
      className={className}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: Math.max(0, width),
        height: Math.max(0, height),
        pointerEvents: "none",
        mixBlendMode: "screen",
        opacity,
        transition: transition("opacity", fadeMs),
        ...style,
      }}
    />
  );
}

export function useBoxSize<T extends HTMLElement>(): [RefObject<T | null>, Size] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    // The observer reports the first size as soon as it starts observing.
    const observer = new ResizeObserver((entries) => {
      const box = entries[entries.length - 1]?.contentRect;
      if (!box) return;
      setSize((now) => (now.width === box.width && now.height === box.height ? now : { width: box.width, height: box.height }));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, size];
}
