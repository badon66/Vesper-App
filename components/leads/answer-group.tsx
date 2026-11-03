"use client";

import { Check } from "lucide-react";
import { FieldError } from "@/components/field-error";
import { NOT_COLLECTED, NOT_COLLECTED_LABEL } from "@/lib/leads/questions";
import { cn } from "@/lib/utils";

// The quiet "Not collected" answer beside a question (round 2): dashed until
// chosen, then light on dark with a tick like any chosen answer. It sits in
// the question's own line, so it costs no extra row; its touch area is the
// full 44 px, reaching into the space around the line.
export const NOT_COLLECTED_CHIP =
  "relative -my-2.5 inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-input bg-background px-3 text-sm font-medium text-muted-foreground transition-colors";
export const NOT_COLLECTED_CHIP_ON = "border-solid border-foreground bg-foreground text-background";

// A one-tap question: big choices backed by real radio buttons, so they work
// with one thumb and with a keyboard or screen reader. The chosen answer is
// light on dark with a tick, not gold: gold is kept for the next step.
// Tapping the chosen answer again clears it. Round 2 (Keenan, 2026-11-03):
// a counted question also offers "Not collected", beside the question, and
// the booking sheet's answers grow on a wide phone.
export function AnswerGroup<T extends string>({
  name,
  legend,
  options,
  value,
  onChange,
  columns = 2,
  error,
  hideLegend = false,
  notCollected = false,
  size = "form",
  describedBy,
}: {
  name: string;
  legend: string;
  options: { value: T; label: string }[];
  value: T | string | null;
  // Not collected arrives as NOT_COLLECTED.
  onChange: (value: T | null) => void;
  // Four in a row take smaller words on a narrow phone, so they fit one row.
  columns?: 2 | 3 | 4;
  error?: string;
  // When the screen's heading already asks the question.
  hideLegend?: boolean;
  // Offer "Not collected" beside the question.
  notCollected?: boolean;
  // The booking sheet's answers step up at 420 px and wider.
  size?: "form" | "sheet";
  // A note about the question, shown elsewhere on the screen.
  describedBy?: string;
}) {
  const grid = { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4" }[columns];
  const radio = (optionValue: string) => (
    <input
      type="radio"
      name={name}
      value={optionValue}
      checked={value === optionValue}
      onChange={() => onChange(optionValue as T)}
      onClick={() => {
        if (value === optionValue) onChange(null);
      }}
      className="sr-only"
    />
  );
  const marked = value === NOT_COLLECTED;
  return (
    <fieldset
      className={cn("flex flex-col", notCollected ? "gap-3" : "gap-2")}
      aria-describedby={[describedBy, error ? `${name}-error` : null].filter(Boolean).join(" ") || undefined}
      data-question={name}
    >
      <legend className={hideLegend || notCollected ? "sr-only" : cn("mb-2 text-sm font-semibold", size === "sheet" && "min-[420px]:text-base")}>
        {legend}
      </legend>
      {notCollected ? (
        <div className="flex items-center justify-between gap-3">
          <span
            aria-hidden="true"
            className={cn("text-sm font-semibold text-pretty", size === "sheet" && "min-[420px]:text-base", hideLegend && "invisible")}
          >
            {legend}
          </span>
          <label
            data-answer={NOT_COLLECTED}
            className={cn(
              NOT_COLLECTED_CHIP,
              "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background",
              marked && NOT_COLLECTED_CHIP_ON,
            )}
          >
            {radio(NOT_COLLECTED)}
            {marked ? <Check aria-hidden="true" className="size-4 shrink-0" /> : null}
            {NOT_COLLECTED_LABEL}
          </label>
        </div>
      ) : null}
      <div className={`grid gap-2 ${grid}`}>
        {options.map((option) => (
          <label
            key={option.value}
            data-answer={option.value}
            className={cn(
              "group flex min-h-12 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-input bg-background px-2 py-1 text-center text-base font-semibold leading-tight transition-colors has-[:checked]:border-foreground has-[:checked]:bg-foreground has-[:checked]:text-background has-[:disabled]:cursor-not-allowed has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background",
              columns === 4 && "max-[419px]:text-sm",
              size === "sheet" && "min-[420px]:min-h-14 min-[420px]:text-lg",
            )}
          >
            {radio(option.value)}
            <Check aria-hidden="true" className="hidden size-4 shrink-0 group-has-[:checked]:block" />
            {option.label}
          </label>
        ))}
      </div>
      <FieldError id={`${name}-error`} message={error} />
    </fieldset>
  );
}
