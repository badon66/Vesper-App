"use client";

import { useState, type CSSProperties } from "react";

import { confirmColourInitials } from "@/app/(app)/meeting/actions";
import { EaveSection } from "@/components/drawings/eave-section";
import { TrackColourForm } from "@/components/leads/track-colour-form";
import { DeckButton, DECK_TYPE, MoreLayer, say } from "@/components/meeting/deck-parts";
import type { MoreState } from "@/components/meeting/deck-pages";
import { Button } from "@/components/ui/button";
import { CHOOSER_LINES, COLOUR_LINES, soffitView } from "@/lib/meeting/deck-pages";
import type { MeetingPayload } from "@/lib/meeting/state";
import { sentence } from "@/lib/schedule/meetings";
import { calgaryDateOf, formatDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";

// Your colours (round 7, the settled spec's colour_screen): the track colour
// settled against their soffit with the real colour book, and their initials
// confirm what we order. This page exists because white track once went on
// an off-white soffit. If the colour changes at the table, it changes here,
// without leaving the deck.
//
// Split on the 56% line, both columns starting 80 px down, clear of the exit
// (20 px in, 48 px across). Left: the soffit by name (two names on their own lines for a
// split soffit, "We'll check it together." for Not sure or unanswered, never
// the setter's note), the track colour with Change the colour, "One track
// colour for the whole house." on a split, and the screens line right under
// them. Right: the eave in section labelled Soffit, Fascia and Track, as
// wide as the column allows, then the initials and Confirm, 56 px tall and
// no lower than 400 px from the top at 1180 x 820, so the landscape keyboard
// never covers them. No swatches, no photos, no More.
//
// On a taller deck (the iPad Pro, over 900 px; round 7 after-review) both
// columns come down towards the middle of the room above the bottom row,
// as far as the initials field's foot staying at 55% of the height allows
// (about 560 px at 1366 x 1024, above the keyboard there), so the page
// isn't packed into its top half. At 1180 x 820 the top stays at 80 px.
//
// Change the colour opens the chooser as one of the deck's layers (round 7
// review): the pager locks, the dots and chevrons hide, any page change
// closes it. It is laid out like this page: its heading, the screens line
// and the colours on the left, the colour number and Save on the right,
// level with the colours, all above the keyboard. In the rehearsal view the
// choice and Confirm are acted out on screen and nothing is saved.

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
  // The colour chooser, one of the deck's layers.
  chooser: MoreState;
  // The rehearsal view: Confirm and the colour are acted out on screen and
  // nothing is saved.
  readOnly?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const soffit = soffitView(lead);
  const colourSet = colour.kind !== "none";
  const typed = initialsDraft.trim() !== "";
  const confirmedTonight = confirmation !== null && calgaryDateOf(confirmation.at) === today;

  async function confirm() {
    if (readOnly) {
      onConfirmed({ initials: initialsDraft.trim(), at: new Date().toISOString() });
      onInitialsDraft("");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const result = await confirmColourInitials(lead.id, initialsDraft);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      onConfirmed({ initials: initialsDraft.trim(), at: result.initialledAt });
      onInitialsDraft("");
    } catch {
      setMessage("No signal. The initials were not saved. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  const small = cn(DECK_TYPE.small, "text-muted-foreground");

  const notes = [
    !confirmedTonight && confirmation ? (
      <p key="last" className={small}>
        {sentence(`Last confirmed with initials ${confirmation.initials}, ${formatDateTime(confirmation.at)}`)}
      </p>
    ) : null,
    !confirmedTonight && !colourSet ? (
      <p key="first" className={small}>
        Choose the colour first, then initial it here.
      </p>
    ) : null,
    message ? (
      <p key="message" role="alert" className={cn(DECK_TYPE.small, "font-semibold text-destructive")}>
        {message}
      </p>
    ) : null,
  ].filter(Boolean);

  return (
    <div className={PAGE_CLASS} style={PAGE_STYLE}>
      <div data-deck-box="split" className="col-start-1 row-span-2 row-start-2 flex min-w-0 flex-col overflow-hidden pr-10 pb-28 pl-16">
        <h2 className={DECK_TYPE.headline}>Your colours</h2>
        <dl className="mt-8 flex flex-col gap-7">
          <div className="flex flex-col gap-1">
            <dt className={small}>{soffit.label}</dt>
            {soffit.names.map((name, at) => (
              <dd key={at} className={DECK_TYPE.name} data-testid="deck-soffit-colour">
                {say(name)}
              </dd>
            ))}
          </div>
          <div className="flex flex-col gap-1">
            <dt className={small}>Your track colour</dt>
            <dd className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <span className={DECK_TYPE.name} data-testid="deck-track-colour">
                {colourSet ? say(colour.text) : "Not chosen yet"}
              </span>
              <DeckButton onClick={() => chooser.set(true)} aria-haspopup="dialog" aria-expanded={chooser.open}>
                {colourSet ? "Change the colour" : "Choose the colour"}
              </DeckButton>
            </dd>
            {soffit.split ? <dd className={cn(DECK_TYPE.small, "mt-1")}>{COLOUR_LINES.splitTrack}</dd> : null}
          </div>
        </dl>
        <p className={cn(small, "mt-6 max-w-[34rem]")}>{say(COLOUR_LINES.screens)}</p>
      </div>

      {/* The 56% line runs only as far as this column's content. */}
      <div data-deck-box="split" className="col-start-2 row-start-2 flex min-w-0 flex-col overflow-hidden pr-12">
        <div className="flex flex-col border-l border-border pl-10">
          <EaveSection variant="colour" className="max-w-full" style={EAVE_STYLE} />
          <div className="mt-4 flex flex-col gap-3">
            {confirmedTonight && confirmation ? (
              <p className={cn(DECK_TYPE.small, "font-semibold")} data-testid="colour-confirmed">
                {sentence(`Confirmed with initials ${confirmation.initials}, ${formatDateTime(confirmation.at)}`)}
              </p>
            ) : (
              <>
                <p id="colour-initials-label" className={DECK_TYPE.small}>
                  {say(COLOUR_LINES.initials)}
                </p>
                <div className="flex items-center gap-3">
                  <input
                    id="colour-initials"
                    aria-label="Your initials"
                    aria-describedby="colour-initials-label"
                    placeholder="Initials"
                    value={initialsDraft}
                    onChange={(event) => onInitialsDraft(event.target.value.toUpperCase())}
                    maxLength={12}
                    autoCapitalize="characters"
                    autoComplete="off"
                    spellCheck={false}
                    disabled={!colourSet}
                    className="h-14 w-40 rounded-md border border-input bg-background px-3 text-center text-[24px] font-bold tracking-widest text-foreground outline-none select-text placeholder:text-[length:var(--deck-small)] placeholder:font-normal placeholder:tracking-normal placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  />
                  <Button
                    type="button"
                    variant={typed ? "default" : "outline"}
                    onClick={() => void confirm()}
                    disabled={!colourSet || busy || !typed}
                    className="h-14 px-7 text-[20px]"
                  >
                    {busy ? "Saving" : "Confirm"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      {notes.length > 0 ? (
        <div className="col-start-2 row-start-3 min-w-0 overflow-hidden pr-12">
          <div className="flex flex-col gap-3 border-l border-border pt-3 pl-10">{notes}</div>
        </div>
      ) : null}

      <MoreLayer open={chooser.open} onClose={() => chooser.set(false)} label="Choose the track colour">
        <Chooser
          leadId={lead.id}
          colour={colour}
          colours={colours}
          actOut={readOnly}
          onClose={() => chooser.set(false)}
          onSaved={(choice, ralCode) => {
            onColourSaved(choice, ralCode);
            setMessage(null);
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
  actOut,
  onClose,
  onSaved,
}: {
  leadId: string;
  colour: DeckColour;
  colours: MeetingPayload["colours"];
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
            <p className={cn(DECK_TYPE.small, "max-w-[34rem] text-muted-foreground")}>{say(COLOUR_LINES.screens)}</p>
          </>
        }
      />
    </div>
  );
}
