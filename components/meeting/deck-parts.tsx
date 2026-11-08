"use client";

import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { DeckDrawing, isDrawingFallback } from "@/components/drawings/deck-drawing";
import type { DrawingGround } from "@/components/drawings/house-drawing";
import type { DeckSlot, Look } from "@/lib/deck";
import type { EaveVariant } from "@/lib/drawings/eave";
import type { DrawingFit, HouseCropName } from "@/lib/drawings/house";
import { COOL_WHITE, WARM_WHITE } from "@/lib/lights/looks";
import type { SlotView } from "@/lib/meeting/deck-pages";
import type { DeckPhoto } from "@/lib/meeting/state";
import { EASE_QUIET, MOTION } from "@/lib/motion";
import { smartApostrophes } from "@/lib/typography";
import { cn } from "@/lib/utils";

// The deck's shared parts (round 7, the settled spec's pages and motion):
// the two page layouts (the photo above a solid band; the picture on the
// left 56% and the words on the right 44%), Keenan's photos cropped by their
// focus point, a slot's picture or its fallback, the More button and the
// full-screen More layer. Meeting mode and the rehearsal view render the
// same parts; only what fills an empty slot differs.

// ---------------------------------------------------------------- type

// Sizes come from the deck's root (deck-view.tsx), where they grow from the
// 1180 wide iPad Air to the 1366 wide iPad Pro: headlines 52/60 px Manrope
// 600 at -0.015em, words 27/30 px, secondary lines 20/22 px, the colour
// page's names 32/36, the full warranty 24/27, a More's label 44/50 in the
// headline's style, and a words-only More's words 30/32.
export const DECK_TYPE = {
  headline: "text-[length:var(--deck-headline)] leading-[1.1] font-semibold tracking-[-0.015em] text-balance",
  body: "text-[length:var(--deck-body)] leading-[1.3] text-pretty",
  small: "text-[length:var(--deck-small)] leading-[1.3] text-pretty",
  name: "text-[length:var(--deck-name)] leading-[1.2] font-semibold",
  warranty: "text-[length:var(--deck-warranty)] leading-[1.35] text-pretty",
  moreLabel: "text-[length:var(--deck-more-label)] leading-[1.1] font-semibold tracking-[-0.015em] text-balance",
  moreBody: "text-[length:var(--deck-more-body)] leading-[1.3] text-pretty",
} as const;

// Every customer word the deck draws reads with typographic apostrophes
// ("we’ll", not "we'll"); what Settings stores stays as Keenan typed it.
export const say = smartApostrophes;

