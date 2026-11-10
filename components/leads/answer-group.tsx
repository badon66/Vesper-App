"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { FieldError } from "@/components/field-error";
import {
  NOT_COLLECTED,
  NOT_COLLECTED_LABEL,
  NOTE_MAX,
} from "@/lib/leads/questions";
import { cn } from "@/lib/utils";

// The quiet "Not collected" answer beside a question (round 2): a small
// dashed chip on the question's own line, so it costs no extra row. Its
// touch area is the full 44 px, reaching a little into the space around the
// line, while the chip itself stays clear of the answers below. Chosen, it
// turns light on dark with a tick, like any chosen answer.
const CHIP_TOUCH =
  "relative -my-1.5 inline-flex min-h-11 shrink-0 cursor-pointer items-center outline-none";
const CHIP_FACE =
  "inline-flex h-8 items-center gap-1.5 rounded-md border border-dashed border-input bg-background px-3 text-sm font-medium text-muted-foreground transition-colors";
const CHIP_FACE_ON =
  "border-solid border-foreground bg-foreground text-background";
const CHIP_FACE_SHEET = "min-[420px]:h-9 min-[420px]:text-base";

// The phone's Not collected: the same chip, as a button that toggles.
export function NotCollectedToggle({
  pressed,
  onToggle,
  size = "form",
  label,
  testId,
}: {
  pressed: boolean;
  onToggle: () => void;
  size?: "form" | "sheet";
  // What a screen reader hears, e.g. "Phone: Not collected".
  label: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      onClick={onToggle}
      data-testid={testId}
      className={cn(CHIP_TOUCH, "group")}
    >
      <span
        className={cn(
          CHIP_FACE,
          size === "sheet" && CHIP_FACE_SHEET,
          pressed && CHIP_FACE_ON,
          "group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-background",
        )}
      >
        {pressed ? (
          <Check aria-hidden="true" className="size-4 shrink-0" />
        ) : null}
        {NOT_COLLECTED_LABEL}
      </span>
    </button>
  );
}

// Round 6 (Keenan, 2026-11-07): a small Note chip beside Not collected,
// for a quick note on that answer. Chosen (or holding a note) it turns light
// on dark like any chosen chip, and a one-line box opens under the answers.
export function NoteToggle({
  open,
  hasText,
  onToggle,
  label,
  size = "form",
  testId,
}: {
  open: boolean;
  hasText: boolean;
  onToggle: () => void;
  label: string;
  size?: "form" | "sheet";
  testId?: string;
}) {
  const on = open || hasText;
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={label}
      onClick={onToggle}
      data-testid={testId}
      className={cn(CHIP_TOUCH, "group")}
    >
      <span
        className={cn(
          CHIP_FACE,
          size === "sheet" && CHIP_FACE_SHEET,
          on && CHIP_FACE_ON,
          "group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-background",
        )}
      >
        {hasText ? (
          <Check aria-hidden="true" className="size-4 shrink-0" />
        ) : null}
        Note
      </span>
    </button>
  );
}

// The note's own box. In a form it carries `name`; in the sheet it's
// controlled.
export function NoteField({
  id,
  name,
  label,
  value,
  onChange,
  autoFocus,
}: {
  id: string;
  name?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <input
      id={id}
      name={name}
      type="text"
      aria-label={label}
      placeholder="A quick note on this answer"
      autoComplete="off"
      enterKeyHint="done"
      maxLength={NOTE_MAX}
      // Opened by a tap, it's ready to type in.
      autoFocus={autoFocus}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
      className="h-11 w-full rounded-md border border-input bg-background px-3 text-base outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
      data-testid={`${id}-input`}
    />
  );
}

