"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cancelBooking } from "@/app/(app)/app/schedule/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Move or cancel an upcoming booking (Keenan, 2026-11-01). Moving picks a
// new time, which is held first like any booking. Cancelling sends the lead
// to Follow up for the next day.
export function BookingActions({ meetingId }: { meetingId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function cancel() {
    setMessage(null);
    startTransition(async () => {
      const result = await cancelBooking(meetingId, note);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      setConfirming(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3" data-testid="booking-actions">
      {!confirming ? (
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="min-h-11">
            <Link href={`/app/schedule/book?move=${meetingId}`}>Move</Link>
          </Button>
          <Button type="button" variant="outline" className="min-h-11" onClick={() => setConfirming(true)}>
            Cancel booking
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-md border p-3">
          <p className="text-sm font-semibold">Cancel this booking? The lead goes to Follow up for tomorrow.</p>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`cancel-note-${meetingId}`}>Note (optional)</Label>
            <Input
              id={`cancel-note-${meetingId}`}
              value={note}
              maxLength={500}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="destructive" className="min-h-11" disabled={pending} onClick={cancel}>
              {pending ? "Cancelling" : "Yes, cancel it"}
            </Button>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
          </div>
        </div>
      )}
      {message ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {message}
        </p>
      ) : null}
    </div>
  );
}
