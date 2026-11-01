"use client";

import { useState, useTransition } from "react";
import { setTrackColour, type TrackColourState } from "@/app/(app)/app/leads/actions";
import { AnswerGroup } from "@/components/leads/answer-group";
import { RalCodeField } from "@/components/ral-code-field";
import { Button } from "@/components/ui/button";
import { CUSTOM_CHOICE } from "@/lib/leads/track-colour";

// The owner sets a lead's track colour: one of the colours on his list, or
// Custom with a RAL Classic number. Names only, no swatches. Tapping the
// chosen colour again clears it.
export function TrackColourForm({
  leadId,
  options,
  current,
  ralNames,
}: {
  leadId: string;
  // The active colours, plus the lead's own colour if it has been retired.
  options: { value: string; label: string }[];
  current: { choice: string | null; ralCode: string | null };
  ralNames: Record<string, string>;
}) {
  const [choice, setChoice] = useState<string | null>(current.choice);
  const [state, setState] = useState<TrackColourState>({});
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      setState(await setTrackColour({}, formData));
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4" data-testid="track-colour-form">
      <input type="hidden" name="id" value={leadId} />
      <AnswerGroup
        name="choice"
        legend="Set the track colour"
        options={[...options, { value: CUSTOM_CHOICE, label: "Custom" }]}
        value={choice}
        columns={3}
        error={state.errors?.choice}
        onChange={(value) => {
          setChoice(value);
          setState({});
        }}
      />
      {choice === CUSTOM_CHOICE ? (
        <RalCodeField
          id="lead-track-ral"
          label="RAL Classic number"
          defaultValue={current.ralCode}
          ralNames={ralNames}
          error={state.errors?.ral_code}
          emptyHint="From the RAL K7 book. A custom colour needs powder coating."
        />
      ) : null}
      {state.error && !state.errors ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p role="status" className="text-sm text-muted-foreground">
          Saved.
        </p>
      ) : null}
      <Button type="submit" size="lg" className="w-full sm:w-fit" disabled={pending}>
        {pending ? "Saving" : "Save track colour"}
      </Button>
    </form>
  );
}
