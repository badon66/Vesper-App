"use client";

import { Check, MessageSquare, Phone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { confirmMeeting, fillMissingAnswers } from "@/app/(app)/app/(owner)/meetings/actions";
import { AnswerGroup } from "@/components/leads/answer-group";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CHRISTMAS_LIGHTS_OPTIONS, LOOKED_INTO_BEFORE_OPTIONS, OWNS_HOME_OPTIONS, WANTS_PRICE_OPTIONS, toggleAnswer, splitAnswer, type PairedQuestion } from "@/lib/leads/door";
import { EVERYONE_OPTIONS, QUESTION_LABELS, type CountedQuestion } from "@/lib/leads/questions";
import { formatDateTime } from "@/lib/time";

// Time confirmed (round 7, Keenan, 2026-11-08): Keenan always confirms
// himself. Text opens his phone's Messages with the ready-made text, which
// he can change before sending; Call rings them. Then Confirmed records when.
export function ConfirmMeeting({
  meetingId,
  phone,
  smsHref,
  confirmedAt,
  primary = false,
}: {
  meetingId: string;
  phone: string | null;
  smsHref: string | null;
  confirmedAt: string | null;
  primary?: boolean;
}) {
  const router = useRouter();
  const [at, setAt] = useState(confirmedAt);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function set(confirmed: boolean) {
    setError(null);
    start(async () => {
      const result = await confirmMeeting(meetingId, confirmed);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setAt(result.at ?? null);
      router.refresh();
    });
  }
  return (
    <div className="flex flex-col gap-3" data-testid="prep-confirm">
      {phone ? (
        <div className="flex flex-wrap gap-2">
          {smsHref ? (
            <Button asChild size="lg" variant="outline" className="h-12 px-5">
              <a href={smsHref} data-testid="prep-text">
                <MessageSquare aria-hidden="true" className="size-5" />
                Text
              </a>
            </Button>
          ) : null}
          <Button asChild size="lg" variant="outline" className="h-12 px-5">
            <a href={`tel:${phone}`} data-testid="prep-call">
              <Phone aria-hidden="true" className="size-5" />
              Call
            </a>
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No number saved, so there&apos;s nothing to text or call.</p>
      )}
      {at ? (
        <p className="flex flex-wrap items-center gap-x-3 text-sm" data-testid="prep-confirmed">
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <Check aria-hidden="true" className="size-4" />
            Confirmed {formatDateTime(at)}
          </span>
          <button
            type="button"
            onClick={() => set(false)}
            disabled={pending}
            className="inline-flex min-h-11 items-center underline underline-offset-4 disabled:opacity-60"
          >
            Take it back
          </button>
        </p>
      ) : (
        <Button
          type="button"
          size="lg"
          variant={primary ? "default" : "outline"}
          className="h-12 self-start px-6"
          onClick={() => set(true)}
          disabled={pending}
          data-testid="prep-confirm-button"
        >
          {pending ? "Saving" : "Confirmed"}
        </Button>
      )}
      {error ? (
        <p role="alert" className="text-sm font-semibold text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const OPTIONS: Partial<Record<CountedQuestion, { value: string; label: string }[]>> = {
  owns_home: OWNS_HOME_OPTIONS,
  wants_price: WANTS_PRICE_OPTIONS,
  both_decision_makers: EVERYONE_OPTIONS,
  christmas_lights_now: CHRISTMAS_LIGHTS_OPTIONS,
  looked_into_before: LOOKED_INTO_BEFORE_OPTIONS,
};

// Missing answers filled (round 7): each question left Not collected or
// never asked, answered right here.
export function FillAnswers({ leadId, missing, primary = false }: { leadId: string; missing: CountedQuestion[]; primary?: boolean }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string | null>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const given = Object.fromEntries(Object.entries(answers).filter((entry): entry is [string, string] => Boolean(entry[1] && entry[1].trim())));
  function save() {
    setError(null);
    start(async () => {
      const result = await fillMissingAnswers(leadId, given);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
      setAnswers({});
      router.refresh();
    });
  }
  return (
    <div className="flex flex-col gap-4" data-testid="prep-answers">
      {missing.map((question) => {
        if (question === "phone") {
          return (
            <div key="phone" className="flex flex-col gap-2">
              <Label htmlFor="prep-phone">Phone</Label>
              <Input
                id="prep-phone"
                type="tel"
                inputMode="tel"
                autoComplete="off"
                value={answers.phone ?? ""}
                onChange={(event) => setAnswers((current) => ({ ...current, phone: event.target.value }))}
                className="max-w-xs"
              />
            </div>
          );
        }
        const paired = question === "christmas_lights_now" || question === "looked_into_before" ? (question as PairedQuestion) : null;
        const value = answers[question] ?? null;
        return (
          <AnswerGroup
            key={question}
            name={`prep-${question}`}
            legend={QUESTION_LABELS[question]}
            options={OPTIONS[question] ?? []}
            columns={(OPTIONS[question] ?? []).length >= 3 ? 3 : 2}
            value={value}
            {...(paired
              ? { chosen: splitAnswer(paired, value), onTap: (option: string) => setAnswers((current) => ({ ...current, [question]: toggleAnswer(paired, current[question] ?? null, option) })) }
              : {})}
            onChange={(next) => setAnswers((current) => ({ ...current, [question]: next }))}
          />
        );
      })}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          size="lg"
          variant={primary ? "default" : "outline"}
          className="h-12 px-6"
          onClick={save}
          disabled={pending || Object.keys(given).length === 0}
          data-testid="prep-answers-save"
        >
          {pending ? "Saving" : "Save answers"}
        </Button>
        {saved && !pending ? <span className="text-sm text-muted-foreground">Saved.</span> : null}
      </div>
      {error ? (
        <p role="alert" className="text-sm font-semibold text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
