"use client";

import { Check, ChevronRight } from "lucide-react";
import { useEffect, useState, type RefObject } from "react";
import { AddressField, type AddressFieldValue } from "@/components/leads/address-field";
import { useViewAs } from "@/components/view-as-context";
import { AnswerGroup, NoteField, NotCollectedToggle, NoteToggle } from "@/components/leads/answer-group";
import { CheckGroup } from "@/components/leads/check-group";
import { PhotoSlots } from "@/components/leads/photo-slots";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  bookingBlockers,
  canSaveLead,
  draftAnswers,
  guidedPhotoCount,
  screenOpenQuestions,
  toFinishLater,
  typedProblem,
  type MissingItem,
  type SheetDraft,
  type SheetScreen,
} from "@/lib/booking/sheet";
import {
  HOT_BUTTON_OPTIONS,
  HOT_BUTTONS_LABEL,
  SETTER_READ_LABEL,
  SETTER_READ_OPTIONS,
  type HotButton,
  type SetterRead,
} from "@/lib/leads/extras";
import { FIND_OUT_QUESTIONS, PHOTO_SLOTS, splitAnswer, toggleAnswer, toggleSoffit, type PairedQuestion, type PhotoSlot } from "@/lib/leads/door";
import { EVERYONE_OPTIONS, NOT_COLLECTED, NOT_COLLECTED_LABEL, QUESTION_LABELS, type CountedQuestion, type NoteKey } from "@/lib/leads/questions";
import type { DuplicateLead } from "@/app/(app)/app/leads/actions";
import type { PickedAddress } from "@/lib/places";
import { HOUSE_TYPE_OPTIONS, SOFFIT_OPTIONS, type HouseType, type SoffitColour } from "@/lib/leads/status";
import { ADDRESS_TO_COME } from "@/lib/leads/to-finish";
import { PHOTO_BUCKET } from "@/lib/photos";
import { createClient } from "@/lib/supabase/client";
import { formatPhone, normalizePhone } from "@/lib/phone";
import { PHOTO_SKIP_OPTIONS, type PhotoSkip } from "@/lib/schedule/readiness";
import { cn } from "@/lib/utils";

type Change = (patch: Partial<SheetDraft>) => void;
type Answer = (question: CountedQuestion, value: string | null) => void;

// The booking sheet's screens (round 2, Keenan, 2026-11-03; round 3,
// 2026-11-05). Each question takes an answer or Not collected; a screen's
// "Mark the rest Not collected" answers what's left in one tap. Answers grow
// on a wide phone. The moment an answer rules booking out, the screen says
// so, in the plain warning style: a neutral border and a bold first line,
// never red. Round 3: the phone is on Book, last; the optional answers
// (house type, setter's read, hot buttons, call or text) are one tap each
// and never block anything.

