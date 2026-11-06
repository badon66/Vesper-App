"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

// Any that apply (round 3, 2026-11-05: the hot buttons), backed by real
// checkboxes, the same big tap-sized choices as the one-tap answers: chosen
// is light on dark with a tick, never gold. An exclusive choice (Not sure)
// clears the others, and any other choice clears it. In a form the boxes
// carry the name; in the booking sheet it is controlled.
export function CheckGroup<T extends string>({
  name,
  legend,
  hint,
  options,
  value,
  defaultValue = [],
  exclusive,
  onChange,
  size = "form",
  hideLegend = false,
}: {
  name: string;
  legend: string;
  hint?: string;
  options: { value: T; label: string }[];
  // Controlled (the sheet) or uncontrolled with defaultValue (a form).
  value?: T[];
  defaultValue?: T[];
  exclusive?: T;
  onChange?: (next: T[]) => void;
  size?: "form" | "sheet";
  hideLegend?: boolean;
}) {
  const [own, setOwn] = useState<T[]>(defaultValue);
  const chosen = value ?? own;

  function toggle(option: T) {
    let next: T[];
    if (chosen.includes(option)) next = chosen.filter((item) => item !== option);
    else if (option === exclusive) next = [option];
    else next = [...chosen.filter((item) => item !== exclusive), option];
    if (value === undefined) setOwn(next);
    onChange?.(next);
  }

  return (
    <fieldset className="flex flex-col gap-2" data-question={name}>
      <legend className={hideLegend ? "sr-only" : cn("mb-2 font-semibold", size === "sheet" ? "text-sm min-[420px]:text-base" : "text-sm")}>
        {legend}
        {hint ? <span className="font-normal text-muted-foreground"> {hint}</span> : null}
      </legend>
      <div className="grid grid-cols-2 gap-2">
        {options.map((option) => {
          const on = chosen.includes(option.value);
          return (
            <label
              key={option.value}
              data-answer={option.value}
              className={cn(
                "flex min-h-12 cursor-pointer items-center justify-center rounded-md border border-input bg-background px-2 py-1 text-center text-base leading-tight font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background",
                size === "sheet" && "min-[420px]:min-h-14 min-[420px]:text-lg",
                on && "border-foreground bg-foreground text-background",
              )}
            >
              <input type="checkbox" name={name} value={option.value} checked={on} onChange={() => toggle(option.value)} className="sr-only" />
              {/* The same type and tick as a one-tap answer: the tick runs in
                  the words' own line, so choosing never moves them. */}
              <span>
                {on ? <Check aria-hidden="true" className="mr-1 inline-block size-4 align-[-0.15em]" /> : null}
                {option.label}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
