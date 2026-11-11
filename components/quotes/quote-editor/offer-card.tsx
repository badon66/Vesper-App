"use client";

import { ChevronDown, Trash2 } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { OfferPhoto, type OfferPhotos } from "@/components/quotes/quote-editor/offer-photo";
import { BreakdownList, Choice, MoneyBox, Stepper, useTyping } from "@/components/quotes/quote-editor/parts";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { coverageLine } from "@/lib/meeting/price-screen";
import { cleanFeet, formatMoney, hasUpperRun, screenTotal, selectRuns, type QuoteRun, type QuoteTotals } from "@/lib/pricing";
import { areaDisplayName, isGable } from "@/lib/quotes/areas";
import { automaticUpperAccess, moneyText, offerNameIssue, toggleOfferRun } from "@/lib/quotes/editor";
import { cleanUpperAccess, OFFER_NAME_EDITOR_MAX, ONE_OFFER_SHOWN, type QuoteOffer } from "@/lib/quotes/offers";
import { cn } from "@/lib/utils";

// One offer in Keenan's quote editor (round 9, the spec 3.7; round 11): its
// name as customers read it, a tap per area it covers (every gable with its
// own tick box, so he can leave it out or put it back), its upper access
// (filled in from its areas, typed over if he likes, 0 included), its own
// box count, its photo spot (on the lead page), its live total and the
// breakdown exactly as the customer sees it. Deleting takes a second tap.
// A tap or focus anywhere on the card makes it the active offer, and the
// areas it covers light up on the drawings above (onActivate); that writes
// nothing. Round 13 (Keenan, 2026-11-11): a "Show to customer" switch, on
// to start. Off, the card is marked Hidden and the offer shows nowhere the
// customer looks (Your price, their link); the last shown offer's switch
// stays on (canHide), because at least one offer is always shown.

