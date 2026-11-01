"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useState, useTransition } from "react";
import { RalCodeField } from "@/components/ral-code-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError } from "@/components/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ralLabel, type TrackColour } from "@/lib/leads/track-colour";
import {
  addTrackColour,
  moveTrackColour,
  setTrackColourActive,
  updateTrackColour,
  type TrackColourFormState,
} from "./track-colour-actions";

// Keenan's track colours. Each has a name and an optional RAL code. Colours
// are added, renamed, reordered and retired, never deleted, so old leads
// keep theirs. Names only, no swatches.
export function TrackColours({
  colours,
  ralNames,
}: {
  colours: TrackColour[];
  ralNames: Record<string, string>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setMessage(result.error);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Track colours</CardTitle>
        <CardDescription>
          White is the only stock track colour. These are the choices for a
          lead&apos;s track colour, in this order; any other colour is set on
          the lead as Custom with its RAL code. A retired colour stays on the
          leads that have it.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <ol className="flex flex-col divide-y rounded-md border" aria-label="Track colours">
          {colours.map((colour, index) => (
            <li key={colour.id} className="flex flex-col gap-3 p-3" data-testid="track-colour-row">
              {editing === colour.id ? (
                <EditColour colour={colour} ralNames={ralNames} onDone={() => setEditing(null)} />
              ) : (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <div className="min-w-0 flex-1">
                    <p className={colour.active ? "font-semibold" : "font-semibold text-muted-foreground"}>
                      {colour.name}
                      {colour.active ? null : <span className="ml-2 text-sm font-normal">Retired</span>}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {colour.ral_code ? ralLabel(colour.ral_code, ralNames[colour.ral_code]) : "No RAL code"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-11"
                      disabled={pending || index === 0}
                      onClick={() => run(() => moveTrackColour(colour.id, "up"))}
                    >
                      <ArrowUp aria-hidden="true" />
                      <span className="sr-only">Move {colour.name} up</span>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-11"
                      disabled={pending || index === colours.length - 1}
                      onClick={() => run(() => moveTrackColour(colour.id, "down"))}
                    >
                      <ArrowDown aria-hidden="true" />
                      <span className="sr-only">Move {colour.name} down</span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11"
                      disabled={pending}
                      onClick={() => {
                        setMessage(null);
                        setEditing(colour.id);
                      }}
                    >
                      Edit<span className="sr-only"> {colour.name}</span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11"
                      disabled={pending}
                      onClick={() => run(() => setTrackColourActive(colour.id, !colour.active))}
                    >
                      {colour.active ? "Retire" : "Restore"}
                      <span className="sr-only"> {colour.name}</span>
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ol>
        {message ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {message}
          </p>
        ) : null}
        <AddColour ralNames={ralNames} />
      </CardContent>
    </Card>
  );
}

// Saves one colour form through a transition, so what was typed stays after
// an error and the caller hears about a success.
function useColourForm(
  action: (state: TrackColourFormState, formData: FormData) => Promise<TrackColourFormState>,
  onSaved: () => void,
) {
  const [state, setState] = useState<TrackColourFormState>({});
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await action({}, formData);
      if (result.ok) {
        setState({});
        onSaved();
      } else {
        setState(result);
      }
    });
  }

  return { state, pending, onSubmit };
}

function EditColour({
  colour,
  ralNames,
  onDone,
}: {
  colour: TrackColour;
  ralNames: Record<string, string>;
  onDone: () => void;
}) {
  const { state, pending, onSubmit } = useColourForm(updateTrackColour, onDone);
  const nameId = `track-colour-${colour.id}-name`;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
      <input type="hidden" name="id" value={colour.id} />
      <div className="flex flex-col gap-2">
        <Label htmlFor={nameId}>Name</Label>
        <Input
          id={nameId}
          name="name"
          defaultValue={colour.name}
          maxLength={40}
          autoComplete="off"
          aria-invalid={state.errors?.name ? true : undefined}
          aria-describedby={state.errors?.name ? `${nameId}-error` : undefined}
        />
        <FieldError id={`${nameId}-error`} message={state.errors?.name} />
      </div>
      <RalCodeField
        id={`track-colour-${colour.id}-ral`}
        label="RAL code (optional)"
        defaultValue={colour.ral_code}
        ralNames={ralNames}
        error={state.errors?.ral_code}
      />
      {state.error && !state.errors ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {state.error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending} className="min-h-11">
          {pending ? "Saving" : "Save colour"}
        </Button>
        <Button type="button" variant="outline" className="min-h-11" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function AddColour({ ralNames }: { ralNames: Record<string, string> }) {
  // A fresh, empty form after each colour is added.
  const [round, setRound] = useState(0);
  const { state, pending, onSubmit } = useColourForm(addTrackColour, () => setRound((n) => n + 1));

  return (
    <form
      key={round}
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-3 rounded-md border p-3"
      aria-labelledby="add-track-colour"
    >
      <p id="add-track-colour" className="font-semibold">
        Add a colour
      </p>
      <div className="flex flex-col gap-2">
        <Label htmlFor="track-colour-new-name">Name</Label>
        <Input
          id="track-colour-new-name"
          name="name"
          maxLength={40}
          autoComplete="off"
          aria-invalid={state.errors?.name ? true : undefined}
          aria-describedby={state.errors?.name ? "track-colour-new-name-error" : undefined}
        />
        <FieldError id="track-colour-new-name-error" message={state.errors?.name} />
      </div>
      <RalCodeField
        id="track-colour-new-ral"
        label="RAL code (optional)"
        ralNames={ralNames}
        error={state.errors?.ral_code}
      />
      {state.error && !state.errors ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="min-h-11 w-fit">
        {pending ? "Adding" : "Add colour"}
      </Button>
    </form>
  );
}
