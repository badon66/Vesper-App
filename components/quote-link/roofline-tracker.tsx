"use client";

import { useState } from "react";
import { linkOpeningStep, openingStep, type TrackerStep, type TrackerStepKey } from "@/lib/quote-link/tracker";
import { smartApostrophes as say } from "@/lib/typography";
import { cn } from "@/lib/utils";

// "Where you're at" (round 17, Keenan, 2026-11-12): four steps as lights
// along a low roofline. Done steps are lit warm, the current one glows
// gently (still with reduce motion on), the ones after it are dim. Tap a
// step, its light or its name, to read it. In the meeting the current step
// is open to start; on the link nothing is until they have chosen
// (linkOpeningStep). "page" is the white customer link; "deck" is meeting
// mode, at the deck's sizes. Colours come from the theme's tokens, so it
// reads on the link's white and the meeting's navy alike; only the lit
// bulbs are a fixed warm white. The words are Keenan's
// (lib/quote-link/tracker.ts).

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
  closedUntilChosen = false,
}: {
  steps: TrackerStep[];
  // The heading (the link has one; the meeting's page has its own).
  title?: string | null;
  // "You pay nothing until it's installed and you're happy with it."
  pay?: string | null;
  tone?: "page" | "deck";
  className?: string;
  headingId?: string;
  // The link's rule: no step open to start until they have chosen.
  closedUntilChosen?: boolean;
}) {
  // The step that reads first keeps up as the steps move (a choice made at
  // the table, a booking on the link). A tapped step stays open until they
  // move on, then the step that is now news opens.
  const first = closedUntilChosen ? linkOpeningStep(steps) : openingStep(steps);
  const [picked, setPicked] = useState<{ key: TrackerStepKey; from: TrackerStepKey | null } | null>(null);
  // Once the steps move on, a tap is let go for good, so it never comes
  // back if they move back (React's adjust-state-while-rendering pattern).
  if (picked !== null && picked.from !== first) setPicked(null);
  const open = picked !== null && picked.from === first ? picked.key : first;
  const setOpen = (key: TrackerStepKey) => setPicked({ key, from: first });
  const shown = open === null ? null : (steps.find((step) => step.key === open) ?? steps[0]);
  const deck = tone === "deck";
  return (
    <section
      aria-labelledby={title ? headingId : undefined}
      aria-label={title ? undefined : "Where you're at"}
      className={cn("flex flex-col", className)}
      data-testid="tracker"
    >
      {title ? (
        // On the link, where no step is open to start, a quiet line beside
        // the heading says the steps open (Keenan's "Tap a step to read
        // it"), at no cost in height; "Click" with a mouse.
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <h2 id={headingId} className={cn("font-bold", deck ? "text-[length:var(--deck-body)]" : "text-xl")}>
            {say(title)}
          </h2>
          {closedUntilChosen ? (
            <p className="text-sm text-muted-foreground" data-testid="tracker-hint">
              <span className="pointer-fine:hidden">Tap a step to read it.</span>
              <span className="hidden pointer-fine:inline">Click a step to read it.</span>
            </p>
          ) : null}
        </div>
      ) : null}
      <div className={cn("relative w-full", deck ? "mt-2 h-[88px]" : "mt-2 h-16 lg:h-[76px]")}>
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
              className="absolute flex size-11 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center outline-none [-webkit-tap-highlight-color:transparent]"
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
                  // An outline, not a ring: a lit bulb's glow is a box
                  // shadow, which would hide a ring (round 17 critique).
                  open === step.key && "outline-2 outline-offset-2 outline-foreground outline-solid",
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
                "flex min-h-11 w-full cursor-pointer flex-col items-center justify-start gap-0.5 rounded-md px-0.5 py-1 text-center leading-tight outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                deck ? "text-[length:var(--deck-small)]" : "text-sm",
                step.state === "later" ? "text-muted-foreground" : "font-semibold",
              )}
              data-testid="tracker-step"
              data-step={step.key}
              data-state={step.state}
            >
              <span className={cn("text-balance", open === step.key && "underline decoration-2 underline-offset-4")}>{say(step.label)}</span>
              {step.date ? (
                <span className="font-normal text-muted-foreground tabular-nums" data-testid="tracker-date">
                  {step.date.short}
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ol>
      {/* On a laptop the link puts the step's words and the pay line side
          by side, each at a reading width, to keep the top short. The row
          is the live region, always present, so a step's words are read
          out when they appear, the first time too (the box itself is
          hidden until a step opens on the link). */}
      <div aria-live="polite" className={cn("flex flex-col", !deck && "lg:flex-row lg:items-center lg:gap-10")}>
      <div
        id="tracker-detail"
        hidden={shown === null}
        className={cn("mt-3 rounded-md bg-muted", deck ? "px-5 py-4" : "px-4 py-3 lg:max-w-2xl lg:flex-1")}
        data-testid="tracker-detail"
        data-step={shown?.key}
      >
        {shown ? (
          <>
            <p className={cn("font-semibold", deck ? "text-[length:var(--deck-small)] leading-[1.3]" : "text-base")}>
              {say(shown.label)}
              {shown.state === "done" ? <span className="font-normal text-muted-foreground">{" "}· Done</span> : null}
              {shown.date ? <span className="font-normal text-muted-foreground">{` · ${shown.date.long}`}</span> : null}
            </p>
            <p className={cn("mt-1 text-pretty", deck ? "text-[length:var(--deck-small)] leading-[1.3]" : "text-base")}>{say(shown.text)}</p>
          </>
        ) : null}
      </div>
      {pay ? (
        <p
          className={cn("mt-3 font-semibold text-pretty", deck ? "text-[length:var(--deck-small)] leading-[1.3]" : "text-base lg:max-w-sm")}
          data-testid="tracker-pay"
        >
          {say(pay)}
        </p>
      ) : null}
      </div>
    </section>
  );
}
