"use client";

import { useState, useTransition } from "react";
import { ActionMessage } from "@/components/action-message";
import { setTrackColour, type TrackColourState } from "@/app/(app)/app/leads/actions";
import { AnswerGroup } from "@/components/leads/answer-group";
import { RalCodeField } from "@/components/ral-code-field";
import { Button } from "@/components/ui/button";
import { CUSTOM_CHOICE, ralLabel, RAL_CODE_PATTERN } from "@/lib/leads/track-colour";
import { CHOOSER_LINES } from "@/lib/meeting/deck-pages";
import { smartApostrophes } from "@/lib/typography";
import { cn } from "@/lib/utils";

// The owner sets a lead's track colour: one of the colours on his list, or
// Custom with a RAL Classic number. Names only, no swatches. Tapping the
// chosen colour again clears it.
//
// variant "meeting" (the colour chooser in front of the customer, round 7
// review): 20 px type, the legend "Choose the colour", Custom's field
// "Colour number" with "From the colour book." under it, never "RAL Classic"
// or "powder coating"; a typed number still reads back its name. A number
// that isn't four digits or isn't in the book is caught on the iPad, in
// those words, before anything is sent. The lead page and prep keep the
// "lead" variant's words.
//
// actOut (the rehearsal view): the choice is acted out on screen, through
// onSaved, and nothing is sent to the server.
export function TrackColourForm({
  leadId,
  options,
  current,
  ralNames,
  onSaved,
  requireColour = false,
  quiet = false,
  variant = "lead",
  actOut = false,
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
  variant?: "lead" | "meeting";
  actOut?: boolean;
}) {
  const [choice, setChoice] = useState<string | null>(current.choice);
  const [state, setState] = useState<TrackColourState>({});
  const [pending, startTransition] = useTransition();
  const meeting = variant === "meeting";

  // The meeting's own check of a custom number, in the colour book's words.
  function codeProblem(code: string): string | null {
    if (!RAL_CODE_PATTERN.test(code)) return CHOOSER_LINES.codeShort;
    if (!ralNames[code]) return CHOOSER_LINES.codeUnknown;
    return null;
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const picked = String(formData.get("choice") ?? "") || null;
    const code = picked === CUSTOM_CHOICE ? String(formData.get("ral_code") ?? "").trim() : null;
    if (meeting && code !== null) {
      const problem = codeProblem(code);
      if (problem) {
        setState({ errors: { ral_code: problem } });
        return;
      }
    }
    if (actOut) {
      setState({ ok: true });
      onSaved?.(picked, code);
      return;
    }
    startTransition(async () => {
      try {
        const result = await setTrackColour({}, formData);
        // In front of the customer a refused number reads in the book's words.
        setState(meeting && result.errors?.ral_code ? { ...result, errors: { ...result.errors, ral_code: CHOOSER_LINES.codeUnknown } } : result);
        if (result.ok) onSaved?.(picked, code);
      } catch {
        // No signal: say so here rather than taking the screen down.
        setState({ error: "No signal. The colour was not saved. Try again in a moment." });
      }
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className={cn(
        "flex flex-col gap-4",
        // 20 px through the answers and their legend, 56 px tall answers.
        meeting && "gap-6 [&_[data-answer]]:min-h-14 [&_[data-answer]]:text-[20px] [&_legend]:mb-3 [&_legend]:text-[20px]",
      )}
      data-testid="track-colour-form"
    >
      <input type="hidden" name="id" value={leadId} />
      <AnswerGroup
        name="choice"
        legend={meeting ? CHOOSER_LINES.legend : "Set the track colour"}
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
        meeting ? (
          <ColourNumberField
            defaultValue={current.ralCode}
            ralNames={ralNames}
            error={state.errors?.ral_code}
            // A refusal goes as soon as the number is changed.
            onEdit={() => setState((now) => (now.errors || now.error ? {} : now))}
          />
        ) : (
          <RalCodeField
            id="lead-track-ral"
            label="RAL Classic number"
            defaultValue={current.ralCode}
            ralNames={ralNames}
            error={state.errors?.ral_code}
            emptyHint="From the RAL K7 book. A custom colour needs powder coating."
          />
        )
      ) : null}
      <ActionMessage text={state.error && !state.errors ? state.error : null} className={meeting ? "text-[20px]" : undefined} />
      {state.ok ? (
        <p role="status" className={meeting ? "text-[20px] text-muted-foreground" : "text-sm text-muted-foreground"}>
          Saved.
        </p>
      ) : null}
      {requireColour && !choice ? (
        <p className={meeting ? "text-[20px] text-muted-foreground" : "text-sm text-muted-foreground"}>Pick a colour to save it.</p>
      ) : null}
      <Button
        type="submit"
        size="lg"
        variant={quiet ? "outline" : "default"}
        className={meeting ? "h-14 w-fit px-7 text-[20px]" : "w-full sm:w-fit"}
        disabled={pending || (requireColour && !choice)}
      >
        {pending ? "Saving" : "Save track colour"}
      </Button>
    </form>
  );
}

// Custom's number in the meeting: "Colour number", from the colour book,
// its name read back as soon as four digits are typed. Names only.
function ColourNumberField({
  defaultValue,
  ralNames,
  error,
  onEdit,
}: {
  defaultValue: string | null;
  ralNames: Record<string, string>;
  error?: string;
  onEdit: () => void;
}) {
  const id = "lead-track-ral";
  const [code, setCode] = useState(defaultValue ?? "");
  const typed = code.trim();
  const known = RAL_CODE_PATTERN.test(typed) ? ralNames[typed] : undefined;
  const status =
    typed === ""
      ? CHOOSER_LINES.codeHint
      : known
        ? ralLabel(typed, known)
        : RAL_CODE_PATTERN.test(typed)
          ? CHOOSER_LINES.codeUnknown
          : CHOOSER_LINES.codeShort;
  // A refusal already says it in red: the line under the field doesn't say
  // it a second time (it stays in place, empty, so it still announces the
  // read-back once the number is changed).
  const repeated = Boolean(error) && error === status;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-[20px] font-semibold">
        {CHOOSER_LINES.codeLabel}
      </label>
      <input
        id={id}
        name="ral_code"
        value={code}
        onChange={(event) => {
          setCode(event.target.value);
          onEdit();
        }}
        inputMode="numeric"
        autoComplete="off"
        maxLength={4}
        placeholder="7016"
        aria-invalid={error ? true : undefined}
        aria-describedby={[repeated ? null : `${id}-name`, error ? `${id}-error` : null].filter(Boolean).join(" ")}
        className="h-14 w-40 rounded-md border border-input bg-background px-3 text-center text-[24px] font-semibold tracking-widest text-foreground tabular-nums outline-none select-text placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring"
      />
      <p
        id={`${id}-name`}
        aria-live="polite"
        className={cn(known ? "text-[20px] font-semibold" : "text-[20px] text-muted-foreground", "empty:-mt-2")}
        data-testid={`${id}-name`}
      >
        {repeated ? null : smartApostrophes(status)}
      </p>
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-[20px] font-semibold text-destructive">
          {smartApostrophes(error)}
        </p>
      ) : null}
    </div>
  );
}
