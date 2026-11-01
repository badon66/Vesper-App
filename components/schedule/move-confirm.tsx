"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { moveBooking } from "@/app/(app)/app/schedule/actions";
import { Button } from "@/components/ui/button";
import { holdStore } from "@/lib/schedule/hold-store";
import { formatMeetingTime, sentence } from "@/lib/schedule/meetings";

// Moving a booking to the time the person now holds.
export function MoveConfirm({
  meetingId,
  leadId,
  from,
  to,
  held,
}: {
  meetingId: string;
  leadId: string;
  from: string;
  to: string;
  held: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function move() {
    setMessage(null);
    startTransition(async () => {
      const result = await moveBooking(meetingId, to);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      holdStore.set(null);
      router.push(`/app/leads/${leadId}?moved=1`);
    });
  }

  return (
    <div className="flex flex-col gap-3" data-testid="move-confirm">
      <p className="text-base">
        From <span className="font-semibold">{formatMeetingTime(from)}</span> to{" "}
        <span className="font-semibold">{sentence(formatMeetingTime(to))}</span>
      </p>
      {message ? (
        <p role="alert" className="text-sm font-semibold text-destructive">
          {message}
        </p>
      ) : null}
      <Button type="button" size="lg" className="w-full" disabled={!held || pending} onClick={move}>
        {pending ? "Moving" : "Move the booking"}
      </Button>
    </div>
  );
}
