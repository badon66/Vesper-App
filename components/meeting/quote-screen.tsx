"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { saveQuoteDraft } from "@/app/(app)/meeting/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { quoteFingerprint, quoteInputs, type MeetingPayload, type QuoteUIState } from "@/lib/meeting/state";
import { defaultValidUntil, formatMoney, priceQuote, screenTotal, type ColourTiming } from "@/lib/pricing";
import { formatFullDate, formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";

// The live quote (M5): Keenan builds on the left, the bill sits on the
// right, and the total moves as he types. All math is lib/pricing.ts on
// the iPad; Save is the only thing that needs signal.

const RUN_NAMES = ["Front", "Front upper", "Left gable", "Right gable", "Garage", "Back", "Left side", "Right side"];

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
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const inputs = useMemo(() => quoteInputs(state, pricing), [state, pricing]);
  const priced = useMemo(() => priceQuote(inputs), [inputs]);
  const set = (patch: Partial<QuoteUIState>) => onChange({ ...state, ...patch });

  async function save() {
    // What is being saved, as it stands at the tap; edits made while the
    // save is in flight still count as unsaved afterwards.
    const snapshot = quoteFingerprint(state);
    setBusy(true);
    setMessage(null);
    try {
      const result = await saveQuoteDraft({
        leadId,
        runs: state.runs.map((run) => ({ ...run, feet: Math.max(0, Math.round(run.feet)) })),
        boxCount: state.boxCount,
        pricePerFt: inputs.pricePerFt,
        boxPrice: inputs.boxPrice,
        adders: inputs.adders,
        discounts: inputs.discounts,
        colourTiming: state.colourTiming,
        rushFeePerFt: inputs.rushFeePerFt,
        financingOffered: state.financingOffered,
        validUntil: state.validUntil,
        notes: "",
        gstEnabled: pricing.gstEnabled,
        gstRate: pricing.gstRate,
        gstNumber: pricing.gstNumber,
      });
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      onSaved(result.quoteId, result.savedAt, snapshot);
    } catch {
      setMessage("No signal. The quote stays on this iPad; save again when you're back online.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col gap-6 overflow-y-auto px-6 pt-14 pb-12 lg:grid lg:grid-cols-[1fr_380px] lg:gap-10 lg:overflow-hidden lg:px-10 lg:pt-16 lg:pb-10">
      {/* ------------------------------------------------ the builder */}
      <div className="flex min-w-0 flex-col gap-5 lg:min-h-0 lg:overflow-y-auto lg:pr-1 lg:pb-4" data-testid="quote-builder">
        <h2 className="text-3xl font-bold lg:text-4xl">Your price</h2>

        <section className="flex flex-col gap-2" aria-label="Runs">
          <p className="text-sm font-semibold text-muted-foreground">Runs</p>
          {state.runs.map((run, at) => (
            <div key={at} className="flex items-center gap-2">
              <Input
                value={run.name}
                list="run-names"
                aria-label={`Run ${at + 1} name`}
                maxLength={60}
                onChange={(event) => set({ runs: state.runs.map((item, which) => (which === at ? { ...item, name: event.target.value } : item)) })}
                className="min-w-0 flex-1"
              />
              <Input
                inputMode="numeric"
                aria-label={`Run ${at + 1} feet`}
                value={run.feet === 0 ? "" : String(run.feet)}
                placeholder="ft"
                onChange={(event) => {
                  const feet = Number(event.target.value.replace(/\D/g, "")) || 0;
                  set({ runs: state.runs.map((item, which) => (which === at ? { ...item, feet } : item)) });
                }}
                className="w-20 text-center tabular-nums"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={`Run ${at + 1} level: ${run.level === "upper" ? "upper" : "lower"}`}
                onClick={() => set({ runs: state.runs.map((item, which) => (which === at ? { ...item, level: item.level === "upper" ? "lower" : "upper" } : item)) })}
                className="w-20"
              >
                {run.level === "upper" ? "Upper" : "Lower"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove run ${at + 1}`}
                onClick={() => set({ runs: state.runs.filter((_, which) => which !== at) })}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <datalist id="run-names">
            {RUN_NAMES.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <div className="flex flex-wrap gap-2">
            {RUN_NAMES.filter((name) => !state.runs.some((run) => run.name === name)).slice(0, 5).map((name) => (
              <Button key={name} type="button" variant="outline" size="sm" onClick={() => set({ runs: [...state.runs, { name, feet: 0, level: name.includes("upper") ? "upper" : "lower" }] })}>
                + {name}
              </Button>
            ))}
            <Button type="button" variant="ghost" size="sm" onClick={() => set({ runs: [...state.runs, { name: "", feet: 0, level: "lower" }] })}>
              + Other
            </Button>
          </div>
        </section>

        <section className="flex flex-wrap items-end gap-5" aria-label="Boxes and prices">
          <div className="flex flex-col gap-1.5">
            <Label>Control boxes</Label>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="icon" aria-label="Fewer boxes" disabled={state.boxCount <= 0} onClick={() => set({ boxCount: state.boxCount - 1 })}>
                <Minus className="size-4" />
              </Button>
              <span className="w-8 text-center text-lg font-bold tabular-nums">{state.boxCount}</span>
              <Button type="button" variant="outline" size="icon" aria-label="More boxes" disabled={state.boxCount >= 20} onClick={() => set({ boxCount: state.boxCount + 1 })}>
                <Plus className="size-4" />
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="quote-ppf">Per foot</Label>
            <Input id="quote-ppf" inputMode="decimal" value={state.pricePerFt} onChange={(event) => set({ pricePerFt: event.target.value })} className="w-24 text-center tabular-nums" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="quote-box">Per box</Label>
            <Input id="quote-box" inputMode="decimal" value={state.boxPrice} onChange={(event) => set({ boxPrice: event.target.value })} className="w-24 text-center tabular-nums" />
          </div>
        </section>

        <section className="flex flex-col gap-2" aria-label="Extra work">
          <p className="text-sm font-semibold text-muted-foreground">Extra work</p>
          {state.adders.map((adder, at) => (
            <div key={at} className="flex items-center gap-2">
              <Input
                value={adder.label}
                placeholder="Height, complexity"
                aria-label={`Extra work ${at + 1} label`}
                maxLength={80}
                onChange={(event) => set({ adders: state.adders.map((item, which) => (which === at ? { ...item, label: event.target.value } : item)) })}
                className="min-w-0 flex-1"
              />
              <Input
                inputMode="decimal"
                aria-label={`Extra work ${at + 1} amount`}
                value={adder.amount}
                placeholder="$"
                onChange={(event) => set({ adders: state.adders.map((item, which) => (which === at ? { ...item, amount: event.target.value } : item)) })}
                className="w-24 text-center tabular-nums"
              />
              <Button type="button" variant="ghost" size="icon" aria-label={`Remove extra work ${at + 1}`} onClick={() => set({ adders: state.adders.filter((_, which) => which !== at) })}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => set({ adders: [...state.adders, { label: "", amount: "" }] })}>
            + Extra work
          </Button>
        </section>

        <section className="flex flex-col gap-2" aria-label="Discounts">
          <p className="text-sm font-semibold text-muted-foreground">Discounts</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-pressed={state.neighbourOn}
              onClick={() => set({ neighbourOn: !state.neighbourOn })}
              className={cn(
                "inline-flex min-h-11 items-center rounded-md border px-4 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring",
                state.neighbourOn ? "border-foreground bg-foreground text-background" : "border-input",
              )}
            >
              Neighbour discount
            </button>
            {state.neighbourOn ? (
              <Input
                inputMode="decimal"
                aria-label="Neighbour discount amount"
                value={state.neighbourAmount}
                onChange={(event) => set({ neighbourAmount: event.target.value })}
                className="w-24 text-center tabular-nums"
              />
            ) : null}
          </div>
          {state.customDiscounts.map((discount, at) => (
            <div key={at} className="flex items-center gap-2">
              <Input
                value={discount.label}
                placeholder="Discount"
                aria-label={`Discount ${at + 1} label`}
                maxLength={80}
                onChange={(event) => set({ customDiscounts: state.customDiscounts.map((item, which) => (which === at ? { ...item, label: event.target.value } : item)) })}
                className="min-w-0 flex-1"
              />
              <Input
                inputMode="decimal"
                aria-label={`Discount ${at + 1} amount`}
                value={discount.amount}
                placeholder="$"
                onChange={(event) => set({ customDiscounts: state.customDiscounts.map((item, which) => (which === at ? { ...item, amount: event.target.value } : item)) })}
                className="w-24 text-center tabular-nums"
              />
              <Button type="button" variant="ghost" size="icon" aria-label={`Remove discount ${at + 1}`} onClick={() => set({ customDiscounts: state.customDiscounts.filter((_, which) => which !== at) })}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => set({ customDiscounts: [...state.customDiscounts, { label: "", amount: "" }] })}>
            + Discount
          </Button>
        </section>

        <section className="flex flex-col gap-2" aria-label="Track colour">
          <p className="text-sm font-semibold text-muted-foreground">Track colour</p>
          {colourKind === "none" ? (
            <p className="text-sm text-pretty text-muted-foreground">To be confirmed. A stocked colour is included either way.</p>
          ) : colourKind === "list" ? (
            <p className="text-sm text-pretty">{colourText}: included.</p>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-pretty">{colourText}.</p>
              <div className="flex flex-wrap gap-2">
                <TimingChoice
                  current={state.colourTiming}
                  value="factory_order"
                  onPick={(value) => set({ colourTiming: value })}
                  label="Factory order, spring install"
                  detail="Included"
                />
                {pricing.rushFeePerFt !== null ? (
                  <TimingChoice
                    current={state.colourTiming}
                    value="rush"
                    onPick={(value) => set({ colourTiming: value })}
                    label="This season"
                    detail={`${formatMoney(pricing.rushFeePerFt)}/ft`}
                  />
                ) : null}
              </div>
            </div>
          )}
        </section>

        <section className="flex flex-wrap items-end gap-5" aria-label="Financing and dates">
          <button
            type="button"
            aria-pressed={state.financingOffered}
            onClick={() => set({ financingOffered: !state.financingOffered })}
            className={cn(
              "inline-flex min-h-11 items-center rounded-md border px-4 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring",
              state.financingOffered ? "border-foreground bg-foreground text-background" : "border-input",
            )}
          >
            Financing available
          </button>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="quote-valid">Valid until</Label>
            <Input
              id="quote-valid"
              type="date"
              min={today}
              value={state.validUntil}
              onChange={(event) => set({ validUntil: event.target.value || defaultValidUntil(today, pricing.quoteValidDays) })}
              className="w-44"
            />
          </div>
        </section>
      </div>

      {/* ------------------------------------------------ the bill */}
      {/* Pinned high in its column: the iPad's keyboard rises over the
          lower half while Keenan types the feet. */}
      <div className="flex min-w-0 flex-col gap-4 border-t pt-6 lg:min-h-0 lg:border-t-0 lg:pt-20 lg:pl-2" data-testid="quote-bill">
        {priced.totalFeet === 0 ? (
          // No number until something is measured: the first price the
          // customer sees is the real one, never the box on its own.
          <div>
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="mt-1 text-2xl text-muted-foreground lg:text-3xl" data-testid="quote-waiting">
              Adds up here as we measure.
            </p>
          </div>
        ) : (
          <>
            <ul className="flex flex-col gap-1.5">
              {priced.lines.map((line, at) => (
                <li key={at} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 text-base lg:text-lg">
                  <span className="min-w-0">
                    {line.label}
                    {line.detail ? <span className="ml-2 text-sm text-muted-foreground">{line.detail}</span> : null}
                  </span>
                  <span className="font-semibold tabular-nums">{formatMoney(line.amount)}</span>
                </li>
              ))}
            </ul>
            <div className="border-t pt-3">
              <p className="text-sm text-muted-foreground">Total</p>
              <p className="text-5xl font-bold text-primary tabular-nums lg:text-6xl" data-testid="quote-total">
                {screenTotal(priced.subtotal, pricing.gstEnabled)}
              </p>
            </div>
          </>
        )}
        <div className="flex flex-col gap-1 text-sm text-muted-foreground">
          <p>No payment until your install is complete.</p>
          {state.financingOffered ? <p>Financing available. We will walk through the options together.</p> : null}
          {state.validUntil ? <p>Valid until {formatFullDate(state.validUntil)}.</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Outline, so the total stays the one gold thing on the screen. */}
          <Button type="button" variant="outline" onClick={() => void save()} disabled={busy || priced.totalFeet === 0}>
            {busy ? "Saving" : quoteId ? "Save changes" : "Save quote"}
          </Button>
          {message || priced.totalFeet === 0 ? null : dirty ? (
            <p className="text-sm text-muted-foreground" data-testid="quote-unsaved">
              {savedAt ? "Changes not saved yet." : "Not saved yet."}
            </p>
          ) : savedAt ? (
            <p className="text-sm text-muted-foreground">Saved {formatTime(savedAt)}.</p>
          ) : null}
        </div>
        {message ? (
          <p role="alert" className="max-w-sm text-sm font-semibold text-pretty text-destructive">
            {message}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function TimingChoice({
  current,
  value,
  label,
  detail,
  onPick,
}: {
  current: ColourTiming | null;
  value: ColourTiming;
  label: string;
  detail: string;
  onPick: (value: ColourTiming) => void;
}) {
  const chosen = current === value;
  return (
    <button
      type="button"
      aria-pressed={chosen}
      onClick={() => onPick(value)}
      className={cn(
        "inline-flex min-h-11 flex-col items-start justify-center rounded-md border px-4 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
        chosen ? "border-foreground bg-foreground text-background" : "border-input",
      )}
    >
      <span className="text-sm font-semibold">{label}</span>
      <span className={cn("text-xs", chosen ? "text-background/80" : "text-muted-foreground")}>{detail}</span>
    </button>
  );
}
