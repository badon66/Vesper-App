"use client";

import { ChevronRight } from "lucide-react";
import { useMemo, useSyncExternalStore } from "react";
import { useViewAs } from "@/components/view-as-context";
import { draftAge, draftName, readDrafts } from "@/lib/booking/drafts";
import { rawDrafts, subscribeDrafts } from "@/lib/booking/drafts-browser";
import { stepCount } from "@/lib/booking/sheet";
import { bookingSheet } from "@/lib/booking/sheet-store";

// The minute, for each draft's age; it ticks over once a minute.
function subscribeMinute(onChange: () => void) {
  const timer = window.setInterval(onChange, 60_000);
  return () => window.clearInterval(timer);
}
const thisMinute = () => Math.floor(Date.now() / 60_000);

// Unfinished bookings on Home (round 2, Keenan, 2026-11-03): what a setter
// entered in the booking sheet and left, kept on this phone for 24 hours.
// Tapping one reopens the sheet, asks for a time, then picks up where they
// left off. Nothing shows when there are none, and nothing while Keenan
// views the app as someone: their drafts are on their own phone.
export function UnfinishedBookings({ userId }: { userId: string }) {
  const { viewingAs } = useViewAs();
  const raw = useSyncExternalStore(subscribeDrafts, () => rawDrafts(userId), () => null);
  const minute = useSyncExternalStore(subscribeMinute, thisMinute, () => 0);
  const drafts = useMemo(() => (minute === 0 ? [] : readDrafts(raw, minute * 60_000 + 59_999)), [raw, minute]);

  if (viewingAs || drafts.length === 0) return null;

  return (
    <section aria-labelledby="unfinished-heading" className="flex flex-col gap-3" data-testid="unfinished">
      <div>
        <h2 id="unfinished-heading" className="text-lg font-bold">
          Unfinished
        </h2>
        <p className="text-sm text-pretty text-muted-foreground">
          Bookings you started on this phone. Tap one, pick a time, and carry on where you left off. Each is kept for 24 hours.
        </p>
      </div>
      <ul className="flex flex-col divide-y rounded-md border" aria-label="Unfinished bookings">
        {drafts.map((record) => {
          const address = [record.draft.address_line, record.draft.neighbourhood].filter((part) => part.trim()).join(", ");
          const { number, total } = stepCount(record.screen);
          return (
            <li key={record.id}>
              <button
                type="button"
                onClick={() => bookingSheet.open({ kind: "draft", draftId: record.id })}
                className="flex min-h-16 w-full items-center justify-between gap-3 px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-testid="unfinished-item"
                data-draft={record.id}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="font-semibold">{draftName(record.draft)}</span>
                  <span className="truncate text-sm text-muted-foreground">{address || "No address yet"}</span>
                  <span className="text-sm text-muted-foreground">
                    Stopped at step {number} of {total}, {draftAge(record.savedAt, minute * 60_000 + 30_000)}
                  </span>
                </span>
                <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
