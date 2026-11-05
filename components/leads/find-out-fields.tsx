"use client";

import { useEffect, useRef, useState } from "react";
import { FieldError } from "@/components/field-error";
import { AnswerGroup, NotCollectedToggle } from "@/components/leads/answer-group";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FIND_OUT_QUESTIONS, type FindOutField } from "@/lib/leads/door";
import {
  EVERYONE_OPTIONS,
  isQuestionDone,
  NOT_COLLECTED,
  NOT_COLLECTED_LABEL,
  QUESTION_LABELS,
  type CountedQuestion,
} from "@/lib/leads/questions";
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
    field: item.field as "christmas_lights_now" | "looked_into_before" | "areas_wanted" | "install_timing",
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

// Whether the answers so far rule booking out: the phone or a booking
// question marked Not collected, or answered No or Not yet.
export function bookingRuledOut(answers: QuestionDefaults, phoneMarked: boolean): boolean {
  const ruledOut = (value: string | null) => value === NOT_COLLECTED || value === "no" || value === "not_yet";
  return phoneMarked || ruledOut(answers.owns_home) || ruledOut(answers.wants_price) || ruledOut(answers.both_decision_makers);
}

export function LeadQuestions({
  defaults,
  phone,
  phoneNotCollected,
  soffitNote,
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

  const open = openOf(answers, phoneTyped, phoneMarked).length;

  function update(next: { answers?: QuestionDefaults; typed?: boolean; marked?: boolean }) {
    const nextAnswers = next.answers ?? answers;
    const typed = next.typed ?? phoneTyped;
    const marked = next.marked ?? phoneMarked;
    if (next.answers) setAnswers(nextAnswers);
    if (next.typed !== undefined) setPhoneTyped(typed);
    if (next.marked !== undefined) setPhoneMarked(marked);
    onOpenChange?.(openOf(nextAnswers, typed, marked));
    onBookingChange?.(bookingRuledOut(nextAnswers, marked));
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
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="lead-phone">Phone</Label>
          <NotCollectedToggle
            pressed={phoneMarked}
            label="Phone: Not collected"
            testId="phone-not-collected"
            onToggle={() => markPhone(!phoneMarked)}
          />
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
          onChange={(event) => {
            const typed = event.currentTarget.value.trim() !== "";
            if (typed !== phoneTyped) update({ typed });
          }}
          onBlur={onPhoneBlur}
          aria-invalid={phoneMessage ? true : undefined}
          aria-describedby="lead-phone-error"
        />
        {phoneMarked ? <input type="hidden" name="phone_not_collected" value="1" /> : null}
        {phoneMarked ? (
          <p className="text-sm font-semibold text-pretty" data-testid="phone-not-collected-note">
            Without a number, they can&apos;t be booked.
          </p>
        ) : null}
        <FieldError id="lead-phone-error" message={phoneMessage} />
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
        {ASKED.map(({ field, legend, options, columns }) => (
          <AnswerGroup
            key={field}
            name={field}
            legend={legend}
            options={options}
            value={answers[field]}
            columns={columns}
            notCollected
            error={errors[field] === ANSWER_OR_NOT_COLLECTED && isQuestionDone(answers[field]) ? undefined : errors[field]}
            onChange={(value) => update({ answers: { ...answers, [field]: value } })}
          />
        ))}
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

        <AnswerGroup
          name="soffit_colour"
          legend={SOFFIT.question}
          options={SOFFIT.options}
          value={answers.soffit_colour}
          columns={2}
          error={errors.soffit_colour}
          onChange={(value) => setAnswers((current) => ({ ...current, soffit_colour: value }))}
        />
        {answers.soffit_colour === "other" ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="lead-soffit_note">Soffit colour note</Label>
            <Input id="lead-soffit_note" name="soffit_note" defaultValue={soffitNote} />
            <FieldError id="lead-soffit_note-error" message={errors.soffit_note} />
          </div>
        ) : null}
      </section>
      {afterQuestions ? <section className="flex flex-col gap-5" data-testid="setter-notes-fields">{afterQuestions}</section> : null}
    </>
  );
}