// A one-tap question: big choices backed by real radio buttons, so they work
// with one thumb and with a keyboard or screen reader. The chosen answer is
// light on dark with a tick, not gold: gold is kept for the next step.
// Tapping the chosen answer again clears it. Round 2 (Keenan, 2026-11-03):
// a counted question also offers "Not collected", beside the question, and
// the booking sheet's answers grow on a wide phone.
export function AnswerGroup<T extends string>({
  name,
  legend,
  options,
  value,
  onChange,
  columns = 2,
  error,
  hideLegend = false,
  notCollected = false,
  size = "form",
  describedBy,
  chosen,
  onTap,
  note,
  id,
}: {
  name: string;
  legend: string;
  options: { value: T; label: string }[];
  value: T | string | null;
  // Not collected arrives as NOT_COLLECTED.
  onChange: (value: T | null) => void;
  // Four in a row take smaller words, so they fit one row.
  columns?: 2 | 3 | 4;
  error?: string;
  // When the screen's heading already asks the question.
  hideLegend?: boolean;
  // Offer "Not collected" beside the question.
  notCollected?: boolean;
  // The booking sheet's answers step up at 420 px and wider.
  size?: "form" | "sheet";
  // A note about the question, shown elsewhere on the screen.
  describedBy?: string;
  // Round 6: more than one choice at a time (Christmas lights now, Looked
  // into it before, a split soffit). The parent says which are chosen and
  // what a tap does; the choices are checkboxes with no name, so a form
  // carries the answer in its own hidden fields.
  chosen?: string[];
  onTap?: (option: T) => void;
  // Round 6: a Note chip beside Not collected, and the note's box.
  note?: { value: string; onChange: (value: string) => void; name?: string };
  // Book now, finish later (2026-11-10): the edit page's questions carry an
  // id (q-<question>), so an item still to finish can jump straight here.
  // It clears the sticky header, and is marked for a moment on landing.
  id?: string;
}) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteFocus, setNoteFocus] = useState(false);
  const multiple = chosen !== undefined && onTap !== undefined;
  const grid = { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4" }[
    columns
  ];
  const radio = (optionValue: string) =>
    multiple && optionValue !== NOT_COLLECTED ? (
      <input
        type="checkbox"
        value={optionValue}
        checked={chosen.includes(optionValue)}
        onChange={() => onTap(optionValue as T)}
        className="sr-only"
      />
    ) : (
      <input
        type="radio"
        // In a multiple-choice question only Not collected is a radio, and
        // the parent's hidden field carries the answer.
        name={multiple ? undefined : name}
        value={optionValue}
        checked={value === optionValue}
        onChange={() => onChange(optionValue as T)}
        onClick={() => {
          if (value === optionValue) onChange(null);
        }}
        className="sr-only"
      />
    );
  const noteShown = note ? noteOpen || note.value.trim() !== "" : false;
  const marked = value === NOT_COLLECTED;
  return (
    <fieldset
      id={id}
      className={cn(
        "flex flex-col rounded-md",
        notCollected ? "gap-1.5" : "gap-2",
        id &&
          "scroll-mt-40 ring-offset-4 ring-offset-background data-landed:ring-2 data-landed:ring-ring",
      )}
      aria-describedby={
        [describedBy, error ? `${name}-error` : null]
          .filter(Boolean)
          .join(" ") || undefined
      }
      data-question={name}
    >
      <legend
        className={
          hideLegend || notCollected || note
            ? "sr-only"
            : cn(
                "mb-2 text-sm font-semibold",
                size === "sheet" && "min-[420px]:text-base",
              )
        }
      >
        {legend}
      </legend>
      {notCollected || note ? (
        <div className="flex items-center justify-between gap-2">
          <span
            aria-hidden="true"
            className={cn(
              "text-sm font-semibold text-pretty",
              size === "sheet" && "min-[420px]:text-base",
              hideLegend && "invisible",
            )}
          >
            {legend}
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {note ? (
              <NoteToggle
                open={noteOpen}
                hasText={note.value.trim() !== ""}
                size={size}
                label={`${legend}: note`}
                testId={`${name}-note-toggle`}
                onToggle={() => {
                  setNoteFocus(!noteOpen);
                  setNoteOpen(!noteOpen);
                }}
              />
            ) : null}
            {notCollected ? (
              <label
                data-answer={NOT_COLLECTED}
                className={cn(CHIP_TOUCH, "group")}
              >
                {radio(NOT_COLLECTED)}
                <span
                  className={cn(
                    CHIP_FACE,
                    size === "sheet" && CHIP_FACE_SHEET,
                    marked && CHIP_FACE_ON,
                    "group-has-[:focus-visible]:ring-2 group-has-[:focus-visible]:ring-ring group-has-[:focus-visible]:ring-offset-2 group-has-[:focus-visible]:ring-offset-background",
                  )}
                >
                  {marked ? (
                    <Check aria-hidden="true" className="size-4 shrink-0" />
                  ) : null}
                  {NOT_COLLECTED_LABEL}
                </span>
              </label>
            ) : null}
          </span>
        </div>
      ) : null}
      <div className={`grid gap-2 ${grid}`}>
        {options.map((option) => (
          <label
            key={option.value}
            data-answer={option.value}
            className={cn(
              "group relative flex min-h-12 cursor-pointer items-center justify-center rounded-md border border-input bg-background px-2 py-1 text-center text-base font-semibold leading-tight transition-colors has-[:checked]:border-foreground has-[:checked]:bg-foreground has-[:checked]:text-background has-[:disabled]:cursor-not-allowed has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background",
              columns === 4 && "max-[419px]:text-sm",
              size === "sheet" && "min-[420px]:min-h-14",
              size === "sheet" &&
                (columns === 4
                  ? "min-[420px]:text-base"
                  : "min-[420px]:text-lg"),
            )}
          >
            {radio(option.value)}
            {/* The tick runs in the words' own line, so choosing an answer
                never pushes its words onto another line (round 2 polish).
                Four across there's no room beside the words, so the tick
                sits in the chip's corner instead (round 3). */}
            {columns === 4 ? (
              <>
                <Check
                  aria-hidden="true"
                  className="absolute top-1 left-1 hidden size-3.5 group-has-[:checked]:block"
                />
                <span>{option.label}</span>
              </>
            ) : (
              <span>
                <Check
                  aria-hidden="true"
                  className="mr-1 hidden size-4 align-[-0.15em] group-has-[:checked]:inline-block"
                />
                {option.label}
              </span>
            )}
          </label>
        ))}
      </div>
      {note && noteShown ? (
        <NoteField
          id={`${name}-note`}
          name={note.name}
          label={`${legend}: note`}
          value={note.value}
          onChange={note.onChange}
          autoFocus={noteFocus}
        />
      ) : note?.name ? (
        <input type="hidden" name={note.name} value={note.value} />
      ) : null}
      <FieldError id={`${name}-error`} message={error} />
    </fieldset>
  );
}
