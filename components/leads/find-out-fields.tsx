"use client";

import { Fragment, useState } from "react";
import { FieldError } from "@/components/field-error";
import { AnswerGroup } from "@/components/leads/answer-group";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FIND_OUT_QUESTIONS, type FindOutField } from "@/lib/leads/door";
import type { LeadFormErrors } from "@/lib/leads/schema";

// The six Find out questions, all optional. Answers are kept while the form
// is open, so a correction from the server never loses them.
export function FindOutFields({
  defaults,
  soffitNote,
  errors,
}: {
  defaults: Record<FindOutField, string | null>;
  soffitNote: string;
  errors: LeadFormErrors;
}) {
  const [answers, setAnswers] = useState(defaults);

  return (
    <section aria-labelledby="find-out-heading" className="flex flex-col gap-5" data-testid="find-out">
      <div>
        <h2 id="find-out-heading" className="text-lg font-bold">
          Find out
        </h2>
        <p className="text-sm text-muted-foreground">Optional. Tap an answer again to clear it.</p>
      </div>
      {FIND_OUT_QUESTIONS.map(({ field, question, options, columns }) => (
        <Fragment key={field}>
          <AnswerGroup
            name={field}
            legend={question}
            options={options}
            value={answers[field]}
            columns={columns}
            error={errors[field]}
            onChange={(value) => setAnswers((current) => ({ ...current, [field]: value }))}
          />
          {field === "soffit_colour" && answers.soffit_colour === "other" ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="lead-soffit_note">Soffit colour note</Label>
              <Input id="lead-soffit_note" name="soffit_note" defaultValue={soffitNote} />
              <FieldError id="lead-soffit_note-error" message={errors.soffit_note} />
            </div>
          ) : null}
        </Fragment>
      ))}
    </section>
  );
}
