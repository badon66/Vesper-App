"use client";

import { useState, useTransition } from "react";
import { ActionMessage } from "@/components/action-message";
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
  onSaved,
  requireColour = false,
  quiet = false,
}: {
  leadId: string;
  // The active colours, plus the lead's own colour if it has been retired.
  options: { value: string; label: string }[];
  current: { choice: string | null; ralCode: string | null };
  ralNames: Record<string, string>;
  // Meeting mode hears about a saved colour, to show it and ask for initials.
  onSaved?: (choice: string | null, ralCode: string | null) => void;
  // Meeting mode never saves "no colour": a customer tapping the chosen
  // colour to agree with it would otherwise clear it.
  requireColour?: boolean;
  // The prep list (round 7): an outlined Save when another item has the gold.
  quiet?: boolean;
}) {
  const [choice, setChoice] = useState<string | null>(current.choice);
  const [state, setState] = useState<TrackColourState>({});
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const picked = String(formData.get("choice") ?? "") || null;
    const code = picked === CUSTOM_CHOICE ? String(formData.get("ral_code") ?? "").trim() : null;
    startTransition(async () => {
      try {
        const result = await setTrackColour({}, formData);
        setState(result);
        if (result.ok) onSaved?.(picked, code);
      } catch {
        // No signal: say so here rather than taking the screen down.
        setState({ error: "No signal. The colour was not saved. Try again in a moment." });
      }
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
      <ActionMessage text={state.error && !state.errors ? state.error : null} />
      {state.ok ? (
        <p role="status" className="text-sm text-muted-foreground">
          Saved.
        </p>
      ) : null}
      {requireColour && !choice ? (
        <p className="text-sm text-muted-foreground">Pick a colour to save it.</p>
      ) : null}
      <Button type="submit" size="lg" variant={quiet ? "outline" : "default"} className="w-full sm:w-fit" disabled={pending || (requireColour && !choice)}>
        {pending ? "Saving" : "Save track colour"}
      </Button>
    </form>
  );
}