export function OfferCard({
  offer,
  runs,
  totals,
  quoteBoxes,
  fees,
  gstEnabled,
  locked,
  photos = null,
  autoFocus = false,
  canHide = true,
  onActivate,
  onChange,
  onShow,
  onDelete,
}: {
  offer: QuoteOffer;
  runs: QuoteRun[];
  totals: QuoteTotals | null;
  // The quote's own box count: the default for an offer that has none.
  quoteBoxes: number;
  // The quote's own upper access amounts, for the automatic amount.
  fees: { upperAccessFee: number | null; upperGableAccessFee: number | null };
  gstEnabled: boolean;
  locked: boolean;
  // The lead's mockups and the taps on them (the lead page); null shows no
  // photo spot (meeting mode).
  photos?: OfferPhotos | null;
  // A blank offer just added: its name field takes focus.
  autoFocus?: boolean;
  // False on the last offer the customer sees: it can't be hidden.
  canHide?: boolean;
  // The Show to customer switch (round 13).
  onShow?: (shown: boolean) => void;
  // Pointer down or focus within the card: it is the active offer.
  onActivate?: () => void;
  onChange: (offer: QuoteOffer) => void;
  onDelete: () => void;
}) {
  const nameId = useId();
  const showId = useId();
  const hidden = offer.hidden === true;
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const issue = offerNameIssue(offer.name);
  const coverage = coverageLine(runs, offer);
  const hasFeet = totals !== null && totals.totalFeet > 0;
  const boxes = offer.boxes ?? Math.min(9, Math.max(1, quoteBoxes));
  const name = offer.name.trim() || "this offer";
  const measured = runs.some((run) => cleanFeet(run.feet) > 0);

  // Upper access: the automatic amount from its areas, or what Keenan typed
  // over it (0 included). The line shows once the offer has an upper area,
  // and while an amount is typed.
  const auto = automaticUpperAccess(runs, offer, fees);
  const typed = cleanUpperAccess(offer.upperAccess);
  const showAccess = typed !== null || hasUpperRun(selectRuns(runs, offer.runs));
  const access = useTyping(moneyText(typed ?? auto));

  // "Tap again to delete" lasts a few seconds.
  useEffect(() => {
    if (!confirmDelete) return;
    const timer = window.setTimeout(() => setConfirmDelete(false), 4000);
    return () => window.clearTimeout(timer);
  }, [confirmDelete]);

  return (
    <article
      data-offer-card={offer.id}
      data-testid="offer-card"
      aria-label={offer.name.trim() || "New offer"}
      onPointerDown={onActivate}
      onFocus={onActivate}
      data-hidden={hidden ? "true" : "false"}
      className={cn("flex min-w-0 flex-col gap-4 rounded-lg border p-4", hidden ? "border-dashed bg-muted/30" : "bg-card")}
    >
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor={nameId} className="sr-only">
            Offer name
          </label>
          <Input
            id={nameId}
            value={offer.name}
            maxLength={OFFER_NAME_EDITOR_MAX}
            placeholder="Name it"
            disabled={locked}
            autoFocus={autoFocus}
            aria-invalid={issue ? true : undefined}
            aria-describedby={`${nameId}-hint`}
            onChange={(event) => onChange({ ...offer, name: event.target.value.replace(/\$/g, "") })}
            className="text-lg font-semibold"
            data-testid="offer-name"
          />
          <p id={`${nameId}-hint`} className={cn("text-xs", issue ? "font-semibold text-destructive" : "text-muted-foreground")}>
            {issue ?? (hidden ? "Hidden. Customers don't see this offer." : "Customers see this name.")}
          </p>
        </div>
        {!locked ? (
          <button
            type="button"
            onClick={() => (confirmDelete ? onDelete() : setConfirmDelete(true))}
            aria-label={confirmDelete ? undefined : `Delete ${name}`}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring",
              confirmDelete ? "border border-destructive text-destructive" : "min-w-11 text-muted-foreground hover:bg-muted",
            )}
            data-testid="offer-delete"
          >
            {confirmDelete ? "Tap again to delete" : <Trash2 aria-hidden="true" className="size-4" />}
          </button>
        ) : null}
      </div>

      {onShow ? (
        <div className="flex flex-col">
          <div className="flex flex-wrap items-center gap-x-3">
            {/* The label is the tap target (48 px); the switch itself is small. */}
            <label htmlFor={showId} className="flex min-h-12 cursor-pointer items-center gap-3 text-sm font-semibold">
              <Switch
                id={showId}
                checked={!hidden}
                disabled={locked || (!hidden && !canHide)}
                onCheckedChange={(shown) => onShow(shown)}
                data-testid="offer-show"
              />
              Show to customer
            </label>
            {hidden ? (
              <span className="rounded-md border border-foreground px-2 py-0.5 text-xs font-bold tracking-wide uppercase" data-testid="offer-hidden">
                Hidden
              </span>
            ) : null}
          </div>
          {hidden ? (
            <p className="text-xs text-pretty text-muted-foreground">Not on Your price in the meeting, and not on their link.</p>
          ) : !canHide && !locked ? (
            <p className="text-xs text-muted-foreground" data-testid="offer-show-note">
              {ONE_OFFER_SHOWN}
            </p>
          ) : null}
        </div>
      ) : null}

      {photos ? <OfferPhoto offerId={offer.id} photos={photos} locked={locked} /> : null}

      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-muted-foreground">Areas it covers</p>
        {!measured ? (
          <p className="text-sm text-muted-foreground">Measure the areas above first.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {runs.map((run, at) => {
              const feet = cleanFeet(run.feet);
              if (feet === 0) return null;
              const gable = isGable(run);
              const chip = (
                <Choice
                  on={offer.runs.includes(at)}
                  disabled={locked}
                  onToggle={() => onChange(toggleOfferRun(offer, at))}
                  tick={gable}
                  testId="offer-run"
                  data={{ position: String(at), gable: gable ? "true" : undefined }}
                >
                  {areaDisplayName(run)}
                  <span className="font-normal tabular-nums opacity-80">{feet} ft</span>
                </Choice>
              );
              // A gable's tick box, so he can leave it out or put it back.
              return gable ? (
                <span key={at} className="inline-flex" data-testid="offer-gable" data-on={offer.runs.includes(at) ? "true" : "false"}>
                  {chip}
                </span>
              ) : (
                <span key={at} className="inline-flex">
                  {chip}
                </span>
              );
            })}
          </div>
        )}
        {offer.runs.length === 0 && measured ? <p className="text-sm text-muted-foreground">Tap the areas it covers.</p> : null}
      </div>

      <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-semibold text-muted-foreground">Control boxes</p>
          <Stepper
            value={boxes}
            min={1}
            max={9}
            label={`control boxes in ${name}`}
            disabled={locked}
            onChange={(value) => onChange({ ...offer, boxes: value })}
            testId="offer-boxes"
          />
        </div>
        {showAccess ? (
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-semibold text-muted-foreground">Upper access</p>
            <div className="flex flex-wrap items-center gap-2">
              <MoneyBox
                label={`Upper access in ${name}`}
                value={access.value}
                placeholder={auto === null ? "None" : undefined}
                disabled={locked}
                onFocus={access.start}
                onChange={(text) => {
                  access.type(text);
                  // Nothing typed yet leaves the offer be; a number (0
                  // included) sticks for this offer.
                  const value = cleanUpperAccess(text);
                  if (value !== null) onChange({ ...offer, upperAccess: value });
                }}
                onBlur={() => {
                  // A box left empty goes back to the automatic amount.
                  if (access.value === "" && typed !== null) onChange({ ...offer, upperAccess: null });
                  access.stop();
                }}
                testId="offer-upper-access"
                data={{ auto: typed === null ? "true" : "false" }}
              />
              {typed !== null && !locked ? (
                <button
                  type="button"
                  onClick={() => onChange({ ...offer, upperAccess: null })}
                  className="inline-flex min-h-11 items-center rounded-md px-2 text-sm font-semibold text-muted-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                  data-testid="offer-upper-access-auto"
                >
                  Automatic{auto !== null ? `, ${formatMoney(auto)}` : ""}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
        <div className="ml-auto flex flex-col items-end text-right">
          <p className="text-sm text-muted-foreground">{coverage || "No measured areas yet"}</p>
          <p className="text-2xl font-bold tabular-nums" data-testid="offer-total">
            {hasFeet && totals ? screenTotal(totals.subtotal, gstEnabled) : offer.runs.length === 0 ? "Pick the areas" : "Not measured yet"}
          </p>
        </div>
      </div>

      {hasFeet && totals ? (
        <div className="flex flex-col">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((now) => !now)}
            className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-semibold underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronDown aria-hidden="true" className={cn("size-4 transition-transform", open && "rotate-180")} />
            {open ? "Hide the breakdown" : "The breakdown, as they see it"}
          </button>
          {open ? <BreakdownList totals={totals} gstEnabled={gstEnabled} className="mt-1" /> : null}
        </div>
      ) : null}
    </article>
  );
}
