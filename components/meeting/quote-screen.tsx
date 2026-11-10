"use client";

import { Check } from "lucide-react";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { InitialsConfirm, type Confirmation } from "@/components/meeting/colour-page";
import { DeckButton, DeckImage, DECK_TYPE, MoreLayer, say, useDeck } from "@/components/meeting/deck-parts";
import { hasMeasuredRun, QuoteEditor } from "@/components/quotes/quote-editor/quote-editor";
import { useQuoteSave } from "@/components/quotes/quote-editor/use-quote-save";
import { Button } from "@/components/ui/button";
import { DEFAULT_LINES, deckLine, priceSubLine, type DeckLines } from "@/lib/deck";
import { breakdownRows, coverageLine, minimumSentence, NO_PAYMENT, screenOptions, type BreakdownRow } from "@/lib/meeting/price-screen";
import { blackFridayOn, chooseWithBlackFriday, offerPrice, withBlackFriday } from "@/lib/meeting/black-friday-state";
import { colourTimingView, offerMockup } from "@/lib/meeting/deck-pages";
import { quoteInputs, quoteOffers, quoteRushFee, type MeetingMockup, type MeetingPayload, type QuoteUIState } from "@/lib/meeting/state";
import { MOTION, transition } from "@/lib/motion";
import { formatMoney, type QuoteTotals } from "@/lib/pricing";
import { QUOTE_LOCKED_MEETING, savedLine } from "@/lib/quotes/draft";
import { offerNameIssue } from "@/lib/quotes/editor";
import { BLACK_FRIDAY_LABEL, blackFridayWords } from "@/lib/quotes/black-friday";
import { cleanOfferName, type PricedOffer } from "@/lib/quotes/offers";
import { formatFullDate } from "@/lib/time";
import { cn } from "@/lib/utils";

