"use client";

import { Check } from "lucide-react";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { DECK_TYPE, say, useDeck } from "@/components/meeting/deck-parts";
import { RunsDrawing } from "@/components/meeting/runs-drawing";
import { hasMeasuredRun, QuoteEditor } from "@/components/quotes/quote-editor/quote-editor";
import { useQuoteSave } from "@/components/quotes/quote-editor/use-quote-save";
import { Button } from "@/components/ui/button";
import { DEFAULT_LINES, deckLine, priceSubLine, type DeckLines } from "@/lib/deck";
import { breakdownRows, coverageLine, minimumSentence, NO_PAYMENT, screenOptions, type BreakdownRow } from "@/lib/meeting/price-screen";
import { quoteInputs, quoteOffers, type MeetingPayload, type QuoteUIState } from "@/lib/meeting/state";
import { MOTION, transition } from "@/lib/motion";
import { formatMoney, type QuoteTotals } from "@/lib/pricing";
import { QUOTE_LOCKED_MEETING, savedLine } from "@/lib/quotes/draft";
import { offerNameIssue } from "@/lib/quotes/editor";
import { cleanOfferName, type PricedOffer } from "@/lib/quotes/offers";
import { formatFullDate } from "@/lib/time";
import { cn } from "@/lib/utils";

// Your price (round 9, the spec 3.5): a presentation, not a form. Every
// option the customer can have, biggest first in one row, every total the
// same size, so Keenan walks them down from the full wrap. The option on
// screen lights its runs on the house (the rest dashed) with its coverage
// line, and its own breakdown sits on the right with its total and Choose.
// On screen and picked never look alike (DESIGN.md's Porch Light Rule): on
// screen is a 2 px Night Text outline; picked is the Night Text fill with a
// tick and "Your choice". The page the customer watches holds no gold at
// all: the total is Night Text and Choose is outlined.
//
// Keenan's small outlined Edit, bottom left, opens the quote editor (the
// same one as the lead page's Edit the quote) as a full-screen layer; the
// inputs, Save and the signal note appear only there. The pick and the
// install day picked on What happens next save quietly with the quote when
// there's signal; anything unsaved shows only in the Edit layer.
//
// Everything is worked on the iPad (lib/pricing.ts over the payload cached
// when meeting mode opened), so the page makes no network call to show a
// price. An accepted quote shows read only.
//
// CONTRACT (deck-view passes these)
//   <QuoteScreen
//     leadId, pricing, colourKind, colourText, today
//     state, onChange          the quote as the deck holds it (setQuote)
//     quoteId, savedAt, dirty  the last save, and whether anything changed
//                              since (the Edit layer says so)
//     onSaved(id, at, fingerprint)
//     readOnly?                the rehearsal view: saves are acted out
//     lines?                   settings.deck.lines (deck.words.lines); the
//                              code's defaults when left out
//     edit?                    the deck's layer state for this page
//                              (moreOf("quote")), so the pager locks and the
//                              dots hide while the editor is open; left out,
//                              the page keeps its own (and the dots show)
//     locked?                  the quote is accepted (meeting.draft.accepted):
//                              read only, Choose hidden, Edit says why
//   />

export type QuoteScreenProps = {
  leadId: string;
  pricing: MeetingPayload["pricing"];
  colourKind: "none" | "list" | "custom";
  colourText: string;
  state: QuoteUIState;
  onChange: (next: QuoteUIState) => void;
  quoteId: string | null;
  savedAt: string | null;
  dirty: boolean;
  onSaved: (quoteId: string, savedAt: string, fingerprint: string) => void;
  today: string;
  // The rehearsal view (round 7): Save is acted out on screen and nothing
  // is written.
  readOnly?: boolean;
  lines?: DeckLines;
  edit?: { open: boolean; set: (open: boolean) => void };
  locked?: boolean;
};

