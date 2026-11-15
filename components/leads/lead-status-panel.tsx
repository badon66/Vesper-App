"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { changeLeadStatus } from "@/app/(app)/app/leads/actions";
import { GlanceRow } from "@/components/leads/at-a-glance";
import { Button } from "@/components/ui/button";
import { FOLLOW_UP_CHOICES, FOLLOW_UP_MAX_DAYS } from "@/lib/leads/attention";
import { followUpShort, type StatusOption } from "@/lib/leads/glance";
import type { LeadStatus } from "@/lib/leads/status";
import { addDays, formatDay } from "@/lib/time";
import { cn } from "@/lib/utils";
import { VIEW_AS_READ_ONLY } from "@/lib/view-as";

// Round 21 (Keenan, 2026-11-15): the lead's status as a dropdown in At a
// glance, and its follow-up day under it. A status that needs nothing more
// saves as soon as it's picked; Follow up asks when and Lost asks why, as
// the old Status card did. Meeting booked, Sold and Installed show what sets
// them and can't be picked. Every save carries the lead's version from when
// the page opened, the same check as round 20's quick edit: a change made
// elsewhere meanwhile stops it with "This lead changed since you opened
// it...". Under View as nothing saves and it says so, calmly.

type Message = { kind: "error" | "changed" | "view_as"; text: string } | null;
type When = (typeof FOLLOW_UP_CHOICES)[number]["value"] | "date";

