"use client";

import { useEffect, useRef, useState } from "react";

import { EASE_QUIET } from "@/lib/motion";
import { cn } from "@/lib/utils";

// The customer's mockup, full screen, pinch to zoom (M5). Two fingers
// scale, one finger pans while zoomed, a double tap steps between fit
// and close-up. At normal size a one-finger swipe turns the page, the
// same as everywhere else in the deck. Nothing here talks to the
// network: the image is already on the iPad.
// crossOrigin: meeting mode asks for the picture in CORS mode so the
// service worker can keep it for no signal; the customer's quote page
// passes null, so the viewer reuses the picture already on the page (its
// short-lived link may have expired by the time they zoom). onError lets the
// page say what to do when a picture won't load. Full screen in the deck
// (2026-11-11): onTap is a single tap that isn't the start of a double tap
// (it waits out the double tap's 300 ms), onSwipeDown a downward swipe at
// normal size; both close the full-screen picture. wheelZoom (the
// customer's link on a computer, 2026-11-12): the mouse wheel or a trackpad
// pinch zooms, and a drag pans once zoomed in.
export function PinchZoom({
  src,
  alt,
  onSwipe,
  onTap,
  onSwipeDown,
  crossOrigin = "anonymous",
  onError,
  wheelZoom = false,
  className,
}: {
  src: string;
  alt: string;
  onSwipe?: (delta: number) => void;
  onTap?: () => void;
  onSwipeDown?: () => void;
  crossOrigin?: "anonymous" | null;
  onError?: () => void;
  wheelZoom?: boolean;
  className?: string;
}) {
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
  const frame = useRef<HTMLDivElement>(null);
  // A listener of its own, not React's, so the page's own zoom stays out of it.
  useEffect(() => {
    const element = frame.current;
    if (!wheelZoom || !element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      // A trackpad pinch arrives as small steps with ctrlKey; a wheel as big ones.
      const step = event.ctrlKey ? 0.01 : 0.002;
      setTransform((current) => {
        const scale = Math.min(4, Math.max(1, current.scale * Math.exp(-event.deltaY * step)));
        return scale === 1 ? { scale: 1, x: 0, y: 0 } : { ...current, scale };
      });
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [wheelZoom]);
  const [touching, setTouching] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const start = useRef({ scale: 1, x: 0, y: 0, distance: 0, midX: 0, midY: 0 });
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const lastTap = useRef(0);
  const tapTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (tapTimer.current !== null) window.clearTimeout(tapTimer.current);
    },
    [],
  );

  function distance() {
    const [a, b] = Array.from(pointers.current.values());
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  function clamp(next: { scale: number; x: number; y: number }) {
    const scale = Math.min(4, Math.max(1, next.scale));
    const range = (scale - 1) * 600;
    return {
      scale,
      x: Math.min(range, Math.max(-range, next.x)),
      y: Math.min(range, Math.max(-range, next.y)),
    };
  }

  function release(pointerId: number, clientX: number, clientY: number) {
    const wasOnly = pointers.current.size === 1 && pointers.current.has(pointerId);
    pointers.current.delete(pointerId);
    if (pointers.current.size === 0) setTouching(false);
    const from = swipe.current;
    swipe.current = null;
    if (!wasOnly || !from) return;
    const dx = clientX - from.x;
    const dy = clientY - from.y;
    // A tap: barely moved. Wait out a double tap before it counts.
    if (onTap && Math.abs(dx) < 10 && Math.abs(dy) < 10) {
      if (tapTimer.current !== null) {
        window.clearTimeout(tapTimer.current);
        tapTimer.current = null;
      } else if (transform.scale === 1) {
        tapTimer.current = window.setTimeout(() => {
          tapTimer.current = null;
          onTap();
        }, 300);
      }
      return;
    }
    if (transform.scale !== 1) return;
    if (onSwipeDown && dy > 80 && dy > Math.abs(dx) * 1.5) {
      onSwipeDown();
      return;
    }
    if (onSwipe && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) onSwipe(dx < 0 ? 1 : -1);
  }

  return (
    <div
      ref={frame}
      className={cn("relative h-full w-full touch-none overflow-hidden select-none", wheelZoom && transform.scale > 1 && "cursor-grab active:cursor-grabbing", className)}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        setTouching(true);
        if (pointers.current.size === 1) {
          swipe.current = { x: event.clientX, y: event.clientY };
          const now = Date.now();
          if (now - lastTap.current < 300) {
            setTransform((current) => (current.scale > 1 ? { scale: 1, x: 0, y: 0 } : { scale: 2.2, x: 0, y: 0 }));
          }
          lastTap.current = now;
          start.current = { ...transform, distance: 0, midX: event.clientX, midY: event.clientY };
        } else if (pointers.current.size === 2) {
          // Two fingers is a pinch, never a page turn.
          swipe.current = null;
          const [a, b] = Array.from(pointers.current.values());
          start.current = {
            ...transform,
            distance: Math.hypot(a.x - b.x, a.y - b.y),
            midX: (a.x + b.x) / 2,
            midY: (a.y + b.y) / 2,
          };
        }
      }}
      onPointerMove={(event) => {
        if (!pointers.current.has(event.pointerId)) return;
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pointers.current.size === 2) {
          const spread = distance();
          if (start.current.distance > 0 && spread > 0) {
            const factor = spread / start.current.distance;
            setTransform(clamp({ scale: start.current.scale * factor, x: start.current.x, y: start.current.y }));
          }
        } else if (pointers.current.size === 1 && transform.scale > 1) {
          const point = pointers.current.get(event.pointerId);
          if (!point) return;
          setTransform((current) =>
            clamp({
              scale: current.scale,
              x: start.current.x + (point.x - start.current.midX),
              y: start.current.y + (point.y - start.current.midY),
            }),
          );
        }
      }}
      onPointerUp={(event) => release(event.pointerId, event.clientX, event.clientY)}
      onPointerCancel={(event) => {
        swipe.current = null;
        release(event.pointerId, event.clientX, event.clientY);
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- signed, cached for offline */}
      <img
        src={src}
        alt={alt}
        crossOrigin={crossOrigin ?? undefined}
        onError={onError}
        draggable={false}
        className="size-full object-contain"
        style={{
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          transition: touching ? "none" : `transform 150ms ${EASE_QUIET}`,
        }}
      />
    </div>
  );
}