// A headline never breaks inside a hyphenated word ("Our 10-year warranty"
// must not end a line on "10-"), and reads with typographic apostrophes.
export function keepHyphens(raw: string): ReactNode {
  const text = say(raw);
  if (!text.includes("-")) return text;
  return text.split(/(\s+)/).map((part, at) =>
    part.includes("-") ? (
      <span key={at} className="whitespace-nowrap">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

// ---------------------------------------------------------------- context

export type EmptySlotRenderer = (slot: DeckSlot) => ReactNode;

export type DeckContextValue = {
  // Where layers mount: inside the deck, over the pages, under the exit.
  overlay: HTMLElement | null;
  reduced: boolean;
  // The rehearsal view's example for an empty slot; undefined in a meeting
  // (and in the rehearsal's Customer view), where the fallback shows.
  renderEmptySlot?: EmptySlotRenderer;
  // The meeting's own whites, for the drawings.
  warm: Look;
  cool: Look;
};

export const DeckContext = createContext<DeckContextValue>({
  overlay: null,
  reduced: false,
  warm: WARM_WHITE,
  cool: COOL_WHITE,
});

export const useDeck = () => useContext(DeckContext);

// ---------------------------------------------------------------- pictures

const noCallout: CSSProperties = { WebkitTouchCallout: "none" };

// One of Keenan's photos, filling its box. Cropped ("cover") around its
// focus point, which stays in view whatever the box's shape, or shown whole
// ("contain"). Always loaded in CORS mode, so the service worker can keep it
// for a meeting without signal.
export function DeckImage({
  photo,
  alt,
  fit = "cover",
  focus,
  className,
  style,
}: {
  photo: Pick<DeckPhoto, "url" | "focus">;
  alt: string;
  fit?: "cover" | "contain";
  // Another photo's focus point, so a pair crops the same way (Hidden by day).
  focus?: [number, number];
  className?: string;
  style?: CSSProperties;
}) {
  const [x, y] = focus ?? photo.focus;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a signed storage photo, kept for no signal
    <img
      src={photo.url}
      alt={alt}
      crossOrigin="anonymous"
      draggable={false}
      decoding="async"
      className={cn("absolute inset-0 size-full select-none", fit === "cover" ? "object-cover" : "object-contain", className)}
      style={{ objectPosition: `${Math.round(x * 1000) / 10}% ${Math.round(y * 1000) / 10}%`, ...noCallout, ...style }}
    />
  );
}

// The rehearsal view's example for an empty slot, in a box it fills.
export function SlotExample({ slot, className }: { slot: DeckSlot; className?: string }) {
  const { renderEmptySlot } = useDeck();
  return <div className={cn("absolute inset-0 overflow-hidden", className)}>{renderEmptySlot?.(slot) ?? null}</div>;
}

// How a slot's drawing sits in its box (lib/drawings): fitted whole or
// filling it edge to edge, on its own navy or straight on a More's card, a
// house crop in place of the kind's own, the eave lit or by day.
export type DrawingOptions = { fit?: DrawingFit; ground?: DrawingGround; crop?: HouseCropName; eave?: EaveVariant };

// What a slot shows in its box: Keenan's first photo, the rehearsal's
// example, or its drawing. Null when its fallback is the words alone (or
// the page is skipped), so the caller lays the words out without a picture.
export function SlotPicture({
  view,
  alt,
  fit = "cover",
  drawing,
  className,
}: {
  view: SlotView;
  alt: string;
  fit?: "cover" | "contain";
  drawing?: DrawingOptions;
  className?: string;
}) {
  const { warm, cool } = useDeck();
  if (view.kind === "photo") return <DeckImage photo={view.photos[0]} alt={alt} fit={fit} className={className} />;
  if (view.kind === "example") return <SlotExample slot={view.slot} className={className} />;
  if (!isDrawingFallback(view.fallback)) return null;
  return <DeckDrawing kind={view.fallback} warm={warm} cool={cool} {...drawing} className={cn("absolute inset-0 size-full", className)} />;
}

export function slotHasPicture(view: SlotView): boolean {
  return view.kind !== "fallback" || isDrawingFallback(view.fallback);
}

// ---------------------------------------------------------------- layouts

// A labelled outline button, 56 px tall with a 20 px label: a page's More,
// and Back in the same spot on its layer. Never gold: it is never the next
// thing to do.
export function DeckButton({
  children,
  onClick,
  className,
  ...rest
}: {
  children: ReactNode;
  onClick: () => void;
  className?: string;
} & Omit<React.ComponentProps<"button">, "onClick" | "children" | "className">) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-14 touch-none items-center justify-center rounded-md border border-input bg-background px-6 text-[20px] leading-none font-semibold whitespace-nowrap text-foreground outline-none select-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

// Where every page's button sits: bottom right, on solid navy, in the
// bottom row (its centre line is the dots' and chevrons'; deck-view.tsx).
export function BottomRight({ children }: { children: ReactNode }) {
  return (
    <div data-deck-row="button" className="absolute right-12 z-10" style={{ bottom: "var(--deck-row-bottom, 20px)" }}>
      {children}
    </div>
  );
}

// A picture on the left 56% of a split page or a More: full height, ending
// above the bottom row, so the dots and chevrons never sit on a photo.
function LeftPicture({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-w-0">
      <div data-deck-picture="" className="absolute inset-x-0 top-0 overflow-hidden" style={{ bottom: "var(--deck-clear, 78px)" }}>
        {children}
      </div>
    </div>
  );
}

// A page or More with no picture: its block centred in the space above the
// bottom row, at the deck's 64 px left margin with a measure of 880 px, and
// never higher than the exit's corner (the first spacer keeps 88 px; if the
// block is taller than the room it starts there).
function CentredBlock({ children, className, box }: { children: ReactNode; className?: string; box: string }) {
  return (
    <div data-deck-box={box} className="flex h-full w-full flex-col overflow-hidden pr-16 pl-16" style={{ paddingBottom: "var(--deck-clear, 78px)" }}>
      <div aria-hidden="true" className="min-h-[88px] flex-1" />
      <div className={cn("flex w-full max-w-[880px] shrink-0 flex-col", className)}>{children}</div>
      <div aria-hidden="true" className="flex-1" />
    </div>
  );
}

// A full page: the photo above a solid Night Background band (about 30% of
// the height at 1180 x 820, 28% at 1366 x 1024), the headline left of a
// vertical line at 56% of the width, the words right of it, and the More
// button bottom right. Nothing sits on the photo. A page with no words and
// no More (the mockup) has no line and no right column: its headline sits
// alone in the band.
export function BandPage({
  picture,
  headline,
  children,
  more,
}: {
  picture: ReactNode;
  headline: string;
  children?: ReactNode;
  more?: ReactNode;
}) {
  const side = Boolean(more) || (children !== null && children !== undefined && children !== false);
  const title = headline.trim() ? <h2 className={DECK_TYPE.headline}>{keepHyphens(headline)}</h2> : null;
  return (
    <div className="flex h-full w-full flex-col">
      <div className="relative min-h-0 flex-1 overflow-hidden bg-background">{picture}</div>
      <div data-deck-box="band" className="relative shrink-0 overflow-hidden bg-background" style={{ height: "var(--deck-band)" }}>
        {side ? (
          <>
            {/* The line stops above the bottom row. */}
            <span aria-hidden="true" className="absolute top-6 left-[56%] w-px bg-border" style={{ bottom: "var(--deck-clear, 78px)" }} />
            <div className="grid h-full grid-cols-[56%_44%]">
              <div className="min-w-0 pt-6 pr-10 pl-16">{title}</div>
              <div className="flex min-w-0 flex-col gap-2 pt-6 pr-12 pl-10">{children}</div>
            </div>
          </>
        ) : (
          <div className="min-w-0 pt-6 pr-16 pl-16">{title}</div>
        )}
        {more ? <BottomRight>{more}</BottomRight> : null}
      </div>
    </div>
  );
}

// A split page (install day, the warranty): the picture on the left 56% at
// full height (ending above the bottom row), the headline and words on the
// right 44%. Without a picture the headline and words are one block,
// centred in the space above the bottom row at the 64 px margin; the steps
// and warranty lines run the block's full measure.
export function SplitPage({
  picture,
  headline,
  children,
  more,
}: {
  picture: ReactNode | null;
  headline: string;
  children?: ReactNode;
  more?: ReactNode;
}) {
  const title = headline.trim() ? <h2 className={DECK_TYPE.headline}>{keepHyphens(headline)}</h2> : null;
  return (
    <div className="relative h-full w-full">
      {picture ? (
        <div className="grid h-full grid-cols-[56%_44%]">
          <LeftPicture>{picture}</LeftPicture>
          <div data-deck-box="split" className="flex min-w-0 flex-col gap-7 overflow-hidden pt-16 pr-12 pb-28 pl-10">
            {title}
            {children}
          </div>
        </div>
      ) : (
        <CentredBlock box="split" className="gap-8">
          {title}
          {children}
        </CentredBlock>
      )}
      {more ? <BottomRight>{more}</BottomRight> : null}
    </div>
  );
}

// Words line by line, at the deck's words size.
export function Lines({ lines, className }: { lines: string[]; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {lines.map((line, at) => (
        <p key={at} className={DECK_TYPE.body}>
          {say(line)}
        </p>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- layers

// Mounted while open and through its closing fade; `shown` drives the CSS.
function usePresence(open: boolean, outMs: number): { mounted: boolean; shown: boolean } {
  const [previous, setPrevious] = useState(open);
  const [lingering, setLingering] = useState(false);
  const [entered, setEntered] = useState(false);
  if (open !== previous) {
    setPrevious(open);
    setLingering(!open);
  }
  useEffect(() => {
    if (open) {
      let frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => setEntered(true));
      });
      return () => cancelAnimationFrame(frame);
    }
    const timer = window.setTimeout(() => {
      setLingering(false);
      setEntered(false);
    }, outMs);
    return () => window.clearTimeout(timer);
  }, [open, outMs]);
  return { mounted: open || lingering, shown: open && entered };
}

// A one-finger sideways swipe on a layer: |dx| over 60 px and well over |dy|.
export function useSideSwipe(onSwipe: (delta: 1 | -1) => void) {
  const from = useRef<{ id: number; x: number; y: number } | null>(null);
  return {
    onPointerDown: (event: React.PointerEvent) => {
      from.current = event.isPrimary ? { id: event.pointerId, x: event.clientX, y: event.clientY } : null;
    },
    onPointerUp: (event: React.PointerEvent) => {
      const start = from.current;
      from.current = null;
      if (!start || start.id !== event.pointerId) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) onSwipe(dx < 0 ? 1 : -1);
    },
    onPointerCancel: () => {
      from.current = null;
    },
  };
}

// The full-screen layer behind a page's More button (and the gallery's
// contact sheet): solid Night Card, fading in while rising 16 px over 220 ms
// and closing in 180 ms (the contact sheet just fades, over 200 ms; with
// Reduce Motion, a fade of 100 ms). The page behind does not move, the pager
// is locked while it is open (the deck does that), a sideways swipe closes
// it, and Back sits where the More button was.
//
// Without `children`, it lays out a More: its picture on the left 56% (one
// full-height panel, ending above the bottom row) and its label and words
// on the right; with no picture, the label and words are one block centred
// above the bottom row at the 64 px margin, the label in the headline's
// style and the words a step up. With `children`, the caller lays it out
// (the contact sheet, the colour chooser).
export function MoreLayer({
  open,
  onClose,
  label,
  picture,
  lines,
  lineSize = "body",
  after,
  variant = "rise",
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  picture?: ReactNode | null;
  lines?: string[];
  // The full warranty reads at 24/27 px, every line of it.
  lineSize?: "body" | "warranty";
  after?: ReactNode;
  variant?: "rise" | "fade";
  children?: ReactNode;
}) {
  const { overlay, reduced } = useDeck();
  const inMs = reduced ? MOTION.reducedFadeMs : variant === "fade" ? MOTION.sheetFadeMs : MOTION.moreInMs;
  const outMs = reduced ? MOTION.reducedFadeMs : variant === "fade" ? MOTION.sheetFadeMs : MOTION.moreOutMs;
  const { mounted, shown } = usePresence(open, outMs);
  const back = useRef<HTMLButtonElement>(null);
  const opener = useRef<Element | null>(null);
  const swipe = useSideSwipe(() => onClose());

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    back.current?.focus({ preventScroll: true });
    return () => {
      const element = opener.current;
      if (element instanceof HTMLElement && element.isConnected) element.focus({ preventScroll: true });
    };
  }, [open]);

  if (!mounted || !overlay) return null;
  const rise = variant === "rise" && !reduced;
  const ms = shown ? inMs : outMs;
  const style: CSSProperties = {
    // A sideways move stays with the layer (to close it), never the browser.
    touchAction: "pan-y",
    opacity: shown ? 1 : 0,
    transform: rise ? `translateY(${shown ? 0 : MOTION.moreRisePx}px)` : undefined,
    transition: `opacity ${ms}ms ${EASE_QUIET}${rise ? `, transform ${ms}ms ${EASE_QUIET}` : ""}`,
  };
  const warranty = lineSize === "warranty";
  const words = (text: string) => (
    <div className={cn("flex flex-col", warranty ? "gap-3" : "gap-4")}>
      {(lines ?? []).map((line, at) => (
        <p key={at} className={text}>
          {say(line)}
        </p>
      ))}
    </div>
  );

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={say(label)}
      data-deck-layer=""
      className="absolute inset-0 z-30 bg-card text-foreground"
      style={style}
      {...swipe}
    >
      {children ?? (
        picture ? (
          <div className="grid h-full grid-cols-[56%_44%]">
            <LeftPicture>{picture}</LeftPicture>
            <div data-deck-box="layer" className="flex min-w-0 flex-col gap-6 overflow-hidden pt-16 pr-12 pb-28 pl-10">
              <h2 className={DECK_TYPE.moreLabel}>{say(label)}</h2>
              {words(warranty ? DECK_TYPE.warranty : DECK_TYPE.body)}
              {after}
            </div>
          </div>
        ) : (
          <CentredBlock box="layer" className="gap-7">
            <h2 className={DECK_TYPE.moreLabel}>{say(label)}</h2>
            {words(warranty ? DECK_TYPE.warranty : DECK_TYPE.moreBody)}
            {after}
          </CentredBlock>
        )
      )}
      <BottomRight>
        <DeckButton ref={back} onClick={onClose}>
          Back
        </DeckButton>
      </BottomRight>
    </div>,
    overlay,
  );
}
