"use client";

import { useEffect, useRef, useState } from "react";
import { FieldError } from "@/components/field-error";
import { AnswerGroup, NoteField, NotCollectedToggle, NoteToggle } from "@/components/leads/answer-group";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FIND_OUT_QUESTIONS, splitAnswer, toggleAnswer, toggleSoffit, type FindOutField, type PairedQuestion } from "@/lib/leads/door";
import {
  EVERYONE_OPTIONS,
  isQuestionDone,
  NOT_COLLECTED,
  NOT_COLLECTED_LABEL,
  QUESTION_LABELS,
  type AnswerNotes,
  type CountedQuestion,
  type NoteKey,
} from "@/lib/leads/questions";
import type { SoffitColour } from "@/lib/leads/status";
import { ANSWER_OR_NOT_COLLECTED, type LeadFormErrors } from "@/lib/leads/schema";
import { formatPhone, normalizePhone } from "@/lib/phone";

// The questions on New lead and Edit lead (round 2, Keenan, 2026-11-03):
// the phone, then what they found out, in the order they're asked at the
// door. Every one takes an answer or Not collected, in any order, and the
// lead can't be saved until each has one; "Mark the rest Not collected"
// does the rest in one tap. The soffit colour keeps its Not sure answer and
// isn't needed to save. Answers are kept while the form is open, so a
// correction from the server never loses them.

export type QuestionField = FindOutField | "both_decision_makers";
export type QuestionDefaults = Record<QuestionField, string | null>;

// The questions after the phone, in the order they're asked.
const ASKED: { field: Exclude<QuestionField, "soffit_colour">; legend: string; options: { value: string; label: string }[]; columns: 2 | 3 | 4 }[] = [
  ...FIND_OUT_QUESTIONS.filter((item) => item.field === "owns_home" || item.field === "wants_price").map((item) => ({
    field: item.field as "owns_home" | "wants_price",
    legend: item.question,
    options: item.options,
    columns: 2 as const,
  })),
  { field: "both_decision_makers", legend: QUESTION_LABELS.both_decision_makers, options: EVERYONE_OPTIONS, columns: 2 },
  ...FIND_OUT_QUESTIONS.filter((item) => !["owns_home", "wants_price", "soffit_colour"].includes(item.field)).map((item) => ({
    field: item.field as "christmas_lights_now" | "looked_into_before",
    legend: item.question,
    options: item.options,
    columns: Math.min(Math.max(item.options.length, 2), 4) as 2 | 3 | 4,
  })),
];

const SOFFIT = FIND_OUT_QUESTIONS.find((item) => item.field === "soffit_colour")!;

// The counted questions still open, the phone first.
function openOf(answers: QuestionDefaults, phoneTyped: boolean, phoneMarked: boolean): CountedQuestion[] {
  return [
    ...(phoneTyped || phoneMarked ? [] : (["phone"] as CountedQuestion[])),
    ...ASKED.filter((item) => !isQuestionDone(answers[item.field])).map((item) => item.field),
  ];
}

// Whether the answers so far rule booking out. Book now, finish later
// (Keenan, 2026-11-10): only a No on owns the home does. No phone, Not
// collected, or a No or Not yet on the other questions no longer stops a
// booking; what's missing is finished later.
export function bookingRuledOut(answers: QuestionDefaults): boolean {
  return answers.owns_home === "no";
}

// Round 6: the two that can take two answers together.
const PAIRED: readonly string[] = ["christmas_lights_now", "looked_into_before"];

