"use client";

import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { AreaViews } from "@/components/quotes/quote-editor/area-views";
import { OfferCard } from "@/components/quotes/quote-editor/offer-card";
import { useOfferPhotos } from "@/components/quotes/quote-editor/offer-photo";
import { Choice, cleanMoneyInput, DateField, MoneyField, QuietWarning, Stepper } from "@/components/quotes/quote-editor/parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { LeadMockupItem } from "@/lib/leads/mockup-roles";
import {
  colourTimingFor,
  quoteInputs,
  quoteMinimum,
  quoteRushFee,
  rushFeeOn,
  withColourTiming,
  withRushFee,
  type MeetingPayload,
  type QuoteUIState,
} from "@/lib/meeting/state";
import { cleanFeet, defaultValidUntil, formatMoney, percentWords, totalFeet, usablePercent } from "@/lib/pricing";
import { addQuickStart, editorOffers, editorOrder, offerLitPositions, offerWarnings, percentDiscountWords, typeDiscountAmount } from "@/lib/quotes/editor";
import {
  canHideOffer,
  isCustomerOffer,
  keepOneShown,
  OFFERS_MAX,
  pricedOffers,
  quickStartsFor,
  setLeadOffer,
  setOfferHidden,
  type QuickStart,
  type QuoteOffer,
} from "@/lib/quotes/offers";
import { cn } from "@/lib/utils";

// Keenan's quote editor (round 9, the spec 3.7; round 11, quoting by area):
// one component in two places, the lead page's Edit the quote sheet and
// meeting mode's Edit layer, so it is literally the quote the meeting opens
// with. The sections follow the order a quote is built: measuring (the
// Front and Back views drawn, the Sides and Other, each area a line he taps
// to type the feet into, priced the quote's way or his own), the offers
// (each picking its areas, gables ticked on or off, biggest first, with a
// photo spot on the lead page; tapping a card lights the areas it covers on
// the drawings, and a tap outside the cards puts the lights out), and the
// prices for this quote (collapsed, since Settings' values usually stand).
// Warnings are quiet and never block. An accepted
// quote is read only. Owner only, never under View as, never customer
// facing. It holds no state of its own but the screen's: the quote is the
// caller's, and Save is the caller's too.

export type QuoteEditorProps = {
  state: QuoteUIState;
  onChange: (next: QuoteUIState) => void;
  pricing: MeetingPayload["pricing"];
  colourKind: "none" | "list" | "custom";
  colourText: string;
  today: string;
  // An accepted quote: everything shows, nothing changes, and these words
  // say why at the top.
  locked?: boolean;
  lockedWords?: string;
  // Round 11, the lead page only: the lead's mockups for the photo spot on
  // each offer, who is uploading, and how to catch the page up after a pick
  // or an upload. Meeting mode passes none and shows no spot.
  mockups?: LeadMockupItem[];
  leadId?: string;
  userId?: string;
  onMockupsRefresh?: () => void;
};

