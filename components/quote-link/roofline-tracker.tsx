"use client";

import { useState } from "react";
import { openingStep, type TrackerStep, type TrackerStepKey } from "@/lib/quote-link/tracker";
import { smartApostrophes as say } from "@/lib/typography";
import { cn } from "@/lib/utils";

// "Where you're at" (round 17, Keenan, 2026-11-12): four steps as lights
// along a low roofline. Done steps are lit warm, the current one glows
// gently (still with reduce motion on), the ones after it are dim. Tap a
// step, its light or its name, to read it; the current step is open to
// start. "page" is the white customer link; "deck" is meeting mode, at the
// deck's sizes. Colours come from the theme's tokens, so it reads on the
// link's white and the meeting's navy alike; only the lit bulbs are a
// fixed warm white. The words are Keenan's (lib/quote-link/tracker.ts).

// Where each light sits: across the width, on a low gable from eave to
// eave (the line runs 0,36 to 50,8 to 100,36 in a 100 x 40 box).
const SPOTS = [12.5, 37.5, 62.5, 87.5].map((x) => ({ x, y: ((36 - 28 * ((x <= 50 ? x : 100 - x) / 50)) / 40) * 100 }));

const LIT = "#e9b65a";

export function RooflineTracker({
  steps,
  title,
  pay,
  tone = "page",
  className,
  headingId = "tracker-title",
}: {
  steps: TrackerStep[];
  // The heading (the link has one; the meeting's page has its own).
  title?: string | null;
  // "You pay nothing until it's installed and you're happy with it."
  pay?: string | null;
  tone?: "page" | "deck";
  className?: string;
  headingId?: string;
}) {
  // The current step reads first, and keeps up as the steps move (a choice
  // made at the table, a booking on the link) until a step is tapped.
  const [picked, setOpen] = useState<TrackerStepKey | null>(null);
  const open = picked ?? openingStep(steps);
  const shown = steps.find((step) => step.key === open) ?? steps[0];
  const deck = tone === "deck";
  return (
    <section
      aria-labelledby={title ? headingId : undefined}
      aria-label={title ? undefined : "Where you're at"}
      className={cn("flex flex-col", className)}
      data-testid="tracker"
    >
      {title ? (
        <h2 id={headingId} className={cn("font-bold", deck ? "text-[length:var(--deck-body)]" : "text-xl")}>
          {say(title)}
        </h2>
      ) : null}
      <div className={cn("relative w-full", deck ? "mt-2 h-[88px]" : "mt-4 h-[76px] lg:h-[84px]")}>
        <svg aria-hidden="true" viewBox="0 0 100 40" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
          <polyline
            points="0,36 50,8 100,36"
            fill="none"
            strokeWidth="2"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            className="stroke-foreground/30"
          />
        </svg>
        {steps.map((step, at) => {
          const spot = SPOTS[at];
          const lit = step.state !== "later";
          return (
            <button
              key={step.key}
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              onClick={() => setOpen(step.key)}
              className="absolute flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center outline-none [-webkit-tap-highlight-color:transparent]"
              style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
              data-testid="tracker-light"
              data-state={step.state}
            >
              {step.state === "current" ? (
                <span aria-hidden="true" className="tracker-glow absolute size-8 rounded-full" style={{ backgroundColor: `${LIT}66` }} />
              ) : null}
              <span
                aria-hidden="true"
                className={cn(
                  "relative block size-4 rounded-full border-2",
                  lit ? "border-[#c7913a]" : "border-muted-foreground/45 bg-background",
                  open === step.key && "ring-2 ring-foreground ring-offset-2 ring-offset-background",
                )}
                style={lit ? { backgroundColor: LIT, boxShadow: `0 1px 8px ${LIT}aa` } : undefined}
              />
            </button>
          );
        })}
      </div>
      <ol className="grid grid-cols-4 gap-1">
        {steps.map((step) => (
          <li key={step.key} className="flex flex-col items-center">
            <button
              type="button"
              aria-pressed={open === step.key}
              aria-current={step.state === "current" ? "step" : undefined}
              aria-controls="tracker-detail"
              onClick={() => setOpen(step.key)}
              className={cn(
                "flex min-h-11 w-full flex-col items-center justify-start gap-0.5 rounded-md px-0.5 py-1 text-center leading-tight outline-none focus-visible:ring-2 focus-visible:ring-ring",
                deck ? "text-[length:var(--deck-small)]" : "text-sm",
                step.state === "later" ? "text-muted-foreground" : "font-semibold",
                open === step.key && "underline decoration-2 underline-offset-4",
              )}
              data-testid="tracker-step"
              data-step={step.key}
              data-state={step.state}
            >
              <span className="text-balance">{say(step.label)}</span>
              {step.date ? (
                <span className="font-normal text-muted-foreground tabular-nums no-underline" data-testid="tracker-date">
                  {step.date.short}
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ol>
      <div
        id="tracker-detail"
        aria-live="polite"
        className={cn("mt-3 rounded-md bg-muted", deck ? "px-5 py-4" : "px-4 py-3")}
        data-testid="tracker-detail"
        data-step={shown.key}
      >
        <p className={cn("font-semibold", deck ? "text-[length:var(--deck-small)] leading-[1.3]" : "text-base")}>
          {say(shown.label)}
          {shown.state === "done" ? <span className="font-normal text-muted-foreground">{" "}· Done</span> : null}
          {shown.date ? <span className="font-normal text-muted-foreground">{` · ${shown.date.long}`}</span> : null}
        </p>
        <p className={cn("mt-1 text-pretty", deck ? "text-[length:var(--deck-small)] leading-[1.3]" : "text-base")}>{say(shown.text)}</p>
      </div>
      {pay ? (
        <p className={cn("mt-3 font-semibold text-pretty", deck ? "text-[length:var(--deck-small)] leading-[1.3]" : "text-base")} data-testid="tracker-pay">
          {say(pay)}
        </p>
      ) : null}
    </section>
  );
}
