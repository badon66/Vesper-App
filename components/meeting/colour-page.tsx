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
// Change the colour opens the chooser as one of the deck's layers (round 7
// review): the pager locks, the dots and chevrons hide, any page change
// closes it. In the rehearsal view the choice and Confirm are acted out on
// screen and nothing is saved.

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

  return (
    <div className="relative grid h-full w-full grid-cols-[56%_44%]">
      <div data-deck-box="split" className="flex min-w-0 flex-col overflow-hidden pt-20 pr-10 pb-28 pl-16">
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

      <div data-deck-box="split" className="flex min-w-0 flex-col overflow-hidden pt-20 pr-12 pb-28">
        {/* The 56% line runs only as far as this column's content. */}
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
                    className="h-14 w-40 rounded-md border border-input bg-background px-3 text-center text-[24px] font-bold tracking-widest text-foreground outline-none select-text placeholder:text-[20px] placeholder:font-normal placeholder:tracking-normal placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
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
                {confirmation ? (
                  <p className={small}>{sentence(`Last confirmed with initials ${confirmation.initials}, ${formatDateTime(confirmation.at)}`)}</p>
                ) : null}
                {!colourSet ? <p className={small}>Choose the colour first, then initial it here.</p> : null}
              </>
            )}
            {message ? (
              <p role="alert" className={cn(DECK_TYPE.small, "font-semibold text-destructive")}>
                {message}
              </p>
            ) : null}
          </div>
        </div>
      </div>

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
// in the rehearsal view). Its Back is the layer's, bottom right.
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
      className="absolute inset-0 overflow-y-auto overscroll-contain pt-[88px] pr-16 pl-16"
      style={{ paddingBottom: "var(--deck-clear, 78px)" }}
      onKeyDown={(event) => {
        // Escape from inside a field closes it too (the deck leaves fields alone).
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <div className="flex max-w-[880px] flex-col gap-6">
        <div className="flex flex-col gap-3">
          <h2 className={DECK_TYPE.moreLabel}>{CHOOSER_LINES.heading}</h2>
          <p className={cn(DECK_TYPE.small, "text-muted-foreground")}>{say(COLOUR_LINES.screens)}</p>
        </div>
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
        />
      </div>
    </div>
  );
}
