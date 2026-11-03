import { CircleAlert } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// One meeting on the Meetings page: when, who, where, anything to fix
// before leaving, and a big Start. The next meeting tonight gets the one
// gold Start on the page; the rest are outlined, just as big.

export type MeetingItemData = {
  meetingId: string;
  leadId: string;
  time: string;
  name: string;
  address: string;
  // Only when someone else hosts it.
  host: string | null;
  // Tonight, once Keenan has marked how it went.
  outcome: string | null;
  missingMockup: boolean;
  missingColour: boolean;
  // "6 of 8 collected" (round 2): information only.
  completeness: string;
  next: boolean;
  // The latest change to anything its meeting page shows (the lead, its
  // mockup, Settings), so an older save counts as out of date.
  changedAt: string;
};

// Upcoming meetings are reference, not tonight: a compact card, a
// normal-height Start.
export function MeetingItem({
  item,
  compact = false,
  children,
}: {
  item: MeetingItemData;
  compact?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <li
      className={cn(
        "flex flex-col rounded-xl border sm:flex-row sm:items-center",
        compact ? "gap-2 p-3 sm:gap-5 sm:px-4" : "gap-4 p-4 sm:gap-6 sm:p-5",
        item.outcome && "opacity-70",
      )}
      data-testid="meeting-item"
      data-lead={item.leadId}
    >
      <p className={cn("shrink-0 font-bold tabular-nums", compact ? "text-lg sm:w-28" : "text-2xl sm:w-32")}>{item.time}</p>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className={cn("font-semibold text-pretty", compact ? "text-base" : "text-lg")}>{item.name}</p>
        <p className="text-pretty text-muted-foreground">{item.address}</p>
        <p className="text-sm text-muted-foreground" data-testid="completeness">
          {item.completeness}
        </p>
        {item.host ? <p className="text-sm text-muted-foreground">Host: {item.host}</p> : null}
        {item.outcome ? <p className="text-sm font-semibold">{item.outcome}</p> : null}
        {item.missingMockup || item.missingColour ? (
          <ul className="mt-1 flex flex-col" aria-label="To fix before the meeting">
            {item.missingMockup ? (
              <li className="flex flex-wrap items-center gap-x-2 text-sm font-semibold">
                <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
                No mockup yet.
                <Link
                  href={`/app/leads/${item.leadId}#mockup`}
                  className="inline-flex min-h-11 items-center font-normal underline underline-offset-4"
                >
                  Add it on the lead page
                </Link>
              </li>
            ) : null}
            {item.missingColour ? (
              <li className="flex flex-wrap items-center gap-x-2 text-sm font-semibold">
                <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
                No track colour yet.
                <Link
                  href={`/app/leads/${item.leadId}#track-colour`}
                  className="inline-flex min-h-11 items-center font-normal underline underline-offset-4"
                >
                  Set it on the lead page
                </Link>
              </li>
            ) : null}
          </ul>
        ) : null}
        {children}
      </div>
      <Button
        asChild
        size="lg"
        variant={item.next ? "default" : "outline"}
        className={cn("shrink-0", compact ? "h-11 px-6 text-base" : "h-14 px-10 text-lg")}
      >
        {/* A full page load on purpose: it lets the service worker keep the
            meeting page for a reload without signal. */}
        <a href={`/meeting/${item.leadId}#start`} aria-label={`Start the meeting with ${item.name}`}>
          Start
        </a>
      </Button>
    </li>
  );
}
