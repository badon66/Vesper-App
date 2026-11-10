"use client";

import { ChevronDown, Trash2 } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { RunsDrawing } from "@/components/meeting/runs-drawing";
import { BreakdownList, Choice, Stepper } from "@/components/quotes/quote-editor/parts";
import { Input } from "@/components/ui/input";
import { coverageLine } from "@/lib/meeting/price-screen";
import { cleanFeet, screenTotal, type QuoteRun, type QuoteTotals } from "@/lib/pricing";
import { offerNameIssue, toggleOfferRun } from "@/lib/quotes/editor";
import { OFFER_NAME_EDITOR_MAX, offerRunName, type QuoteOffer } from "@/lib/quotes/offers";
import { cn } from "@/lib/utils";

// One offer in Keenan's quote editor (round 9, the spec 3.7): its name as
// customers read it, a tap per run, a small drawing lighting its runs (the
// rest dashed), its own box count, its live total and the breakdown exactly
// as the customer sees it. Deleting takes a second tap.

export function OfferCard({
  offer,
  runs,
  totals,
  quoteBoxes,
  gstEnabled,
  locked,
  autoFocus = false,
  onChange,
  onDelete,
}: {
  offer: QuoteOffer;
  runs: QuoteRun[];
  totals: QuoteTotals | null;
  // The quote's own box count: the default for an offer that has none.
  quoteBoxes: number;
  gstEnabled: boolean;
  locked: boolean;
  // A blank offer just added: its name field takes focus.
  autoFocus?: boolean;
  onChange: (offer: QuoteOffer) => void;
  onDelete: () => void;
}) {
  const nameId = useId();
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const issue = offerNameIssue(offer.name);
  const coverage = coverageLine(runs, offer);
  const hasFeet = totals !== null && totals.totalFeet > 0;
  const boxes = offer.boxes ?? Math.min(9, Math.max(1, quoteBoxes));

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
      className="flex min-w-0 flex-col gap-4 rounded-lg border bg-card p-4"
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
            {issue ?? "Customers see this name."}
          </p>
        </div>
        {!locked ? (
          <button
            type="button"
            onClick={() => (confirmDelete ? onDelete() : setConfirmDelete(true))}
            aria-label={confirmDelete ? undefined : `Delete ${offer.name.trim() || "this offer"}`}
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

      <RunsDrawing runs={runs} lit={offer.runs} dashedRest decorative className="h-32 w-full rounded-md" />

      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-muted-foreground">Runs it covers</p>
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Add the measured runs above first.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {runs.map((run, at) => (
              <Choice
                key={at}
                on={offer.runs.includes(at)}
                disabled={locked}
                onToggle={() => onChange(toggleOfferRun(offer, at))}
                testId="offer-run"
              >
                {offerRunName(run, at)}
                <span className="font-normal tabular-nums opacity-80">{cleanFeet(run.feet)} ft</span>
              </Choice>
            ))}
          </div>
        )}
        {offer.runs.length === 0 && runs.length > 0 ? <p className="text-sm text-muted-foreground">Tap the runs it covers.</p> : null}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-semibold text-muted-foreground">Control boxes</p>
          <Stepper
            value={boxes}
            min={1}
            max={9}
            label={`control boxes in ${offer.name.trim() || "this offer"}`}
            disabled={locked}
            onChange={(value) => onChange({ ...offer, boxes: value })}
            testId="offer-boxes"
          />
        </div>
        <div className="flex flex-col items-end text-right">
          <p className="text-sm text-muted-foreground">{coverage || "No measured runs yet"}</p>
          <p className="text-2xl font-bold tabular-nums" data-testid="offer-total">
            {hasFeet && totals ? screenTotal(totals.subtotal, gstEnabled) : offer.runs.length === 0 ? "Pick the runs" : "Not measured yet"}
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
