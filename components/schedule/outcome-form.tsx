"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { ActionMessage } from "@/components/action-message";
import { setOutcome } from "@/app/(app)/app/schedule/actions";
import { AnswerGroup } from "@/components/leads/answer-group";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { submitKeepingValues } from "@/lib/forms/submit";
import { MEETING_STATUS_LABELS, OUTCOMES, type MeetingStatus, type Outcome } from "@/lib/schedule/meetings";

// Keenan marks a meeting after its slot: Qualified, Not qualified (a reason
// from Settings, or Other with a few words), No-show or Cancelled (an
// optional note). He can correct it until the booking fee is paid.
export function OutcomeForm({
  meetingId,
  current,
  currentReason,
  reasons,
}: {
  meetingId: string;
  current: MeetingStatus;
  currentReason: string | null;
  reasons: string[];
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(async (previous: Awaited<ReturnType<typeof setOutcome>>, formData: FormData) => {
    const result = await setOutcome(previous, formData);
    if (result?.ok) router.refresh();
    return result;
  }, null);
  const initial = (OUTCOMES as readonly string[]).includes(current) ? (current as Outcome) : null;
  const [outcome, setOutcomeChoice] = useState<Outcome | null>(initial);
  const choices = reasons.includes("Other") ? reasons : [...reasons, "Other"];
  const known = currentReason && choices.includes(currentReason) ? currentReason : currentReason ? "Other" : null;
  const [reason, setReason] = useState<string | null>(known);

  return (
    <form onSubmit={submitKeepingValues(formAction)} className="flex flex-col gap-3" data-testid="outcome-form">
      <input type="hidden" name="meeting_id" value={meetingId} />
      <AnswerGroup
        name="outcome"
        legend={initial ? "Outcome (change it until the fee is paid)" : "How did it go?"}
        options={OUTCOMES.map((value) => ({ value, label: MEETING_STATUS_LABELS[value] }))}
        value={outcome}
        onChange={setOutcomeChoice}
      />
      {outcome === "not_qualified" ? (
        <>
          <AnswerGroup
            name="reason"
            legend="Why not?"
            options={choices.map((value) => ({ value, label: value }))}
            value={reason}
            onChange={setReason}
          />
          {reason === "Other" ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor={`other-${meetingId}`}>In a few words</Label>
              <Input
                id={`other-${meetingId}`}
                name="other_reason"
                maxLength={200}
                defaultValue={known === "Other" ? (currentReason ?? "") : ""}
              />
            </div>
          ) : null}
        </>
      ) : null}
      {outcome === "no_show" || outcome === "cancelled" ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`note-${meetingId}`}>Note (optional, never a price)</Label>
          <Input id={`note-${meetingId}`} name="note" maxLength={500} />
        </div>
      ) : null}
      <ActionMessage text={state && !state.ok ? state.message : null} />
      <Button type="submit" className="min-h-11 w-full sm:w-fit" disabled={pending || !outcome}>
        {pending ? "Saving" : "Save outcome"}
      </Button>
    </form>
  );
}