// Your price (round 9, the spec 3.5; round 10, Keenan, 2026-11-10): a
// presentation, not a form. The option on screen shows its own mockup big
// on the left (a mockup marked for that offer, else their Main, else no
// picture and the options take the room); on the right every option the
// customer can have, biggest first, each with its total and what it covers
// in words ("Front and garage, upper and lower: 165 ft"); then one colour
// line (their colour, in stock or made to order, and for made to order the
// spring or this season choice that sets the quote's colour timing); then
// the breakdown one tap away (What's in it, a layer) and Choose. No
// drawing. On screen and picked never look alike (DESIGN.md's Porch Light
// Rule): on screen is a 2 px Night Text outline; picked is the Night Text
// fill with a tick. The page the customer watches holds no gold at all.
//
// When they say yes (Choose), their initials confirm the colour right here,
// in a layer near the top so the keyboard never covers it (the colour
// page's own box and save path), unless they already initialled this
// colour tonight; then the deck goes to What happens next.
//
// Black Friday (Keenan, 2026-11-10): once the deal is set in Settings, a
// quiet button beside the headline. On, every option shows its regular
// total struck through beside the Black Friday total, and the breakdown
// shows the Black Friday line. A yes with it on puts the deal's line on the
// quote (lib/meeting/black-friday-state.ts), so the save, the link, the
// acceptance and commission all read it; off, or the yes taken back, takes
// it off.
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
  // Round 10: their mockups (MeetingPayload.mockups); the offer on screen
  // shows its own picture, else the Main, else none.
  mockups?: readonly MeetingMockup[];
  // Round 10: the initials for the colour, taken here when they say yes
  // (the colour page's own box and save path); null with no lead.
  initials?: {
    draft: string;
    onDraft: (value: string) => void;
    onConfirmed: (confirmation: Confirmation) => void;
    // Already initialled for this colour at this meeting: no need to ask.
    confirmed: boolean;
  } | null;
  // Where a yes goes once the colour is initialled: What happens next.
  onYes?: () => void;
  // The deck's layer states for the breakdown and the initials, so the
  // pager locks while either is open.
  breakdownLayer?: { open: boolean; set: (open: boolean) => void };
  initialsLayer?: { open: boolean; set: (open: boolean) => void };
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
  mockups = [],
  initials = null,
  onYes,
  breakdownLayer,
  initialsLayer,
}: QuoteScreenProps) {
  const inputs = useMemo(() => quoteInputs(state, pricing), [state, pricing]);
  const options = useMemo(() => screenOptions(inputs, quoteOffers(state)), [inputs, state]);
  // Black Friday (Keenan, 2026-11-10): the button shows only once the deal
  // is set in Settings. On, every option shows its regular total struck
  // through beside the Black Friday total. An accepted quote shows as it
  // was agreed (its line, if any, is an ordinary discount there).
  const deal = pricing.blackFriday;
  const dealOn = !locked && blackFridayOn(state, deal);
  const prices = useMemo(
    () => new Map(options.map((option) => [option.offer.id, offerPrice(inputs, option.offer, deal, dealOn)])),
    [options, inputs, deal, dealOn],
  );
  const shownTotals = (option: PricedOffer) => {
    const price = prices.get(option.offer.id);
    return price?.deal ?? price?.regular ?? option.totals;
  };
  const struckTotal = (option: PricedOffer) => {
    const price = prices.get(option.offer.id);
    return price?.deal && price.regular ? price.regular.subtotal : null;
  };
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [ownEdit, setOwnEdit] = useState(false);
  const [ownBreakdown, setOwnBreakdown] = useState(false);
  const [ownInitials, setOwnInitials] = useState(false);
  const editOpen = edit ? edit.open : ownEdit;
  const setEditOpen = edit ? edit.set : setOwnEdit;
  const breakdownOpen = breakdownLayer ? breakdownLayer.open : ownBreakdown;
  const setBreakdownOpen = breakdownLayer ? breakdownLayer.set : setOwnBreakdown;
  const initialsOpen = initialsLayer ? initialsLayer.open : ownInitials;
  const setInitialsOpen = initialsLayer ? initialsLayer.set : setOwnInitials;

  const chosen = options.find((option) => option.offer.id === state.chosenOffer) ?? null;
  // On screen: the one Keenan tapped, else the choice, else the biggest.
  const viewing = options.find((option) => option.offer.id === viewingId) ?? chosen ?? options[0] ?? null;
  const colour = colourKind === "none" ? null : colourText.trim() || null;
  // The sub-line counts the options: none until something is measured.
  const sub = options.length > 0 ? priceSubLine(lines, options.length, colour) : "";
  const { save } = useQuoteSave({ leadId, pricing, from: "meeting", readOnly });
  // The picture for the option on screen: its own, else the Main, else none.
  const picture = offerMockup(mockups, viewing?.offer.id ?? null);
  // The one colour line: stock, or made to order with spring or this season.
  const timing = colourTimingView({ lines, kind: colourKind, text: colourText, timing: state.colourTiming, rushFee: quoteRushFee(state) });

  // The pick, the install day and the colour's timing save with the quote,
  // quietly, when there's signal: a moment after they change, and again when the signal comes
  // back. A failure stays on the iPad and shows only in the Edit layer.
  // The Black Friday line saves the same way, so turning the button off
  // after a yes takes the line off the saved quote too.
  const dealLine = state.customDiscounts.find((line) => line.label.trim() === BLACK_FRIDAY_LABEL)?.amount ?? "";
  const pickKey = `${state.chosenOffer ?? ""}|${state.installOn ?? ""}|${state.colourTiming ?? ""}|${dealLine}`;
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

  // A yes: the option becomes their choice; then their initials for the
  // colour, right here (unless already initialled tonight for this colour),
  // then What happens next. Tapping their choice again takes it back.
  const choose = (id: string) => {
    setViewingId(id);
    if (state.chosenOffer === id) {
      onChange(chooseWithBlackFriday(state, null, pricing));
      return;
    }
    // With Black Friday on, the yes carries the deal's line for this option.
    onChange(chooseWithBlackFriday(state, id, pricing));
    if (initials && colour !== null && !initials.confirmed) setInitialsOpen(true);
    else onYes?.();
  };
  const viewingChosen = viewing !== null && chosen?.offer.id === viewing.offer.id;
  const viewingTotals = viewing ? shownTotals(viewing) : null;
  const viewingRegular = viewing ? struckTotal(viewing) : null;
  const setTiming = (next: "factory_order" | "rush") => {
    if (locked || state.colourTiming === next) return;
    onChange({ ...state, colourTiming: next });
  };

  return (
    <div className="relative flex h-full w-full flex-col pt-[72px]" style={{ paddingBottom: "var(--deck-clear, 78px)" }} data-testid="price-page">
      <header className="flex flex-wrap items-baseline gap-x-6 gap-y-1 pr-12 pl-16">
        <h2 className={DECK_TYPE.headline}>{say(deckLine(lines, "price_headline"))}</h2>
        {sub ? (
          <p className={cn(DECK_TYPE.body, "text-muted-foreground")} data-testid="price-sub">
            {say(sub)}
          </p>
        ) : null}
        {/* Black Friday: quiet, outlined while off, the light fill and the
            deal's words while on. Never gold. Only once the deal is set. */}
        {deal && !locked && viewing !== null ? (
          <button
            type="button"
            aria-pressed={dealOn}
            onClick={() => onChange(withBlackFriday(state, !dealOn, pricing))}
            className={cn(
              "ml-auto inline-flex h-12 shrink-0 touch-manipulation items-center gap-2 self-center rounded-md border px-4 text-[20px] leading-none font-semibold whitespace-nowrap outline-none [-webkit-tap-highlight-color:transparent] focus-visible:ring-2 focus-visible:ring-ring",
              dealOn ? "border-foreground bg-foreground text-background" : "border-input bg-background text-foreground hover:bg-muted",
            )}
            data-testid="price-black-friday"
          >
            {dealOn ? <Check aria-hidden="true" className="size-5 shrink-0" strokeWidth={2.5} /> : null}
            {dealOn ? `${BLACK_FRIDAY_LABEL}, ${blackFridayWords(deal)}` : BLACK_FRIDAY_LABEL}
          </button>
        ) : null}
      </header>

      {viewing === null ? (
        <p className={cn(DECK_TYPE.body, "mt-8 pr-12 pl-16 text-muted-foreground")} data-testid="price-empty">
          {say(deckLine(lines, "price_empty"))}
        </p>
      ) : (
        <div className={cn("mt-5 grid min-h-0 flex-1", picture ? "grid-cols-[minmax(0,1fr)_540px]" : "grid-cols-1")}>
          {/* Left: the option's own mockup, else the Main, big. */}
          {picture ? (
            <div className="relative min-h-0 min-w-0 overflow-hidden" data-testid="price-mockup" data-mockup={picture.id}>
              <DeckImage photo={{ url: picture.url, focus: [0.5, 0.5] }} alt={`Your house: ${cleanOfferName(viewing.offer.name)}`} fit="contain" />
            </div>
          ) : null}

          {/* Right (or the whole width, with no picture): the options, each
              with its total and what it covers, the colour line, then the
              breakdown one tap away and Choose. */}
          <div className={cn("flex min-h-0 min-w-0 flex-col gap-4 overflow-y-auto pr-12", picture ? "pl-8" : "pl-16")} data-testid="price-right">
            <div
              className={cn("grid shrink-0 gap-2.5", !picture && options.length > 1 && (options.length >= 4 ? "grid-cols-4" : options.length === 3 ? "grid-cols-3" : "grid-cols-2"))}
              role="group"
              aria-label="Options"
              data-testid="price-options"
            >
              {options.map((option) => (
                <OptionButton
                  key={option.offer.id}
                  option={option}
                  total={shownTotals(option)?.subtotal ?? 0}
                  regular={struckTotal(option)}
                  coverage={coverageLine(state.runs, option.offer)}
                  onScreen={option.offer.id === viewing.offer.id}
                  chosen={option.offer.id === chosen?.offer.id}
                  gstEnabled={pricing.gstEnabled}
                  yourChoice={deckLine(lines, "your_choice")}
                  onShow={() => setViewingId(option.offer.id)}
                />
              ))}
            </div>

            {timing.kind !== "none" ? (
              <div className="flex shrink-0 flex-col gap-2" data-testid="price-colour">
                <p className={cn(DECK_TYPE.small, "font-semibold")} data-testid="price-colour-line">
                  {say(timing.line)}
                </p>
                {timing.kind === "made" ? (
                  <div className="grid grid-cols-2 gap-2.5">
                    <TimingChoice
                      label={timing.spring.label}
                      value={timing.spring.value}
                      chosen={timing.chosen === "spring"}
                      disabled={locked}
                      onChoose={() => setTiming("factory_order")}
                      testId="price-timing-spring"
                    />
                    {timing.season ? (
                      <TimingChoice
                        label={timing.season.label}
                        value={timing.season.value}
                        chosen={timing.chosen === "season"}
                        disabled={locked}
                        onChoose={() => setTiming("rush")}
                        testId="price-timing-season"
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className={cn("grid shrink-0 gap-3", viewingTotals && !locked ? "grid-cols-2" : "grid-cols-1", !picture && "max-w-[720px]")}>
              {viewingTotals ? (
                <DeckButton
                  onClick={() => setBreakdownOpen(true)}
                  aria-haspopup="dialog"
                  aria-expanded={breakdownOpen}
                  className="min-w-0 px-4"
                  data-testid="price-breakdown-open"
                >
                  <span className="truncate">{say(deckLine(lines, "whats_in", { name: cleanOfferName(viewing.offer.name) }))}</span>
                </DeckButton>
              ) : null}
              {!locked ? (
                <button
                  type="button"
                  aria-pressed={viewingChosen}
                  onClick={() => choose(viewing.offer.id)}
                  className={cn(
                    "inline-flex h-14 min-w-0 touch-manipulation items-center justify-center gap-2 rounded-md border px-4 text-[22px] font-semibold whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    viewingChosen ? "border-foreground bg-foreground text-background" : "border-foreground/70 bg-background hover:bg-muted",
                  )}
                  data-testid="price-choose"
                >
                  {viewingChosen ? (
                    <>
                      <Check aria-hidden="true" className="size-6 shrink-0" />
                      <span className="truncate">{say(deckLine(lines, "your_choice"))}</span>
                    </>
                  ) : (
                    <span className="truncate">{say(deckLine(lines, "choose", { name: cleanOfferName(viewing.offer.name) }))}</span>
                  )}
                </button>
              ) : null}
            </div>

            <div className={cn(DECK_TYPE.small, "flex shrink-0 flex-col gap-1 text-muted-foreground")}>
              <p>{NO_PAYMENT}</p>
              {state.validUntil ? <p>{say(deckLine(lines, "price_held", { date: formatFullDate(state.validUntil) }))}</p> : null}
              {state.financingOffered ? <p>{say(deckLine(lines, "financing"))}</p> : null}
            </div>
          </div>
        </div>
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

      {/* The breakdown, one tap away: every line, its total. */}
      {viewing && viewingTotals ? (
        <MoreLayer open={breakdownOpen} onClose={() => setBreakdownOpen(false)} label={deckLine(lines, "whats_in", { name: cleanOfferName(viewing.offer.name) })}>
          <div className="flex h-full w-full flex-col pr-16 pl-16" style={{ paddingTop: 88, paddingBottom: "var(--deck-clear, 78px)" }} data-testid="price-breakdown">
            <h2 className={DECK_TYPE.moreLabel}>{say(deckLine(lines, "whats_in", { name: cleanOfferName(viewing.offer.name) }))}</h2>
            <p className={cn(DECK_TYPE.small, "mt-2 text-muted-foreground")} data-testid="price-coverage">
              {say(coverageLine(state.runs, viewing.offer))}
            </p>
            <div className="mt-4 flex min-h-0 max-w-[760px] flex-col">
              <Breakdown totals={viewingTotals} />
              <p className="mt-2 flex items-baseline justify-between gap-4 border-t border-foreground/60 pt-3" data-testid="price-total">
                <span className={cn(DECK_TYPE.small, "text-muted-foreground")}>Total</span>
                <span className="whitespace-nowrap">
                  {viewingRegular !== null ? (
                    <s className="mr-3 text-[22px] text-muted-foreground tabular-nums" data-testid="price-total-regular">
                      <span className="sr-only">Regular price </span>
                      {formatMoney(viewingRegular)}
                    </s>
                  ) : null}
                  {viewingRegular !== null ? <span className="sr-only">{`${BLACK_FRIDAY_LABEL} price `}</span> : null}
                  <span className="text-[length:var(--deck-headline)] leading-none font-semibold tabular-nums">{formatMoney(viewingTotals.subtotal)}</span>
                  {pricing.gstEnabled ? <span className="ml-2 text-[22px] text-muted-foreground">+ GST</span> : null}
                </span>
              </p>
              <p className={cn(DECK_TYPE.small, "mt-3 text-muted-foreground")}>{say(deckLine(lines, "price_includes"))}</p>
            </div>
          </div>
        </MoreLayer>
      ) : null}

      {/* Their initials for the colour, once they say yes: near the top, so
          the landscape keyboard never covers the field. */}
      {initials && colour !== null ? (
        <MoreLayer open={initialsOpen} onClose={() => setInitialsOpen(false)} label={deckLine(lines, "initials_prompt")}>
          <div className="flex h-full w-full flex-col gap-5 pr-16 pl-16" style={{ paddingTop: 96 }} data-testid="price-initials">
            <h2 className={DECK_TYPE.moreLabel}>{say(chosen ? cleanOfferName(chosen.offer.name) : deckLine(lines, "your_choice"))}</h2>
            <p className={DECK_TYPE.body}>{say(timing.kind === "none" ? colour : timing.kind === "stock" ? timing.line : `${timing.line} ${timing.chosen === "season" && timing.season ? timing.season.label : timing.spring.label}.`)}</p>
            <InitialsConfirm
              id="price-initials-field"
              leadId={leadId}
              enabled
              prompt={deckLine(lines, "initials_prompt")}
              draft={initials.draft}
              onDraft={initials.onDraft}
              onConfirmed={(confirmation) => {
                initials.onConfirmed(confirmation);
                setInitialsOpen(false);
                onYes?.();
              }}
              readOnly={readOnly}
            />
          </div>
        </MoreLayer>
      ) : null}

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

// The colour's timing, one tap: Install in spring (Included) or Install
// this season (the rush colour fee). Chosen is the Night Text fill, never
// gold.
function TimingChoice({
  label,
  value,
  chosen,
  disabled,
  onChoose,
  testId,
}: {
  label: string;
  value: string;
  chosen: boolean;
  disabled: boolean;
  onChoose: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={chosen}
      disabled={disabled}
      data-testid={testId}
      onClick={onChoose}
      className={cn(
        "flex min-h-[60px] min-w-0 touch-manipulation flex-col items-start justify-center rounded-md border px-4 py-1.5 text-left outline-none [-webkit-tap-highlight-color:transparent] focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
        chosen ? "border-foreground bg-foreground text-background" : "border-input bg-background text-foreground active:bg-secondary",
      )}
    >
      <span className="flex max-w-full items-center text-[20px] leading-6 font-semibold">
        <span className="min-w-0 truncate">{say(label)}</span>
        <Check aria-hidden="true" className={cn("ml-2 size-5 shrink-0", !chosen && "invisible")} strokeWidth={2.5} />
      </span>
      <span className={cn("max-w-full truncate text-[18px] leading-[22px]", !chosen && "text-muted-foreground")}>{say(value)}</span>
    </button>
  );
}

// One option: its name and total on one line, what it covers under them.
// On screen: a 2 px Night Text outline. Picked: the Night Text fill, a tick
// and "Your choice".
function OptionButton({
  option,
  total,
  regular,
  coverage,
  onScreen,
  chosen,
  gstEnabled,
  yourChoice,
  onShow,
}: {
  option: PricedOffer;
  // The total shown, and the regular total struck through beside it while
  // Black Friday is on (null otherwise).
  total: number;
  regular: number | null;
  coverage: string;
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
        "relative flex min-h-[84px] min-w-0 touch-manipulation flex-col justify-center gap-1 rounded-lg border-2 px-4 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        chosen ? "bg-foreground text-background" : "bg-background text-foreground",
        onScreen || chosen ? "border-foreground" : "border-border",
      )}
    >
      {chosen ? (
        <span className="sr-only" data-testid="price-your-choice">
          {say(yourChoice)}
        </span>
      ) : null}
      {/* The name and the price share a line while they fit; with Black
          Friday's two prices in a narrow column, the prices drop under it. */}
      <span className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="flex min-w-0 items-start gap-2 text-[23px] leading-tight font-semibold">
          {chosen ? <Check aria-hidden="true" className="mt-0.5 size-6 shrink-0" /> : null}
          <span className="truncate">{say(name)}</span>
        </span>
        <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
          {regular !== null ? (
            <s className={cn("text-[18px] leading-tight", chosen ? "text-background/75" : "text-muted-foreground")} data-testid="price-option-regular">
              <span className="sr-only">Regular price </span>
              {formatMoney(regular)}
            </s>
          ) : null}
          <span className="text-[26px] leading-tight font-semibold" data-testid="price-option-total">
            {regular !== null ? <span className="sr-only">{`${BLACK_FRIDAY_LABEL} price `}</span> : null}
            {formatMoney(total)}
            {gstEnabled ? <span className="ml-1.5 text-[18px] font-normal">+ GST</span> : null}
          </span>
        </span>
      </span>
      <span className={cn("line-clamp-2 text-pretty text-[19px] leading-snug", chosen ? "text-background/85" : "text-muted-foreground")} data-testid="price-option-coverage">
        {say(coverage)}
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
