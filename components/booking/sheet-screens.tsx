"use client";

import { Check } from "lucide-react";
import { useState, type RefObject } from "react";
import { AddressField } from "@/components/leads/address-field";
import { AnswerGroup } from "@/components/leads/answer-group";
import { PhotoSlots } from "@/components/leads/photo-slots";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  draftAnswers,
  guidedPhotoCount,
  PROBLEM_SCREENS,
  readinessLead,
  screenOpenQuestions,
  type SheetDraft,
  type SheetScreen,
} from "@/lib/booking/sheet";
import { FIND_OUT_QUESTIONS, type PhotoSlot } from "@/lib/leads/door";
import {
  EVERYONE_OPTIONS,
  NOT_COLLECTED,
  NOT_COLLECTED_LABEL,
  QUESTION_LABELS,
  type CountedQuestion,
} from "@/lib/leads/questions";
import type { DuplicateLead } from "@/app/(app)/app/leads/actions";
import type { PickedAddress } from "@/lib/places";
import { SOFFIT_OPTIONS, type SoffitColour } from "@/lib/leads/status";
import { formatPhone, normalizePhone } from "@/lib/phone";
import { timePhrase } from "@/lib/schedule/meetings";
import { leadReadiness, PHOTO_SKIP_OPTIONS, READINESS_NAMES, type PhotoSkip } from "@/lib/schedule/readiness";
import { cn } from "@/lib/utils";

type Change = (patch: Partial<SheetDraft>) => void;
type Answer = (question: CountedQuestion, value: string | null) => void;

// The booking sheet's screens (round 2, Keenan, 2026-11-03). Each question
// takes an answer or Not collected; a screen's "Mark the rest Not collected"
// answers what's left in one tap. Answers grow on a wide phone.

// ---------------------------------------------------------------- At the door: who

