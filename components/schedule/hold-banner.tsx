"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { holdTime, releaseMyHold } from "@/app/(app)/app/schedule/actions";
import { Button } from "@/components/ui/button";
import { holdStore } from "@/lib/schedule/hold-store";
import { formatMeetingTime } from "@/lib/schedule/meetings";

// What the booking screen says about the chosen time: held for this person,
// or why not, with a way to hold it, pick another or let it go.
export function HoldBanner({
  startsAt,
  held,
  slotState,
  holderName,
  pickAnotherHref,
  leadId,
  meetingId,
}: {
  startsAt: string;
  held: boolean;
  slotState: string | null;
  holderName: string | null;
  pickAnotherHref: string;
  leadId?: string | null;
  meetingId?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const when = formatMeetingTime(startsAt);

  function letGo() {
    startTransition(async () => {
      holdStore.set(null);
      await releaseMyHold();
      router.push(pickAnotherHref);
    });
  }

  function holdIt() {
    startTransition(async () => {
      const result = await holdTime(startsAt, { leadId, meetingId });
      if (result.ok) holdStore.set({ startsAt });
      router.refresh();
    });
  }

  return (
    <div
      className="flex flex-col gap-3 rounded-md border border-primary p-4"
      data-testid="hold-banner"
      data-held={held ? "yes" : "no"}
      role="status"
    >
      {held ? (
        <>
          <p className="text-lg font-bold">You&apos;re holding {when}.</p>
          <p className="text-sm">Nobody else can pick it while you book. It lets go if you leave or close the app.</p>
        </>
      ) : slotState === "held" ? (
        <p className="text-lg font-bold">{holderName ?? "Someone"} is booking this time.</p>
      ) : slotState === "booked" ? (
        <p className="text-lg font-bold">{when} has just been booked.</p>
      ) : slotState === "open" ? (
        <p className="text-lg font-bold">{when} is open, but not held for you yet.</p>
      ) : (
        <p className="text-lg font-bold">{when} can&apos;t be booked now.</p>
      )}
      <div className="flex flex-wrap gap-2">
        {!held && slotState === "open" ? (
          <Button type="button" className="min-h-11" disabled={pending} onClick={holdIt}>
            Hold this time
          </Button>
        ) : null}
        <Button asChild variant="outline" className="min-h-11">
          <Link href={pickAnotherHref}>Pick another time</Link>
        </Button>
        {held ? (
          <Button type="button" variant="outline" className="min-h-11" disabled={pending} onClick={letGo}>
            Let go
          </Button>
        ) : null}
      </div>
    </div>
  );
}
