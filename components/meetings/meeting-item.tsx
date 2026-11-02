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
  next: boolean;
  // The latest change to anything its meeting page shows (the lead, its
  // mockup, Settings), so an older save counts as out of date.
  changedAt: string;
};

export function MeetingItem({ item, children }: { item: MeetingItemData; children?: React.ReactNode }) {
  return (
    <li
      className={cn("flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center sm:gap-6 sm:p-5", item.outcome && "opacity-70")}
      data-testid="meeting-item"
      data-lead={item.leadId}
    >
      <p className="shrink-0 text-2xl font-bold tabular-nums sm:w-32">{item.time}</p>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-lg font-semibold text-pretty">{item.name}</p>
        <p className="text-pretty text-muted-foreground">{item.address}</p>
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
      <Button asChild size="lg" variant={item.next ? "default" : "outline"} className="h-14 shrink-0 px-10 text-lg">
        {/* A full page load on purpose: it lets the service worker keep the
            meeting page for a reload without signal. */}
        <a href={`/meeting/${item.leadId}#start`} aria-label={`Start the meeting with ${item.name}`}>
          Start
        </a>
      </Button>
    </li>
  );
}