export function QuoteEditor({
  state,
  onChange,
  pricing,
  colourKind,
  colourText,
  today,
  locked = false,
  lockedWords,
  mockups,
  leadId,
  userId,
  onMockupsRefresh,
}: QuoteEditorProps) {
  const set = (patch: Partial<QuoteUIState>) => onChange({ ...state, ...patch });
  const inputs = useMemo(() => quoteInputs(state, pricing), [state, pricing]);
  const offers = useMemo(() => editorOffers(state.runs, state.offers), [state.runs, state.offers]);
  const priced = useMemo(() => new Map(pricedOffers(inputs, offers).map((item) => [item.offer.id, item])), [inputs, offers]);
  const warnings = useMemo(() => offerWarnings(inputs, offers), [inputs, offers]);
  const photos = useOfferPhotos({ mockups, leadId, userId, onRefresh: onMockupsRefresh });
  const [quickOpen, setQuickOpen] = useState(false);
  const [focusOffer, setFocusOffer] = useState<string | null>(null);

  // The active offer (its card tapped or focused): the measured areas it
  // covers light up on the drawings. Screen state only; nothing is written.
  const [activeOffer, setActiveOffer] = useState<string | null>(null);
  const lit = useMemo(() => offerLitPositions(state.runs, offers.find((offer) => offer.id === activeOffer) ?? null), [state.runs, offers, activeOffer]);

  // The cards sit biggest first, but re-sort only when Keenan leaves a
  // field or taps outside the cards, never while he types or taps a card's
  // runs; adding or deleting one re-sorts at once.
  const idsKey = offers.map((offer) => offer.id).join(",");
  const [order, setOrder] = useState<string[]>(() => editorOrder(inputs, offers));
  const [orderKey, setOrderKey] = useState(idsKey);
  if (orderKey !== idsKey) {
    setOrderKey(idsKey);
    setOrder(editorOrder(inputs, offers));
  }
  const resort = () => {
    const next = editorOrder(inputs, offers);
    if (next.join(",") !== order.join(",")) setOrder(next);
  };
  const cards = [
    ...order.flatMap((id) => offers.filter((offer) => offer.id === id)),
    ...offers.filter((offer) => !order.includes(offer.id)),
  ];

  const setOffers = (next: QuoteOffer[], patch: Partial<QuoteUIState> = {}) => set({ offers: next, ...patch });
  const addOffer = (kind: QuickStart) => {
    const next = addQuickStart(offers, kind, state.runs);
    setQuickOpen(false);
    if (kind === "custom") setFocusOffer(next[next.length - 1]?.id ?? null);
    setOffers(next);
  };
  const changeOffer = (offer: QuoteOffer) => setOffers(offers.map((item) => (item.id === offer.id ? offer : item)));
  const deleteOffer = (id: string) => {
    if (activeOffer === id) setActiveOffer(null);
    // At least one offer is always shown (round 13): if only hidden ones
    // are left, the first of them shows again.
    setOffers(
      keepOneShown(offers.filter((item) => item.id !== id)),
      state.chosenOffer === id ? { chosenOffer: null } : {},
    );
  };
  // Show to customer (round 13). Hiding the offer chosen at the table
  // drops that choice: the customer no longer sees it.
  const showOffer = (id: string, shown: boolean) =>
    setOffers(setOfferHidden(offers, id, !shown), !shown && state.chosenOffer === id ? { chosenOffer: null } : {});
  // Round 17: "Lead with this one", one star per quote. The card moves to
  // the top the next time the list re-sorts, as with any price change.
  const leadOffer = (id: string, lead: boolean) => setOffers(setLeadOffer(offers, lead ? id : null));

  const feet = totalFeet(state.runs);
  const quickStarts = quickStartsFor(state.runs);
  // Keenan's own four; the customer's own build (take 3) doesn't count.
  const full = offers.filter((offer) => !isCustomerOffer(offer)).length >= OFFERS_MAX;
  const fees = { upperAccessFee: inputs.upperAccessFee ?? null, upperGableAccessFee: inputs.upperGableAccessFee ?? null };

  return (
    <div
      className="flex flex-col gap-8"
      data-testid="quote-editor"
      onBlur={(event) => {
        if (event.target instanceof HTMLInputElement) resort();
      }}
      onPointerDown={(event) => {
        if (event.target instanceof Element && event.target.closest("[data-offer-card]")) return;
        resort();
        setActiveOffer(null);
      }}
    >
      {locked && lockedWords ? (
        <p role="status" className="rounded-md border border-input px-4 py-3 text-base font-semibold text-pretty" data-testid="quote-locked">
          {lockedWords}
        </p>
      ) : null}

      {/* ------------------------------------------------ measuring */}
      <section aria-labelledby="editor-runs" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            <h3 id="editor-runs" className="text-lg font-bold">
              Measuring
            </h3>
            <p className="text-sm text-pretty text-muted-foreground">
              The feet on each area. The garage and porch count as Front lower; the sides are one number for both.
            </p>
          </div>
          <p className="text-sm text-muted-foreground tabular-nums" data-testid="editor-feet">
            {feet} ft measured
          </p>
        </div>
        <AreaViews
          runs={state.runs}
          offers={state.offers}
          pricePerFt={inputs.pricePerFt}
          trackPrices={pricing.trackPrices}
          locked={locked}
          lit={lit}
          onChange={(next) => set(next)}
        />
      </section>

      {/* ------------------------------------------------ offers */}
      <section aria-labelledby="editor-offers" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 id="editor-offers" className="text-lg font-bold">
            Offers
          </h3>
          {!locked ? (
            <Button
              type="button"
              variant="outline"
              aria-expanded={quickOpen}
              disabled={full}
              onClick={() => setQuickOpen((open) => !open)}
              data-testid="add-offer"
            >
              <Plus aria-hidden="true" className="size-4" />
              Offer
            </Button>
          ) : null}
        </div>
        {full && !locked ? <p className="text-sm text-muted-foreground">The meeting and the link show up to 4.</p> : null}
        {quickOpen && !full && !locked ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="quick-starts">
            {quickStarts.map((start) => (
              <button
                key={start.kind}
                type="button"
                onClick={() => addOffer(start.kind)}
                className="flex min-h-16 flex-col items-start justify-center rounded-md border border-input bg-background px-3 py-2 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                data-testid={`quick-start-${start.kind}`}
              >
                <span className="font-semibold">{start.label}</span>
                <span className="text-xs text-muted-foreground">{start.hint}</span>
              </button>
            ))}
          </div>
        ) : null}
        {cards.length === 0 ? (
          <p className="text-sm text-muted-foreground">Measure an area above and a full wrap appears here.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {cards.map((offer) => (
              <OfferCard
                key={offer.id}
                offer={offer}
                runs={state.runs}
                totals={priced.get(offer.id)?.totals ?? null}
                quoteBoxes={state.boxCount}
                fees={fees}
                gstEnabled={pricing.gstEnabled}
                locked={locked}
                photos={photos}
                autoFocus={focusOffer === offer.id}
                canHide={canHideOffer(offers, offer.id)}
                onActivate={() => setActiveOffer(offer.id)}
                onChange={changeOffer}
                onShow={(shown) => showOffer(offer.id, shown)}
                onLead={(lead) => leadOffer(offer.id, lead)}
                onDelete={() => deleteOffer(offer.id)}
                polishReady={pricing.polishReady === true}
              />
            ))}
          </div>
        )}
        {cards.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            {cards.some((offer) => offer.lead === true)
              ? "Customers see the one you lead with first, then the rest biggest first."
              : cards.some((offer) => offer.hidden === true)
                ? "Customers see the shown ones biggest first. Hidden ones stay here."
                : "Customers see these biggest first. Star one to lead with it."}
          </p>
        ) : null}
        {warnings.length > 0 ? (
          <div className="flex flex-col gap-2" data-testid="editor-warnings">
            {warnings.map((warning) => (
              <QuietWarning key={warning.key}>{warning.text}</QuietWarning>
            ))}
          </div>
        ) : null}
      </section>

      {/* ------------------------------------------------ prices */}
      <Prices state={state} set={set} pricing={pricing} colourKind={colourKind} colourText={colourText} today={today} locked={locked} />
    </div>
  );
}

