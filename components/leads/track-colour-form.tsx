"use client";

import { Check } from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";
import { ActionMessage } from "@/components/action-message";
import { setTrackColour, type TrackColourState } from "@/app/(app)/app/leads/actions";
import { AnswerGroup } from "@/components/leads/answer-group";
import { RalCodeField } from "@/components/ral-code-field";
import { Button } from "@/components/ui/button";
import { CUSTOM_CHOICE, ralLabel, RAL_CODE_PATTERN } from "@/lib/leads/track-colour";
import { CHOOSER_LINES, chooserSave } from "@/lib/meeting/deck-pages";
import { smartApostrophes } from "@/lib/typography";
import { cn } from "@/lib/utils";

// The owner sets a lead's track colour: one of the colours on his list, or
// Custom with a RAL Classic number. Names only, no swatches. On the lead
// page and in prep, tapping the chosen colour again clears it.
//
// variant "meeting" (the colour chooser in front of the customer, round 7
// review and after-review): the deck's secondary size, the legend "Choose
// the colour", Custom's field "Colour number" with "From the colour book."
// beside it, never "RAL Classic" or "powder coating"; a typed number still
// reads back its name. A number that isn't four digits or isn't in the book
// is caught on the iPad, in those words, before anything is sent. It lays
// itself out like the colour page, on the 56% line: `intro` (the heading
// and the screens line) and the colours on the left, and on the right,
// level with the legend, the colour number with its read-back and Save, so
// everything typed or tapped ends above where the iPad's keyboard comes up
// (about 420 px at 1180 x 820). Save stays an outline until there is a new
// colour to save, then turns gold (the Porch Light Rule, as Confirm does).
// The chosen colour's tick hangs after its name, as the light picker's do.
// The lead page and prep keep the "lead" variant's words and look.
//
// actOut (the rehearsal view): the choice is acted out on screen, through
// onSaved, and nothing is sent to the server.
type TrackColourFormProps = {
  leadId: string;
  // The active colours, plus the lead's own colour if it has been retired.
  options: { value: string; label: string }[];
  current: { choice: string | null; ralCode: string | null };
  ralNames: Record<string, string>;
  // Meeting mode hears about a saved colour, to show it and ask for initials.
  onSaved?: (choice: string | null, ralCode: string | null) => void;
  // Never save "no colour" (the meeting always works this way: a customer
  // tapping the chosen colour to agree with it keeps it chosen).
  requireColour?: boolean;
  // The prep list (round 7): an outlined Save when another item has the gold.
  quiet?: boolean;
  variant?: "lead" | "meeting";
  actOut?: boolean;
  // The meeting variant's heading and screens line, above the colours.
  intro?: ReactNode;
};

export function TrackColourForm(props: TrackColourFormProps) {
  return props.variant === "meeting" ? <MeetingColourForm {...props} /> : <LeadColourForm {...props} />;
}

// The save itself, shared by both variants: the meeting's own check of a
// custom number first, then acted out (rehearsal) or sent.
function useColourSave({
  meeting,
  actOut,
  ralNames,
  onSaved,
}: {
  meeting: boolean;
  actOut: boolean;
  ralNames: Record<string, string>;
  onSaved?: (choice: string | null, ralCode: string | null) => void;
}) {
  const [state, setState] = useState<TrackColourState>({});
  const [pending, startTransition] = useTransition();

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

  return { state, setState, pending, onSubmit };
}

// ---------------------------------------------------------------- the lead page and prep