export function QuoteScreen({
  leadId,
  pricing,
  colourKind,
  colourText,
  state,
  onChange,
  quoteId,
  savedAt,
  dirty,
  onSaved,
  today,
  readOnly = false,
  lines = DEFAULT_LINES,
  edit,
  locked = false,
}: QuoteScreenProps) {
  const inputs = useMemo(() => quoteInputs(state, pricing), [state, pricing]);
  const options = useMemo(() => screenOptions(inputs, quoteOffers(state)), [inputs, state]);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [ownEdit, setOwnEdit] = useState(false);
  const editOpen = edit ? edit.open : ownEdit;
  const setEditOpen = edit ? edit.set : setOwnEdit;

  const chosen = options.find((option) => option.offer.id === state.chosenOffer) ?? null;
  // On screen: the one Keenan tapped, else the choice, else the biggest.
  const viewing = options.find((option) => option.offer.id === viewingId) ?? chosen ?? options[0] ?? null;
  const colour = colourKind === "none" ? null : colourText.trim() || null;
  // The sub-line counts the options: none until something is measured.
  const sub = options.length > 0 ? priceSubLine(lines, options.length, colour) : "";
  const { save } = useQuoteSave({ leadId, pricing, from: "meeting", readOnly });

  // The pick, the install day and the colour's timing save with the quote,
  // quietly, when there's signal: a moment after they change, and again when the signal comes
  // back. A failure stays on the iPad and shows only in the Edit layer.
  // The colour's timing, chosen on the colour page, saves the same way.
  const pickKey = `${state.chosenOffer ?? ""}|${state.installOn ?? ""}|${state.colourTiming ?? ""}`;
  const lastPick = useRef(pickKey);
  const [pickWaiting, setPickWaiting] = useState(false);
  const quietSave = useEffectEvent(async () => {
    if (readOnly || locked || !hasMeasuredRun(state) || quoteOffers(state).some((offer) => offerNameIssue(offer.name))) return;
    const result = await save(state, { quiet: true, quoteId });
    setPickWaiting(result === null);
    if (result) onSaved(result.quoteId, result.savedAt, result.fingerprint);
  });
  useEffect(() => {
    if (lastPick.current === pickKey) return;
    lastPick.current = pickKey;
    const timer = window.setTimeout(() => void quietSave(), 800);
    return () => window.clearTimeout(timer);
  }, [pickKey]);
  useEffect(() => {
    if (!pickWaiting) return;
    const retry = () => void quietSave();
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [pickWaiting]);

  const choose = (id: string) => {
    setViewingId(id);
    onChange({ ...state, chosenOffer: state.chosenOffer === id ? null : id });
  };
  const viewingChosen = viewing !== null && chosen?.offer.id === viewing.offer.id;

  return (
    <div className="relative flex h-full w-full flex-col pt-[72px]" style={{ paddingBottom: "var(--deck-clear, 78px)" }} data-testid="price-page">
      {/* The headline and the sub-line share a line, so the options and
          their breakdowns keep the height. */}
      <header className="flex flex-wrap items-baseline gap-x-6 gap-y-1 pr-12 pl-16">
        <h2 className={DECK_TYPE.headline}>{say(deckLine(lines, "price_headline"))}</h2>
        {sub ? (
          <p className={cn(DECK_TYPE.body, "text-muted-foreground")} data-testid="price-sub">
            {say(sub)}
          </p>
        ) : null}
      </header>

      {viewing === null ? (
        <p className={cn(DECK_TYPE.body, "mt-8 pr-12 pl-16 text-muted-foreground")} data-testid="price-empty">
          {say(deckLine(lines, "price_empty"))}
        </p>
      ) : (
        <>
          {/* The options: biggest on the left, every total the same size. */}
          <div className="mt-4 flex shrink-0 gap-3 pr-12 pl-16" role="group" aria-label="Options" data-testid="price-options">
            {options.map((option) => (
              <OptionButton
                key={option.offer.id}
                option={option}
                onScreen={option.offer.id === viewing.offer.id}
                chosen={option.offer.id === chosen?.offer.id}
                gstEnabled={pricing.gstEnabled}
                yourChoice={deckLine(lines, "your_choice")}
                onShow={() => setViewingId(option.offer.id)}
              />
            ))}
          </div>

          {/* Two even columns: the house needs about 420 px at its fixed
              height, and the breakdown's column needs the room for the
              total and Choose side by side, "+ GST" included. */}
          <div className="mt-6 grid min-h-0 flex-1 grid-cols-2">
            {/* Left: the house lighting the option on screen, what it
                covers, and what every option shares. The drawing has a
                fixed slot and the coverage line always keeps two lines, so
                a tap on another option changes only the lights. */}
            <div className="flex min-h-0 min-w-0 flex-col gap-3 pr-10 pl-16" data-testid="price-left">
              <RunsDrawing runs={state.runs} lit={viewing.offer.runs} dashedRest className="h-[230px] w-full shrink-0" />
              <p
                className={cn(DECK_TYPE.small, "line-clamp-2 shrink-0 font-semibold")}
                style={{ minHeight: "calc(var(--deck-small, 20px) * 2.6)" }}
                data-testid="price-coverage"
              >
                {say(coverageLine(state.runs, viewing.offer))}
              </p>
              <div className={cn(DECK_TYPE.small, "flex flex-col gap-1 text-muted-foreground")}>
                <p>{say(deckLine(lines, "price_includes"))}</p>
                <p>{NO_PAYMENT}</p>
                {state.validUntil ? <p>{say(deckLine(lines, "price_held", { date: formatFullDate(state.validUntil) }))}</p> : null}
                {state.financingOffered ? <p>{say(deckLine(lines, "financing"))}</p> : null}
              </div>
            </div>

            {/* Right: its breakdown, then its total and Choose on one
                row (Choose drops under the total only when they can't
                share it). */}
            <div className="flex min-h-0 min-w-0 flex-col pr-12 pl-10" data-testid="price-breakdown">
              <p className={cn(DECK_TYPE.body, "shrink-0 font-semibold")}>
                {say(deckLine(lines, "whats_in", { name: cleanOfferName(viewing.offer.name) }))}
              </p>
              {viewing.totals ? <Breakdown totals={viewing.totals} /> : null}
              {viewing.totals || !locked ? (
                <div className="mt-2 flex shrink-0 flex-wrap items-end justify-between gap-x-5 gap-y-3 border-t border-foreground/60 pt-3">
                  {viewing.totals ? (
                    <p className="flex flex-col gap-1" data-testid="price-total">
                      <span className={cn(DECK_TYPE.small, "leading-none text-muted-foreground")}>Total</span>
                      <span className="whitespace-nowrap">
                        <span className="text-[length:var(--deck-headline)] leading-none font-semibold tabular-nums">
                          {formatMoney(viewing.totals.subtotal)}
                        </span>
                        {pricing.gstEnabled ? <span className="ml-2 text-[22px] text-muted-foreground">+ GST</span> : null}
                      </span>
                    </p>
                  ) : null}
                  {!locked ? (
                    <button
                      type="button"
                      aria-pressed={viewingChosen}
                      onClick={() => choose(viewing.offer.id)}
                      className={cn(
                        "inline-flex h-14 min-w-fit flex-1 touch-manipulation items-center justify-center gap-2 rounded-md border px-6 text-[22px] font-semibold whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                        viewingChosen ? "border-foreground bg-foreground text-background" : "border-foreground/70 bg-background hover:bg-muted",
                      )}
                      data-testid="price-choose"
                    >
                      {viewingChosen ? (
                        <>
                          <Check aria-hidden="true" className="size-6" />
                          {say(deckLine(lines, "your_choice"))}
                        </>
                      ) : (
                        say(deckLine(lines, "choose", { name: cleanOfferName(viewing.offer.name) }))
                      )}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </>
      )}

      {/* Keenan's own: small, outlined, bottom left, away from Choose and
          the forward chevron, on the dots' centre line. */}
      <div className="absolute left-12 z-10 flex h-14 items-center" style={{ bottom: "var(--deck-row-bottom, 20px)" }}>
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={editOpen}
          className="inline-flex h-12 touch-none items-center justify-center rounded-md border border-input bg-background px-5 text-[20px] leading-none font-semibold text-foreground outline-none select-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="price-edit"
        >
          Edit
        </button>
      </div>

      {editOpen ? (
        <EditLayer
          leadId={leadId}
          pricing={pricing}
          colourKind={colourKind}
          colourText={colourText}
          state={state}
          onChange={onChange}
          quoteId={quoteId}
          savedAt={savedAt}
          dirty={dirty}
          onSaved={onSaved}
          today={today}
          readOnly={readOnly}
          locked={locked}
          onClose={() => setEditOpen(false)}
        />
      ) : null}
    </div>
  );
}

// One option: its name and its total, all the same size. On screen: a 2 px
// Night Text outline. Picked: the Night Text fill, a tick and "Your choice".
function OptionButton({
  option,
  onScreen,
  chosen,
  gstEnabled,
  yourChoice,
  onShow,
}: {
  option: PricedOffer;
  onScreen: boolean;
  chosen: boolean;
  gstEnabled: boolean;
  yourChoice: string;
  onShow: () => void;
}) {
  const name = cleanOfferName(option.offer.name);
  return (
    <button
      type="button"
      aria-pressed={onScreen}
      onClick={onShow}
      data-testid="price-option"
      data-option={option.offer.id}
      data-on-screen={onScreen ? "yes" : "no"}
      data-chosen={chosen ? "yes" : "no"}
      className={cn(
        "relative flex min-h-[88px] min-w-[250px] flex-1 basis-0 touch-manipulation flex-col justify-center gap-1 rounded-lg border-2 px-5 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        chosen ? "bg-foreground text-background" : "bg-background text-foreground",
        onScreen || chosen ? "border-foreground" : "border-border",
      )}
    >
      {/* "Your choice" sits on the button's top edge, so marking a pick
          never changes the row's height, even at four options with GST. */}
      {chosen ? (
        <span className="absolute -top-4 right-3 rounded-md bg-foreground px-2.5 text-[20px] leading-7 font-semibold text-background" data-testid="price-your-choice">
          {say(yourChoice)}
        </span>
      ) : null}
      <span className="flex items-start gap-2 text-[24px] leading-tight font-semibold">
        {chosen ? <Check aria-hidden="true" className="mt-0.5 size-6 shrink-0" /> : null}
        <span className="line-clamp-2 min-w-0">{say(name)}</span>
      </span>
      <span className="text-[28px] leading-tight tabular-nums">
        {formatMoney(option.totals?.subtotal ?? 0)}
        {gstEnabled ? <span className="ml-1.5 text-[20px]">+ GST</span> : null}
      </span>
    </button>
  );
}

// The option's breakdown, in the rows and words the link and the Accepted
// sheet use (lib/pricing.ts): 22 px rows, or 20 px rows packed closer once
// the list is long: five rows or more, a detail beyond the track's and the
// box's (upper access, a rush colour), or the minimum. At 1180 x 820 the
// longest breakdown (every adder, a discount and the minimum) fits whole;
// only something longer still scrolls inside its column, with the total
// and Choose staying put.
function breakdownIsCompact(rows: BreakdownRow[]): boolean {
  return (
    rows.length >= 5 ||
    rows.some((row, at) => row.kind === "sum" || (row.kind === "line" && (row.minimum || (at > 1 && row.detail !== null))))
  );
}

function Breakdown({ totals }: { totals: QuoteTotals }) {
  const rows = breakdownRows(totals);
  const compact = breakdownIsCompact(rows);
  const size = compact ? "text-[20px] leading-[1.2]" : "text-[22px] leading-tight";
  const pad = compact ? "py-[3px]" : "py-1.5";
  const detail = cn("text-[20px] text-muted-foreground", compact ? "leading-[1.2]" : "leading-tight");
  return (
    <dl className={cn("mt-2 flex min-h-0 flex-col overflow-y-auto", size)} data-testid="price-lines" data-compact={compact ? "yes" : "no"}>
      {rows.map((row, at) =>
        row.kind === "sum" ? (
          <div key={at} className={cn("flex items-baseline justify-between gap-4 border-t border-input", pad)}>
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="shrink-0 font-semibold tabular-nums">{row.amount}</dd>
          </div>
        ) : (
          <div key={at} className={cn("flex flex-col border-t border-border", pad)} data-line={row.label}>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="min-w-0">{say(row.label)}</dt>
              <dd className="shrink-0 font-semibold tabular-nums">{row.amount}</dd>
            </div>
            {row.detail ? <p className={detail}>{say(row.detail)}</p> : null}
            {row.minimum ? <p className={cn(detail, "mt-0.5 text-foreground")}>{say(minimumSentence(totals.subtotal))}</p> : null}
          </div>
        ),
      )}
    </dl>
  );
}

// Keenan's Edit layer: the shared quote editor, full screen inside the deck
// (over the pages, under the way out), with Save in gold, the save's state
// and the signal note. Done goes back to the price page; anything unsaved
// stays on the iPad.
function EditLayer({
  leadId,
  pricing,
  colourKind,
  colourText,
  state,
  onChange,
  quoteId,
  savedAt,
  dirty,
  onSaved,
  today,
  readOnly,
  locked,
  onClose,
}: {
  leadId: string;
  pricing: MeetingPayload["pricing"];
  colourKind: "none" | "list" | "custom";
  colourText: string;
  state: QuoteUIState;
  onChange: (next: QuoteUIState) => void;
  quoteId: string | null;
  savedAt: string | null;
  dirty: boolean;
  onSaved: (quoteId: string, savedAt: string, fingerprint: string) => void;
  today: string;
  readOnly: boolean;
  locked: boolean;
  onClose: () => void;
}) {
  const { overlay, reduced } = useDeck();
  const { busy, message, save } = useQuoteSave({ leadId, pricing, from: "meeting", readOnly });
  const [shown, setShown] = useState(false);
  const title = useRef<HTMLHeadingElement>(null);
  const nameIssue = quoteOffers(state).some((offer) => offerNameIssue(offer.name) !== null);
  const measured = hasMeasuredRun(state);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(true));
    title.current?.focus({ preventScroll: true });
    return () => cancelAnimationFrame(frame);
  }, []);

  // Escape goes back (the deck leaves this layer's keys to it).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("input, textarea, select")) return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function onSave() {
    const result = await save(state, { quoteId });
    if (result) onSaved(result.quoteId, result.savedAt, result.fingerprint);
  }

  const status = locked
    ? null
    : !measured
      ? "Measure a run to save."
      : nameIssue
        ? "An offer's name needs fixing first."
        : dirty
          ? savedAt
            ? "Changes not saved yet."
            : "Not saved yet."
          : savedAt
            ? savedLine(savedAt)
            : null;

  if (!overlay) return null;
  const ms = reduced ? MOTION.reducedFadeMs : MOTION.moreInMs;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="quote-edit-title"
      data-deck-layer=""
      data-deck-keys="own"
      data-testid="quote-edit-layer"
      className="absolute inset-0 z-30 flex flex-col bg-card text-foreground"
      style={{
        touchAction: "pan-y",
        opacity: shown ? 1 : 0,
        transform: reduced ? undefined : `translateY(${shown ? 0 : MOTION.moreRisePx}px)`,
        transition: reduced ? transition("opacity", ms) : `${transition("opacity", ms)}, ${transition("transform", ms)}`,
      }}
    >
      {/* Clear of the way out, top left. */}
      <header className="flex shrink-0 items-center border-b py-4 pr-12 pl-24">
        <h2 id="quote-edit-title" ref={title} tabIndex={-1} className="text-2xl font-bold outline-none">
          {locked ? "The quote" : "Edit the quote"}
        </h2>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-6xl px-12 py-6">
          <QuoteEditor
            state={state}
            onChange={onChange}
            pricing={pricing}
            colourKind={colourKind}
            colourText={colourText}
            today={today}
            locked={locked}
            lockedWords={QUOTE_LOCKED_MEETING}
          />
        </div>
      </div>
      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-t px-12 py-4">
        <div className="flex min-w-0 flex-col text-sm" aria-live="polite">
          {message ? (
            <p role="alert" className="font-semibold text-pretty text-destructive" data-testid="quote-edit-message">
              {message}
            </p>
          ) : locked ? null : (
            <p data-testid="quote-edit-status">{[status, readOnly ? "Rehearsal: nothing is saved." : "Saving needs signal."].filter(Boolean).join(" ")}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" size="lg" onClick={onClose} data-testid="quote-edit-done">
            Done
          </Button>
          {!locked ? (
            <Button type="button" size="lg" onClick={() => void onSave()} disabled={busy || !measured || nameIssue} data-testid="quote-edit-save">
              {busy ? "Saving" : quoteId ? "Save changes" : "Save quote"}
            </Button>
          ) : null}
        </div>
      </footer>
    </div>,
    overlay,
  );
}
