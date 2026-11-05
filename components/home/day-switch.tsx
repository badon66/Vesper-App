"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// Today and Tomorrow on Home (Keenan, 2026-11-05): two plain segments that
// swap the list in place, with no reload. Both lists are drawn on the
// server; this only chooses which one shows. It opens on Today every time,
// and the heading names the evening on screen ("Meetings tomorrow"), so a
// list scrolled past the switch still says which evening it is.
export function DaySwitch({
  headingId,
  days,
  testId,
}: {
  headingId: string;
  days: { label: string; title: string; count: number; content: ReactNode }[];
  testId?: string;
}) {
  const [chosen, setChosen] = useState(0);
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3" data-testid={testId}>
      <h2 id={headingId} className="text-lg font-bold" aria-live="polite">
        {days[chosen]?.title}
      </h2>
      <div role="group" aria-label="Which evening" className="grid grid-cols-2 gap-1 rounded-md border p-1">
        {days.map((day, index) => (
          <button
            key={day.label}
            type="button"
            aria-pressed={index === chosen}
            onClick={() => setChosen(index)}
            className={cn(
              "min-h-11 rounded px-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring",
              index === chosen ? "bg-secondary text-foreground" : "text-muted-foreground",
            )}
            data-day={day.label}
          >
            {day.label} <span className="tabular-nums">({day.count})</span>
          </button>
        ))}
      </div>
      {days.map((day, index) => (
        <div key={day.label} hidden={index !== chosen} data-day-list={day.label}>
          {day.content}
        </div>
      ))}
    </section>
  );
}
