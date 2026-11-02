"use client";

import { MoveHorizontal } from "lucide-react";
import { useRef, useState } from "react";

// The same house, day and night, with a handle to drag between them
// (M5). The night photo sits on top, clipped to the left of the handle,
// so dragging right turns the lights on across the house.
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
    <div
      ref={box}
      className="relative h-full w-full touch-none overflow-hidden select-none"
      onPointerDown={(event) => {
        dragging.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        moveTo(event.clientX);
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
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- signed, cached for offline */}
      <img src={dayUrl} alt="The house by day" className="absolute inset-0 size-full object-cover" draggable={false} />
      {/* eslint-disable-next-line @next/next/no-img-element -- signed, cached for offline */}
      <img
        src={nightUrl}
        alt="The same house at night, lights on"
        className="absolute inset-0 size-full object-cover"
        draggable={false}
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
      />
      <div aria-hidden="true" className="absolute inset-y-0 w-0.5 bg-background/80" style={{ left: `${position}%` }} />
      <div
        aria-hidden="true"
        className="absolute top-1/2 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-primary bg-background/90"
        style={{ left: `${position}%` }}
      >
        {/* An icon, not the ↔ character: some fonts promote it to emoji. */}
        <MoveHorizontal className="size-4" />
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={position}
        onChange={(event) => setPosition(Number(event.target.value))}
        aria-label="Slide between day and night"
        className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
      />
      <span className="absolute bottom-4 left-4 rounded bg-background/70 px-2 py-0.5 text-xs font-semibold">Night</span>
      <span className="absolute right-4 bottom-4 rounded bg-background/70 px-2 py-0.5 text-xs font-semibold">Day</span>
    </div>
  );
}
