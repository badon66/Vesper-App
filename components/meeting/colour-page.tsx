"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { confirmColourInitials } from "@/app/(app)/meeting/actions";
import { EaveSection } from "@/components/drawings/eave-section";
import { TrackColourForm } from "@/components/leads/track-colour-form";
import { DeckButton, DECK_TYPE, useDeck } from "@/components/meeting/deck-parts";
import { Button } from "@/components/ui/button";
import { COLOUR_LINES, soffitView } from "@/lib/meeting/deck-pages";
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
// Split on the 56% line. Left: the soffit by name (two names on their own
// lines for a split soffit, "We'll check it together." for Not sure or
// unanswered, never the setter's note), the track colour with Change the
// colour, "One track colour for the whole house." on a split, and the
// screens line. Right: the eave in section labelled Soffit, Fascia and
// Track, then the initials and Confirm, 56 px tall and no lower than 400 px
// from the top at 1180 x 820, so the landscape keyboard never covers them.
// No swatches, no photos, no More.

export type DeckColour = { kind: "none" | "list" | "custom"; text: string; choice: string | null; ralCode: string | null };
export type Confirmation = { initials: string; at: string } | null;

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
  // The rehearsal view: Confirm is acted out on screen and nothing is saved.
  readOnly?: boolean;
}) {
  const { overlay } = useDeck();
  const [busy, setBusy] = useState(false);
  const [choosing, setChoosing] = useState(false);
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

  return (
    <div className="relative grid h-full w-full grid-cols-[56%_44%]">
      <span aria-hidden="true" className="absolute top-10 bottom-24 left-[56%] w-px bg-border" />
      <div className="flex min-w-0 flex-col pt-10 pr-10 pb-20 pl-16">
        <h2 className={DECK_TYPE.headline}>Your colours</h2>
        <dl className="mt-8 flex flex-col gap-7">
          <div className="flex flex-col gap-1">
            <dt className="text-[20px] leading-[1.3] text-muted-foreground">{soffit.label}</dt>
            {soffit.names.map((name, at) => (
              <dd key={at} className="text-[32px] leading-[1.2] font-semibold" data-testid="deck-soffit-colour">
                {name}
              </dd>
            ))}
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-[20px] leading-[1.3] text-muted-foreground">Your track colour</dt>
            <dd className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <span className="text-[32px] leading-[1.2] font-semibold" data-testid="deck-track-colour">
                {colourSet ? colour.text : "Not chosen yet"}
              </span>
              <DeckButton disabled={readOnly} onClick={() => setChoosing(true)} aria-haspopup="dialog" className="disabled:opacity-50">
                {colourSet ? "Change the colour" : "Choose the colour"}
              </DeckButton>
            </dd>
            {soffit.split ? <dd className="mt-1 text-[20px] leading-[1.3]">{COLOUR_LINES.splitTrack}</dd> : null}
          </div>
        </dl>
        <p className="mt-auto max-w-[34rem] text-[20px] leading-[1.3] text-pretty text-muted-foreground">
          {COLOUR_LINES.screens}
        </p>
      </div>

      <div className="flex min-w-0 flex-col pt-10 pr-12 pb-20 pl-10">
        <EaveSection variant="colour" className="w-full max-w-[380px]" />
        <div className="mt-4 flex flex-col gap-3">
          {confirmedTonight && confirmation ? (
            <p className="text-[20px] leading-[1.3] font-semibold" data-testid="colour-confirmed">
              {sentence(`Confirmed with initials ${confirmation.initials}, ${formatDateTime(confirmation.at)}`)}
            </p>
          ) : (
            <>
              <p id="colour-initials-label" className="text-[20px] leading-[1.3] text-pretty">
                {COLOUR_LINES.initials}
              </p>
              <div className="flex items-center gap-3">
                <input
                  id="colour-initials"
                  aria-labelledby="colour-initials-label"
                  value={initialsDraft}
                  onChange={(event) => onInitialsDraft(event.target.value.toUpperCase())}
                  maxLength={12}
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={!colourSet}
                  className="h-14 w-40 rounded-md border border-input bg-background px-3 text-center text-[24px] font-bold tracking-widest text-foreground outline-none select-text focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
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
                <p className="text-[20px] leading-[1.3] text-muted-foreground">
                  {sentence(`Last confirmed with initials ${confirmation.initials}, ${formatDateTime(confirmation.at)}`)}
                </p>
              ) : null}
              {!colourSet ? (
                <p className="text-[20px] leading-[1.3] text-muted-foreground">Choose the colour first, then initial it here.</p>
              ) : null}
            </>
          )}
          {message ? (
            <p role="alert" className="text-[20px] leading-[1.3] font-semibold text-destructive">
              {message}
            </p>
          ) : null}
        </div>
      </div>

      {choosing && overlay && !readOnly
        ? createPortal(
            <Chooser
              leadId={lead.id}
              colour={colour}
              colours={colours}
              onClose={() => setChoosing(false)}
              onSaved={(choice, ralCode) => {
                onColourSaved(choice, ralCode);
                setMessage(null);
                setChoosing(false);
              }}
            />,
            overlay,
          )
        : null}
    </div>
  );
}

// Changing the colour at the table: Keenan's list by name (no swatches), or
// a RAL Classic code, saved as the lead page saves it.
function Chooser({
  leadId,
  colour,
  colours,
  onClose,
  onSaved,
}: {
  leadId: string;
  colour: DeckColour;
  colours: MeetingPayload["colours"];
  onClose: () => void;
  onSaved: (choice: string | null, ralCode: string | null) => void;
}) {
  const back = useRef<HTMLButtonElement>(null);
  useEffect(() => back.current?.focus({ preventScroll: true }), []);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Choose the track colour"
      data-deck-keys="own"
      className={cn("absolute inset-0 z-40 overflow-y-auto bg-background text-foreground")}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-10 pt-[10vh] pb-16 lg:px-16">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h2 className="text-3xl font-bold lg:text-4xl">The track colour</h2>
            <p className="mt-2 text-[20px] leading-[1.3] text-pretty text-muted-foreground">
              {COLOUR_LINES.chooser}
            </p>
          </div>
          <Button ref={back} type="button" variant="ghost" onClick={onClose}>
            Back
          </Button>
        </div>
        <TrackColourForm
          leadId={leadId}
          options={colours.list
            .filter((item) => item.active || item.id === colour.choice)
            .map((item) => ({ value: item.id, label: item.name }))}
          current={{ choice: colour.choice, ralCode: colour.ralCode }}
          ralNames={colours.ralNames}
          requireColour
          onSaved={onSaved}
        />
      </div>
    </div>
  );
}
