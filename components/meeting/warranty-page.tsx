"use client";

import { Check, House } from "lucide-react";
import { useState } from "react";

import { BottomCorner, CentredBlock, DECK_TYPE, DeckButton, keepHyphens, MoreLayer, say } from "@/components/meeting/deck-parts";
import { warrantyLines } from "@/lib/meeting/deck-pages";
import { formatMoney } from "@/lib/pricing";
import { cn } from "@/lib/utils";

// Our 10-year warranty, made visual (round 10, Keenan, 2026-11-10): a
// timeline of the ten years (years 1 to 5 parts and labour, years 6 to 10
// parts, with the service call fee from Settings only when it is set), what
// is covered, and that it transfers with the home. The exact wording of
// settings.warranty_text, every line as stored, is one tap away behind The
// full warranty (bottom left, the deck's button spot). Nothing here is a
// promise the warranty text doesn't make: the four covered parts and the
// two spans are Keenan's own words for it.
//
// iPad landscape first: one block centred above the deck's bottom row at
// its 64 px margin. Solid fills only.

const YEARS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
const COVERED = ["Lights", "Track", "Control box", "Our workmanship"] as const;

export const WARRANTY_MORE_LABEL = "The full warranty";

// "$200 service call", or "Service call $200 + GST" while GST is on; null
// when the fee isn't set, and the line is hidden.
export function serviceCallShort(fee: number | null, gstEnabled = false): string | null {
  if (fee === null || !Number.isFinite(fee) || fee < 0) return null;
  return gstEnabled ? `Service call ${formatMoney(fee)} + GST` : `${formatMoney(fee)} service call`;
}

export function WarrantyPage({
  headline,
  text,
  serviceCallFee,
  className,
  gstEnabled = false,
  more,
  moreLabel = WARRANTY_MORE_LABEL,
}: {
  headline: string;
  text: string;
  serviceCallFee: number | null;
  className?: string;
  // Optional: "+ GST" on the fee while GST is enabled.
  gstEnabled?: boolean;
  // Optional: the deck's own layer state (deck-view's moreOf(page.key)), so
  // the pager locks and the dots hide while the full warranty is open. On
  // its own the page keeps its own state.
  more?: { open: boolean; set: (open: boolean) => void };
  moreLabel?: string;
}) {
  const [ownOpen, setOwnOpen] = useState(false);
  const open = more ? more.open : ownOpen;
  const setOpen = more ? more.set : setOwnOpen;
  const lines = warrantyLines(text);
  const fee = serviceCallShort(serviceCallFee, gstEnabled);
  const title = headline.trim() || "Our 10-year warranty";

  return (
    <div data-testid="warranty-page" className={cn("relative h-full w-full", className)}>
      <CentredBlock box="warranty" className="gap-12">
        <h2 className={DECK_TYPE.headline}>{keepHyphens(title)}</h2>

        {/* The ten years: a numbered row, the bar (solid gold for parts and
            labour, gold outline for parts), and what each span means. */}
        <div data-testid="warranty-timeline" className="flex flex-col gap-3" role="img" aria-label={timelineLabel(fee)}>
          <div aria-hidden="true" className="grid grid-cols-10 gap-1.5">
            {YEARS.map((year) => (
              <span key={year} className={cn(DECK_TYPE.small, "text-center text-muted-foreground tabular-nums")}>
                {year}
              </span>
            ))}
          </div>
          <div aria-hidden="true" className="grid grid-cols-10 gap-1.5">
            {YEARS.map((year) => (
              <span
                key={year}
                className={cn("h-8 rounded-sm border-2 border-gold", year <= 5 ? "bg-gold" : "bg-transparent")}
              />
            ))}
          </div>
          <div aria-hidden="true" className="grid grid-cols-2 gap-1.5 pt-2">
            <div className="flex flex-col gap-1">
              <span className={cn(DECK_TYPE.small, "text-muted-foreground")}>Years 1 to 5</span>
              <span className={DECK_TYPE.name}>Parts and labour</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className={cn(DECK_TYPE.small, "text-muted-foreground")}>Years 6 to 10</span>
              <span className={DECK_TYPE.name}>Parts</span>
              {fee ? (
                <span data-testid="warranty-service-call" className={DECK_TYPE.body}>
                  {fee}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* What it covers, and that it stays with the house: two columns on
            the timeline's two halves. */}
        <div className="grid grid-cols-2 gap-1.5">
          <div className="flex flex-col gap-3 pr-6">
            <span className={cn(DECK_TYPE.small, "text-muted-foreground")}>What it covers</span>
            <ul data-testid="warranty-covered" className="flex flex-col gap-2.5">
              {COVERED.map((part) => (
                <li key={part} className={cn(DECK_TYPE.body, "flex items-center gap-2.5 whitespace-nowrap")}>
                  <Check aria-hidden="true" className="size-6 shrink-0 text-gold" strokeWidth={2.5} />
                  {part}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-3">
            <span className={cn(DECK_TYPE.small, "text-muted-foreground")}>If you sell</span>
            <p data-testid="warranty-transfers" className={cn(DECK_TYPE.body, "flex items-center gap-2.5")}>
              <House aria-hidden="true" className="size-6 shrink-0 text-gold" strokeWidth={2} />
              {say("It transfers with the home.")}
            </p>
          </div>
        </div>
      </CentredBlock>

      {lines.length > 0 ? (
        <>
          <BottomCorner>
            <DeckButton data-testid="warranty-full" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}>
              {say(moreLabel)}
            </DeckButton>
          </BottomCorner>
          <MoreLayer open={open} onClose={() => setOpen(false)} label={moreLabel} lines={lines} lineSize="warranty" />
        </>
      ) : null}
    </div>
  );
}

function timelineLabel(fee: string | null): string {
  return `Years 1 to 5: parts and labour. Years 6 to 10: parts${fee ? `, ${fee.charAt(0).toLowerCase()}${fee.slice(1)}` : ""}.`;
}
