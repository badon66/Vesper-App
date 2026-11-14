"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { changeLeadStatus } from "@/app/(app)/app/leads/actions";
import { deleteLead } from "@/app/(app)/app/leads/delete-actions";
import { Button } from "@/components/ui/button";
import { DialogPanel } from "@/components/ui/dialog-panel";

// Round 20 (Keenan, 2026-11-14): Delete lead, at the very bottom of the lead
// page, below everything. Keenan's only (the page never renders it for a
// setter or under View as, and the database refuses anyone else). It asks
// once. A lead with an accepted quote, or booking pay or commission, can't
// be deleted: the button says why and offers Closed instead.

export type DeleteState =
  | { kind: "ok"; meetings: string[] }
  | { kind: "blocked"; reason: "accepted" | "pay"; closed: boolean };

export function DeleteLead({
  leadId,
  name,
  state,
  lostReasons,
}: {
  leadId: string;
  name: string;
  state: DeleteState;
  lostReasons: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [reason, setReason] = useState("");
  const [closedNow, setClosedNow] = useState(false);

  if (state.kind === "blocked") {
    const why =
      state.reason === "accepted"
        ? "This lead has an accepted quote, so it can't be deleted."
        : "This lead has booking pay or commission, so it can't be deleted.";
    const closed = state.closed || closedNow;
    return (
      <section className="flex flex-col gap-3 border-t pt-6" aria-label="Delete lead" data-testid="delete-lead">
        <Button type="button" variant="outline" disabled className="self-start" data-testid="delete-lead-button">
          Delete lead
        </Button>
        <p className="text-sm text-muted-foreground text-pretty" data-testid="delete-lead-why">
          {why} {closed ? "It's in Closed." : "You can move it to Closed instead."}
        </p>
        {closed ? null : (
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!reason) {
                setError("Pick a reason.");
                return;
              }
              setError(null);
              const data = new FormData();
              data.set("id", leadId);
              data.set("status", "lost");
              data.set("lost_reason", reason);
              start(async () => {
                const result = await changeLeadStatus({}, data);
                if (result.error) {
                  setError(result.error);
                  return;
                }
                setClosedNow(true);
                router.refresh();
              });
            }}
          >
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Reason
              <select
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="h-11 rounded-md border border-border bg-background px-3 text-base font-normal"
                data-testid="delete-lead-close-reason"
              >
                <option value="">Pick one</option>
                {lostReasons.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" variant="outline" disabled={pending} data-testid="delete-lead-close">
              {pending ? "Moving..." : "Move to Closed"}
            </Button>
          </form>
        )}
        {error ? (
          <p role="alert" className="text-sm font-semibold text-destructive">
            {error}
          </p>
        ) : null}
      </section>
    );
  }

  const meetings = state.meetings;
  return (
    <section className="flex flex-col gap-3 border-t pt-6" aria-label="Delete lead" data-testid="delete-lead">
      <Button
        type="button"
        variant="outline"
        className="self-start text-destructive"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        data-testid="delete-lead-button"
      >
        Delete lead
      </Button>
      <DialogPanel
        open={open}
        onClose={() => (pending ? undefined : setOpen(false))}
        title={`Delete ${name}?`}
        testId="delete-lead-confirm"
        actions={
          <>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>
              Keep it
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              data-testid="delete-lead-yes"
              onClick={() =>
                start(async () => {
                  const result = await deleteLead(leadId);
                  if (!result.ok) {
                    setError(result.message);
                    return;
                  }
                  router.replace("/app/leads");
                })
              }
            >
              {pending ? "Deleting..." : "Delete"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 text-base text-pretty">
          <p>It moves to Deleted for 30 days, then it&apos;s gone for good.</p>
          {meetings.length > 0 ? (
            <p data-testid="delete-lead-meetings">
              {meetings.length === 1
                ? `Its meeting ${meetings[0]} will be cancelled and the time freed up. Restoring the lead won't bring the meeting back.`
                : `Its meetings ${meetings.join(" and ")} will be cancelled and the times freed up. Restoring the lead won't bring them back.`}
            </p>
          ) : null}
          <p className="text-sm text-muted-foreground">Until then you can restore it from Admin, Deleted.</p>
          {error ? (
            <p role="alert" className="text-sm font-semibold text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      </DialogPanel>
    </section>
  );
}
