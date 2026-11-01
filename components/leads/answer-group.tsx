"use client";

import { FieldError } from "@/components/field-error";

// A one-tap question: big choices backed by real radio buttons, so they work
// with one thumb and with a keyboard or screen reader. Unlike a plain choice
// group, tapping the chosen answer again clears it, because every Find out
// question is optional.
export function AnswerGroup<T extends string>({
  name,
  legend,
  options,
  value,
  onChange,
  columns = 2,
  error,
}: {
  name: string;
  legend: string;
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (value: T | null) => void;
  columns?: 2 | 3 | 4;
  error?: string;
}) {
  const grid = { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-2 sm:grid-cols-4" }[columns];
  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={error ? `${name}-error` : undefined}>
      <legend className="mb-2 text-sm font-semibold">{legend}</legend>
      <div className={`grid gap-2 ${grid}`}>
        {options.map((option) => (
          <label
            key={option.value}
            className="flex min-h-12 cursor-pointer items-center justify-center rounded-md border border-input bg-background px-2 py-1 text-center text-base font-semibold leading-tight transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:disabled]:cursor-not-allowed has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background"
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              onClick={() => {
                if (value === option.value) onChange(null);
              }}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
      <FieldError id={`${name}-error`} message={error} />
    </fieldset>
  );
}
