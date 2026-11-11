"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";

import { MoneyBox, Segmented, useTyping } from "@/components/quotes/quote-editor/parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cleanFeet, formatMoney, type QuoteRun } from "@/lib/pricing";
import { AREA_LABELS, AREA_VIEWS, areaDisplayName, otherRuns, type AreaKey } from "@/lib/quotes/areas";
import {
  addOtherRun,
  areaLines,
  areaShortLabel,
  dropRun,
  moneyText,
  runByTheFoot,
  runPricingMode,
  setAreaFeet,
  setRunFeet,
  setRunPricing,
  type PricingMode,
  type RunsAndOffers,
} from "@/lib/quotes/editor";
import type { QuoteOffer } from "@/lib/quotes/offers";
import { cn } from "@/lib/utils";

// Measuring, front and back views (round 11, Keenan, 2026-11-11). Keenan
// measures the house as areas: the Front view (lower, its gable, upper, its
// gable), the Back view (the same four), the Sides (one number each for
// both sides together) and Other for anything off the views (a shed, a
// detached garage). Each area is a line he taps to type its feet; an area
// with no feet isn't on the house and is never kept as a run. Under a
// measured line sits its price: the quote's price a foot, his own price a
// foot for that area, or a flat price. An old quote's extra runs on an area
// (Front and Garage, say) show as more lines under it, named apart, never
// merged. No drawing: this is Keenan's alone, and customers only ever see
// an offer's photo. Owner only, never View as.

const LEVELS = [
  { value: "lower", label: "Lower" },
  { value: "upper", label: "Upper" },
] as const;

export function AreaViews({
  runs,
  offers,
  pricePerFt,
  locked,
  onChange,
}: {
  runs: QuoteRun[];
  // The quote's own offers list, as held (empty stands for one full wrap).
  offers: QuoteOffer[];
  pricePerFt: number;
  locked: boolean;
  onChange: (next: RunsAndOffers) => void;
}) {
  const state: RunsAndOffers = { runs, offers };
  const lines = areaLines(runs);
  const others = otherRuns(runs);
  const setRun = (at: number, next: QuoteRun) => onChange({ ...state, runs: runs.map((run, which) => (which === at ? next : run)) });

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {AREA_VIEWS.map((view) => (
        <Panel key={view.kind} title={view.title}>
          <ul className="flex flex-col divide-y">
            {view.keys.map((key) => (
              <AreaLine
                key={key}
                areaKey={key}
                positions={lines[key]}
                runs={runs}
                pricePerFt={pricePerFt}
                locked={locked}
                onFeet={(feet) => onChange(setAreaFeet(state, key, feet))}
                onRunFeet={(at, feet) => onChange(setRunFeet(state, at, feet))}
                onRun={setRun}
              />
            ))}
          </ul>
        </Panel>
      ))}
      <Panel title="Other" hint="Anything off the views: a shed, a detached garage.">
        {others.length > 0 ? (
          <ul className="flex flex-col divide-y">
            {others.map((at, which) => (
              <OtherLine
                key={at}
                at={at}
                number={which + 1}
                run={runs[at]}
                pricePerFt={pricePerFt}
                locked={locked}
                onFeet={(feet) => onChange(setRunFeet(state, at, feet))}
                onRun={(next) => setRun(at, next)}
                onRemove={() => onChange(dropRun(state, at))}
              />
            ))}
          </ul>
        ) : null}
        {!locked ? (
          <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => onChange(addOtherRun(state))} data-testid="area-other-add">
            <Plus aria-hidden="true" className="size-4" />
            Other
          </Button>
        ) : null}
      </Panel>
    </div>
  );
}