// A note that doesn't block: what an answer means for booking, and, once
// booking is ruled out, the way on: Keep as a lead, the one gold button.
function BookingNote({
  title,
  children,
  testId,
  onKeepAsLead,
}: {
  title: string;
  children?: React.ReactNode;
  testId?: string;
  onKeepAsLead?: () => void;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-foreground/60 px-3 py-1.5 text-sm text-pretty min-[420px]:text-base" data-testid={testId}>
      <div role="status" className="flex flex-col gap-0.5">
        <p className="font-semibold">{title}</p>
        {children ? <p className="text-muted-foreground">{children}</p> : null}
      </div>
      {onKeepAsLead ? (
        <Button type="button" className="min-[420px]:text-base" onClick={onKeepAsLead} data-testid="keep-as-lead">
          Keep as a lead
        </Button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- At the door: who

// Just the name (round 3); the phone is the footer's (round 5). A first name
// or the address is enough to book (2026-11-10), and it says so.
export function WhoScreen({
  draft,
  onChange,
  onExisting,
}: {
  draft: SheetDraft;
  onChange: Change;
  onExisting: (() => void) | null;
}) {
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
            enterKeyHint="done"
            className="min-[420px]:h-14 min-[420px]:text-lg"
            onKeyDown={(event) => nextField(event, null)}
            value={draft.last_name}
            maxLength={80}
            onChange={(event) => onChange({ last_name: event.target.value })}
          />
        </div>
      </div>
      <p className="text-sm text-pretty text-muted-foreground min-[420px]:text-base">
        A first name or the address is enough to book. The rest can be finished later.
      </p>
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

function questionSetup(question: CountedQuestion): { legend: string; options: { value: string; label: string }[]; columns: 2 | 3 | 4 } {
  if (question === "both_decision_makers") return { legend: QUESTION_LABELS.both_decision_makers, options: EVERYONE_OPTIONS, columns: 2 };
  const found = FIND_OUT_QUESTIONS.find((item) => item.field === question);
  const options = found?.options ?? [];
  // One row of answers: two, three or four across.
  const columns = Math.min(Math.max(options.length, 2), 4) as 2 | 3 | 4;
  return { legend: found?.question ?? QUESTION_LABELS[question], options, columns };
}

// What the answers mean for booking, said the moment it's so, with the way
// on: Keep as a lead lets the time go at once; a new person carries on in New
// lead with everything entered, and a saved lead opens on its page, where a
// follow-up day is set (round 2 polish). Since 2026-11-10 the one answer
// that rules a booking out is a No on owns the home.
export function ruledOutTitle(draft: SheetDraft): string | null {
  return bookingBlockers(draft).length > 0 ? "Only homeowners can be booked." : null;
}

function DoorNote({ draft, onKeepAsLead }: { draft: SheetDraft; onKeepAsLead: () => void }) {
  const title = ruledOutTitle(draft);
  if (!title) return null;
  return <BookingNote title={title} testId="door-note" onKeepAsLead={onKeepAsLead} />;
}

// A screen of counted questions: at the door (owns the home, wants a price,
// everyone who decides) or after it (what else they learned).
export function QuestionsScreen({
  screen,
  questions,
  draft,
  onAnswer,
  onMarkRest,
  onKeepAsLead,
  onChange,
  onNote,
}: {
  screen: SheetScreen;
  questions: CountedQuestion[];
  draft: SheetDraft;
  onAnswer: Answer;
  onMarkRest: () => void;
  onKeepAsLead: () => void;
  // The learned step's optional answers (round 3).
  onChange?: Change;
  // Round 6: a note on each answer.
  onNote: (key: NoteKey, value: string) => void;
}) {
  const answers = draftAnswers(draft);
  const open = screenOpenQuestions(screen, draft);
  return (
    <div className="flex flex-col gap-5 min-[420px]:gap-6">
      {questions.map((question) => {
        const setup = questionSetup(question);
        const value = answers[question] ?? null;
        // Round 6: Christmas lights now and Looked into it before take two
        // answers together.
        const paired = question === "christmas_lights_now" || question === "looked_into_before" ? (question as PairedQuestion) : null;
        return (
          <AnswerGroup
            key={question}
            name={`sheet-${question}`}
            legend={setup.legend}
            options={setup.options}
            columns={setup.columns}
            value={value}
            notCollected
            size="sheet"
            note={{ value: draft.answer_notes?.[question] ?? "", onChange: (text) => onNote(question, text) }}
            {...(paired
              ? {
                  chosen: value === NOT_COLLECTED ? [] : splitAnswer(paired, value),
                  onTap: (option: string) => onAnswer(question, toggleAnswer(paired, value === NOT_COLLECTED ? null : value, option)),
                }
              : {})}
            onChange={(next) => onAnswer(question, next)}
          />
        );
      })}
      {screen === "door" ? <DoorNote draft={draft} onKeepAsLead={onKeepAsLead} /> : null}
      {open.length > 0 ? (
        <Button type="button" variant="link" size="sm" className="-mt-3 self-start px-0 min-[420px]:text-base" onClick={onMarkRest} data-testid="mark-rest">
          Mark the rest Not collected
        </Button>
      ) : null}
      {screen === "learned" && onChange ? (
        <div className="flex flex-col gap-5 border-t pt-4 min-[420px]:gap-6" data-testid="sheet-extras">
          <AnswerGroup
            name="sheet-setter-read"
            legend={`${SETTER_READ_LABEL} (optional)`}
            options={SETTER_READ_OPTIONS}
            columns={3}
            size="sheet"
            value={draft.setter_read}
            onChange={(next) => onChange({ setter_read: next as SetterRead | null })}
          />
          <CheckGroup
            name="sheet-hot-buttons"
            legend={HOT_BUTTONS_LABEL}
            hint="(optional, pick any)"
            options={HOT_BUTTON_OPTIONS}
            exclusive="not_sure"
            size="sheet"
            value={draft.hot_buttons}
            onChange={(next) => onChange({ hot_buttons: next as HotButton[] })}
          />
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- After the door: the house

// The house's address and its soffit colour, together: both are a look at
// the house from the sidewalk.
export function AddressScreen({
  draft,
  formRef,
  apiKey,
  duplicates,
  onPicked,
  onEdited,
  onValue,
  onWorking,
  onLocateFailed,
  onChange,
}: {
  draft: SheetDraft;
  formRef: RefObject<HTMLFormElement | null>;
  apiKey: string | null;
  duplicates: DuplicateLead[];
  onPicked: (picked: PickedAddress | null) => void;
  onEdited: (value: { addressLine: string; positioned: boolean }) => void;
  onValue: (value: AddressFieldValue) => void;
  onWorking: (working: boolean) => void;
  onLocateFailed: (title: string) => void;
  onChange: Change;
}) {
  const { viewingAs } = useViewAs();
  const [soffitNoteOpen, setSoffitNoteOpen] = useState(false);
  const soffitNoteText = draft.answer_notes?.soffit_colour ?? "";
  return (
    <form ref={formRef} onSubmit={(event) => event.preventDefault()} className="flex flex-col gap-3 min-[420px]:gap-4">
      <div className="flex flex-col gap-3">
        <AddressField
          apiKey={apiKey}
          linkLeads={false}
          leadId={draft.leadId}
          place="door"
          fallbackNeighbourhood={draft.neighbourhood || null}
          onPicked={onPicked}
          onEdited={onEdited}
          onValue={onValue}
          onWorking={onWorking}
          onLocateFailed={onLocateFailed}
          // The sheet keeps what was entered on the phone, except in View as.
          keepsEntries={!viewingAs}
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
      </div>

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-x-3">
          <span aria-hidden="true" className="text-sm font-semibold min-[420px]:text-base">
            Soffit colour
          </span>
          {/* The chip reaches into the space around the line, like Not
              collected, so it costs the step no height. */}
          <span className="-my-1.5 ml-auto flex items-center gap-2">
            <span id="sheet-soffit-note-hint" className="text-sm text-muted-foreground">
              Split? Pick both.
            </span>
            {/* Round 6: the soffit's private note, on its own line so the
                step doesn't grow. */}
            <NoteToggle
              open={soffitNoteOpen}
              hasText={soffitNoteText.trim() !== ""}
              size="sheet"
              label="Soffit colour: note"
              testId="sheet-soffit-note-toggle"
              onToggle={() => setSoffitNoteOpen(!soffitNoteOpen)}
            />
          </span>
        </div>
        {/* Round 6: a split soffit takes two colours, then a short note
            saying which is where. Not sure stands alone. */}
        <AnswerGroup
          name="sheet-soffit"
          legend="Soffit colour"
          hideLegend
          describedBy="sheet-soffit-note-hint"
          options={SOFFIT_OPTIONS}
          columns={2}
          size="sheet"
          value={draft.soffit_colour}
          chosen={[draft.soffit_colour, draft.soffit_colour_2].filter((item): item is SoffitColour => item !== null)}
          onTap={(option) => {
            const current = [draft.soffit_colour, draft.soffit_colour_2].filter((item): item is SoffitColour => item !== null);
            const next = toggleSoffit(current, option as SoffitColour);
            onChange({ soffit_colour: next[0] ?? null, soffit_colour_2: next[1] ?? null });
          }}
          onChange={() => {}}
        />
        {soffitNoteOpen || soffitNoteText.trim() !== "" ? (
          <NoteField
            id="sheet-soffit-private-note"
            label="Soffit colour: note"
            value={soffitNoteText}
            onChange={(text) => onChange({ answer_notes: { ...(draft.answer_notes ?? {}), soffit_colour: text } })}
            autoFocus={soffitNoteOpen}
          />
        ) : null}
        {draft.soffit_colour === "other" || draft.soffit_colour_2 !== null ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="sheet-soffit-note">{draft.soffit_colour_2 !== null ? "Which colour is where?" : "Which colour?"}</Label>
            <Input
              id="sheet-soffit-note"
              value={draft.soffit_note}
              maxLength={200}
              placeholder={draft.soffit_colour_2 !== null ? "White at the front, cream at the back" : undefined}
              onChange={(event) => onChange({ soffit_note: event.target.value })}
            />
          </div>
        ) : null}
      </section>

      <AnswerGroup
        name="sheet-house-type"
        legend="House type (optional)"
        options={HOUSE_TYPE_OPTIONS}
        columns={4}
        size="sheet"
        value={draft.house_type}
        onChange={(next) => onChange({ house_type: next as HouseType | null })}
      />
    </form>
  );
}

// The four guided photos, as large tiles: each tile is its Take photo button.
// A saved lead's photos go straight into its slots; a person not saved yet
// (round 3: usually, since the phone is asked last) has them uploaded to the
// setter's own folder at once, kept with the draft and attached at the save.
export function PhotosScreen({
  draft,
  userId,
  photos,
  onChange,
  onBusyChange,
  skipOpen,
  onSkipOpen,
  local,
}: {
  draft: SheetDraft;
  userId: string;
  photos: Partial<Record<PhotoSlot, string>>;
  onChange: Change;
  onBusyChange: (busy: boolean) => void;
  skipOpen: boolean;
  onSkipOpen: () => void;
  // View as: the photos are acted out on screen and attach to nothing.
  local: boolean;
}) {
  const complete = guidedPhotoCount(draft) >= 3;
  const saved = Boolean(draft.leadId);
  const pending = draft.photo_paths;
  // Photos already uploaded for a person not saved yet, shown again with a
  // signed link when the screen comes back (from Unfinished or a reload).
  const [initial, setInitial] = useState<Partial<Record<PhotoSlot, { path: string; preview: string }>> | null>(
    saved || local || Object.keys(pending).length === 0 ? {} : null,
  );
  useEffect(() => {
    if (initial !== null) return;
    let cancelled = false;
    const entries = Object.entries(pending) as [PhotoSlot, string][];
    createClient()
      .storage.from(PHOTO_BUCKET)
      .createSignedUrls(entries.map(([, path]) => path), 3600)
      .then(
        ({ data }) => {
          if (cancelled) return;
          // A photo whose link couldn't be signed (weak signal) still
          // counts: it shows as saved without the picture, and is never
          // dropped from the draft.
          const shown: Partial<Record<PhotoSlot, { path: string; preview: string }>> = {};
          for (const [slot, path] of entries) {
            shown[slot] = { path, preview: data?.find((item) => item.path === path)?.signedUrl ?? "" };
          }
          setInitial(shown);
        },
        () => {
          if (!cancelled) setInitial(Object.fromEntries(entries.map(([slot, path]) => [slot, { path, preview: "" }])));
        },
      );
    return () => {
      cancelled = true;
    };
    // Only when the screen opens: later changes are the slots' own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="flex flex-col gap-4">
      {initial === null ? (
        <p className="text-sm text-muted-foreground">Loading the photos.</p>
      ) : (
        <PhotoSlots
          userId={userId}
          mode={local || !saved ? "form" : "attach"}
          layout="tiles"
          leadId={draft.leadId ?? undefined}
          saved={photos}
          initial={initial}
          onBusyChange={onBusyChange}
          onTakenChange={
            saved || local
              ? (slots) => {
                  const merged = Array.from(new Set([...draft.photo_slots, ...slots]));
                  if (merged.length !== draft.photo_slots.length) onChange({ photo_slots: merged });
                }
              : undefined
          }
          // A person not saved yet: the photos that count are exactly the
          // uploaded paths the save will attach, so Book's check and the
          // save always agree.
          onPathsChange={
            saved || local
              ? undefined
              : (paths) => {
                  const slots = PHOTO_SLOTS.map(({ slot }) => slot).filter((slot) => paths[slot]);
                  if (JSON.stringify(paths) !== JSON.stringify(draft.photo_paths) || slots.join() !== draft.photo_slots.join()) {
                    onChange({ photo_paths: paths, photo_slots: slots });
                  }
                }
          }
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
        <Button type="button" variant="link" size="sm" className="self-start px-0 min-[420px]:text-base" onClick={onSkipOpen}>
          Can&apos;t get the photos?
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Book


// Book, round 3 (Keenan, 2026-11-05): the only gate. Since 2026-11-10 (book
// now, finish later) it needs only a first name or the address, and no No
// on owns the home. Everything else still missing is listed To finish
// later, each with a tap to its step, and never stops it; a No on owns the
// home is said with Keep as a lead. The phone is the footer's (round 5),
// right above the Book button; its Not collected and note are here.
export function BookScreen({
  draft,
  name,
  warnings,
  onFix,
  onKeepAsLead,
  onChange,
  onAnswer,
}: {
  draft: SheetDraft;
  name: string;
  warnings: string[];
  onFix: (screen: SheetScreen) => void;
  onKeepAsLead: () => void;
  onChange: Change;
  onAnswer: Answer;
}) {
  const later = toFinishLater(draft);
  const ruledOut = ruledOutTitle(draft);
  const typed = typedProblem(draft);
  const photosSkipped = guidedPhotoCount(draft) < 3 && draft.skip !== null && later.every((item) => item.screen !== "house");
  return (
    <div className="flex flex-col gap-4">
      <div data-testid="sheet-summary" className="flex flex-col gap-0.5">
        {/* The time is in the header, with its countdown, so it isn't said
            twice: the room goes to the list of what's to finish. */}
        <p className="text-lg font-bold text-balance min-[420px]:text-xl">{name}</p>
        <p className="text-sm text-pretty text-muted-foreground min-[420px]:text-base">
          {[draft.address_line, draft.neighbourhood].filter(Boolean).join(", ") || ADDRESS_TO_COME}
        </p>
        {photosSkipped ? (
          <p className="text-sm text-muted-foreground min-[420px]:text-base">
            Photos skipped: {PHOTO_SKIP_OPTIONS.find((option) => option.value === draft.skip)?.label ?? ""}
          </p>
        ) : null}
      </div>

      {ruledOut ? (
        <BookingNote title={ruledOut} testId="book-ruled-out" onKeepAsLead={onKeepAsLead} />
      ) : !canSaveLead(draft) ? (
        // Neither a name nor an address yet: the one thing Book needs. The
        // list below has a tap to each.
        <BookingNote title="Add a first name or the address to book." testId="book-needs" />
      ) : typed ? (
        // Something typed that can't be saved as it is; Book's button takes
        // the setter to it.
        <BookingNote title={typed.text} testId="book-needs" />
      ) : null}

      {/* Not a gate (2026-11-10): what can be finished after booking, each
          with a tap to its step. The reminder on the setter's screens and
          the lead's To be completed list the same things until they're in. */}
      <section aria-labelledby="sheet-later-heading" className="flex flex-col gap-1" data-testid="book-checklist" data-missing={later.length}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <h3 id="sheet-later-heading" className="text-sm font-bold min-[420px]:text-base">
            To finish later
          </h3>
          {later.length > 0 && !ruledOut ? (
            <p className="text-sm text-muted-foreground min-[420px]:text-base" data-testid="book-later-note">
              None of it stops the booking.
            </p>
          ) : null}
        </div>
        {later.length > 0 ? (
          <ul className="flex flex-col" data-testid="readiness">
            {groupByStep(later).map((group) => (
              <MissingRow key={group.screen} group={group} onFix={onFix} />
            ))}
          </ul>
        ) : (
          <p className="flex items-center gap-2 text-sm min-[420px]:text-base" data-testid="readiness" data-ok="yes">
            <Check aria-hidden="true" className="size-4 shrink-0" />
            Nothing. Everything is in.
          </p>
        )}
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

      <BookConfirm draft={draft} onChange={onChange} onAnswer={onAnswer} />
    </div>
  );
}

// The phone as a slim footer on every step (round 5, Keenan, 2026-11-06):
// the number can come up at any point at the door, so it sits at the bottom
// of every step, above Back and Next, and stays put as the steps change. It
// opens the number pad. Typing a number takes back a Not collected (that
// toggle is on Book). Not needed to book since 2026-11-10: a booking without
// one lists it to finish later.
export function PhoneFooter({ draft, onChange }: { draft: SheetDraft; onChange: Change }) {
  const notCollected = draft.not_collected.includes("phone");
  const valid = !notCollected && draft.phone.trim() !== "" && normalizePhone(draft.phone).ok;
  return (
    <div className="flex items-center gap-3" data-testid="sheet-phone-block" data-question="sheet-phone">
      <Label htmlFor="sheet-phone" className="shrink-0 text-base font-semibold">
        Phone
      </Label>
      <div className="relative min-w-0 flex-1">
        <Input
          id="sheet-phone"
          type="tel"
          inputMode="tel"
          enterKeyHint="done"
          autoComplete="off"
          className={cn("h-11 text-base min-[420px]:text-lg", valid && "pr-10")}
          value={draft.phone}
          maxLength={40}
          placeholder={notCollected ? NOT_COLLECTED_LABEL : "The best number to confirm"}
          onChange={(event) =>
            onChange({
              phone: event.target.value,
              ...(notCollected ? { not_collected: draft.not_collected.filter((item) => item !== "phone") } : {}),
            })
          }
          onKeyDown={(event) => nextField(event, null)}
          onBlur={(event) => {
            const phone = normalizePhone(event.currentTarget.value);
            if (phone.ok && phone.e164) onChange({ phone: formatPhone(phone.e164) });
          }}
        />
        {valid ? (
          <Check aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3 size-5 -translate-y-1/2" data-testid="sheet-phone-ok" />
        ) : null}
      </div>
    </div>
  );
}

// On Book (round 5; round 6, Keenan, 2026-11-07): Keenan does the
// confirming, so Call or text isn't asked any more, just said. The phone's
// Not collected (which no longer rules booking out, 2026-11-10; it stays to
// finish later) and its Note sit here; the number itself is in the footer
// below.
function BookConfirm({ draft, onChange, onAnswer }: { draft: SheetDraft; onChange: Change; onAnswer: Answer }) {
  const phoneNotCollected = draft.not_collected.includes("phone");
  const noteText = draft.answer_notes?.phone ?? "";
  const [noteOpen, setNoteOpen] = useState(false);
  return (
    <section className="flex flex-col gap-2 border-t pt-3" data-testid="book-confirm" aria-label="The phone">
      <p className="text-sm text-muted-foreground min-[420px]:text-base" data-testid="keenan-confirms">
        Keenan confirms the meeting with them.
      </p>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-pretty text-muted-foreground min-[420px]:text-base">Didn&apos;t get a number?</span>
        <span className="flex shrink-0 items-center gap-2">
          <NoteToggle
            open={noteOpen}
            hasText={noteText.trim() !== ""}
            size="sheet"
            label="Phone: note"
            testId="sheet-phone-note-toggle"
            onToggle={() => setNoteOpen(!noteOpen)}
          />
          <NotCollectedToggle
            pressed={phoneNotCollected}
            size="sheet"
            label="Phone: Not collected"
            testId="sheet-phone-not-collected"
            onToggle={() => onAnswer("phone", phoneNotCollected ? null : NOT_COLLECTED)}
          />
        </span>
      </div>
      {noteOpen || noteText.trim() !== "" ? (
        <NoteField
          id="sheet-phone-note"
          label="Phone: note"
          value={noteText}
          onChange={(text) => onChange({ answer_notes: { ...(draft.answer_notes ?? {}), phone: text } })}
          autoFocus={noteOpen}
        />
      ) : null}
    </section>
  );
}

// What's still missing, one row per step in the order of the visit, so the
// list stays short enough to see whole on a 390-wide phone.
type MissingGroup = { screen: SheetScreen; items: MissingItem[] };
function groupByStep(items: MissingItem[]): MissingGroup[] {
  const order = Object.keys(STEP_NAMES) as SheetScreen[];
  return order
    .map((screen) => ({ screen, items: items.filter((item) => item.screen === screen) }))
    .filter((group) => group.items.length > 0);
}

// A step's missing things, with a tap to that step.
function MissingRow({ group, onFix }: { group: MissingGroup; onFix: (screen: SheetScreen) => void }) {
  const labels = group.items.map((item) => item.label).join(", ");
  return (
    <li data-ok="no" data-item={group.items[0].key} data-items={group.items.map((item) => item.key).join(" ")} data-step={group.screen}>
      <button
        type="button"
        onClick={() => onFix(group.screen)}
        className="flex min-h-11 w-full items-center justify-between gap-3 py-1 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring min-[420px]:min-h-12 min-[420px]:text-base"
        aria-label={`${labels}: go to ${STEP_NAMES[group.screen]}`}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span aria-hidden="true" className="size-4 shrink-0 rounded-full border-2 border-muted-foreground" />
          <span className="font-semibold text-pretty">{labels}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
          {STEP_NAMES[group.screen]}
          <ChevronRight aria-hidden="true" className="size-4 shrink-0" />
        </span>
      </button>
    </li>
  );
}

// Where each step's things are, as the setter thinks of them.
export const STEP_NAMES: Record<SheetScreen, string> = {
  who: "Name",
  door: "At the door",
  learned: "What they learned",
  address: "The house",
  house: "Photos",
  book: "Book",
};

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
