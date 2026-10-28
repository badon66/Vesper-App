"use client";

import { useState, useTransition } from "react";
import { changeLeadStatus } from "@/app/(app)/app/leads/actions";
import { ChoiceGroup } from "@/components/leads/choice-group";
import { Button } from "@/components/ui/button";
import { STATUS_LABELS, type LeadStatus } from "@/lib/leads/status";

const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export function StatusControl({
  leadId,
  current,
  choices,
  lostReasons,
}: {
  leadId: string;
  current: LeadStatus;
  choices: LeadStatus[];
  lostReasons: string[];
}) {
  const [selected, setSelected] = useState<LeadStatus>(current);
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
      <Button type="submit" size="lg" disabled={pending || selected === current}>
        {pending ? "Saving" : "Save status"}
      </Button>
    </form>
  );
}
