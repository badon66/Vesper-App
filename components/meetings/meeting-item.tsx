import { PrepLine, type PrepGlance } from "@/components/meetings/prep-line";
import { ConfirmedTick } from "@/components/meetings/confirmed-tick";
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
  // Round 7: Ready, or what's left on the prep list; null once marked.
  prep: PrepGlance | null;
  // Round 7: when Keenan confirmed the time with them.
  confirmed: boolean;
  // "6 of 8 collected" (round 2): information only.
  completeness: string;
  // Round 12: "Someone who decides won't be there." or "Not asked yet
  // whether everyone who decides will be there.", as the meeting carries
  // it; null when everyone will be there, or once the meeting is marked.
  everyone: string | null;
  // The setter's read and hot buttons (round 3), or null.
  read: string | null;
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
      <div className={cn("flex shrink-0 flex-row items-baseline gap-3 sm:flex-col sm:gap-1", compact ? "sm:w-28" : "sm:w-32")}>
        <p className={cn("font-bold tabular-nums", compact ? "text-lg" : "text-2xl")}>{item.time}</p>
        {item.confirmed ? <ConfirmedTick /> : null}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className={cn("font-semibold text-pretty", compact ? "text-base" : "text-lg")}>{item.name}</p>
        <p className="text-pretty text-muted-foreground">{item.address}</p>
        <p className="text-sm text-muted-foreground" data-testid="completeness">
          {item.completeness}
        </p>
        {item.everyone ? (
          <p className="text-sm font-semibold text-pretty" data-testid="everyone-deciding">
            {item.everyone}
          </p>
        ) : null}
        {item.read ? (
          <p className="text-sm font-semibold text-pretty" data-testid="setter-read-line">
            {item.read}
          </p>
        ) : null}
        {item.host ? <p className="text-sm text-muted-foreground">Host: {item.host}</p> : null}
        {item.outcome ? <p className="text-sm font-semibold">{item.outcome}</p> : null}
        {item.prep ? <PrepLine leadId={item.leadId} prep={item.prep} /> : null}
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