// Prices for this quote: collapsed, since Settings' values usually stand.
// Every option is priced from these (lib/pricing.ts) with its own runs and
// boxes. Discounts and extra work are shared by every option.
function Prices({
  state,
  set,
  pricing,
  colourKind,
  colourText,
  today,
  locked,
}: {
  state: QuoteUIState;
  set: (patch: Partial<QuoteUIState>) => void;
  pricing: MeetingPayload["pricing"];
  colourKind: "none" | "list" | "custom";
  colourText: string;
  today: string;
  locked: boolean;
}) {
  const [open, setOpen] = useState(false);
  const inputs = quoteInputs(state, pricing);
  const minimum = quoteMinimum(state, pricing);
  const rushFee = quoteRushFee(state);
  const timing = colourTimingFor(colourKind, colourText, state.colourTiming);
  // Round 17: "Charge a rush fee" is off to start; on, it holds the amount
  // (Settings' to start, his to type over), even while the box is empty.
  const [feeSwitch, setFeeSwitch] = useState(false);
  const feeOn = timing === "rush" && (feeSwitch || rushFee !== null);
  const discountCount = inputs.discounts.length;
  const summary = [
    `${formatMoney(inputs.pricePerFt)} a foot`,
    `${formatMoney(inputs.boxPrice)} a box`,
    minimum ? `${formatMoney(minimum)} minimum` : null,
    discountCount > 0 ? `${discountCount} ${discountCount === 1 ? "discount" : "discounts"}` : null,
    rushFeeOn(state) ? "rush colour fee" : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <section aria-labelledby="editor-prices" className="flex flex-col gap-4">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="editor-prices-body"
        onClick={() => setOpen((now) => !now)}
        className="flex min-h-11 items-center justify-between gap-3 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="editor-prices-toggle"
      >
        <span className="flex flex-col">
          <span id="editor-prices" className="text-lg font-bold">
            Prices for this quote
          </span>
          <span className="text-sm text-muted-foreground">{summary}</span>
        </span>
        <ChevronDown aria-hidden="true" className={cn("size-5 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div id="editor-prices-body" className="flex flex-col gap-6">
          <div className="flex flex-wrap items-end gap-5">
            <MoneyField id="editor-ppf" label="Per foot" value={state.pricePerFt} onChange={(value) => set({ pricePerFt: value })} disabled={locked} />
            <MoneyField id="editor-box" label="Per box" value={state.boxPrice} onChange={(value) => set({ boxPrice: value })} disabled={locked} />
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-semibold">Control boxes</p>
              <Stepper
                value={Math.min(9, Math.max(1, state.boxCount))}
                min={1}
                max={9}
                label="control boxes, unless an offer says otherwise"
                disabled={locked}
                onChange={(value) => set({ boxCount: value })}
              />
            </div>
            <MoneyField
              id="editor-upper"
              label="Upper access"
              value={state.upperAccessFee}
              placeholder="None"
              onChange={(value) => set({ upperAccessFee: value })}
              disabled={locked}
            />
            <MoneyField
              id="editor-upper-gable"
              label="With an upper gable"
              value={state.upperGableAccessFee}
              placeholder="None"
              onChange={(value) => set({ upperGableAccessFee: value })}
              disabled={locked}
            />
            <MoneyField
              id="editor-minimum"
              label="Minimum job"
              value={state.minJobTotal ?? (pricing.minJobTotal ? String(pricing.minJobTotal) : "")}
              placeholder="None"
              onChange={(value) => set({ minJobTotal: value })}
              disabled={locked}
            />
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold">Track colour</p>
            {colourKind === "none" ? (
              <p className="text-sm text-pretty text-muted-foreground">
                No track colour yet. White is in stock and included; any other colour is made to order.
              </p>
            ) : timing === "stock" ? (
              <p className="text-sm text-pretty">{colourText}: in stock and included.</p>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-sm text-pretty">{colourText} is made to order. Your price in the meeting sets this too.</p>
                {/* Round 17 (Keenan, 2026-11-12): this season is included and the
                    default; spring is included; a rush fee is his choice. */}
                <div className="flex flex-wrap items-center gap-3">
                  <Choice
                    on={timing === "rush"}
                    disabled={locked}
                    onToggle={() => {
                      if (timing !== "rush") set(withColourTiming("rush"));
                    }}
                    testId="editor-timing-season"
                  >
                    {feeOn && rushFee !== null ? `This season, ${formatMoney(rushFee)} rush fee` : "This season, included"}
                  </Choice>
                  <Choice
                    on={timing === "factory_order"}
                    disabled={locked}
                    onToggle={() => {
                      if (timing === "factory_order") return;
                      setFeeSwitch(false);
                      set(withColourTiming("factory_order"));
                    }}
                    testId="editor-timing-spring"
                  >
                    Spring, included
                  </Choice>
                </div>
                {timing === "rush" ? (
                  <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
                    <label htmlFor="editor-rush-switch" className="flex min-h-12 cursor-pointer items-center gap-3 text-sm font-semibold">
                      <Switch
                        id="editor-rush-switch"
                        checked={feeOn}
                        disabled={locked}
                        onCheckedChange={(on) => {
                          setFeeSwitch(on);
                          set(withRushFee(on, pricing));
                        }}
                        data-testid="editor-rush-switch"
                      />
                      Charge a rush fee
                    </label>
                    {feeOn ? (
                      <MoneyField
                        id="editor-rush"
                        label="Rush colour fee"
                        value={state.rushFee}
                        placeholder="0"
                        onChange={(value) => set({ rushFee: value })}
                        disabled={locked}
                      />
                    ) : null}
                  </div>
                ) : null}
                <p className="text-xs text-pretty text-muted-foreground" data-testid="editor-rush-note">
                  {feeOn
                    ? "Their price includes the rush colour fee, and their link and Your price name it."
                    : "No rush fee: nothing on their link or in the meeting mentions one."}
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold">Discounts, for every offer</p>
            <div className="flex flex-wrap items-center gap-3">
              <Choice on={state.neighbourOn} disabled={locked} onToggle={() => set({ neighbourOn: !state.neighbourOn })}>
                Neighbour discount
              </Choice>
              {state.neighbourOn ? (
                <Input
                  inputMode="decimal"
                  aria-label="Neighbour discount amount"
                  value={state.neighbourAmount}
                  disabled={locked}
                  onChange={(event) => set({ neighbourAmount: cleanMoneyInput(event.target.value) })}
                  className="w-28 tabular-nums"
                />
              ) : null}
            </div>
            {state.customDiscounts.map((discount, at) => {
              const unnamed = discount.label.trim() === "" && Number(discount.amount) > 0;
              // A line worked out on each option (Black Friday as a percent)
              // reads "15% off" in its amount box and says what it comes to
              // on each option underneath; "Use dollars instead" makes it a
              // fixed amount, the same on every option.
              const percent = usablePercent(discount.percent);
              const perOption = percentDiscountWords(discount, inputs, state.offers);
              return (
                <div key={at} className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <Input
                      value={discount.label}
                      placeholder="Its name"
                      aria-label={`Discount ${at + 1} name`}
                      maxLength={80}
                      disabled={locked}
                      aria-invalid={unnamed ? true : undefined}
                      onChange={(event) =>
                        set({ customDiscounts: state.customDiscounts.map((item, which) => (which === at ? { ...item, label: event.target.value } : item)) })
                      }
                      className="min-w-0 flex-1"
                    />
                    {percent !== null ? (
                      <Input
                        readOnly
                        aria-label={`Discount ${at + 1} amount`}
                        value={`${percentWords(percent)}% off`}
                        className="w-28 tabular-nums"
                        data-testid="editor-percent-amount"
                      />
                    ) : (
                      <Input
                        inputMode="decimal"
                        aria-label={`Discount ${at + 1} amount`}
                        value={discount.amount}
                        placeholder="$"
                        disabled={locked}
                        onChange={(event) =>
                          set({ customDiscounts: typeDiscountAmount(state.customDiscounts, at, cleanMoneyInput(event.target.value)) })
                        }
                        className="w-28 tabular-nums"
                      />
                    )}
                    {!locked ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove discount ${at + 1}`}
                        onClick={() => set({ customDiscounts: state.customDiscounts.filter((_, which) => which !== at) })}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    ) : null}
                  </div>
                  {perOption ? (
                    <p className="text-xs text-muted-foreground" data-testid="editor-percent-discount">
                      {perOption}{" "}
                      {!locked ? (
                        <button
                          type="button"
                          className="underline underline-offset-2"
                          data-testid="editor-percent-to-dollars"
                          onClick={() => set({ customDiscounts: typeDiscountAmount(state.customDiscounts, at, discount.amount) })}
                        >
                          Use dollars instead
                        </button>
                      ) : null}
                    </p>
                  ) : null}
                  {unnamed ? <p className="text-xs font-semibold">Name this discount. Customers see it.</p> : null}
                </div>
              );
            })}
            {!locked ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() => set({ customDiscounts: [...state.customDiscounts, { label: "", amount: "" }] })}
              >
                + Discount
              </Button>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold">Extra work, for every offer</p>
            {state.adders.map((adder, at) => (
              <div key={at} className="flex flex-wrap items-center gap-2">
                <Input
                  value={adder.label}
                  placeholder="Height, complexity"
                  aria-label={`Extra work ${at + 1} label`}
                  maxLength={80}
                  disabled={locked}
                  onChange={(event) => set({ adders: state.adders.map((item, which) => (which === at ? { ...item, label: event.target.value } : item)) })}
                  className="min-w-0 flex-1"
                />
                <Input
                  inputMode="decimal"
                  aria-label={`Extra work ${at + 1} amount`}
                  value={adder.amount}
                  placeholder="$"
                  disabled={locked}
                  onChange={(event) =>
                    set({ adders: state.adders.map((item, which) => (which === at ? { ...item, amount: cleanMoneyInput(event.target.value) } : item)) })
                  }
                  className="w-28 tabular-nums"
                />
                {/* On an offer with no upper run, this line drops off. */}
                <Choice
                  on={Boolean(adder.upperOnly)}
                  disabled={locked}
                  label={`Extra work ${at + 1}: only with upper runs`}
                  onToggle={() => set({ adders: state.adders.map((item, which) => (which === at ? { ...item, upperOnly: !item.upperOnly } : item)) })}
                >
                  Only with upper runs
                </Choice>
                {!locked ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove extra work ${at + 1}`}
                    onClick={() => set({ adders: state.adders.filter((_, which) => which !== at) })}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                ) : null}
              </div>
            ))}
            {!locked ? (
              <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => set({ adders: [...state.adders, { label: "", amount: "" }] })}>
                + Extra work
              </Button>
            ) : null}
          </div>

          <div className="flex flex-wrap items-end gap-5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="editor-valid">Price held until</Label>
              {/* In words, over the device's own picker (round 12). */}
              <DateField
                id="editor-valid"
                min={today}
                value={state.validUntil}
                disabled={locked}
                onChange={(value) => set({ validUntil: value || defaultValidUntil(today, pricing.priceHoldDays) })}
              />
            </div>
            <Choice on={state.financingOffered} disabled={locked} onToggle={() => set({ financingOffered: !state.financingOffered })}>
              Offer financing
            </Choice>
          </div>
        </div>
      ) : null}
    </section>
  );
}

// Whether the quote has anything measured to save: the save waits for feet.
export function hasMeasuredRun(state: Pick<QuoteUIState, "runs">): boolean {
  return state.runs.some((run) => cleanFeet(run.feet) > 0);
}