function LeadColourForm({ leadId, options, current, ralNames, onSaved, requireColour = false, quiet = false, actOut = false }: TrackColourFormProps) {
  const [choice, setChoice] = useState<string | null>(current.choice);
  const { state, setState, pending, onSubmit } = useColourSave({ meeting: false, actOut, ralNames, onSaved });

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
      {requireColour && !choice ? <p className="text-sm text-muted-foreground">Pick a colour to save it.</p> : null}
      <Button
        type="submit"
        size="lg"
        variant={quiet ? "outline" : "default"}
        className="w-full sm:w-fit"
        disabled={pending || (requireColour && !choice)}
      >
        {pending ? "Saving" : "Save track colour"}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------- the meeting

// The deck's secondary size (20 px at 1180, 22 at 1366), outside the deck 20.
const SMALL = "text-[length:var(--deck-small,20px)] leading-[1.3]";

// DESIGN.md's choice button, as the picker draws it: the chosen colour is
// Night Text with navy words, the others a 1 px Night Input outline. Never
// gold: gold is kept for Save once there is something to save.
const OPTION =
  "relative flex min-h-14 cursor-pointer items-center justify-center rounded-md border px-8 py-1 text-center font-semibold leading-tight outline-none [-webkit-tap-highlight-color:transparent] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background";
const OPTION_CHOSEN = "border-foreground bg-foreground text-background";
const OPTION_UNCHOSEN = "border-input bg-background text-foreground active:bg-secondary";

function MeetingColourForm({ leadId, options, current, ralNames, onSaved, actOut = false, intro }: TrackColourFormProps) {
  const [choice, setChoice] = useState<string | null>(current.choice);
  // The number lives here (not in the field) so Save knows when a valid one
  // is typed, and it survives a tap away from Custom and back.
  const [code, setCode] = useState(current.ralCode ?? "");
  const { state, setState, pending, onSubmit } = useColourSave({ meeting: true, actOut, ralNames, onSaved });
  const custom = choice === CUSTOM_CHOICE;
  const typed = code.trim();
  const known = RAL_CODE_PATTERN.test(typed) ? ralNames[typed] : undefined;
  // Nothing new to save (the colour it opened on): Save waits, outlined and
  // off, with Back as the way out. A new colour, complete: gold.
  const { unchanged, ready } = chooserSave({ choice, current, code, ralNames });
  const all = [...options, { value: CUSTOM_CHOICE, label: "Custom" }];

  return (
    <form onSubmit={onSubmit} noValidate className="grid w-full grid-cols-[56%_44%] content-start" data-testid="track-colour-form">
      <input type="hidden" name="id" value={leadId} />
      {intro ? <div className="col-start-1 row-start-1 flex min-w-0 flex-col gap-3 pt-20 pr-10 pb-8 pl-16">{intro}</div> : null}

      <fieldset className="col-start-1 row-start-2 flex min-w-0 flex-col pr-10 pl-16" aria-describedby={state.errors?.choice ? "choice-error" : undefined}>
        <legend className={cn(SMALL, "mb-3 font-semibold")}>{CHOOSER_LINES.legend}</legend>
        <div className="grid grid-cols-3 gap-2">
          {all.map((option) => {
            const chosen = choice === option.value;
            return (
              <label key={option.value} data-answer={option.value} className={cn(OPTION, SMALL, "leading-tight", chosen ? OPTION_CHOSEN : OPTION_UNCHOSEN)}>
                <input
                  type="radio"
                  name="choice"
                  value={option.value}
                  checked={chosen}
                  // Tapping the chosen colour keeps it chosen: in front of the
                  // customer one colour is always picked.
                  onChange={() => {
                    setChoice(option.value);
                    setState({});
                  }}
                  className="sr-only"
                />
                {/* The name is centred and never moves; the chosen one's
                    tick hangs just after it, in the button's padding. */}
                <span className="relative">
                  {option.label}
                  {chosen ? (
                    <Check
                      aria-hidden="true"
                      className="absolute top-1/2 left-full -translate-y-1/2"
                      style={{ width: "0.8em", height: "0.8em", marginLeft: 6 }}
                      strokeWidth={2.5}
                    />
                  ) : null}
                </span>
              </label>
            );
          })}
        </div>
        {state.errors?.choice ? (
          <p id="choice-error" role="alert" className={cn(SMALL, "mt-3 font-semibold text-destructive")}>
            {state.errors.choice}
          </p>
        ) : null}
      </fieldset>

      {/* Level with the legend: the colour number on the legend's line, its
          field on the first row of colours with the read-back beside it,
          and Save on the second row, where it stays whether or not Custom
          is chosen. The 56% line runs only as far as this column's content. */}
      <div className="col-start-2 row-start-2 min-w-0 pr-12">
        <div className="flex flex-col border-l border-border pl-10">
          {custom ? (
            <ColourNumberField
              code={code}
              known={known}
              error={state.errors?.ral_code}
              onChange={(value) => {
                setCode(value);
                // A refusal goes as soon as the number is changed.
                setState((now) => (now.errors || now.error ? {} : now));
              }}
            />
          ) : (
            // The same room, empty, so Save never moves.
            <div aria-hidden="true">
              <p className={cn(SMALL, "mb-3")}>&nbsp;</p>
              <div className="h-14" />
            </div>
          )}
          <Button
            type="submit"
            size="lg"
            variant={ready ? "default" : "outline"}
            className="mt-2 h-14 w-fit px-7 text-[20px]"
            disabled={pending || choice === null || unchanged}
            data-ready={ready ? "" : undefined}
          >
            {pending ? "Saving" : "Save track colour"}
          </Button>
          <ActionMessage text={state.error && !state.errors ? state.error : null} className={cn(SMALL, "mt-3")} />
          {state.ok ? (
            <p role="status" className={cn(SMALL, "mt-3 text-muted-foreground")}>
              Saved.
            </p>
          ) : null}
          {choice === null ? <p className={cn(SMALL, "mt-3 text-muted-foreground")}>Pick a colour to save it.</p> : null}
        </div>
      </div>
    </form>
  );
}

// Custom's number in the meeting: "Colour number" on the legend's line, the
// field on the first row of colours, and beside it what the number reads as
// (its colour book name as soon as four digits are typed), or, after a
// refused Save, the reason in red in the same place. Names only.
function ColourNumberField({
  code,
  known,
  error,
  onChange,
}: {
  code: string;
  known: string | undefined;
  error?: string;
  onChange: (value: string) => void;
}) {
  const id = "lead-track-ral";
  const typed = code.trim();
  const status =
    typed === ""
      ? CHOOSER_LINES.codeHint
      : known
        ? ralLabel(typed, known)
        : RAL_CODE_PATTERN.test(typed)
          ? CHOOSER_LINES.codeUnknown
          : CHOOSER_LINES.codeShort;
  return (
    <div className="flex flex-col">
      <label htmlFor={id} className={cn(SMALL, "mb-3 font-semibold")}>
        {CHOOSER_LINES.codeLabel}
      </label>
      <div className="flex h-14 items-center gap-4">
        <input
          id={id}
          name="ral_code"
          value={code}
          onChange={(event) => onChange(event.target.value)}
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          placeholder="7016"
          aria-invalid={error ? true : undefined}
          aria-describedby={[error ? null : `${id}-name`, error ? `${id}-error` : null].filter(Boolean).join(" ")}
          className="h-14 w-40 shrink-0 rounded-md border border-input bg-background px-3 text-center text-[24px] font-semibold tracking-widest text-foreground tabular-nums outline-none select-text placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring"
        />
        <div className="min-w-0">
          {/* The read-back stays in place (empty while a refusal shows), so
              it still announces the name once the number is changed. */}
          <p
            id={`${id}-name`}
            aria-live="polite"
            className={cn(SMALL, "line-clamp-2", known ? "font-semibold" : "text-muted-foreground")}
            data-testid={`${id}-name`}
          >
            {error ? null : smartApostrophes(status)}
          </p>
          {error ? (
            <p id={`${id}-error`} role="alert" className={cn(SMALL, "line-clamp-2 font-semibold text-destructive")}>
              {smartApostrophes(error)}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
