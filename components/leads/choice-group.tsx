import { Check } from "lucide-react";
import { FieldError } from "@/components/field-error";

// Big tap-sized choices backed by real radio buttons, so they work with one
// thumb and with a keyboard or screen reader. The chosen one is light on dark
// with a tick, like the Find out answers: gold is kept for the next step
// (2026-11-03).
export function ChoiceGroup<T extends string>({
  name,
  legend,
  options,
  defaultValue,
  columns = 2,
  error,
  onChange,
  hideLegend = false,
}: {
  name: string;
  legend: string;
  options: { value: T; label: string; hint?: string }[];
  defaultValue?: T | null;
  columns?: 2 | 3 | 4;
  error?: string;
  onChange?: (value: T) => void;
  // When a heading right above already names the question.
  hideLegend?: boolean;
}) {
  const grid = { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-2 sm:grid-cols-4" }[columns];
  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={error ? `${name}-error` : undefined}>
      <legend className={hideLegend ? "sr-only" : "mb-2 text-sm font-semibold"}>{legend}</legend>
      <div className={`grid gap-2 ${grid}`}>
        {options.map((option) => (
          <label
            key={option.value}
            className="group flex min-h-12 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-input bg-background px-3 text-center text-base font-semibold transition-colors has-[:checked]:border-foreground has-[:checked]:bg-foreground has-[:checked]:text-background has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background"
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              defaultChecked={defaultValue === option.value}
              onChange={onChange ? () => onChange(option.value) : undefined}
              className="sr-only"
            />
            <Check aria-hidden="true" className="hidden size-4 shrink-0 group-has-[:checked]:block" />
            {option.hint ? (
              <span className="flex flex-col py-1">
                <span>{option.label}</span>
                <span className="text-sm font-normal">{option.hint}</span>
              </span>
            ) : (
              option.label
            )}
          </label>
        ))}
      </div>
      <FieldError id={`${name}-error`} message={error} />
    </fieldset>
  );
}
