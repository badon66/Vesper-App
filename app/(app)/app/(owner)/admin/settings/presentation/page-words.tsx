"use client";

import { CircleAlert, Minus, Plus } from "lucide-react";
import Link from "next/link";
import { FieldError } from "@/components/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { WORD_LIMITS, wordCount, type PageWords, type WordsPageKey } from "@/lib/deck";
import {
  headlineLength,
  isDraftField,
  LINES_UP_FRONT_KEY,
  MAX_LINES_UP_FRONT,
  PAGE_FIELDS,
  PAGE_HELP,
  warrantyLines,
  wordsToAvoid,
  type WordsField,
} from "@/lib/settings/deck-schema";
import { cn } from "@/lib/utils";

// One page's words in Settings: the headline, the words, the More button's
// label and the words behind it, each with a live count against the copy
// rules' limits. Fields a page doesn't have are not shown, and the save
// never touches them. The built pages' lines are lines-words.tsx.

const WORDS_LABEL: Partial<Record<WordsPageKey, string>> = {
  light_picker: "The line under it",
  your_house: "The line under it",
  mockup: "The line under it",
};

const WORDS_HINT: Partial<Record<WordsPageKey, string>> = {
  light_picker: "Two lines at most beside Steady, Twinkle, Chase and Off.",
  your_house: "{feet} is filled in with the feet measured on the quote. The line is hidden until something is measured.",
};

const BUTTON_HINT: Partial<Record<WordsPageKey, string>> = {
  gallery: "The meeting adds the real count, like See all 6. It opens the grid of every photo.",
  warranty: "It opens every line of the warranty, word for word.",
  your_house: "It opens our drawing of their roofline, every measured run lit and named with its feet. Shown once something is measured.",
  next_steps: "It opens what we need on install day, beside the control box photo.",
};

export const wordsFieldId = (page: WordsPageKey, field: WordsField) => `deck-${page}-${field}`;
export const LINES_UP_FRONT_ID = "deck-warranty-lines-up-front";

type Props = {
  page: WordsPageKey;
  value: PageWords;
  onChange: (field: WordsField, text: string) => void;
  onBlur: (field: WordsField) => void;
  // Messages to show now (the editor decides which are due).
  errors: Partial<Record<WordsField | typeof LINES_UP_FRONT_KEY, string>>;
  linesUpFront?: number;
  onLinesUpFront?: (count: number) => void;
  warrantyText?: string;
};

export function PageWords({ page, value, onChange, onBlur, errors, linesUpFront, onLinesUpFront, warrantyText }: Props) {
  const rules = PAGE_FIELDS[page];
  return (
    <div className="flex flex-col gap-5">
      <p className="max-w-prose text-sm text-pretty text-muted-foreground">{PAGE_HELP[page]}</p>
      <WordsInput
        page={page}
        field="headline"
        label={page === "mockup" ? "Title" : "Headline"}
        value={value.headline}
        onChange={onChange}
        onBlur={onBlur}
        error={errors.headline}
        count={{ n: headlineLength(value.headline), max: WORD_LIMITS.headlineChars, unit: "characters" }}
      />
      {rules.words ? (
        <WordsInput
          page={page}
          field="words"
          label={WORDS_LABEL[page] ?? "Words"}
          hint={WORDS_HINT[page]}
          value={value.words}
          onChange={onChange}
          onBlur={onBlur}
          error={errors.words}
          rows={3}
          count={{ n: wordCount(value.words), max: rules.words.max, aim: rules.words.aim, unit: "words" }}
        />
      ) : null}
      {page === "warranty" && onLinesUpFront ? (
        <LinesUpFront count={linesUpFront ?? 3} onChange={onLinesUpFront} warrantyText={warrantyText ?? ""} error={errors[LINES_UP_FRONT_KEY]} />
      ) : null}
      {rules.moreLabel ? (
        <WordsInput
          page={page}
          field="moreLabel"
          label="Button label"
          hint={BUTTON_HINT[page] ?? "Say what's behind it, like What's in it or Up close. The button is hidden when there's nothing behind it."}
          value={value.moreLabel}
          onChange={onChange}
          onBlur={onBlur}
          error={errors.moreLabel}
          count={{ n: wordCount(value.moreLabel), max: rules.moreLabel.maxWords, unit: "words" }}
        />
      ) : null}
      {rules.moreText ? (
        <WordsInput
          page={page}
          field="moreText"
          label="Words behind the button"
          hint="One full screen beside its picture. Line breaks show as written."
          value={value.moreText}
          onChange={onChange}
          onBlur={onBlur}
          error={errors.moreText}
          rows={5}
          count={{ n: wordCount(value.moreText), max: WORD_LIMITS.moreWords, unit: "words" }}
        />
      ) : null}
    </div>
  );
}

