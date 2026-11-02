"use client";

import { MoveHorizontal } from "lucide-react";
import { useRef, useState } from "react";

// The same house, day and night, with a handle to drag between them
// (M5). The night photo sits on top, clipped to the left of the handle,
// so dragging right turns the lights on across the house.
//
// Only the strip around the handle drags. A tap anywhere moves the line
// there, and a swipe anywhere else turns the page like every other page.
export function DayNightSlider({ dayUrl, nightUrl }: { dayUrl: string; nightUrl: string }) {
  const [position, setPosition] = useState(50);
  const box = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  function moveTo(clientX: number) {
    const rect = box.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const next = ((clientX - rect.left) / rect.width) * 100;
    setPosition(Math.min(100, Math.max(0, Math.round(next))));
  }

  return (
    <div ref={box} className="relative h-full w-full overflow-hidden select-none" onClick={(event) => moveTo(event.clientX)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- signed, cached for offline */}
      <img
        src={dayUrl}
        alt="The house by day"
        crossOrigin="anonymous"
        className="absolute inset-0 size-full object-cover"
        draggable={false}
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- signed, cached for offline */}
      <img
        src={nightUrl}
        alt="The same house at night, lights on"
        crossOrigin="anonymous"
        className="absolute inset-0 size-full object-cover"
        draggable={false}
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
      />
      <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 w-0.5 bg-background/80" style={{ left: `${position}%` }} />
      <div
        aria-hidden="true"
        className="absolute inset-y-0 w-24 -translate-x-1/2 cursor-ew-resize touch-none"
        style={{ left: `${position}%` }}
        onPointerDown={(event) => {
          dragging.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (dragging.current) moveTo(event.clientX);
        }}
        onPointerUp={() => {
          dragging.current = false;
        }}
        onPointerCancel={() => {
          dragging.current = false;
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="absolute top-1/2 left-1/2 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-primary bg-background/90">
          {/* An icon, not the arrow character: some fonts promote it to emoji. */}
          <MoveHorizontal className="size-4" />
        </div>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={position}
        onChange={(event) => setPosition(Number(event.target.value))}
        aria-label="Slide between day and night"
        className="sr-only"
      />
      <span className="pointer-events-none absolute bottom-14 left-4 rounded bg-background/70 px-2 py-0.5 text-xs font-semibold lg:bottom-16">
        Night
      </span>
      <span className="pointer-events-none absolute right-4 bottom-14 rounded bg-background/70 px-2 py-0.5 text-xs font-semibold lg:bottom-16">
        Day
      </span>
    </div>
  );
}
