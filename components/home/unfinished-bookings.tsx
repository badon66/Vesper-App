"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, useState, useSyncExternalStore } from "react";
import { deleteUnfinished } from "@/components/booking/booking-sheet";
import { Button } from "@/components/ui/button";
import { useViewAs } from "@/components/view-as-context";
import { draftAge, draftName, readDrafts, type SheetDraftRecord } from "@/lib/booking/drafts";
import { rawDrafts, subscribeDrafts } from "@/lib/booking/drafts-browser";
import type { SheetScreen } from "@/lib/booking/sheet";
import { bookingSheet } from "@/lib/booking/sheet-store";
import { cn } from "@/lib/utils";

// Where each draft was left, as the steps are named.
const STOPPED_AT: Record<SheetScreen, string> = {
  who: "the name",
  door: "the three questions",
  learned: "what they learned",
  address: "the house",
  house: "the photos",
  book: "Book",
};

// The minute, for each draft's age; it ticks over once a minute.
function subscribeMinute(onChange: () => void) {
  const timer = window.setInterval(onChange, 60_000);
  return () => window.clearInterval(timer);
}
const thisMinute = () => Math.floor(Date.now() / 60_000);

// Unfinished bookings (round 2, Keenan, 2026-11-03; on Session from
// 2026-11-05): what a setter
// entered in the booking sheet and left, kept on this phone for 24 hours.
// Tapping one reopens the sheet, asks for a time, then picks up where they
// left off. Nothing shows when there are none, and nothing while Keenan
// views the app as someone: their drafts are on their own phone.
// compact (Session, 2026-11-05): one row saying how many there are, which
// opens the list, so the knocking view stays one screen and a draft is
// still in sight.
export function UnfinishedBookings({ userId, compact = false }: { userId: string; compact?: boolean }) {
  const { viewingAs, name } = useViewAs();
  const [open, setOpen] = useState(false);
  // The draft tapped, showing its two choices.
  const [chosen, setChosen] = useState<string | null>(null);
  const raw = useSyncExternalStore(subscribeDrafts, () => rawDrafts(userId), () => null);
  const minute = useSyncExternalStore(subscribeMinute, thisMinute, () => 0);
  const drafts = useMemo(() => (minute === 0 ? [] : readDrafts(raw, minute * 60_000 + 59_999)), [raw, minute]);

  // Keenan is told why there's no list. It's what a phone holds, so the View
  // as comparison leaves it out, like the welcome's device steps.
  if (viewingAs) {
    return (
      <p className="text-sm text-pretty text-muted-foreground" data-device data-testid="unfinished-view-as">
        Unfinished bookings stay on {name ? `${name}'s` : "their"} phone, so they don&apos;t show here.
      </p>
    );
  }
  if (drafts.length === 0) return null;

  const list = (
    <ul className="flex flex-col divide-y rounded-md border" aria-label="Unfinished bookings">
      {drafts.map((record) => (
        <UnfinishedRow
          key={record.id}
          record={record}
          now={minute * 60_000 + 30_000}
          open={chosen === record.id}
          onToggle={() => setChosen(chosen === record.id ? null : record.id)}
          onDelete={() => {
            setChosen(null);
            void deleteUnfinished(userId, record.id);
          }}
        />
      ))}
    </ul>
  );

  if (compact) {
    return (
      <section aria-labelledby="unfinished-heading" className="flex flex-col gap-2" data-testid="unfinished">
        <h2 id="unfinished-heading" className="sr-only">
          Unfinished
        </h2>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md border-2 border-foreground/60 px-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="unfinished-toggle"
        >
          <span className="font-semibold">{drafts.length === 1 ? "1 unfinished booking" : `${drafts.length} unfinished bookings`}</span>
          <span className="flex items-center gap-1 text-sm text-muted-foreground">
            On this phone
            <ChevronDown aria-hidden="true" className={cn("size-5 shrink-0", open && "rotate-180")} />
          </span>
        </button>
        {open ? (
          <>
            <p className="text-sm text-pretty text-muted-foreground">Tap one to carry on or delete it. Each is kept for 24 hours.</p>
            {list}
          </>
        ) : null}
      </section>
    );
  }

  return (
    <section aria-labelledby="unfinished-heading" className="flex flex-col gap-3" data-testid="unfinished">
      <div>
        <h2 id="unfinished-heading" className="text-lg font-bold">
          Unfinished
        </h2>
        <p className="text-sm text-pretty text-muted-foreground">
          Bookings you started on this phone. Tap one to pick up where you left off, or to delete it. Each is kept for 24 hours.
        </p>
      </div>
      {list}
    </section>
  );
}

// One unfinished booking (round 5, Keenan, 2026-11-06). A tap shows two
// choices: pick up where you left off, or Delete. Delete asks for a second,
// deliberate tap ("Tap again to delete"), so it's three taps in all and
// can't happen by accident. A person already saved as a lead stays in
// Leads, and the confirm says so.
function UnfinishedRow({
  record,
  now,
  open,
  onToggle,
  onDelete,
}: {
  record: SheetDraftRecord;
  now: number;
  open: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const address = [record.draft.address_line, record.draft.neighbourhood].filter((part) => part.trim()).join(", ");
  const name = draftName(record.draft);
  const saved = Boolean(record.draft.leadId);
  return (
    <li data-testid="unfinished-row" data-draft={record.id}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          setConfirming(false);
          onToggle();
        }}
        className="flex min-h-16 w-full items-center justify-between gap-3 px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="unfinished-item"
        data-draft={record.id}
      >
        <span className="flex min-w-0 flex-col">
          <span className="font-semibold">{name}</span>
          <span className="truncate text-sm text-muted-foreground">{address || "No address yet"}</span>
          <span className="text-sm text-muted-foreground">
            Stopped at {STOPPED_AT[record.screen]}, {draftAge(record.savedAt, now)}
          </span>
        </span>
        <ChevronDown aria-hidden="true" className={cn("size-5 shrink-0 text-muted-foreground", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="flex flex-col gap-2 px-4 pb-3" data-testid="unfinished-choices">
          {/* One above the other: side by side they don't fit a 390-wide
              phone, and apart they're harder to mis-tap. */}
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              size="lg"
              className="h-12 w-full"
              onClick={() => bookingSheet.open({ kind: "draft", draftId: record.id })}
              data-testid="unfinished-pick-up"
            >
              Pick up where you left off
              <ChevronRight aria-hidden="true" className="size-4" />
            </Button>
            <Button
              type="button"
              size="lg"
              variant="outline"
              className={cn("h-12 w-full", confirming && "border-2 border-foreground font-bold")}
              aria-describedby={confirming ? `unfinished-confirm-${record.id}` : undefined}
              onClick={() => (confirming ? onDelete() : setConfirming(true))}
              data-testid="unfinished-delete"
              data-confirming={confirming ? "yes" : "no"}
            >
              {confirming ? "Tap again to delete" : "Delete"}
            </Button>
          </div>
          {confirming ? (
            <p id={`unfinished-confirm-${record.id}`} role="status" className="text-sm text-pretty" data-testid="unfinished-confirm">
              {saved
                ? `This deletes what's on this phone. ${name} is saved, so they stay in Leads.`
                : "This deletes what's on this phone, and any time it holds is let go."}
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
