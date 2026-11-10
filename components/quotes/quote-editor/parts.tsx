"use client";

import { Check, Minus, Plus } from "lucide-react";
import type { ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { breakdownRows, minimumSentence } from "@/lib/meeting/price-screen";
import { screenTotal, type QuoteTotals } from "@/lib/pricing";
import { cn } from "@/lib/utils";

// The quote editor's small parts (round 9): one-tap choices, a stepper, a
// money field, a quiet warning and the breakdown as the customer sees it,
// in the app's dark form style. DESIGN.md: a chosen answer is Night Text
// with a tick, never gold; a warning that doesn't block has a neutral
// border and a bold first line.

// A one-tap answer: outline, or Night Text fill with a tick when on.
export function Choice({
  on,
  onToggle,
  children,
  disabled,
  className,
  label,
  testId,
}: {
  on: boolean;
  onToggle: () => void;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
  label?: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      data-testid={testId}
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 rounded-md border px-3 text-sm font-semibold whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60",
        on ? "border-foreground bg-foreground text-background" : "border-input bg-background text-foreground hover:bg-muted",
        className,
      )}
    >
      {on ? <Check aria-hidden="true" className="size-4 shrink-0" /> : null}
      {children}
    </button>
  );
}

// Fewer and more, with the count between.
export function Stepper({
  value,
  min,
  max,
  onChange,
  label,
  disabled,
  testId,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  label: string;
  disabled?: boolean;
  testId?: string;
}) {
  const button =
    "inline-flex size-11 items-center justify-center rounded-md border border-input bg-background outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <div className="flex items-center gap-2" role="group" aria-label={label} data-testid={testId}>
      <button type="button" aria-label={`Fewer: ${label}`} disabled={disabled || value <= min} onClick={() => onChange(value - 1)} className={button}>
        <Minus aria-hidden="true" className="size-4" />
      </button>
      <span className="w-7 text-center text-lg font-bold tabular-nums" aria-live="polite">
        {value}
      </span>
      <button type="button" aria-label={`More: ${label}`} disabled={disabled || value >= max} onClick={() => onChange(value + 1)} className={button}>
        <Plus aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}

// A dollar amount as typed: digits and one point, nothing else.
export function cleanMoneyInput(value: string): string {
  const cleaned = value.replace(/[^0-9.]/g, "");
  const [whole, ...rest] = cleaned.split(".");
  return rest.length > 0 ? `${whole}.${rest.join("").slice(0, 2)}` : whole;
}

export function MoneyField({
  id,
  label,
  value,
  onChange,
  placeholder,
  disabled,
  hint,
  className,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">
          $
        </span>
        <Input
          id={id}
          inputMode="decimal"
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(event) => onChange(cleanMoneyInput(event.target.value))}
          className="w-32 pl-7 tabular-nums"
        />
      </div>
      {hint ? <p className="max-w-56 text-xs text-pretty text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

// A warning that never blocks: neutral border, bold first line.
export function QuietWarning({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <p className="rounded-md border border-input px-3 py-2 text-sm font-semibold text-pretty" data-testid={testId}>
      {children}
    </p>
  );
}

// An option's breakdown exactly as the customer sees it: the same rows and
// words as the iPad, the link and the Accepted sheet (lib/pricing.ts), the
// sum before the minimum and Keenan's sentence, then the total.
export function BreakdownList({ totals, gstEnabled, className }: { totals: QuoteTotals; gstEnabled: boolean; className?: string }) {
  const rows = breakdownRows(totals);
  return (
    <dl className={cn("flex flex-col text-sm", className)}>
      {rows.map((row, at) =>
        row.kind === "sum" ? (
          <div key={at} className="flex items-baseline justify-between gap-4 border-t border-input py-2">
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="shrink-0 font-semibold tabular-nums">{row.amount}</dd>
          </div>
        ) : (
          <div key={at} className="flex flex-col border-t py-2">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="min-w-0">
                <span className="font-medium">{row.label}</span>
                {row.detail ? <span className="block text-muted-foreground">{row.detail}</span> : null}
              </dt>
              <dd className="shrink-0 font-semibold tabular-nums">{row.amount}</dd>
            </div>
            {row.minimum ? <p className="mt-1 text-muted-foreground">{minimumSentence(totals.subtotal)}</p> : null}
          </div>
        ),
      )}
      <div className="flex items-baseline justify-between gap-4 border-t border-foreground/60 py-2">
        <dt className="font-bold">Total</dt>
        <dd className="shrink-0 font-bold tabular-nums">{screenTotal(totals.subtotal, gstEnabled)}</dd>
      </div>
    </dl>
  );
}
