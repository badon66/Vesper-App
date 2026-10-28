"use client";

import { useState, useTransition } from "react";
import { changeLeadStatus } from "@/app/(app)/app/leads/actions";
import { ChoiceGroup } from "@/components/leads/choice-group";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FOLLOW_UP_CHOICES, FOLLOW_UP_MAX_DAYS, type FollowUpChoice } from "@/lib/leads/attention";
import { STATUS_LABELS, type LeadStatus } from "@/lib/leads/status";
import { addDays, formatDay } from "@/lib/time";

const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

// Status for a lead, within what this person may set. Choosing Follow up asks
// when: Tomorrow, In 3 days, Next week, or a date. On a lead already in Follow
// up the same choices move the date. `today` is Calgary's date from the
// server, so the choices never depend on the phone's clock.
export function StatusControl({
  leadId,
  current,
  choices,
  lostReasons,
  followUpOn,
  today,
}: {
  leadId: string;
  current: LeadStatus;
  choices: LeadStatus[];
  lostReasons: string[];
  followUpOn: string | null;
  today: string;
}) {
  const [selected, setSelected] = useState<LeadStatus>(current);
  const hasDate = current === "follow_up" && followUpOn !== null;
  const [when, setWhen] = useState<FollowUpChoice>(hasDate ? "keep" : "tomorrow");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await changeLeadStatus({}, formData);
      setError(result.error ?? null);
    });
  }

  const whenOptions: { value: FollowUpChoice; label: string; hint?: string }[] = [
    ...(hasDate && followUpOn ? [{ value: "keep" as const, label: "Keep", hint: formatDay(followUpOn) }] : []),
    ...FOLLOW_UP_CHOICES.map((choice) => ({
      value: choice.value,
      label: choice.label,
      hint: formatDay(addDays(today, choice.days)),
    })),
    { value: "date", label: "On a date" },
  ];
  const unchanged = selected === current && (selected !== "follow_up" || when === "keep");

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={leadId} />
      <ChoiceGroup
        name="status"
        legend="Status"
        options={choices.map((status) => ({ value: status, label: STATUS_LABELS[status] }))}
        defaultValue={current}
        columns={3}
        onChange={setSelected}
      />
      {selected === "follow_up" ? (
        <>
          <ChoiceGroup
            name="follow_up"
            legend="When to follow up?"
            options={whenOptions}
            defaultValue={when}
            columns={2}
            onChange={setWhen}
          />
          {when === "date" ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="follow-up-date">Follow-up day</Label>
              <Input
                id="follow-up-date"
                name="follow_up_date"
                type="date"
                min={today}
                max={addDays(today, FOLLOW_UP_MAX_DAYS)}
                defaultValue={followUpOn && followUpOn >= today ? followUpOn : addDays(today, 1)}
                required
              />
            </div>
          ) : null}
        </>
      ) : null}
      {selected === "lost" && current !== "lost" ? (
        <ChoiceGroup
          name="lost_reason"
          legend="Why was it lost?"
          options={lostReasons.map((reason) => ({ value: reason, label: sentence(reason) }))}
          columns={2}
        />
      ) : null}
      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={pending || unchanged}>
        {pending ? "Saving" : selected === current && selected === "follow_up" ? "Save follow-up day" : "Save status"}
      </Button>
    </form>
  );
}
