"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { bookMeeting, type BookState } from "@/app/(app)/app/schedule/actions";
import { AnswerGroup } from "@/components/leads/answer-group";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { submitKeepingValues } from "@/lib/forms/submit";
import {
  bookingProblems,
  PHOTO_SKIP_OPTIONS,
  PROBLEM_LABELS,
  type PhotoSkip,
  type ReadinessItem,
  type ReadinessLead,
} from "@/lib/schedule/readiness";
import { cn } from "@/lib/utils";

const initialState: BookState = {};

// Before you book, then Book (Keenan, 2026-10-31 and 2026-11-01). Each
// missing item shows with a way to fix it, and the button stays off until
// everything passes. The database checks it all again.
export function BookingForm({
  leadId,
  startsAt,
  lead,
  items,
  guidedPhotos,
  warnings,
  held,
}: {
  leadId: string;
  startsAt: string;
  lead: ReadinessLead;
  items: ReadinessItem[];
  guidedPhotos: number;
  warnings: string[];
  held: boolean;
}) {
  const [state, formAction, pending] = useActionState(bookMeeting, initialState);
  const [skip, setSkip] = useState<PhotoSkip | null>(null);
  const [skipNote, setSkipNote] = useState("");
  const [everyone, setEveryone] = useState(false);
  const problems = bookingProblems(lead, guidedPhotos, { everyone, skip, skipNote });
  const ready = held && problems.length === 0;

  return (
    <form onSubmit={submitKeepingValues(formAction)} className="flex flex-col gap-5" data-testid="booking-form">
      <input type="hidden" name="lead_id" value={leadId} />
      <input type="hidden" name="starts_at" value={startsAt} />

      <section aria-labelledby="ready-heading" className="flex flex-col gap-2">
        <h2 id="ready-heading" className="text-lg font-bold">
          Before you book
        </h2>
        <ul className="flex flex-col gap-2" data-testid="readiness">
          {items.map((item) => (
            <li key={item.key} className={cn("rounded-md border px-3 py-2 text-sm", item.ok ? "" : "border-destructive")} data-ok={item.ok ? "yes" : "no"}>
              <p className="font-semibold">
                {item.ok ? "Done: " : "Missing: "}
                {item.label}
              </p>
              {!item.ok && item.key !== "photos" ? (
                <p className="text-muted-foreground">
                  {item.fix}{" "}
                  <Link href={`/app/leads/${leadId}/edit`} className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">
                    Edit lead
                  </Link>
                </p>
              ) : null}
              {!item.ok && item.key === "photos" ? (
                <p className="text-muted-foreground">
                  {item.fix}{" "}
                  <Link href={`/app/leads/${leadId}`} className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">
                    Take photos
                  </Link>
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {guidedPhotos < 3 ? (
        <div className="flex flex-col gap-3">
          <AnswerGroup
            name="photos_skipped"
            legend="Why are photos missing?"
            options={PHOTO_SKIP_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
            value={skip}
            onChange={setSkip}
          />
          {skip === "other" ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="photos-skip-note">Say why</Label>
              <Input
                id="photos-skip-note"
                name="photos_skip_note"
                value={skipNote}
                maxLength={300}
                onChange={(event) => setSkipNote(event.target.value)}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-md border px-3 py-3 text-base font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
        <input
          type="checkbox"
          name="everyone"
          value="yes"
          checked={everyone}
          onChange={(event) => setEveryone(event.target.checked)}
          className="mt-1 size-5 shrink-0 accent-[var(--primary)]"
        />
        Everyone who decides on the house will be at the meeting
      </label>

      {warnings.length > 0 ? (
        <div role="status" className="rounded-md border border-primary bg-accent px-4 py-3 text-sm text-accent-foreground" data-testid="distance-warning">
          {warnings.map((warning) => (
            <p key={warning} className="font-semibold">
              {warning}
            </p>
          ))}
          <p>You can still book it, or pick another time.</p>
        </div>
      ) : null}

      {problems.length > 0 && held ? (
        <div className="text-sm" data-testid="still-needed">
          <p className="font-semibold">Still needed:</p>
          <ul className="list-disc pl-5">
            {problems.map((problem) => (
              <li key={problem}>{PROBLEM_LABELS[problem] ?? problem}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {state.message ? (
        <p role="alert" className="text-sm font-semibold text-destructive">
          {state.message}
          {state.problems && state.problems.length > 0
            ? ` Missing: ${state.problems.map((problem) => PROBLEM_LABELS[problem] ?? problem).join("; ")}.`
            : ""}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="w-full" disabled={!ready || pending}>
        {pending ? "Booking" : "Book this time"}
      </Button>
    </form>
  );
}
