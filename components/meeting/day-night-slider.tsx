"use client";

import { MoveHorizontal } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";

import { useDeck } from "@/components/meeting/deck-parts";
import { MOTION, transition } from "@/lib/motion";

// Hidden by day (M5; round 7, the settled spec's hidden_by_day and motion):
// the same house by day and at night, with a line to drag between them. The
// night picture sits on top, showing left of the line, so dragging right
// turns the lights on across the house. No automatic sweep.
//
// The line is a 1 px warm white hairline with a 56 px navy grip ringed in
// gold (the one thing to touch on the page); "Night" and "Day" ride either
// side of the grip at 20/22 px on small solid navy plates. The grip and its
// plates sit in the lower third (round 7 review), over the wall and the
// ground, clear of every roofline in Keenan's pair (his rooflines sit in the
// middle 60%) and in the drawn pair. Only the 96 px strip
// around the line drags, following the finger one to one; a tap anywhere
// else on the picture moves the line there over 250 ms (in one step with
// Reduce Motion), and a swipe anywhere else turns the page like every other
// page. Everything moves by transform: the night picture is revealed by a
// box sliding one way while the picture inside it slides back the other.
//
// day and night are the two pictures, each filling its box: Keenan's pair of
// photos, or the drawn pair (HouseDayDrawing and LitHouse).
// The grip's centre, down the picture.
const GRIP_AT = "top-[78%]";
const PLATE = `absolute ${GRIP_AT} -translate-y-1/2 rounded-md bg-navy px-2.5 py-1.5 text-[length:var(--deck-small,20px)] leading-none font-semibold whitespace-nowrap text-foreground`;

export function DayNightSlider({
  day,
  night,
  label = "Slide between day and night",
}: {
  day: ReactNode;
  night: ReactNode;
  label?: string;
}) {
  const { reduced } = useDeck();
  const [position, setPosition] = useState(50);
  const [eased, setEased] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  function placeAt(clientX: number, ease: boolean) {
    const rect = box.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const next = ((clientX - rect.left) / rect.width) * 100;
    setEased(ease && !reduced);
    setPosition(Math.min(100, Math.max(0, Math.round(next * 10) / 10)));
  }

  const move = transition("transform", eased ? MOTION.sliderMs : 0);
  const shift = (percent: number) => ({ transform: `translateX(${percent}%)`, transition: move });

  return (
    <div ref={box} className="relative h-full w-full overflow-hidden select-none" onClick={(event) => placeAt(event.clientX, true)}>
      <div className="absolute inset-0">{day}</div>
      <div aria-hidden="true" className="absolute inset-0 overflow-hidden" style={shift(position - 100)}>
        <div className="absolute inset-0" style={shift(100 - position)}>
          {night}
        </div>
      </div>

      {/* The line, the grip and its plates ride one full-width layer, so a
          percentage of the picture's width is one transform. */}
      <div className="pointer-events-none absolute inset-0" style={shift(position)}>
        <div aria-hidden="true" className="absolute inset-y-0 left-0 w-px -translate-x-1/2 bg-foreground" />
        <div
          aria-hidden="true"
          className="pointer-events-auto absolute inset-y-0 left-0 w-24 -translate-x-1/2 cursor-ew-resize touch-none"
          onPointerDown={(event) => {
            dragging.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            placeAt(event.clientX, false);
          }}
          onPointerMove={(event) => {
            if (dragging.current) placeAt(event.clientX, false);
          }}
          onPointerUp={() => {
            dragging.current = false;
          }}
          onPointerCancel={() => {
            dragging.current = false;
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <span className={`${PLATE} right-[calc(50%+36px)]`}>Night</span>
          <span
            className={`absolute ${GRIP_AT} left-1/2 flex size-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-primary bg-navy text-foreground`}
          >
            {/* An icon, not the arrow character: some fonts promote it to emoji. */}
            <MoveHorizontal className="size-6" />
          </span>
          <span className={`${PLATE} left-[calc(50%+36px)]`}>Day</span>
        </div>
      </div>

      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(position)}
        onChange={(event) => {
          setEased(false);
          setPosition(Number(event.target.value));
        }}
        aria-label={label}
        aria-valuetext={`${Math.round(position)}% night`}
        className="sr-only"
      />
    </div>
  );
}