export function WhoScreen({
  draft,
  onChange,
  onAnswer,
  onExisting,
}: {
  draft: SheetDraft;
  onChange: Change;
  onAnswer: Answer;
  onExisting: (() => void) | null;
}) {
  const phoneNotCollected = draft.not_collected.includes("phone");
  return (
    <div className="flex flex-col gap-4">
      {onExisting ? (
        <div className="-mt-2 flex justify-end">
          <Button type="button" variant="link" size="sm" className="px-0" onClick={onExisting}>
            Existing lead instead
          </Button>
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="sheet-first-name" className="min-[420px]:text-base">
            First name
          </Label>
          <Input
            id="sheet-first-name"
            autoComplete="off"
            autoCapitalize="words"
            enterKeyHint="next"
            className="min-[420px]:h-14 min-[420px]:text-lg"
            onKeyDown={(event) => nextField(event, "sheet-last-name")}
            value={draft.first_name}
            maxLength={80}
            onChange={(event) => onChange({ first_name: event.target.value })}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="sheet-last-name" className="min-[420px]:text-base">
            Last name
          </Label>
          <Input
            id="sheet-last-name"
            autoComplete="off"
            autoCapitalize="words"
            enterKeyHint="next"
            className="min-[420px]:h-14 min-[420px]:text-lg"
            onKeyDown={(event) => nextField(event, "sheet-phone")}
            value={draft.last_name}
            maxLength={80}
            onChange={(event) => onChange({ last_name: event.target.value })}
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="sheet-phone" className="min-[420px]:text-base">
          Phone
        </Label>
        <Input
          id="sheet-phone"
          type="tel"
          inputMode="tel"
          enterKeyHint="done"
          autoComplete="off"
          className="min-[420px]:h-14 min-[420px]:text-lg"
          value={draft.phone}
          maxLength={40}
          disabled={phoneNotCollected}
          placeholder={phoneNotCollected ? NOT_COLLECTED_LABEL : undefined}
          onChange={(event) => onChange({ phone: event.target.value })}
          onKeyDown={(event) => nextField(event, null)}
          onBlur={(event) => {
            const phone = normalizePhone(event.currentTarget.value);
            if (phone.ok && phone.e164) onChange({ phone: formatPhone(phone.e164) });
          }}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">Needed to book and to confirm the meeting.</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-pressed={phoneNotCollected}
            className={cn("border-dashed", phoneNotCollected && "border-solid border-foreground bg-foreground text-background hover:bg-foreground")}
            onClick={() => onAnswer("phone", phoneNotCollected ? null : NOT_COLLECTED)}
            data-testid="sheet-phone-not-collected"
          >
            {phoneNotCollected ? <Check aria-hidden="true" className="size-4" /> : null}
            {NOT_COLLECTED_LABEL}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Enter on a phone's keyboard moves to the next field, or closes it on the last.
function nextField(event: React.KeyboardEvent<HTMLInputElement>, id: string | null) {
  if (event.key !== "Enter") return;
  event.preventDefault();
  if (id) document.getElementById(id)?.focus();
  else event.currentTarget.blur();
}

// ---------------------------------------------------------------- the questions

const RULES: Partial<Record<CountedQuestion, { value: string; text: string }>> = {
  owns_home: { value: "no", text: "Only homeowners can be booked. Keep talking, or let the time go and set a follow-up day." },
  wants_price: { value: "not_yet", text: "Book once they want a price. Until then, let the time go and set a follow-up day." },
  both_decision_makers: {
    value: "no",
    text: "Book once everyone who decides can be there. Until then, let the time go and set a follow-up day.",
  },
};

function questionSetup(question: CountedQuestion): { legend: string; options: { value: string; label: string }[]; columns: 2 | 3 | 4 } {
  if (question === "both_decision_makers") return { legend: QUESTION_LABELS.both_decision_makers, options: EVERYONE_OPTIONS, columns: 3 };
  const found = FIND_OUT_QUESTIONS.find((item) => item.field === question);
  const options = found?.options ?? [];
  // With Not collected added, a row of two becomes a row of three.
  const columns = options.length + 1 === 3 ? 3 : 2;
  return { legend: found?.question ?? QUESTION_LABELS[question], options, columns };
}

// A screen of counted questions: at the door (owns the home, wants a price,
// everyone who decides) or after it (what else they learned).
export function QuestionsScreen({
  screen,
  questions,
  draft,
  onAnswer,
  onMarkRest,
  intro,
}: {
  screen: SheetScreen;
  questions: CountedQuestion[];
  draft: SheetDraft;
  onAnswer: Answer;
  onMarkRest: () => void;
  intro?: string;
}) {
  const answers = draftAnswers(draft);
  const open = screenOpenQuestions(screen, draft);
  return (
    <div className="flex flex-col gap-4 min-[420px]:gap-5">
      {intro ? <p className="-mt-2 text-sm text-pretty text-muted-foreground min-[420px]:text-base">{intro}</p> : null}
      {questions.map((question) => {
        const setup = questionSetup(question);
        const value = answers[question] ?? null;
        const rule = RULES[question];
        return (
          <div key={question} className="flex flex-col gap-1">
            <AnswerGroup
              name={`sheet-${question}`}
              legend={setup.legend}
              options={setup.options}
              columns={setup.columns}
              value={value}
              notCollected
              size="sheet"
              onChange={(next) => onAnswer(question, next)}
            />
            {rule && value === rule.value ? (
              <p className="text-sm text-pretty text-muted-foreground" data-testid={`rule-${question}`}>
                {rule.text}
              </p>
            ) : null}
          </div>
        );
      })}
      {open.length > 0 ? (
        <Button type="button" variant="link" size="sm" className="self-start px-0" onClick={onMarkRest} data-testid="mark-rest">
          Mark the rest Not collected
        </Button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- After the door: the house

export function AddressScreen({
  draft,
  formRef,
  apiKey,
  duplicates,
  onPicked,
  onEdited,
}: {
  draft: SheetDraft;
  formRef: RefObject<HTMLFormElement | null>;
  apiKey: string | null;
  duplicates: DuplicateLead[];
  onPicked: (picked: PickedAddress | null) => void;
  onEdited: (value: { addressLine: string; positioned: boolean }) => void;
}) {
  return (
    <form ref={formRef} onSubmit={(event) => event.preventDefault()} className="flex flex-col gap-3">
      <AddressField
        apiKey={apiKey}
        linkLeads={false}
        leadId={draft.leadId}
        fallbackNeighbourhood={draft.neighbourhood || null}
        onPicked={onPicked}
        onEdited={onEdited}
        defaults={{
          addressLine: draft.address_line,
          city: draft.city,
          postalCode: draft.postal_code || null,
          lat: draft.lat,
          lng: draft.lng,
          placeId: draft.place_id,
          positionSource: draft.position_source,
          accuracy: draft.position_accuracy_m,
        }}
      />
      {duplicates.length > 0 ? (
        <div role="status" className="rounded-md border border-foreground/60 px-3 py-2 text-sm" data-testid="sheet-duplicates">
          <p className="font-semibold">This address already has a lead.</p>
          <ul className="mt-1 flex flex-col gap-1">
            {duplicates.map((duplicate) => (
              <li key={duplicate.id} className="text-pretty">
                <span className="font-semibold">{duplicate.name}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · {duplicate.status}, added by {duplicate.addedBy} on {duplicate.addedOn}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </form>
  );
}

// The soffit colour and the guided photos share a screen: both are a quick
// look at the house from the sidewalk.
export function HouseScreen({
  draft,
  userId,
  photos,
  onChange,
  onBusyChange,
  skipOpen,
  onSkipOpen,
  onAddress,
  local,
}: {
  draft: SheetDraft;
  userId: string;
  photos: Partial<Record<PhotoSlot, string>>;
  onChange: Change;
  onBusyChange: (busy: boolean) => void;
  skipOpen: boolean;
  onSkipOpen: () => void;
  onAddress: () => void;
  // View as: the photos are acted out on screen and attach to nothing.
  local: boolean;
}) {
  const complete = guidedPhotoCount(draft) >= 3;
  const canTake = Boolean(draft.leadId) || local;
  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby="sheet-soffit-heading" className="flex flex-col gap-2">
        <h3 id="sheet-soffit-heading" className="text-sm font-semibold min-[420px]:text-base">
          Soffit colour
        </h3>
        <AnswerGroup
          name="sheet-soffit"
          legend="Soffit colour"
          hideLegend
          options={SOFFIT_OPTIONS}
          columns={2}
          size="sheet"
          value={draft.soffit_colour}
          onChange={(next) => onChange({ soffit_colour: next as SoffitColour | null })}
        />
        {draft.soffit_colour === "other" ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="sheet-soffit-note">Which colour?</Label>
            <Input
              id="sheet-soffit-note"
              value={draft.soffit_note}
              maxLength={200}
              onChange={(event) => onChange({ soffit_note: event.target.value })}
            />
          </div>
        ) : null}
        <p className="text-sm text-pretty text-muted-foreground">White is the only stock track colour, so off-white matters. Not sure is fine.</p>
      </section>

      <section aria-labelledby="sheet-photos-heading" className="flex flex-col gap-3">
        <h3 id="sheet-photos-heading" className="text-sm font-semibold min-[420px]:text-base">
          Photos
        </h3>
        {!canTake ? (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-pretty text-muted-foreground">Photos attach to the person once they&apos;re saved, which happens when the address is in.</p>
            <Button type="button" variant="outline" size="sm" onClick={onAddress}>
              Add the address
            </Button>
          </div>
        ) : (
          <PhotoSlots
            userId={userId}
            mode={local ? "form" : "attach"}
            layout="tiles"
            leadId={draft.leadId ?? undefined}
            saved={photos}
            onBusyChange={onBusyChange}
            onTakenChange={(slots) => {
              const merged = Array.from(new Set([...draft.photo_slots, ...slots]));
              if (merged.length !== draft.photo_slots.length) onChange({ photo_slots: merged });
            }}
          />
        )}
        {complete ? null : skipOpen || draft.skip ? (
          <div className="flex flex-col gap-3" data-testid="sheet-photo-skip">
            <AnswerGroup
              name="sheet-photos-skipped"
              legend="Why can't you get them?"
              options={PHOTO_SKIP_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
              value={draft.skip}
              onChange={(next) => onChange({ skip: next as PhotoSkip | null })}
            />
            {draft.skip === "other" ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="sheet-photos-skip-note">Say why</Label>
                <Input
                  id="sheet-photos-skip-note"
                  value={draft.skip_note}
                  maxLength={300}
                  onChange={(event) => onChange({ skip_note: event.target.value })}
                />
              </div>
            ) : null}
          </div>
        ) : (
          <Button type="button" variant="link" size="sm" className="self-start px-0" onClick={onSkipOpen}>
            Can&apos;t get the photos?
          </Button>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- Book

// A phone as people read it, whatever form it was typed in.
function shownPhone(typed: string): string {
  const phone = normalizePhone(typed);
  return phone.ok && phone.e164 ? formatPhone(phone.e164) : typed;
}

// What each Before you book item needs, said for a Not collected answer.
const NEEDS: Record<string, string> = {
  phone: "Booking needs a number.",
  owns_home: "Booking needs Yes.",
  wants_price: "Booking needs Yes.",
  everyone_deciding_present: "Booking needs Yes.",
};

export function BookScreen({
  draft,
  name,
  heldAt,
  warnings,
  onFix,
}: {
  draft: SheetDraft;
  name: string;
  heldAt: string | null;
  warnings: string[];
  onFix: (screen: SheetScreen) => void;
}) {
  const guided = guidedPhotoCount(draft);
  const notCollected = (key: string) =>
    draft.not_collected.includes((key === "everyone_deciding_present" ? "both_decision_makers" : key) as CountedQuestion);
  const ruledOut = (key: string) =>
    (key === "owns_home" && draft.owns_home === false) ||
    (key === "wants_price" && draft.wants_price === false) ||
    (key === "everyone_deciding_present" && draft.everyone === false);
  const items = leadReadiness(readinessLead(draft), guided).map((item) => {
    const ok =
      item.key === "photos"
        ? guided >= 3 || (draft.skip !== null && (draft.skip !== "other" || draft.skip_note.trim() !== ""))
        : item.ok;
    const shown = ok
      ? item.key === "photos" && guided < 3 && draft.skip
        ? `Photos skipped: ${PHOTO_SKIP_OPTIONS.find((option) => option.value === draft.skip)?.label ?? ""}`
        : item.label
      : ruledOut(item.key)
        ? item.key === "owns_home"
          ? "Owns the home: No. Only homeowners can be booked."
          : item.key === "wants_price"
            ? "Wants a price: Not yet. Book once they want one."
            : "Everyone who decides: No. Book once they can all be there."
        : notCollected(item.key)
          ? `${READINESS_NAMES[item.key]}: ${NOT_COLLECTED_LABEL}`
          : item.label;
    const note = !ok && !ruledOut(item.key) && notCollected(item.key) ? NEEDS[item.key] : null;
    return { key: item.key as string, label: item.label, ok, shown, note };
  });
  // In the order of the screens that ask for them.
  const order = ["phone", "owns_home", "wants_price", "everyone_deciding_present", "map_position", "soffit_colour", "photos"];
  items.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  const answers = draftAnswers(draft);
  return (
    <div className="flex flex-col gap-4">
      <div data-testid="sheet-summary">
        <p className="text-lg font-bold text-balance min-[420px]:text-xl">{name}</p>
        <p className="text-sm text-pretty text-muted-foreground min-[420px]:text-base">
          {[draft.address_line, draft.neighbourhood].filter(Boolean).join(", ") || "No address yet"}
          {draft.phone ? ` · ${shownPhone(draft.phone)}` : answers.phone === NOT_COLLECTED ? " · phone not collected" : ""}
        </p>
        {heldAt ? <p className="text-sm font-semibold min-[420px]:text-base">{timePhrase(heldAt)}</p> : null}
      </div>

      <section aria-labelledby="sheet-ready-heading" className="flex flex-col gap-1">
        <h3 id="sheet-ready-heading" className="text-sm font-bold min-[420px]:text-base">
          Before you book
        </h3>
        <ul className="flex flex-col" data-testid="readiness">
          {items.map((item) => (
            <li
              key={item.key}
              className={cn("flex items-center justify-between gap-3", item.ok ? "min-h-8" : "min-h-12")}
              data-ok={item.ok ? "yes" : "no"}
              data-item={item.key}
            >
              <span className="flex items-start gap-2 text-sm min-[420px]:text-base">
                {item.ok ? (
                  <Check role="img" aria-label="Done" className="mt-0.5 size-4 shrink-0" />
                ) : (
                  <span role="img" aria-label="Missing" className="mt-0.5 size-4 shrink-0 rounded-full border-2 border-muted-foreground" />
                )}
                <span className="flex flex-col">
                  <span className={item.ok ? "" : "font-semibold"}>{item.shown}</span>
                  {item.note ? <span className="text-muted-foreground">{item.note}</span> : null}
                </span>
              </span>
              {!item.ok ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onFix(PROBLEM_SCREENS[item.key] ?? "who")}
                  aria-label={ruledOut(item.key) ? `Change answer: ${READINESS_NAMES[item.key as keyof typeof READINESS_NAMES]}` : `Fix: ${item.label}`}
                >
                  {ruledOut(item.key) ? "Change answer" : "Fix"}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {warnings.length > 0 ? (
        <div role="status" className="rounded-md border border-foreground/60 px-3 py-2 text-sm" data-testid="distance-warning">
          {warnings.map((warning) => (
            <p key={warning} className="font-semibold text-pretty">
              {warning}
            </p>
          ))}
          <p className="text-muted-foreground">You can still book it, or pick another time.</p>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- Existing lead

export function ExistingScreen({
  leads,
  loading,
  onPick,
}: {
  leads: { id: string; name: string; address: string; status: string }[];
  loading: boolean;
  onPick: (leadId: string) => void;
}) {
  const [query, setQuery] = useState("");
  if (loading) return <p className="text-sm text-muted-foreground">Loading your leads.</p>;
  if (leads.length === 0) {
    return <p className="text-sm text-muted-foreground">No New or Follow up leads of yours yet. Go back and add this person instead.</p>;
  }
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = words.length === 0 ? leads : leads.filter((lead) => words.every((word) => `${lead.name} ${lead.address}`.toLowerCase().includes(word)));
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-pretty text-muted-foreground">Your Follow up and New leads, follow-ups due first. Anything already answered is skipped.</p>
      {leads.length > 6 ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="sheet-lead-search" className="sr-only">
            Search your leads
          </Label>
          <Input
            id="sheet-lead-search"
            type="search"
            enterKeyHint="search"
            placeholder="Search by name or street"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      ) : null}
      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">None of your leads match that.</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-md border" aria-label="Your leads">
          {shown.map((lead) => (
            <li key={lead.id}>
              <button
                type="button"
                onClick={() => onPick(lead.id)}
                className="flex min-h-14 w-full flex-col justify-center px-4 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="font-semibold">{lead.name}</span>
                <span className="text-sm text-muted-foreground">
                  {lead.address} · {lead.status}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
