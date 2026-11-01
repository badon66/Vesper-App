"use client";

import { useState, useTransition } from "react";
import { releaseMyHold } from "@/app/(app)/app/schedule/actions";
import { AnswerGroup } from "@/components/leads/answer-group";
import { HoldSync } from "@/components/schedule/hold-keeper";
import { TimePicker } from "@/components/schedule/time-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BoardSlot } from "@/lib/schedule/board";
import { holdStore } from "@/lib/schedule/hold-store";
import { formatMeetingTime, sentence } from "@/lib/schedule/meetings";
import { PHOTO_SKIP_OPTIONS, type PhotoSkip } from "@/lib/schedule/readiness";

export type NewLeadBooking = {
  board: BoardSlot[];
  today: string;
  windowDays: number;
  asSales: boolean;
  viewerId: string | null;
  heldAt: string | null;
};

// "Hold a time" near the top of New lead (Keenan, 2026-11-01): the setter
// grabs the time the moment the customer agrees, then finishes the form
// while holding it. "Save and book" books it. While a time is held, the
// form also asks what booking needs, so one tap books.
export function HoldOnNewLead({ booking, guidedPhotos }: { booking: NewLeadBooking; guidedPhotos: number }) {
  const [held, setHeld] = useState<string | null>(booking.heldAt);
  const [picking, setPicking] = useState(false);
  const [skip, setSkip] = useState<PhotoSkip | null>(null);
  const [pending, startTransition] = useTransition();

  function letGo() {
    startTransition(async () => {
      holdStore.set(null);
      setHeld(null);
      await releaseMyHold();
    });
  }

  return (
    <section className="flex flex-col gap-3" aria-label="Meeting time" data-testid="hold-a-time">
      <HoldSync startsAt={booking.heldAt} />
      {held ? (
        <>
          <input type="hidden" name="held_start" value={held} />
          <div role="status" className="flex flex-col gap-3 rounded-md border border-primary p-4" data-testid="held-time">
            <p className="text-lg font-bold">{sentence(`Holding ${formatMeetingTime(held)}`)}</p>
            <p className="text-sm">Nobody else can pick it. Save and book to confirm it.</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="min-h-11" onClick={() => setPicking((open) => !open)}>
                Change the time
              </Button>
              <Button type="button" variant="outline" className="min-h-11" disabled={pending} onClick={letGo}>
                Let go
              </Button>
            </div>
          </div>
          <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-md border px-3 py-3 text-base font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
            <input type="checkbox" name="everyone" value="yes" className="mt-1 size-5 shrink-0 accent-[var(--primary)]" />
            Everyone who decides on the house will be at the meeting
          </label>
          {guidedPhotos < 3 ? (
            <div className="flex flex-col gap-3">
              <AnswerGroup
                name="photos_skipped"
                legend="If you can't take the Front, Left corner and Right corner photos, why not?"
                options={PHOTO_SKIP_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
                value={skip}
                onChange={setSkip}
              />
              {skip === "other" ? (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="new-lead-skip-note">Say why</Label>
                  <Input id="new-lead-skip-note" name="photos_skip_note" maxLength={300} />
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="w-full"
          aria-expanded={picking}
          onClick={() => setPicking((open) => !open)}
        >
          Hold a time
        </Button>
      )}
      {picking ? (
        <div className="rounded-md border p-3">
          <TimePicker
            initial={booking.board}
            today={booking.today}
            windowDays={booking.windowDays}
            asSales={booking.asSales}
            viewerId={booking.viewerId}
            mode="hold"
            onHeld={(startsAt) => {
              setHeld(startsAt);
              setPicking(false);
            }}
          />
        </div>
      ) : null}
    </section>
  );
}
