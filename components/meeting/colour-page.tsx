"use client";

import { Check } from "lucide-react";
import { useState, type CSSProperties } from "react";

import { confirmColourInitials } from "@/app/(app)/meeting/actions";
import { EaveSection } from "@/components/drawings/eave-section";
import { TrackColourForm } from "@/components/leads/track-colour-form";
import { DeckButton, DECK_TYPE, MoreLayer, say } from "@/components/meeting/deck-parts";
import type { MoreState } from "@/components/meeting/deck-pages";
import { Button } from "@/components/ui/button";
import type { DeckLines } from "@/lib/deck";
import { CHOOSER_LINES, colourTimingView, soffitView } from "@/lib/meeting/deck-pages";
import type { MeetingPayload } from "@/lib/meeting/state";
import type { ColourTiming } from "@/lib/pricing";
import { sentence } from "@/lib/schedule/meetings";
import { calgaryDateOf, formatDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";

// Your track colour (round 7's Your colours; round 9, the meeting as one
// story): the whole colour decision on one page, before the price because
// it can change the price. The track colour settled against their soffit
// with the real colour book, and, for any colour but White, when it is
// installed and what that costs; then their initials confirm the colour on
// their quote. This page exists because white track once went on an
// off-white soffit. If the colour changes at the table, it changes here,
// without leaving the deck.
//
// Split on the 56% line, both columns starting 80 px down, clear of the
// exit (20 px in, 48 px across). Left, in the five seats' order: the
// headline, "By day you see the track, so you choose its colour.", the
// soffit by name (two names on their own lines for a split soffit, "We'll
// check it together." for Not sure or unanswered, never the setter's note),
// the track colour with Change the colour, "One track colour for the whole
// house.", then one colour rule (lib/meeting/deck-pages.ts
// colourTimingView): White reads "White is in stock and included."; any
// other colour "{colour} is made to order." with two equal one-tap buttons,
// Install in spring (Included) and Install this season (the rush colour
// fee, hidden when the quote has none), which set the quote's colour timing
// so every option arrives on the price page already priced. Right: the eave
// in section labelled Soffit, Fascia and Track, as wide as the column
// allows, then the initials and Confirm, 56 px tall and no lower than 400 px
// from the top at 1180 x 820, so the landscape keyboard never covers them,
// then the colour book line under them. (The spec drew the eave on the left
// and the colour book line before the initials; the eave stays on the
// right, as built, so the initials keep their place above the keyboard, and
// the colour book line sits under them, because with a long custom colour,
// a split soffit and the two timing buttons the left column has no room
// for it at 1180 x 796.) No swatches, no photos, no More. Every word is
// settings.deck.lines but the soffit and track labels and the chooser's.
//
// On a taller deck (the iPad Pro, over 900 px; round 7 after-review) both
// columns come down towards the middle of the room above the bottom row,
// as far as the initials field's foot staying at 55% of the height allows
// (about 560 px at 1366 x 1024, above the keyboard there), so the page
// isn't packed into its top half. At 1180 x 820 the top stays at 80 px.
//
// Change the colour opens the chooser as one of the deck's layers (round 7
// review): the pager locks, the dots and chevrons hide, any page change
// closes it. It is laid out like this page: its heading, the colour book
// line and the colours on the left, the colour number and Save on the
// right, level with the colours, all above the keyboard. In the rehearsal
// view the choice, the timing and Confirm are acted out on screen and
// nothing is saved.

export type DeckColour = { kind: "none" | "list" | "custom"; text: string; choice: string | null; ralCode: string | null };
export type Confirmation = { initials: string; at: string } | null;

// The eave's width: the whole column, unless that would push the initials
// below 400 px at 1180 x 820. The drawing is 520 x 440 plus its 7.5 rem label
// column; above it the column's 80 px top, under it the initials sentence
// (two lines), the field and their gaps, 136 px. So its height is 180 px at
// 820 tall (the field ends at 396 px), growing with the deck's height to
// 311 px at 1024 (nearly the whole column at 1366, with the field still
// above the keyboard there).
const EAVE_STYLE: CSSProperties = {
  width: "min(100%, calc((64.2cqh - 346px) * 520 / 440 + 7.5rem))",
};

// The page's rows. Under 900 px tall (the iPad Air, the installed app, the
// rehearsal's frame): an 80 px top, the right column's eave, sentence and
// field, then the rest, so the field ends at 400 px or above at 1180 x 820.
// Over 900 px (the iPad Pro): the room above the bottom row is shared out
// evenly above and below that block, centring it, except that the space
// below it never falls under 45% of the height, so the field's foot stays
// at 55% (563 px at 1366 x 1024, 550 px at 1366 x 1000), clear of the
// keyboard. That limit is what holds on both Pro sizes. The left column
// starts on the same line and runs on down (it never sizes the rows), and
// the lines under the field (when it was last confirmed, what to do first,
// a refusal) sit straight under it in the last row.
const PAGE_STYLE = {
  "--colour-rows-short": "80px auto 1fr",
  "--colour-rows-tall": "minmax(80px, 1fr) auto minmax(calc(45cqh - var(--deck-clear, 78px)), 1fr)",
} as CSSProperties;
const PAGE_CLASS =
  "relative grid h-full w-full grid-cols-[56%_44%] [grid-template-rows:var(--colour-rows-short)] [@container(min-height:900px)]:pb-[var(--deck-clear,78px)] [@container(min-height:900px)]:[grid-template-rows:var(--colour-rows-tall)]";

// The timing buttons, in the light picker's two-line style: an outline, or
// Night Text fill with navy text and a tick when chosen (never gold: the
// page the customer watches holds no gold). 72 px tall, as the picker's
// looks are.
const CHOICE =
  "flex min-h-[72px] min-w-0 flex-col items-start justify-center rounded-md border px-4 py-2 text-left outline-none [-webkit-tap-highlight-color:transparent] focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background";

function TimingButton({
  label,
  value,
  chosen,
  onChoose,
  testId,
}: {
  label: string;
  value: string;
  chosen: boolean;
  onChoose: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={chosen}
      data-testid={testId}
      onClick={onChoose}
      className={cn(CHOICE, chosen ? "border-foreground bg-foreground text-background" : "border-input bg-background text-foreground active:bg-secondary")}
    >
      <span className="flex max-w-full items-center text-[22px] leading-[26px] font-semibold">
        <span className="min-w-0 truncate">{say(label)}</span>
        <Check aria-hidden="true" className={cn("ml-2 size-5 shrink-0", !chosen && "invisible")} strokeWidth={2.5} />
      </span>
      <span className={cn("max-w-full truncate text-[20px] leading-[22px]", !chosen && "text-muted-foreground")}>{say(value)}</span>
    </button>
  );
}

// The initials and Confirm (round 7; round 9 shares it with What happens
// next, where the box appears in step 1 if the colour page was skipped):
// saved the same way from either page, on the lead with a timeline event,
// and acted out on screen in the rehearsal view. Saving needs signal, and
// says so.
export function InitialsConfirm({
  leadId,
  enabled,
  prompt,
  draft,
  onDraft,
  onConfirmed,
  readOnly,
  id,
  describedBy,
}: {
  leadId: string;
  // A colour is chosen: there is something to initial.
  enabled: boolean;
  // The line above the field; empty when the words beside it already say
  // it (What happens next's step 1), which describedBy then names.
  prompt: string;
  describedBy?: string;
  draft: string;
  onDraft: (value: string) => void;
  onConfirmed: (confirmation: Confirmation) => void;
  readOnly: boolean;
  // Keeps the two pages' fields apart.
  id: string;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const typed = draft.trim() !== "";

  async function confirm() {
    if (readOnly) {
      onConfirmed({ initials: draft.trim(), at: new Date().toISOString() });
      onDraft("");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const result = await confirmColourInitials(leadId, draft);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      onConfirmed({ initials: draft.trim(), at: result.initialledAt });
      onDraft("");
    } catch {
      setMessage("No signal. The initials were not saved. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {prompt ? (
        <p id={`${id}-label`} className={DECK_TYPE.small}>
          {say(prompt)}
        </p>
      ) : null}
      <div className="flex items-center gap-3">
        <input
          id={id}
          aria-label="Your initials"
          aria-describedby={prompt ? `${id}-label` : describedBy}
          placeholder="Initials"
          value={draft}
          onChange={(event) => onDraft(event.target.value.toUpperCase())}
          maxLength={12}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          disabled={!enabled}
          className="h-14 w-40 rounded-md border border-input bg-background px-3 text-center text-[24px] font-bold tracking-widest text-foreground outline-none select-text placeholder:text-[length:var(--deck-small)] placeholder:font-normal placeholder:tracking-normal placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        />
        <Button
          type="button"
          variant={typed ? "default" : "outline"}
          onClick={() => void confirm()}
          disabled={!enabled || busy || !typed}
          className="h-14 px-7 text-[20px]"
        >
          {busy ? "Saving" : "Confirm"}
        </Button>
      </div>
      {message ? (
        <p role="alert" className={cn(DECK_TYPE.small, "font-semibold text-destructive")}>
          {message}
        </p>
      ) : null}
    </div>
  );
}

// Whether the colour was initialled at this meeting (tonight).
export function confirmedTonight(confirmation: Confirmation, today: string): boolean {
  return confirmation !== null && calgaryDateOf(confirmation.at) === today;
}

export function ColourPage({
  lead,
  colour,
  colours,
  confirmation,
  today,
  initialsDraft,
  onInitialsDraft,
  onConfirmed,
  onColourSaved,
  lines,
  timing,
  onTiming,
  chooser,
  readOnly = false,
}: {
  lead: MeetingPayload["lead"];
  colour: DeckColour;
  colours: MeetingPayload["colours"];
  confirmation: Confirmation;
  today: string;
  initialsDraft: string;
  onInitialsDraft: (value: string) => void;
  onConfirmed: (confirmation: Confirmation) => void;
  onColourSaved: (choice: string | null, ralCode: string | null) => void;
  // The page's words (settings.deck.lines).
  lines: DeckLines;
  // The quote's colour timing, and how the two timing buttons set it
  // (round 18: a rush fee is each offer's own, never the colour's).
  timing: ColourTiming | null;
  onTiming: (timing: "factory_order" | "rush") => void;
  // The colour chooser, one of the deck's layers.
  chooser: MoreState;
  // The rehearsal view: Confirm and the colour are acted out on screen and
  // nothing is saved.
  readOnly?: boolean;
}) {
  const soffit = soffitView(lead);
  const colourSet = colour.kind !== "none";
  const tonight = confirmedTonight(confirmation, today);
  const view = colourTimingView({ lines, kind: colour.kind, text: colour.text, timing });

  const small = cn(DECK_TYPE.small, "text-muted-foreground");

  const notes = [
    <p key="book" className={cn(small, "max-w-[30rem]")} data-testid="deck-colour-book">
      {say(lines.colour_book)}
    </p>,
    !tonight && confirmation ? (
      <p key="last" className={small}>
        {sentence(`Last confirmed with initials ${confirmation.initials}, ${formatDateTime(confirmation.at)}`)}
      </p>
    ) : null,
    !tonight && !colourSet ? (
      <p key="first" className={small}>
        Choose the colour first, then initial it here.
      </p>
    ) : null,
  ].filter(Boolean);

  return (
    <div className={PAGE_CLASS} style={PAGE_STYLE}>
      <div
        data-deck-box="split"
        className="col-start-1 row-span-2 row-start-2 flex min-w-0 flex-col overflow-hidden pr-10 pl-16"
        style={{ paddingBottom: "var(--deck-clear, 78px)" }}
      >
        <h2 className={DECK_TYPE.headline}>{say(lines.colour_headline)}</h2>
        <p className={cn(DECK_TYPE.body, "mt-3 max-w-[34rem]")} data-testid="deck-colour-opener">
          {say(lines.colour_opener)}
        </p>
        <dl className="mt-6 flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <dt className={small}>{soffit.label}</dt>
            {soffit.names.map((name, at) => (
              <dd key={at} className={DECK_TYPE.name} data-testid="deck-soffit-colour">
                {say(name)}
              </dd>
            ))}
          </div>
          <div className="flex flex-col gap-1">
            <dt className={small}>Your track</dt>
            <dd className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <span className={DECK_TYPE.name} data-testid="deck-track-colour">
                {colourSet ? say(colour.text) : "Not chosen yet"}
              </span>
              <DeckButton onClick={() => chooser.set(true)} aria-haspopup="dialog" aria-expanded={chooser.open}>
                {colourSet ? "Change the colour" : "Choose the colour"}
              </DeckButton>
            </dd>
            <dd className={cn(DECK_TYPE.small, "mt-1")}>{say(lines.colour_one)}</dd>
          </div>
        </dl>
        {view.kind === "stock" ? (
          <p className={cn(DECK_TYPE.body, "mt-5")} data-testid="deck-colour-timing">
            {say(view.line)}
          </p>
        ) : null}
        {view.kind === "made" ? (
          <div className="mt-5 flex max-w-[36rem] flex-col gap-3" data-testid="deck-colour-timing">
            <p className={DECK_TYPE.body}>{say(view.line)}</p>
            <div role="group" aria-label={say(view.line)} className="grid grid-cols-2 gap-3">
              {/* Round 17: this season first, included unless Keenan charges a rush fee. */}
              <TimingButton
                label={view.season.label}
                value={view.season.value}
                chosen={view.chosen === "season"}
                onChoose={() => onTiming("rush")}
                testId="deck-colour-season"
              />
              <TimingButton
                label={view.spring.label}
                value={view.spring.value}
                chosen={view.chosen === "spring"}
                onChoose={() => onTiming("factory_order")}
                testId="deck-colour-spring"
              />
            </div>
          </div>
        ) : null}
      </div>

      {/* The 56% line runs only as far as this column's content. */}
      <div data-deck-box="split" className="col-start-2 row-start-2 flex min-w-0 flex-col overflow-hidden pr-12">
        <div className="flex flex-col border-l border-border pl-10">
          <EaveSection variant="colour" className="max-w-full" style={EAVE_STYLE} />
          <div className="mt-4 flex flex-col gap-3">
            {tonight && confirmation ? (
              <div className="flex flex-col gap-1" data-testid="colour-confirmed">
                <p className={cn(DECK_TYPE.small, "flex items-center gap-2 font-semibold")}>
                  <Check aria-hidden="true" className="size-5 shrink-0" strokeWidth={2.5} />
                  {say(lines.initials_done)}
                </p>
                <p className={cn(small, "tracking-widest")}>{confirmation.initials}</p>
              </div>
            ) : (
              <InitialsConfirm
                id="colour-initials"
                leadId={lead.id}
                enabled={colourSet}
                prompt={lines.initials_prompt}
                draft={initialsDraft}
                onDraft={onInitialsDraft}
                onConfirmed={onConfirmed}
                readOnly={readOnly}
              />
            )}
          </div>
        </div>
      </div>
      <div className="col-start-2 row-start-3 min-w-0 overflow-hidden pr-12">
        <div className="flex flex-col gap-3 border-l border-border pt-4 pl-10">{notes}</div>
      </div>

      <MoreLayer open={chooser.open} onClose={() => chooser.set(false)} label="Choose the track colour">
        <Chooser
          leadId={lead.id}
          colour={colour}
          colours={colours}
          screensLine={lines.colour_book}
          actOut={readOnly}
          onClose={() => chooser.set(false)}
          onSaved={(choice, ralCode) => {
            onColourSaved(choice, ralCode);
            chooser.set(false);
          }}
        />
      </MoreLayer>
    </div>
  );
}

// Changing the colour at the table: Keenan's list by name (no swatches), or
// a number from the colour book, saved as the lead page saves it (acted out
// in the rehearsal view). The form lays itself out on the 56% line, like
// this page (TrackColourForm's meeting variant). Its Back is the layer's,
// bottom right.
function Chooser({
  leadId,
  colour,
  colours,
  screensLine,
  actOut,
  onClose,
  onSaved,
}: {
  leadId: string;
  colour: DeckColour;
  colours: MeetingPayload["colours"];
  screensLine: string;
  actOut: boolean;
  onClose: () => void;
  onSaved: (choice: string | null, ralCode: string | null) => void;
}) {
  return (
    <div
      data-deck-box="layer"
      className="absolute inset-0 overflow-y-auto overscroll-contain"
      // It can scroll, so it says again what the layer says: a sideways
      // move is the layer's (a swipe on its empty space closes it).
      style={{ paddingBottom: "var(--deck-clear, 78px)", touchAction: "pan-y" }}
      onKeyDown={(event) => {
        // Escape from inside a field closes it too (the deck leaves fields alone).
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <TrackColourForm
        leadId={leadId}
        options={colours.list
          .filter((item) => item.active || item.id === colour.choice)
          .map((item) => ({ value: item.id, label: say(item.name) }))}
        current={{ choice: colour.choice, ralCode: colour.ralCode }}
        ralNames={colours.ralNames}
        requireColour
        variant="meeting"
        actOut={actOut}
        onSaved={onSaved}
        intro={
          <>
            <h2 className={DECK_TYPE.moreLabel}>{CHOOSER_LINES.heading}</h2>
            <p className={cn(DECK_TYPE.small, "max-w-[34rem] text-muted-foreground")}>{say(screensLine)}</p>
          </>
        }
      />
    </div>
  );
}
