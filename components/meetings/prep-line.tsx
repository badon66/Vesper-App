import { Check, ChevronRight, CircleAlert } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

// What a meeting still needs before Keenan walks in (round 7, Keenan,
// 2026-11-08): "Ready", or "Prepare for the meeting" with what's left. The
// whole line opens the prep list, where each item can be done right there.
// The same line on the Meetings page and his Home. Owner only.
export type PrepGlance = { ready: boolean; left: number; line: string };

export function PrepLine({ leadId, prep, compact = false }: { leadId: string; prep: PrepGlance; compact?: boolean }) {
  return (
    <Link
      href={`/app/meetings/prep/${leadId}`}
      className={cn(
        "-mx-1 flex min-h-11 items-center gap-2 rounded px-1 text-sm outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring",
        compact ? "" : "mt-1",
      )}
      data-testid="prep-line"
      data-ready={prep.ready ? "true" : "false"}
    >
      {prep.ready ? (
        <Check aria-hidden="true" className="size-4 shrink-0" />
      ) : (
        <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
      )}
      <span className="min-w-0 flex-1 text-pretty">
        {prep.ready ? (
          <span className="font-semibold">Ready</span>
        ) : compact ? (
          // Home: a glance, so the count and what it is, on one line.
          <span className="font-semibold">{prep.line}</span>
        ) : (
          <>
            <span className="font-semibold">Prepare for the meeting</span>
            <span className="text-muted-foreground"> · {prep.line}</span>
          </>
        )}
      </span>
      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
