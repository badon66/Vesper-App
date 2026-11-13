"use client";

import { ChevronDown, Plus, Star, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState, useTransition } from "react";

import { polishOfferDescription } from "@/app/(app)/app/leads/polish-actions";
import { OfferPhoto, type OfferPhotos } from "@/components/quotes/quote-editor/offer-photo";
import { BreakdownList, Choice, MoneyBox, Stepper, useTyping } from "@/components/quotes/quote-editor/parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { coverageLine } from "@/lib/meeting/price-screen";
import { cleanFeet, formatMoney, hasUpperRun, screenTotal, selectRuns, type QuoteRun, type QuoteTotals } from "@/lib/pricing";
import { areaDisplayName, isGable } from "@/lib/quotes/areas";
import { automaticUpperAccess, moneyText, offerDescriptionIssue, offerNameIssue, toggleOfferRun } from "@/lib/quotes/editor";
import {
  canLead,
  cleanRushFee,
  cleanUpperAccess,
  isCustomerOffer,
  OFFER_CHARGES_MAX,
  OFFER_DESCRIPTION_MAX,
  OFFER_NAME_EDITOR_MAX,
  ONE_OFFER_SHOWN,
  type OfferCharge,
  type QuoteOffer,
} from "@/lib/quotes/offers";
import { POLISH_WORDS, polishFacts } from "@/lib/quotes/polish";
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
// stays on (canHide), because at least one offer is always shown. Round 17
// (Keenan, 2026-11-12): "Lead with this one", a star on each shown offer of
// his, one per quote: the starred offer is listed first and the customer's
// link opens on it unless they booked one.

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
  onLead,
  onDelete,
  polishReady = false,
  rushFeeDefault = null,
  accepted = false,
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
  // Round 17: star this offer (true) or take the star off (false).
  onLead?: (lead: boolean) => void;
  // Round 17: the AI key is in the server's environment; Polish is greyed
  // out until it is, and the description box works as plain text.
  polishReady?: boolean;
  // Round 18: Settings' rush fee, what the offer's Rush fee switch fills in.
  rushFeeDefault?: number | null;
  // Round 18: the option the customer said yes to on an accepted quote: it
  // stays editable, but it can't be deleted or hidden.
  accepted?: boolean;
  // Pointer down or focus within the card: it is the active offer.
  onActivate?: () => void;
  onChange: (offer: QuoteOffer) => void;
  onDelete: () => void;
}) {
  const nameId = useId();
  const showId = useId();
  const descriptionId = useId();
  const descriptionBox = useRef<HTMLTextAreaElement>(null);
  // Round 17: the polish's suggestion, or what it said instead. Nothing
  // here saves: Use or Edit puts the words in the box, and the quote saves
  // with Save quote as always.
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [polishNote, setPolishNote] = useState<string | null>(null);
  const [polishing, startPolish] = useTransition();
  const description = offer.description ?? "";
  const polish = () => {
    setPolishNote(null);
    setSuggestion(null);
    startPolish(async () => {
      const result = await polishOfferDescription({ notes: description, facts: polishFacts(offer, runs) }).catch(() => ({
        ok: false as const,
        message: POLISH_WORDS.failed,
      }));
      if (result.ok) setSuggestion(result.suggestion);
      else setPolishNote(result.message);
    });
  };
  const takeSuggestion = (edit: boolean) => {
    if (suggestion === null) return;
    onChange({ ...offer, description: suggestion });
    setSuggestion(null);
    if (edit) {
      window.requestAnimationFrame(() => {
        const box = descriptionBox.current;
        if (!box) return;
        box.focus();
        box.setSelectionRange(box.value.length, box.value.length);
      });
    }
  };
  const hidden = offer.hidden === true;
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const issue = offerNameIssue(offer.name);
  const descriptionIssue = offerDescriptionIssue(offer.description);
  const coverage = coverageLine(runs, offer);
  const hasFeet = totals !== null && totals.totalFeet > 0;
  const boxes = offer.boxes ?? Math.min(9, Math.max(1, quoteBoxes));
  const name = offer.name.trim() || "this offer";
  const measured = runs.some((run) => cleanFeet(run.feet) > 0);

  // Upper access: the automatic amount from its areas, or what Keenan typed
  // over it (0 included). The line shows once the offer has an upper area,
  // and while an amount is typed.
  // Round 18: this offer's own rush fee (its switch; on, Settings' amount
  // to start, his to type over) and its own extra charges.
  const fee = cleanRushFee(offer.rushFee);
  const [feeSwitch, setFeeSwitch] = useState(false);
  const feeOn = feeSwitch || fee !== null;
  const feeTyping = useTyping(moneyText(fee));
  const charges: OfferCharge[] = offer.charges ?? [];
  const setCharges = (next: OfferCharge[]) => onChange({ ...offer, charges: next });
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
            {issue ??
              (isCustomerOffer(offer)
                ? "Built by the customer on their link. Accept it like any other."
                : hidden
                  ? "Hidden. Customers don't see this offer."
                  : "Customers see this name.")}
          </p>
        </div>
        {!locked && !accepted ? (
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
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            {/* The label is the tap target (48 px); the switch itself is small. */}
            <label htmlFor={showId} className="flex min-h-12 cursor-pointer items-center gap-3 text-sm font-semibold">
              <Switch
                id={showId}
                checked={!hidden}
                disabled={locked || accepted || (!hidden && !canHide)}
                onCheckedChange={(shown) => onShow(shown)}
                data-testid="offer-show"
              />
              Show to customer
            </label>
            {onLead && canLead(offer) ? (
              <button
                type="button"
                aria-pressed={offer.lead === true}
                disabled={locked}
                onClick={() => onLead(offer.lead !== true)}
                className={cn(
                  "inline-flex min-h-12 items-center gap-2 rounded-md px-1 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
                  offer.lead === true ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
                data-testid="offer-lead"
              >
                <Star aria-hidden="true" className={cn("size-5 shrink-0", offer.lead === true && "fill-current")} strokeWidth={1.75} />
                {offer.lead === true ? "Leading with this one" : "Lead with this one"}
              </button>
            ) : null}
            {hidden ? (
              <span className="rounded-md border border-foreground px-2 py-0.5 text-xs font-bold tracking-wide uppercase" data-testid="offer-hidden">
                Hidden
              </span>
            ) : null}
          </div>
          {accepted ? (
            <p className="text-xs font-semibold text-pretty" data-testid="offer-accepted-note">
              They said yes to this one. A change here updates their link and the commission; their signed agreement stays as signed.
            </p>
          ) : null}
          {offer.lead === true && !hidden ? (
            <p className="text-xs text-pretty text-muted-foreground" data-testid="offer-lead-note">
              Listed first, and their link opens on it unless they booked another.
            </p>
          ) : null}
          {hidden ? (
            <p className="text-xs text-pretty text-muted-foreground">Not on Your price in the meeting, and not on their link.</p>
          ) : !canHide && !locked ? (
            <p className="text-xs text-muted-foreground" data-testid="offer-show-note">
              {ONE_OFFER_SHOWN}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Round 17: what customers read under the offer's name on their
          link (and inside the breakdown at the table). Rough notes are
          fine: Polish turns them into a suggestion he can use, edit or
          dismiss. */}
      {!isCustomerOffer(offer) ? (
        <div className="flex flex-col gap-2" data-testid="offer-description-block">
          <label htmlFor={descriptionId} className="text-sm font-semibold text-muted-foreground">
            Description
          </label>
          <Textarea
            ref={descriptionBox}
            id={descriptionId}
            value={description}
            rows={3}
            maxLength={OFFER_DESCRIPTION_MAX}
            placeholder="Rough notes are fine: does the whole front, both gables, best value"
            disabled={locked}
            onChange={(event) => onChange({ ...offer, description: event.target.value })}
            aria-invalid={descriptionIssue ? true : undefined}
            aria-describedby={descriptionIssue ? `${descriptionId}-issue ${descriptionId}-hint` : `${descriptionId}-hint`}
            className="min-h-20 text-base"
            data-testid="offer-description"
          />
          {descriptionIssue ? (
            <p id={`${descriptionId}-issue`} className="text-xs font-semibold text-destructive" data-testid="offer-description-issue">
              {descriptionIssue}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!polishReady || locked || polishing || description.trim() === ""}
              aria-busy={polishing}
              onClick={polish}
              data-testid="offer-polish"
            >
              {polishing ? "Polishing" : "Polish"}
            </Button>
            <p id={`${descriptionId}-hint`} className="text-xs text-pretty text-muted-foreground" data-testid="offer-polish-hint">
              {polishReady ? "Customers read this under the offer's name. Polish suggests a cleaner version; nothing changes until you use it." : POLISH_WORDS.noKey}
            </p>
          </div>
          {polishNote ? (
            <p role="status" className="text-sm font-semibold text-pretty" data-testid="offer-polish-note">
              {polishNote}
            </p>
          ) : null}
          {suggestion !== null ? (
            <div role="status" aria-live="polite" className="flex flex-col gap-3 rounded-md border border-input px-3 py-3" data-testid="offer-suggestion">
              <p className="text-xs font-semibold text-muted-foreground">Suggestion</p>
              <p className="text-base text-pretty">{suggestion}</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={() => takeSuggestion(false)} data-testid="offer-suggestion-use">
                  Use
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => takeSuggestion(true)} data-testid="offer-suggestion-edit">
                  Edit
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setSuggestion(null)} data-testid="offer-suggestion-dismiss">
                  Dismiss
                </Button>
              </div>
            </div>
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
        <div className="flex flex-col gap-1.5" data-testid="offer-rush">
          <label className="flex min-h-12 cursor-pointer items-center gap-3 text-sm font-semibold">
            <Switch
              checked={feeOn}
              disabled={locked}
              onCheckedChange={(on) => {
                setFeeSwitch(on);
                onChange({ ...offer, rushFee: on ? cleanRushFee(rushFeeDefault) : null });
              }}
              data-testid="offer-rush-switch"
            />
            Rush fee
          </label>
          {feeOn ? (
            <MoneyBox
              label={`Rush fee in ${name}`}
              value={feeTyping.value}
              placeholder="0"
              disabled={locked}
              onFocus={feeTyping.start}
              onChange={(text) => {
                feeTyping.type(text);
                onChange({ ...offer, rushFee: cleanRushFee(text) });
              }}
              onBlur={feeTyping.stop}
              testId="offer-rush-fee"
            />
          ) : null}
        </div>
        <div className="ml-auto flex flex-col items-end text-right">
          <p className="text-sm text-muted-foreground">{coverage || "No measured areas yet"}</p>
          <p className="text-2xl font-bold tabular-nums" data-testid="offer-total">
            {hasFeet && totals ? screenTotal(totals.subtotal, gstEnabled) : offer.runs.length === 0 ? "Pick the areas" : "Not measured yet"}
          </p>
        </div>
      </div>

      {/* Round 18: extra charges on this offer only; "Extra work, for every
          offer" stays in the quote's prices. */}
      <div className="flex flex-col gap-2" data-testid="offer-charges">
        {charges.map((charge, at) => (
          <ChargeLine
            key={at}
            number={at + 1}
            charge={charge}
            offerName={name}
            locked={locked}
            onChange={(next) => setCharges(charges.map((item, which) => (which === at ? next : item)))}
            onRemove={() => setCharges(charges.filter((_, which) => which !== at))}
          />
        ))}
        {!locked && charges.length < OFFER_CHARGES_MAX ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => setCharges([...charges, { label: "", amount: 0 }])}
            data-testid="offer-charge-add"
          >
            <Plus aria-hidden="true" className="size-4" />
            Extra charge
          </Button>
        ) : null}
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

// One extra charge on an offer: its name (customers read it in the
// breakdown) and its amount, and Remove.
function ChargeLine({
  number,
  charge,
  offerName,
  locked,
  onChange,
  onRemove,
}: {
  number: number;
  charge: OfferCharge;
  offerName: string;
  locked: boolean;
  onChange: (next: OfferCharge) => void;
  onRemove: () => void;
}) {
  const amount = useTyping(charge.amount > 0 ? moneyText(charge.amount) : "");
  const unnamed = charge.label.trim() === "" && charge.amount > 0;
  return (
    <div className="flex flex-col gap-1" data-testid="offer-charge">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={charge.label}
          placeholder="Extra outlet, a long run of wire"
          aria-label={`Extra charge ${number} in ${offerName}, its name`}
          maxLength={80}
          disabled={locked}
          aria-invalid={unnamed ? true : undefined}
          onChange={(event) => onChange({ ...charge, label: event.target.value.replace(/\$/g, "") })}
          className="min-w-0 flex-1 basis-40"
          data-testid="offer-charge-name"
        />
        <MoneyBox
          label={`Extra charge ${number} in ${offerName}, its amount`}
          value={amount.value}
          placeholder="0"
          disabled={locked}
          onFocus={amount.start}
          onChange={(text) => {
            amount.type(text);
            const value = Number(text);
            onChange({ ...charge, amount: Number.isFinite(value) && value >= 0 ? Math.round(value * 100) / 100 : 0 });
          }}
          onBlur={amount.stop}
          className="w-32"
          testId="offer-charge-amount"
        />
        {!locked ? (
          <Button type="button" variant="ghost" size="icon" aria-label={`Remove extra charge ${number}`} onClick={onRemove} data-testid="offer-charge-remove">
            <Trash2 className="size-4" />
          </Button>
        ) : null}
      </div>
      {unnamed ? <p className="text-xs font-semibold">Name this charge. Customers see it.</p> : null}
    </div>
  );
}
