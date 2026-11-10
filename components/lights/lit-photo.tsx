"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { LightCanvas, useBoxSize } from "@/components/lights/light-canvas";
import type { Effect, Look } from "@/lib/deck";
import { DUSK_NAVY, NAVY_MULTIPLY_OPACITY, duskFilter } from "@/lib/lights/dusk";
import { IDENTITY, TRACE_MARGIN, scaleHandles, screenBox, traceFrame } from "@/lib/lights/frame";
import { placeLights, type Size, type TraceGeometry } from "@/lib/lights/place";
import { MOTION, transition } from "@/lib/motion";
import { cn } from "@/lib/utils";

// The customer's house at dusk, lit (round 7, light_picker.performance):
// the light picker's picture, and exactly what prep's See it lit shows.
// Four layers on one explicit crop transform, never object-fit, so the
// roofline is never cropped and the lights land on it:
//   1. the day photo, as taken;
//   2. the same photo under the fixed dusk filter (brightness from prep,
//      saturate 0.65), cross-faded in by opacity;
//   3. one flat Vesper navy layer, multiply, at 38% of the dusk level;
//   4. the light canvas, screen-blended.
// Framed to the trace's bounds joined with its scale handles (the garage or
// front door's bottom corners) plus 10%, with the top kept above the
// roofline (lib/lights/frame.ts traceFrame). Where the photo runs out, the
// box's Night Background shows. Both photo loads are crossOrigin anonymous,
// so the service worker can keep them and nothing is ever tainted. It never
// takes a touch: the page around it decides what a touch does.
//
// CONTRACT
//   <LitPhoto
//     photoUrl     the photo the trace was drawn on (a signed storage URL)
//     trace        { lines, lineFeet?, scale, duskBrightness } (a stored Trace fits)
//     look         the look to show
//     effect?      default "steady"
//     dusk?        0 (the photo as taken) to 1 (dusk). Default 1.
//     duskMs?      how long dusk takes to fall when `dusk` changes (default 0;
//                  the picker's first arrival passes MOTION.duskFallMs)
//     lit?         0 to 1: the lights' fade-up. Default 1.
//     fadeMs?      how long `lit` and Off take (default 400)
//     lookFadeMs?  default 300; 100 or less with Reduce Motion
//     playing?     Twinkle and Chase may run. Default false.
//     label        what a screen reader hears (pickerCanvasLabel in lib/lights/looks.ts)
//     onReady?     once the photo has loaded and the lights are placed
//     onError?     the photo would not load
//     className?   size it with this (it fills its box)
//   />

export type LitPhotoProps = {
  photoUrl: string;
  trace: TraceGeometry & { duskBrightness: number };
  look: Look;
  effect?: Effect;
  dusk?: number;
  duskMs?: number;
  lit?: number;
  fadeMs?: number;
  lookFadeMs?: number;
  playing?: boolean;
  label: string;
  onReady?: () => void;
  onError?: () => void;
  className?: string;
};

export function LitPhoto({
  photoUrl,
  trace,
  look,
  effect = "steady",
  dusk = 1,
  duskMs = 0,
  lit = 1,
  fadeMs = MOTION.offFadeMs,
  lookFadeMs = MOTION.lookFadeMs,
  playing = false,
  label,
  onReady,
  onError,
  className,
}: LitPhotoProps) {
  const [boxRef, box] = useBoxSize<HTMLDivElement>();
  const [natural, setNatural] = useState<Size | null>(null);

  const measure = useCallback((image: HTMLImageElement | null) => {
    // An image that finished loading before the page was alive never fires
    // onLoad, so a complete one is measured here.
    if (image && image.complete && image.naturalWidth > 0) {
      const size = { width: image.naturalWidth, height: image.naturalHeight };
      setNatural((now) => (now && now.width === size.width && now.height === size.height ? now : size));
    }
  }, []);

  const placement = useMemo(() => (natural ? placeLights(trace, natural) : null), [trace, natural]);
  // Framed to the roofline joined with the scale handles (the garage or
  // front door's bottom corners), so the doors and some ground show.
  const transform = useMemo(
    () =>
      natural && placement && box.width > 0 && box.height > 0
        ? traceFrame(placement.bounds, natural, box, TRACE_MARGIN, scaleHandles(trace.scale, natural))
        : IDENTITY,
    [natural, placement, box, trace.scale],
  );
  const ready = Boolean(natural && placement && box.width > 0 && box.height > 0);

  const readyFired = useRef(false);
  useEffect(() => {
    if (ready && !readyFired.current) {
      readyFired.current = true;
      onReady?.();
    }
  }, [ready, onReady]);

  const place = natural && ready ? screenBox(transform, natural) : null;
  const layer = place
    ? { position: "absolute" as const, left: place.left, top: place.top, width: place.width, height: place.height, maxWidth: "none" }
    : { position: "absolute" as const, left: 0, top: 0, opacity: 0, maxWidth: "none" };
  const level = Math.min(1, Math.max(0, dusk));

  return (
    <div ref={boxRef} role="img" aria-label={label} className={cn("relative overflow-hidden bg-background select-none", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- signed storage photo, kept for no signal */}
      <img
        ref={measure}
        src={photoUrl}
        alt=""
        aria-hidden="true"
        crossOrigin="anonymous"
        draggable={false}
        decoding="async"
        onLoad={(event) => measure(event.currentTarget)}
        onError={onError}
        style={{ ...layer, WebkitTouchCallout: "none" }}
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- the same photo, graded to dusk */}
      <img
        src={photoUrl}
        alt=""
        aria-hidden="true"
        crossOrigin="anonymous"
        draggable={false}
        decoding="async"
        style={{
          ...layer,
          WebkitTouchCallout: "none",
          filter: duskFilter(trace.duskBrightness),
          opacity: place ? level : 0,
          transition: transition("opacity", duskMs),
        }}
      />
      {place ? (
        <div
          aria-hidden="true"
          style={{
            ...layer,
            backgroundColor: DUSK_NAVY,
            mixBlendMode: "multiply",
            opacity: level * NAVY_MULTIPLY_OPACITY,
            transition: transition("opacity", duskMs),
          }}
        />
      ) : null}
      {ready ? (
        <LightCanvas
          placement={placement}
          transform={transform}
          width={box.width}
          height={box.height}
          look={look}
          effect={effect}
          lit={lit}
          fadeMs={fadeMs}
          lookFadeMs={lookFadeMs}
          playing={playing}
        />
      ) : null}
    </div>
  );
}
