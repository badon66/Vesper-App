"use client";

import { Check } from "lucide-react";
import { FieldError } from "@/components/field-error";
import { NOT_COLLECTED, NOT_COLLECTED_LABEL } from "@/lib/leads/questions";
import { cn } from "@/lib/utils";

// A one-tap question: big choices backed by real radio buttons, so they work
// with one thumb and with a keyboard or screen reader. The chosen answer is
// light on dark with a tick, not gold: gold is kept for the next step.
// Tapping the chosen answer again clears it. Round 2 (Keenan, 2026-11-03):
// a counted question also offers "Not collected", last and quieter, and the
// booking sheet's answers grow on a wide phone.
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
}: {
  name: string;
  legend: string;
  options: { value: T; label: string }[];
  value: T | string | null;
  // Not collected arrives as NOT_COLLECTED.
  onChange: (value: T | null) => void;
  columns?: 2 | 3 | 4;
  error?: string;
  // When the screen's heading already asks the question.
  hideLegend?: boolean;
  // Offer "Not collected" as the last answer.
  notCollected?: boolean;
  // The booking sheet's answers step up at 420 px and wider.
  size?: "form" | "sheet";
}) {
  const grid = { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-2 sm:grid-cols-4" }[columns];
  const choices: { value: string; label: string; quiet?: boolean }[] = [
    ...options,
    ...(notCollected ? [{ value: NOT_COLLECTED, label: NOT_COLLECTED_LABEL, quiet: true }] : []),
  ];
  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={error ? `${name}-error` : undefined} data-question={name}>
      <legend className={hideLegend ? "sr-only" : cn("mb-2 text-sm font-semibold", size === "sheet" && "min-[420px]:text-base")}>
        {legend}
      </legend>
      <div className={`grid gap-2 ${grid}`}>
        {choices.map((option) => (
          <label
            key={option.value}
            data-answer={option.value}
            className={cn(
              "group flex min-h-12 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-input bg-background px-2 py-1 text-center text-base font-semibold leading-tight transition-colors has-[:checked]:border-foreground has-[:checked]:bg-foreground has-[:checked]:text-background has-[:disabled]:cursor-not-allowed has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background",
              option.quiet && "border-dashed font-medium text-muted-foreground",
              size === "sheet" && "min-[420px]:min-h-14 min-[420px]:text-lg",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value as T)}
              onClick={() => {
                if (value === option.value) onChange(null);
              }}
              className="sr-only"
            />
            <Check aria-hidden="true" className="hidden size-4 shrink-0 group-has-[:checked]:block" />
            {option.label}
          </label>
        ))}
      </div>
      <FieldError id={`${name}-error`} message={error} />
    </fieldset>
  );
}
