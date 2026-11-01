"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addTimeBlock, removeTimeBlock } from "@/app/(app)/app/schedule/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatTime } from "@/lib/time";

// Keenan blocks a time, or a whole evening, so nothing can be booked in it,
// for example a late install day. Removing a block opens the times again.
export function BlockControls({
  evening,
  openTimes,
  blocks,
}: {
  evening: { startsAt: string; endsAt: string } | null;
  openTimes: { startsAt: string; endsAt: string }[];
  blocks: { id: string; starts_at: string; ends_at: string; reason: string | null }[];
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: true } | { ok: false; message: string }>) {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setMessage(result.message);
      else {
        setReason("");
        router.refresh();
      }
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-md border p-4" aria-labelledby="blocks-heading" data-testid="block-controls">
      <h2 id="blocks-heading" className="text-base font-bold">
        Blocked times
      </h2>
      {blocks.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing blocked this evening.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {blocks.map((block) => (
            <li key={block.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                {formatTime(block.starts_at)} to {formatTime(block.ends_at)}
                {block.reason ? `: ${block.reason}` : ""}
              </span>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={pending}
                onClick={() => run(() => removeTimeBlock(block.id))}
              >
                Remove block
              </Button>
            </li>
          ))}
        </ul>
      )}
      {evening ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="block-reason">Reason (optional)</Label>
            <Input id="block-reason" value={reason} maxLength={200} onChange={(event) => setReason(event.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={pending}
              onClick={() => run(() => addTimeBlock(evening.startsAt, evening.endsAt, reason))}
            >
              Block the whole evening
            </Button>
            {openTimes.map((time) => (
              <Button
                key={time.startsAt}
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={pending}
                onClick={() => run(() => addTimeBlock(time.startsAt, time.endsAt, reason))}
              >
                Block {formatTime(time.startsAt)}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
      {message ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {message}
        </p>
      ) : null}
    </section>
  );
}
