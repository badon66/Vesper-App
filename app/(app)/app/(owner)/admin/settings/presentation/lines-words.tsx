"use client";

import { RotateCcw } from "lucide-react";
import { FieldError } from "@/components/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DECK_LINE_DEFAULTS, LINE_SPECS, linesIn, wordCount, type DeckLineKey, type DeckLines, type LineGroup } from "@/lib/deck";
import { isDraftLine, wordsToAvoid } from "@/lib/settings/deck-schema";
import { cn } from "@/lib/utils";
import { AvoidNotes, DraftTag } from "./page-words";

// The built pages' lines in Settings (round 9, settings.deck.lines): the
// cover's line, the Next label, the colour page, the price, What happens
// next and the customer's link, each in one box with a live count, the
// names it fills in, and Use ours to put our words back. Every word here is
// read by customers. They save with the pages' words, from the same bar.

export const lineFieldId = (key: DeckLineKey) => `deck-line-${key}`;

type Props = {
  group: LineGroup;
  lines: DeckLines;
  onChange: (key: DeckLineKey, text: string) => void;
  onBlur: (key: DeckLineKey) => void;
  // Messages to show now (the editor decides which are due).
  errors: Partial<Record<DeckLineKey, string>>;
};

const braced = (names: readonly string[]) => names.map((name) => `{${name}}`).join(", ");

export function LinesWords({ group, lines, onChange, onBlur, errors }: Props) {
  return (
    <div className="flex flex-col gap-5" data-testid={`deck-lines-${group}`}>
      {linesIn(group).map((key) => (
        <LineInput key={key} lineKey={key} value={lines[key]} onChange={onChange} onBlur={onBlur} error={errors[key]} />
      ))}
    </div>
  );
}

function LineInput({
  lineKey,
  value,
  onChange,
  onBlur,
  error,
}: {
  lineKey: DeckLineKey;
  value: string;
  onChange: Props["onChange"];
  onBlur: Props["onBlur"];
  error?: string;
}) {
  const spec = LINE_SPECS[lineKey];
  const id = lineFieldId(lineKey);
  const ours = DECK_LINE_DEFAULTS[lineKey];
  const draft = isDraftLine(lineKey, value);
  const notes = wordsToAvoid(value);
  const n = wordCount(value);
  const over = n > spec.words;
  const fills = spec.fill ?? [];
  const hint = fills.length > 0 ? `Filled in on screen: ${braced(fills)}.` : null;
  const describedBy = [`${id}-count`, hint ? `${id}-hint` : null, error ? `${id}-error` : null, notes.length > 0 ? `${id}-notes` : null]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex items-center gap-2">
          <Label htmlFor={id}>{spec.label}</Label>
          {draft ? <DraftTag /> : null}
        </div>
        <p id={`${id}-count`} className={cn("text-sm tabular-nums", over ? "font-semibold text-destructive" : "text-muted-foreground")}>
          {n} of {spec.words} {spec.words === 1 ? "word" : "words"}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          value={value}
          onChange={(event) => onChange(lineKey, event.currentTarget.value)}
          onBlur={() => onBlur(lineKey)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          autoComplete="off"
          spellCheck
        />
        {value.trim() !== ours ? (
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 shrink-0"
            onClick={() => {
              onChange(lineKey, ours);
              onBlur(lineKey);
            }}
          >
            <RotateCcw aria-hidden="true" />
            Use ours
          </Button>
        ) : null}
      </div>
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
      <FieldError id={`${id}-error`} message={error} />
      {notes.length > 0 ? <AvoidNotes id={`${id}-notes`} notes={notes} /> : null}
    </div>
  );
}