function WordsInput({
  page,
  field,
  label,
  hint,
  value,
  onChange,
  onBlur,
  error,
  count,
  rows,
  after,
}: {
  page: WordsPageKey;
  field: WordsField;
  label: string;
  hint?: string;
  value: string;
  onChange: Props["onChange"];
  onBlur: Props["onBlur"];
  error?: string;
  count: { n: number; max: number; aim?: number; unit: "words" | "characters" };
  rows?: number;
  after?: React.ReactNode;
}) {
  const id = wordsFieldId(page, field);
  const draft = isDraftField(page, field, value);
  const notes = wordsToAvoid(value);
  const over = count.n > count.max;
  const describedBy = [`${id}-count`, hint ? `${id}-hint` : null, error ? `${id}-error` : null, notes.length > 0 ? `${id}-notes` : null]
    .filter(Boolean)
    .join(" ");
  const props = {
    id,
    value,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(field, event.currentTarget.value),
    onBlur: () => onBlur(field),
    "aria-invalid": error ? (true as const) : undefined,
    "aria-describedby": describedBy,
    autoComplete: "off",
    spellCheck: true,
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex items-center gap-2">
          <Label htmlFor={id}>{label}</Label>
          {draft ? <DraftTag /> : null}
        </div>
        <p id={`${id}-count`} className={cn("text-sm tabular-nums", over ? "font-semibold text-destructive" : "text-muted-foreground")}>
          {count.n} of {count.max} {count.unit}
          {count.aim ? `, aim for ${count.aim}` : ""}
        </p>
      </div>
      {rows ? <Textarea {...props} rows={rows} /> : <Input {...props} />}
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {after}
      <FieldError id={`${id}-error`} message={error} />
      {notes.length > 0 ? <AvoidNotes id={`${id}-notes`} notes={notes} /> : null}
    </div>
  );
}

export function DraftTag() {
  return (
    <span
      className="rounded-sm bg-muted px-1.5 py-0.5 text-xs font-semibold text-muted-foreground"
      title="Unchanged since it was first written. Make it yours."
    >
      Draft<span className="sr-only">: unchanged since it was first written</span>
    </span>
  );
}

// Reminders from the copy rules. They never block a save.
export function AvoidNotes({ id, notes }: { id: string; notes: string[] }) {
  return (
    <div id={id} className="flex gap-2 rounded-md border px-3 py-2 text-sm">
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="flex flex-col gap-0.5">
        <p className="font-semibold">Check before customers read it</p>
        {notes.map((note) => (
          <p key={note} className="text-muted-foreground">
            {note}
          </p>
        ))}
      </div>
    </div>
  );
}

// How many of the warranty's lines show up front, always from the top,
// with the lines themselves so Keenan sees exactly what the page says.
function LinesUpFront({
  count,
  onChange,
  warrantyText,
  error,
}: {
  count: number;
  onChange: (count: number) => void;
  warrantyText: string;
  error?: string;
}) {
  const lines = warrantyLines(warrantyText);
  const max = lines.length > 1 ? Math.min(MAX_LINES_UP_FRONT, lines.length - 1) : MAX_LINES_UP_FRONT;
  return (
    <fieldset className="flex flex-col gap-3" aria-describedby={error ? `${LINES_UP_FRONT_ID}-error` : undefined}>
      <legend className="text-sm font-semibold">Warranty lines up front</legend>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="icon" disabled={count <= 1} onClick={() => onChange(Math.max(1, count - 1))}>
          <Minus aria-hidden="true" />
          <span className="sr-only">One line fewer</span>
        </Button>
        <output id={LINES_UP_FRONT_ID} aria-live="polite" className="w-10 text-center text-xl font-bold tabular-nums">
          {count}
        </output>
        <Button type="button" variant="outline" size="icon" disabled={count >= max} onClick={() => onChange(Math.min(max, count + 1))}>
          <Plus aria-hidden="true" />
          <span className="sr-only">One line more</span>
        </Button>
        <p className="text-sm text-muted-foreground">from the top, word for word</p>
      </div>
      {lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          The Warranty text is empty.{" "}
          <Link href="/app/admin/settings#settings-warranty_text" className="font-semibold text-foreground underline underline-offset-4">
            Write it in Settings
          </Link>
          .
        </p>
      ) : (
        <div className="flex flex-col gap-2 rounded-md border p-3 text-sm">
          <p className="font-semibold">On the page</p>
          <ol className="flex flex-col gap-1">
            {lines.slice(0, count).map((line, at) => (
              <li key={`${at}-${line}`}>{line}</li>
            ))}
          </ol>
          <p className="text-muted-foreground">
            Behind the button: all {lines.length} lines, and the service call fee when it is set.{" "}
            <Link href="/app/admin/settings#settings-warranty_text" className="font-semibold text-foreground underline underline-offset-4">
              Edit the warranty
            </Link>
          </p>
        </div>
      )}
      <FieldError id={`${LINES_UP_FRONT_ID}-error`} message={error} />
    </fieldset>
  );
}