export function LeadQuestions({
  defaults,
  phone,
  phoneNotCollected,
  soffitNote,
  soffitSecond = null,
  answerNotes = {},
  errors,
  onOpenChange,
  onBookingChange,
  markRestRef,
  afterPhone,
  afterQuestions,
}: {
  defaults: QuestionDefaults;
  phone: string;
  phoneNotCollected: boolean;
  soffitNote: string;
  // Round 6: a split soffit's second colour, and each question's note.
  soffitSecond?: string | null;
  answerNotes?: AnswerNotes;
  errors: LeadFormErrors;
  // The questions still open after each change, for the form's Save check.
  onOpenChange?: (open: CountedQuestion[]) => void;
  // Whether booking is ruled out, after each change, for Save and book.
  onBookingChange?: (ruledOut: boolean) => void;
  // Lets the form's own "Mark the rest Not collected" (by Save) do the same.
  markRestRef?: React.RefObject<(() => void) | null>;
  // Round 3: Call or text to confirm, beside the phone; the setter's read
  // and hot buttons after the questions. Optional, never counted.
  afterPhone?: React.ReactNode;
  afterQuestions?: React.ReactNode;
}) {
  const [answers, setAnswers] = useState<QuestionDefaults>(defaults);
  const [phoneMarked, setPhoneMarked] = useState(phoneNotCollected && phone.trim() === "");
  const [phoneTyped, setPhoneTyped] = useState(phone.trim() !== "");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const [soffit2, setSoffit2] = useState<string | null>(soffitSecond);
  const [soffitText, setSoffitText] = useState(soffitNote);
  const [notes, setNotes] = useState<AnswerNotes>(answerNotes);
  const [phoneNoteOpen, setPhoneNoteOpen] = useState(false);
  const noteOf = (key: NoteKey) => ({
    value: notes[key] ?? "",
    name: `note_${key}`,
    onChange: (value: string) => setNotes((current) => ({ ...current, [key]: value })),
  });
  const soffitChosen = [answers.soffit_colour, soffit2].filter((item): item is string => Boolean(item));

  const open = openOf(answers, phoneTyped, phoneMarked).length;

  function update(next: { answers?: QuestionDefaults; typed?: boolean; marked?: boolean }) {
    const nextAnswers = next.answers ?? answers;
    const typed = next.typed ?? phoneTyped;
    const marked = next.marked ?? phoneMarked;
    if (next.answers) setAnswers(nextAnswers);
    if (next.typed !== undefined) setPhoneTyped(typed);
    if (next.marked !== undefined) setPhoneMarked(marked);
    onOpenChange?.(openOf(nextAnswers, typed, marked));
    onBookingChange?.(bookingRuledOut(nextAnswers));
  }

  function markPhone(marked: boolean) {
    setPhoneError(null);
    if (marked && phoneRef.current) phoneRef.current.value = "";
    update(marked ? { marked, typed: false } : { marked });
  }

  function markRest() {
    const next = { ...answers };
    for (const item of ASKED) if (!isQuestionDone(next[item.field])) next[item.field] = NOT_COLLECTED;
    if (!phoneTyped && phoneRef.current) phoneRef.current.value = "";
    update(phoneTyped ? { answers: next } : { answers: next, marked: true, typed: false });
  }
  // The form's own Mark the rest, by Save, runs this one.
  useEffect(() => {
    if (markRestRef) markRestRef.current = markRest;
  });

  function onPhoneBlur(event: React.FocusEvent<HTMLInputElement>) {
    const result = normalizePhone(event.currentTarget.value);
    if (!result.ok) {
      setPhoneError(result.error);
      return;
    }
    setPhoneError(null);
    if (result.e164) event.currentTarget.value = formatPhone(result.e164);
  }

  // "Answer this" goes once the question has something.
  const phoneMessage = phoneError ?? (errors.phone === ANSWER_OR_NOT_COLLECTED && (phoneTyped || phoneMarked) ? undefined : errors.phone);
  return (
    <>
      <div className="flex flex-col gap-3" data-question="phone">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="lead-phone">Phone</Label>
          <span className="flex shrink-0 items-center gap-2">
            <NoteToggle
              open={phoneNoteOpen}
              hasText={(notes.phone ?? "").trim() !== ""}
              label="Phone: note"
              testId="phone-note-toggle"
              onToggle={() => setPhoneNoteOpen(!phoneNoteOpen)}
            />
            <NotCollectedToggle
              pressed={phoneMarked}
              label="Phone: Not collected"
              testId="phone-not-collected"
              onToggle={() => markPhone(!phoneMarked)}
            />
          </span>
        </div>
        <Input
          ref={phoneRef}
          id="lead-phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          defaultValue={phone}
          disabled={phoneMarked}
          placeholder={phoneMarked ? NOT_COLLECTED_LABEL : undefined}
          // Book now, finish later: the phone still to finish jumps here.
          className="scroll-mt-40"
          onChange={(event) => {
            const typed = event.currentTarget.value.trim() !== "";
            if (typed !== phoneTyped) update({ typed });
          }}
          onBlur={onPhoneBlur}
          aria-invalid={phoneMessage ? true : undefined}
          aria-describedby="lead-phone-error"
        />
        {phoneMarked ? <input type="hidden" name="phone_not_collected" value="1" /> : null}
        <FieldError id="lead-phone-error" message={phoneMessage} />
        {phoneNoteOpen || (notes.phone ?? "").trim() !== "" ? (
          <NoteField id="phone-note" name="note_phone" label="Phone: note" value={notes.phone ?? ""} onChange={noteOf("phone").onChange} autoFocus={phoneNoteOpen} />
        ) : (
          <input type="hidden" name="note_phone" value={notes.phone ?? ""} />
        )}
        {afterPhone}
      </div>

      <section aria-labelledby="find-out-heading" className="flex flex-col gap-5" data-testid="find-out">
        <div>
          <h2 id="find-out-heading" className="text-lg font-bold">
            Find out
          </h2>
          <p className="text-sm text-pretty text-muted-foreground">
            Answer each one, or mark it Not collected, in any order. Tap an answer again to clear it.
          </p>
        </div>
        {ASKED.map(({ field, legend, options, columns }) => {
          // Round 6: Christmas lights now and Looked into it before take two
          // answers together; the hidden field carries the one stored.
          const paired = PAIRED.includes(field) ? (field as PairedQuestion) : null;
          const value = answers[field];
          return (
            <div key={field} className="contents">
              <AnswerGroup
                id={`q-${field}`}
                name={field}
                legend={legend}
                options={options}
                value={value}
                columns={columns}
                notCollected
                note={noteOf(field)}
                {...(paired
                  ? {
                      chosen: value === NOT_COLLECTED ? [] : splitAnswer(paired, value),
                      onTap: (option: string) => update({ answers: { ...answers, [field]: toggleAnswer(paired, value === NOT_COLLECTED ? null : value, option) } }),
                    }
                  : {})}
                error={errors[field] === ANSWER_OR_NOT_COLLECTED && isQuestionDone(value) ? undefined : errors[field]}
                onChange={(next) => update({ answers: { ...answers, [field]: next } })}
              />
              {paired ? <input type="hidden" name={field} value={value ?? ""} /> : null}
            </div>
          );
        })}
        <div className="flex flex-wrap items-center justify-between gap-2" aria-live="polite">
          <p className="text-sm text-muted-foreground" data-testid="questions-open">
            {open === 0 ? "Every question has an answer." : `${open} still open.`}
          </p>
          {open > 0 ? (
            <Button type="button" variant="link" size="sm" className="px-0" onClick={markRest} data-testid="mark-rest">
              Mark the rest Not collected
            </Button>
          ) : null}
        </div>

        {/* Round 6: a split soffit takes two colours, then a short note
            saying which is where. Not sure stands alone. */}
        <AnswerGroup
          id="q-soffit_colour"
          name="soffit_colour"
          legend={`${SOFFIT.question} (two for a split soffit)`}
          options={SOFFIT.options}
          value={answers.soffit_colour}
          columns={2}
          error={errors.soffit_colour}
          note={noteOf("soffit_colour")}
          chosen={soffitChosen}
          onTap={(option) => {
            const next = toggleSoffit(soffitChosen as SoffitColour[], option as SoffitColour);
            setAnswers((current) => ({ ...current, soffit_colour: next[0] ?? null }));
            setSoffit2(next[1] ?? null);
          }}
          onChange={() => {}}
        />
        <input type="hidden" name="soffit_colour" value={answers.soffit_colour ?? ""} />
        <input type="hidden" name="soffit_colour_2" value={soffit2 ?? ""} />
        {answers.soffit_colour === "other" || soffit2 ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="lead-soffit_note">{soffit2 ? "Which colour is where?" : "Soffit colour note"}</Label>
            <Input
              id="lead-soffit_note"
              name="soffit_note"
              value={soffitText}
              onChange={(event) => setSoffitText(event.target.value)}
              placeholder={soffit2 ? "White at the front, cream at the back" : undefined}
            />
            <FieldError id="lead-soffit_note-error" message={errors.soffit_note} />
          </div>
        ) : null}
      </section>
      {afterQuestions ? <section className="flex flex-col gap-5" data-testid="setter-notes-fields">{afterQuestions}</section> : null}
    </>
  );
}
