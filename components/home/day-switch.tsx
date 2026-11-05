"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// Today and Tomorrow on Home (Keenan, 2026-11-05): two plain segments that
// swap the list in place, with no reload. Both lists are drawn on the
// server; this only chooses which one shows. It opens on Today every time.
export function DaySwitch({
  heading,
  headingId,
  days,
  testId,
}: {
  heading: string;
  headingId: string;
  days: { label: string; count: number; content: ReactNode }[];
  testId?: string;
}) {
  const [chosen, setChosen] = useState(0);
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3" data-testid={testId}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 id={headingId} className="text-lg font-bold">
          {heading}
        </h2>
        <div role="group" aria-label={`${heading}: which day`} className="grid grid-cols-2 gap-1 rounded-md border p-1">
          {days.map((day, index) => (
            <button
              key={day.label}
              type="button"
              aria-pressed={index === chosen}
              onClick={() => setChosen(index)}
              className={cn(
                "min-h-11 rounded px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
                index === chosen ? "bg-secondary font-bold" : "font-semibold text-muted-foreground",
              )}
              data-day={day.label}
            >
              {day.label} <span className="tabular-nums">({day.count})</span>
            </button>
          ))}
        </div>
      </div>
      {days.map((day, index) => (
        <div key={day.label} hidden={index !== chosen} data-day-list={day.label}>
          {day.content}
        </div>
      ))}
    </section>
  );
}
