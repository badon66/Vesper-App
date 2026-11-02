"use client";

import { useRef, useState } from "react";

// The customer's mockup, full screen, pinch to zoom (M5). Two fingers
// scale, one finger pans while zoomed, a double tap steps between fit
// and close-up. Nothing here talks to the network: the image is already
// on the iPad.
export function PinchZoom({ src, alt }: { src: string; alt: string }) {
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
  const [touching, setTouching] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const start = useRef({ scale: 1, x: 0, y: 0, distance: 0, midX: 0, midY: 0 });
  const lastTap = useRef(0);

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

  return (
    <div
      className="relative h-full w-full touch-none overflow-hidden select-none"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        setTouching(true);
        if (pointers.current.size === 1) {
          const now = Date.now();
          if (now - lastTap.current < 300) {
            setTransform((current) => (current.scale > 1 ? { scale: 1, x: 0, y: 0 } : { scale: 2.2, x: 0, y: 0 }));
          }
          lastTap.current = now;
          start.current = { ...transform, distance: 0, midX: event.clientX, midY: event.clientY };
        } else if (pointers.current.size === 2) {
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
      onPointerUp={(event) => {
        pointers.current.delete(event.pointerId);
        if (pointers.current.size === 0) setTouching(false);
      }}
      onPointerCancel={(event) => {
        pointers.current.delete(event.pointerId);
        if (pointers.current.size === 0) setTouching(false);
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- signed, cached for offline */}
      <img
        src={src}
        alt={alt}
        draggable={false}
        className="size-full object-contain"
        style={{
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          transition: touching ? "none" : "transform 150ms ease-out",
        }}
      />
    </div>
  );
}