const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export function LeadStatusPanel({
  leadId,
  stamp,
  current,
  options,
  canChange,
  followUpOn,
  lostReason,
  lostReasons,
  today,
  note,
  fromOutcome,
}: {
  leadId: string;
  stamp: string;
  current: LeadStatus;
  options: StatusOption[];
  canChange: boolean;
  followUpOn: string | null;
  lostReason: string | null;
  lostReasons: string[];
  today: string;
  note: string | null;
  fromOutcome: boolean;
}) {
  const router = useRouter();
  const ids = useId();
  const [pending, setPending] = useState<"follow_up" | "lost" | null>(null);
  const [when, setWhen] = useState<When>("tomorrow");
  const [day, setDay] = useState(followUpOn && followUpOn >= today ? followUpOn : addDays(today, 1));
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<Message>(null);
  const [busy, start] = useTransition();

  const save = (status: LeadStatus, extra: Record<string, string> = {}) => {
    setMessage(null);
    const data = new FormData();
    data.set("id", leadId);
    data.set("status", status);
    data.set("stamp", stamp);
    for (const [key, value] of Object.entries(extra)) data.set(key, value);
    start(async () => {
      const result = await changeLeadStatus({}, data);
      if (result.ok) {
        setPending(null);
        router.refresh();
        return;
      }
      setPending(null);
      if (result.error === VIEW_AS_READ_ONLY) setMessage({ kind: "view_as", text: VIEW_AS_READ_ONLY });
      else setMessage({ kind: result.changed ? "changed" : "error", text: result.error ?? "That didn't save. Try again." });
    });
  };

  const followUp = current === "follow_up" && followUpOn ? followUpShort(followUpOn, today) : null;
  const shown = pending ?? current;

  return (
    <>
      <GlanceRow label="Status" testId="glance-status">
        <select
          id={`${ids}-status`}
          aria-label="Status"
          value={shown}
          disabled={!canChange || busy}
          onChange={(event) => {
            const next = event.target.value as LeadStatus;
            setMessage(null);
            if (next === current) {
              setPending(null);
              return;
            }
            if (next === "follow_up") {
              setWhen("tomorrow");
              setPending("follow_up");
              return;
            }
            if (next === "lost") {
              setReason("");
              setPending("lost");
              return;
            }
            setPending(null);
            save(next);
          }}
          className="h-11 w-full max-w-64 rounded-md border border-border bg-background px-3 text-base font-semibold disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-100"
          data-testid="status-select"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
        {current === "lost" && lostReason ? <p className="text-muted-foreground">{sentence(`Lost: ${lostReason}`)}</p> : null}
        {fromOutcome ? (
          <p className="text-muted-foreground text-pretty" data-testid="status-from-outcome">
            Set by the quote&apos;s outcome.{" "}
            <a href="#quote-outcome" className="inline-flex min-h-11 items-center font-semibold text-foreground underline underline-offset-4">
              Go to the outcome
            </a>
          </p>
        ) : note ? (
          <p className="text-muted-foreground text-pretty">{note}</p>
        ) : null}

        {pending === "follow_up" ? (
          <FollowUpChooser
            ids={ids}
            when={when}
            setWhen={setWhen}
            day={day}
            setDay={setDay}
            today={today}
            busy={busy}
            onSave={() => save("follow_up", { follow_up: when, follow_up_date: day })}
            onCancel={() => setPending(null)}
          />
        ) : null}
        {pending === "lost" ? (
          <div className="flex flex-col gap-2 pt-1" data-testid="status-lost-reason">
            <label htmlFor={`${ids}-reason`} className="font-semibold">
              Why was it lost?
            </label>
            <select
              id={`${ids}-reason`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="h-11 w-full max-w-64 rounded-md border border-border bg-background px-3 text-base"
            >
              <option value="">Pick one</option>
              {lostReasons.map((option) => (
                <option key={option} value={option}>
                  {sentence(option)}
                </option>
              ))}
            </select>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" disabled={busy || !reason} onClick={() => save("lost", { lost_reason: reason })} data-testid="status-save">
                {busy ? "Saving" : reason ? "Save as Lost" : "Pick why it was lost"}
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setPending(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        {message ? (
          message.kind === "view_as" ? (
            <p role="status" className="text-muted-foreground" data-testid="status-view-as">
              {message.text}
            </p>
          ) : (
            <div role="alert" className="flex flex-col gap-1" data-testid="status-message">
              <p className="font-semibold text-destructive text-pretty">{message.text}</p>
              {message.kind === "changed" ? (
                <Button type="button" size="sm" variant="outline" className="self-start" onClick={() => router.refresh()} data-testid="status-reopen">
                  Reopen
                </Button>
              ) : null}
            </div>
          )
        ) : null}
      </GlanceRow>

      {followUp && followUpOn ? (
        <GlanceRow label="Follow-up" testId="glance-follow-up">
          <div className="flex flex-wrap items-center gap-x-3">
            <span className={cn(followUp.overdue ? "font-bold" : "font-semibold")}>{followUp.text}</span>
            {canChange && pending === null ? (
              <span className="flex gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="underline underline-offset-4"
                  disabled={busy}
                  onClick={() => {
                    setMessage(null);
                    setWhen("date");
                    setDay(followUpOn >= today ? followUpOn : addDays(today, 1));
                    setPending("follow_up");
                  }}
                  data-testid="follow-up-change"
                >
                  Change
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="underline underline-offset-4"
                  disabled={busy}
                  aria-label="Clear the follow-up day: back to New"
                  onClick={() => save("new")}
                  data-testid="follow-up-clear"
                >
                  Clear
                </Button>
              </span>
            ) : null}
          </div>
        </GlanceRow>
      ) : null}
    </>
  );
}

function FollowUpChooser({
  ids,
  when,
  setWhen,
  day,
  setDay,
  today,
  busy,
  onSave,
  onCancel,
}: {
  ids: string;
  when: When;
  setWhen: (when: When) => void;
  day: string;
  setDay: (day: string) => void;
  today: string;
  busy: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const choices: { value: When; label: string; hint?: string }[] = [
    ...FOLLOW_UP_CHOICES.map((choice) => ({ value: choice.value, label: choice.label, hint: formatDay(addDays(today, choice.days)) })),
    { value: "date", label: "On a date" },
  ];
  return (
    <div className="flex flex-col gap-2 pt-1" data-testid="status-follow-up">
      <p className="font-semibold" id={`${ids}-when`}>
        When to follow up?
      </p>
      <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-labelledby={`${ids}-when`}>
        {choices.map((choice) => (
          <button
            key={choice.value}
            type="button"
            role="radio"
            aria-checked={when === choice.value}
            onClick={() => setWhen(choice.value)}
            className={cn(
              "flex min-h-11 flex-col items-start justify-center rounded-md border px-3 py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
              when === choice.value ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
            )}
          >
            <span className="font-semibold">{choice.label}</span>
            {choice.hint ? <span className={cn("text-xs", when === choice.value ? "" : "text-muted-foreground")}>{choice.hint}</span> : null}
          </button>
        ))}
      </div>
      {when === "date" ? (
        <div className="flex flex-col gap-1">
          <label htmlFor={`${ids}-day`} className="text-muted-foreground">
            Follow-up day
          </label>
          <input
            id={`${ids}-day`}
            type="date"
            min={today}
            max={addDays(today, FOLLOW_UP_MAX_DAYS)}
            value={day}
            onChange={(event) => setDay(event.target.value)}
            className="h-11 w-full max-w-64 rounded-md border border-border bg-background px-3 text-base"
          />
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={busy} onClick={onSave} data-testid="status-save">
          {busy ? "Saving" : "Save follow-up"}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
