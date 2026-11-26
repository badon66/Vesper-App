"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { pickWeeks, type PickDay } from "@/lib/installs/calendar";
import { cn } from "@/lib/utils";

// Round 23: Keenan's own install day picker (the Accepted sheet, the lead's
// install day). Only his open days can be picked; full ones show greyed
// with "Full"; days in between that aren't open are shaded. The chosen day
// is the foreground colour with a tick. With no open days it says where to
// open some.

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const monthShort = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", month: "short" });
const dayLabel = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" });
const asDate = (day: string) => new Date(`${day}T12:00:00Z`);

export function InstallDayChooser({
  days,
  chosen,
  onChoose,
  label,
  testId = "install-day-chooser",
}: {
  days: PickDay[];
  chosen: string | null;
  onChoose: (day: string) => void;
  label: string;
  testId?: string;
}) {
  const weeks = pickWeeks(days, chosen);
  if (weeks.length === 0) {
    return (
      <p className="rounded-md border border-input px-3 py-3 text-pretty text-muted-foreground" data-testid={`${testId}-empty`}>
        No open install days yet.{" "}
        <Link href="/app/admin/installs" className="font-semibold text-foreground underline underline-offset-4">
          Open some on Installs
        </Link>
        .
      </p>
    );
  }
  const first = weeks.flat().find((cell) => cell !== null)?.day ?? null;
  return (
    <div role="grid" aria-label={label} className="flex flex-col gap-1" data-testid={testId}>
      <div role="row" className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((name, at) => (
          <span key={at} role="columnheader" className="text-center text-xs text-muted-foreground">
            {name}
          </span>
        ))}
      </div>
      {weeks.map((week, at) => (
        <div key={at} role="row" className="grid grid-cols-7 gap-1">
          {week.map((cell, column) => {
            if (!cell) return <span key={column} role="gridcell" aria-hidden="true" />;
            const date = asDate(cell.day);
            const showMonth = cell.day === first || date.getUTCDate() === 1;
            const month = showMonth ? <span className="text-[11px] leading-none">{monthShort.format(date)}</span> : null;
            if (cell.kind === "closed") {
              return (
                <span key={cell.day} role="gridcell" aria-hidden="true" className="flex h-12 flex-col items-center justify-center rounded-md bg-muted/40 text-sm text-muted-foreground/70 tabular-nums">
                  {date.getUTCDate()}
                  {month}
                </span>
              );
            }
            const isChosen = cell.day === chosen;
            const full = cell.kind === "full";
            return (
              <span key={cell.day} role="gridcell">
                <button
                  type="button"
                  disabled={full}
                  aria-pressed={isChosen}
                  aria-label={`${dayLabel.format(date)}${full ? ", full" : ""}`}
                  data-day={cell.day}
                  data-kind={cell.kind}
                  onClick={() => onChoose(cell.day)}
                  className={cn(
                    "flex h-12 w-full flex-col items-center justify-center rounded-md border text-sm font-semibold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isChosen
                      ? "border-foreground bg-foreground text-background"
                      : full
                        ? "cursor-not-allowed border-transparent bg-muted text-muted-foreground"
                        : "border-input bg-background hover:bg-muted",
                  )}
                >
                  <span className="flex items-center gap-0.5 leading-none">
                    {date.getUTCDate()}
                    {isChosen ? <Check aria-hidden="true" className="size-3.5" strokeWidth={3} /> : null}
                  </span>
                  {full ? <span className="text-[11px] leading-none font-normal">Full</span> : month}
                </button>
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}
