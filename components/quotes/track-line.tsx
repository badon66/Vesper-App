"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";

import { smartApostrophes as say } from "@/lib/typography";
import { cn } from "@/lib/utils";

// A track's line in a breakdown (round 18, Keenan, 2026-11-12): "Standard
// track, 165 ft at $24 a foot, $3,960", a tap on it drops down every area on
// that track with its feet and price. The same line in the quote editor,
// meeting mode's Your price and the customer's link; each passes its own
// sizes. Closed to start. The PDF lists the areas under it, always open.

export type TrackArea = { label: string; detail: string | null; amount: string };

export function TrackLine({
  label,
  detail,
  amount,
  areas,
  detailClassName,
  areaClassName,
  rowClassName,
  testId = "track-line",
}: {
  label: string;
  detail: string | null;
  amount: string;
  areas: TrackArea[];
  // The detail's own type size and colour, as the breakdown around it has.
  detailClassName?: string;
  areaClassName?: string;
  rowClassName?: string;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  return (
    <div className={cn("flex flex-col", rowClassName)} data-testid={testId} data-line={label} data-open={open ? "true" : "false"}>
      <div className="flex items-baseline justify-between gap-4">
        <dt className="min-w-0">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={listId}
            onClick={() => setOpen((now) => !now)}
            className="-mx-1 inline-flex min-h-11 items-center gap-1.5 rounded-md px-1 text-left font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="track-line-toggle"
          >
            <span>{say(label)}</span>
            <ChevronDown aria-hidden="true" className={cn("size-4 shrink-0 transition-transform duration-200 motion-reduce:transition-none", open && "rotate-180")} />
          </button>
        </dt>
        <dd className="shrink-0 font-semibold tabular-nums">{amount}</dd>
      </div>
      {detail ? <p className={detailClassName}>{say(detail)}</p> : null}
      <dd id={listId} hidden={!open}>
        {open ? (
          <ul className={cn("mt-1 flex flex-col border-l-2 border-border pl-3", areaClassName)} data-testid="track-areas">
            {areas.map((area, at) => (
              <li key={at} className="flex items-baseline justify-between gap-4 py-1" data-testid="track-area">
                <span className="min-w-0">
                  <span>{say(area.label)}</span>
                  {area.detail ? <span className={cn("block", detailClassName)}>{say(area.detail)}</span> : null}
                </span>
                <span className="shrink-0 tabular-nums">{area.amount}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </dd>
    </div>
  );
}