function Panel({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-3 rounded-lg border bg-card p-4" data-testid="area-view" data-view={title.toLowerCase()}>
      <div className="flex flex-col gap-0.5">
        <h4 className="text-base font-bold">{title}</h4>
        {hint ? <p className="text-xs text-pretty text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

// One standard area: its line, then an old quote's extra runs on it.
function AreaLine({
  areaKey,
  positions,
  runs,
  pricePerFt,
  locked,
  onFeet,
  onRunFeet,
  onRun,
}: {
  areaKey: AreaKey;
  positions: number[];
  runs: QuoteRun[];
  pricePerFt: number;
  locked: boolean;
  onFeet: (feet: number) => void;
  onRunFeet: (at: number, feet: number) => void;
  onRun: (at: number, next: QuoteRun) => void;
}) {
  const at = positions.length > 0 ? positions[0] : null;
  const run = at !== null ? runs[at] : null;
  const feet = run ? cleanFeet(run.feet) : 0;
  // An old run on this area under its own name ("Garage" on Front lower).
  const ownName = run && areaDisplayName(run) !== AREA_LABELS[areaKey] ? run.name.trim() : null;
  return (
    <>
      <li className="flex flex-col py-2" data-testid={feet > 0 ? "editor-run" : undefined} data-area={areaKey}>
        <div className="flex min-h-11 items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className={cn("text-base font-semibold", feet === 0 && "text-muted-foreground")}>{areaShortLabel(areaKey)}</p>
            {ownName ? <p className="truncate text-xs text-muted-foreground">{ownName}</p> : null}
          </div>
          <FeetBox label={`${AREA_LABELS[areaKey]} feet`} area={areaKey} feet={feet} disabled={locked} onFeet={onFeet} />
        </div>
        {run && at !== null && feet > 0 ? (
          <PriceControl run={run} area={areaKey} pricePerFt={pricePerFt} disabled={locked} onRun={(next) => onRun(at, next)} />
        ) : null}
      </li>
      {positions.slice(1).map((extra) => (
        <ExtraLine
          key={extra}
          at={extra}
          areaKey={areaKey}
          run={runs[extra]}
          pricePerFt={pricePerFt}
          locked={locked}
          onFeet={(value) => onRunFeet(extra, value)}
          onRun={(next) => onRun(extra, next)}
        />
      ))}
    </>
  );
}

// An old quote's second run on an area, under its own name, never merged.
function ExtraLine({
  at,
  areaKey,
  run,
  pricePerFt,
  locked,
  onFeet,
  onRun,
}: {
  at: number;
  areaKey: AreaKey;
  run: QuoteRun;
  pricePerFt: number;
  locked: boolean;
  onFeet: (feet: number) => void;
  onRun: (next: QuoteRun) => void;
}) {
  const feet = cleanFeet(run.feet);
  const name = areaDisplayName(run);
  return (
    <li className="flex flex-col py-2" data-testid={feet > 0 ? "editor-run" : undefined} data-area={areaKey} data-position={at}>
      <div className="flex min-h-11 items-center gap-3">
        <p className={cn("min-w-0 flex-1 truncate text-base font-semibold", feet === 0 && "text-muted-foreground")}>{name}</p>
        <FeetBox label={`${name} feet`} area={areaKey} feet={feet} disabled={locked} onFeet={onFeet} />
      </div>
      {feet > 0 ? <PriceControl run={run} area={areaKey} pricePerFt={pricePerFt} disabled={locked} onRun={onRun} /> : null}
    </li>
  );
}

// An Other: its name, feet and level, and Remove. It stays at 0 ft while
// Keenan fills it in (it is on the house only once it has feet).
function OtherLine({
  at,
  number,
  run,
  pricePerFt,
  locked,
  onFeet,
  onRun,
  onRemove,
}: {
  at: number;
  number: number;
  run: QuoteRun;
  pricePerFt: number;
  locked: boolean;
  onFeet: (feet: number) => void;
  onRun: (next: QuoteRun) => void;
  onRemove: () => void;
}) {
  const feet = cleanFeet(run.feet);
  return (
    <li className="flex flex-col py-2" data-testid={feet > 0 ? "editor-run" : undefined} data-area="other" data-position={at}>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={run.name}
          aria-label={`Other ${number} name`}
          maxLength={60}
          placeholder="Shed, detached garage"
          disabled={locked}
          onChange={(event) => onRun({ ...run, name: event.target.value })}
          className="min-w-0 flex-1 basis-36"
          data-testid="area-other-name"
        />
        <FeetBox label={`Other ${number} feet`} area="other" feet={feet} disabled={locked} onFeet={onFeet} />
        <Segmented
          value={run.level}
          options={LEVELS}
          label={`Other ${number} level`}
          disabled={locked}
          onChange={(level) => onRun({ ...run, level })}
          testId="area-other-level"
        />
        {!locked ? (
          <Button type="button" variant="ghost" size="icon" aria-label={`Remove other ${number}`} onClick={onRemove} className="ml-auto" data-testid="area-other-remove">
            <Trash2 className="size-4" />
          </Button>
        ) : null}
      </div>
      {feet > 0 ? <PriceControl run={run} area="other" pricePerFt={pricePerFt} disabled={locked} onRun={onRun} /> : null}
    </li>
  );
}

// Whole feet, typed. What Keenan is typing stays put until he leaves the
// box; a box left empty takes the area off the house.
function FeetBox({
  label,
  area,
  feet,
  disabled,
  onFeet,
}: {
  label: string;
  area: string;
  feet: number;
  disabled: boolean;
  onFeet: (feet: number) => void;
}) {
  const typing = useTyping(feet > 0 ? String(feet) : "");
  return (
    <div className="relative shrink-0">
      <Input
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label={label}
        value={typing.value}
        placeholder="0"
        disabled={disabled}
        onFocus={typing.start}
        onChange={(event) => {
          const text = event.target.value.replace(/\D/g, "").slice(0, 5);
          typing.type(text);
          const next = Number(text) || 0;
          if (next > 0 && next !== feet) onFeet(next);
        }}
        onBlur={() => {
          const next = Number(typing.value) || 0;
          typing.stop();
          if (next !== feet) onFeet(next);
        }}
        className="w-24 pr-8 text-right tabular-nums"
        data-testid="area-feet"
        data-area={area}
      />
      <span aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">
        ft
      </span>
    </div>
  );
}

const MODES: readonly { value: PricingMode; label: string }[] = [
  { value: "quote", label: "Quote price" },
  { value: "rate", label: "$ a foot" },
  { value: "flat", label: "Flat" },
];

// How this area is priced: the quote's price a foot, Keenan's own price a
// foot for it, or a flat price for it. Picking $ a foot or Flat opens an
// empty box to type in (the area prices at the quote's rate until it has a
// number); a box left empty goes back to the quote's price.
function PriceControl({
  run,
  area,
  pricePerFt,
  disabled,
  onRun,
}: {
  run: QuoteRun;
  area: string;
  pricePerFt: number;
  disabled: boolean;
  onRun: (next: QuoteRun) => void;
}) {
  const derived = runPricingMode(run);
  const [chosen, setChosen] = useState<PricingMode | null>(null);
  const mode: PricingMode = derived !== "quote" ? derived : (chosen ?? "quote");
  const [focusBox, setFocusBox] = useState(false);
  const shown = mode === "rate" ? moneyText(run.rate ?? null) : mode === "flat" ? moneyText(run.flat ?? null) : "";
  const typing = useTyping(shown);
  const feet = cleanFeet(run.feet);
  const worth = runByTheFoot(run, pricePerFt);

  const choose = (next: PricingMode) => {
    setChosen(next === "quote" ? null : next);
    setFocusBox(next !== "quote");
    onRun(setRunPricing(run, next, null));
  };

  return (
    <div className="flex flex-wrap items-center gap-2 pt-1 pb-1">
      <Segmented value={mode} options={MODES} label={`${areaDisplayName(run)} price`} disabled={disabled} onChange={choose} size="small" testId="area-price-mode" />
      {mode !== "quote" ? (
        <>
          <MoneyBox
            key={mode}
            label={mode === "rate" ? `${areaDisplayName(run)} price a foot` : `${areaDisplayName(run)} flat price`}
            value={typing.value}
            placeholder={mode === "rate" ? moneyText(pricePerFt) : moneyText(worth)}
            disabled={disabled}
            autoFocus={focusBox}
            onFocus={() => {
              setFocusBox(false);
              typing.start();
            }}
            onChange={(text) => {
              typing.type(text);
              const value = text === "" ? null : Number(text);
              onRun(setRunPricing(run, mode, value !== null && Number.isFinite(value) ? value : null));
            }}
            onBlur={() => {
              // Left without a usable number, the area is at the quote's
              // price, and the control says so.
              if (derived === "quote") setChosen(null);
              typing.stop();
            }}
            testId={mode === "rate" ? "area-rate" : "area-flat"}
            data={{ area }}
          />
          {mode === "rate" ? (
            <p className="text-xs text-muted-foreground tabular-nums">
              {feet} ft, {formatMoney(worth)}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
