"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { restoreLead } from "@/app/(app)/app/leads/delete-actions";
import { Button } from "@/components/ui/button";

// Round 20: Restore on Admin > Deleted. The lead comes back where it was,
// with its quote and link; a meeting that was cancelled stays cancelled.
export function RestoreLeadButton({ leadId }: { leadId: string }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (done) {
    return (
      <Link href={`/app/leads/${leadId}`} className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4" data-testid="restored-open">
        Restored. Open it
      </Link>
    );
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        data-testid="restore-lead"
        onClick={() =>
          start(async () => {
            const result = await restoreLead(leadId);
            if (!result.ok) {
              setError(result.message);
              return;
            }
            setDone(true);
          })
        }
      >
        {pending ? "Restoring..." : "Restore"}
      </Button>
      {error ? (
        <p role="alert" className="text-sm font-semibold text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
