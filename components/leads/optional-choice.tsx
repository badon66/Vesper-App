"use client";

import { useState } from "react";
import { AnswerGroup } from "@/components/leads/answer-group";

// An optional one-tap answer in a form (round 3: house type, the setter's
// read, call or text on New lead and the lead's edit page). The same answers
// as the questions around it, so tapping the chosen one again clears it, as
// the page says; the chosen radio carries the value with the form.
export function OptionalChoice<T extends string>({
  name,
  legend,
  options,
  defaultValue,
  columns = 2,
  error,
}: {
  name: string;
  legend: string;
  options: { value: T; label: string }[];
  defaultValue?: T | null;
  columns?: 2 | 3 | 4;
  error?: string;
}) {
  const [value, setValue] = useState<T | null>(defaultValue ?? null);
  return (
    <AnswerGroup
      name={name}
      legend={legend}
      options={options}
      columns={columns}
      value={value}
      error={error}
      onChange={(next) => setValue((next as T | null) ?? null)}
    />
  );
}
