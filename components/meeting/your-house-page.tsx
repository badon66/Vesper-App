"use client";

import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

import { LitPhoto } from "@/components/lights/lit-photo";
import { BandPage, DeckImage, DECK_TYPE, MoreLayer, say, useDeck } from "@/components/meeting/deck-parts";
import { bandWords, MoreButton, type MoreState } from "@/components/meeting/deck-pages";
import { TRAY_HEIGHT_CSS } from "@/components/meeting/picker/layout";
import { isControlTarget, swipeDelta, swipePointer, type SwipeArea } from "@/components/meeting/picker/picker-state";
import { RunsDrawing } from "@/components/meeting/runs-drawing";
import { deckLine, type DeckLines, type PageWords } from "@/lib/deck";
import { houseLine, measuredRuns, moreWords, type HouseView } from "@/lib/meeting/deck-pages";
import type { DeckPayload } from "@/lib/meeting/state";
import type { QuoteRun } from "@/lib/pricing";
import { cn } from "@/lib/utils";

// Your house (round 9, the meeting as one story; replaces Where your lights
// would go): their own house by day, measured, with nothing lit and no
// money. The customer recognises it for as long as Keenan stays on the
// page, and the turn to Try it on your house is the reveal.
//
// What it shows (lib/meeting/deck-pages.ts houseView): with a trace, the
// photo the roofline was traced on, by day and unlit, in exactly the light
// picker's crop and layout (LitPhoto in its day state, the band at the
// picker's tray height), so the photo stays put on the turn; with no trace,
// their Front photo by day in its own crop; with no photo, our drawing of
// the house with every measured run lit. In the band: the headline, and
// "We measured 166 ft of roofline." built from the quote's runs, hidden
// while nothing is measured. The runs are never listed on the page.
//
// What we measured (behind its button, only once something is measured):
// the deck's house drawing with every measured run lit in warm white, each
// named with its feet ("Front 64 ft"), captioned "Our drawing of your
// roofline.", then the page's words ("Upper is the second storey. Lower is
// the main floor."). No prices. It teaches the drawing and the run names
// the price page uses.
//
// Touch, as on the picker: the page is touch-action none, and a one-finger
// swipe that didn't start on a button turns the page through the deck
// (onSwipe), so the turn to the picker cross-fades; on the photo it takes a
// real flick or a long drag, so a customer pointing along their roofline
// never turns it.

export type YourHousePageProps = {
  deck: DeckPayload;
  view: HouseView;
  words: PageWords;
  lines: DeckLines;
  // The quote's runs as they stand (they change if Keenan measures more).
  runs: QuoteRun[];
  near: boolean;
  more: MoreState;
  onSwipe: (delta: 1 | -1) => void;
};

export function YourHousePage({ deck, view, words, lines, runs, near, more, onSwipe }: YourHousePageProps) {
  const { warm } = useDeck();
  const line = houseLine(words, runs);
  const lit = measuredRuns(runs);
  const layer = lit.length > 0 ? moreWords(words) : null;
  const photoBox = useRef<HTMLDivElement>(null);
  const swipe = useRef<{ id: number; x: number; y: number; at: number; area: SwipeArea } | null>(null);
  const down = useRef(new Set<number>());

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    down.current.add(event.pointerId);
    if (down.current.size > 1 || !swipePointer(event.pointerType) || isControlTarget(event.target)) {
      swipe.current = null;
      return;
    }
    const onPhoto = event.target instanceof Node && photoBox.current?.contains(event.target) === true;
    const area: SwipeArea = onPhoto ? { on: "photo", width: event.currentTarget.clientWidth } : { on: "tray" };
    swipe.current = { id: event.pointerId, x: event.clientX, y: event.clientY, at: event.timeStamp, area };
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    down.current.delete(event.pointerId);
    const from = swipe.current;
    if (!from || from.id !== event.pointerId) return;
    swipe.current = null;
    if (more.open) return;
    const delta = swipeDelta({ dx: event.clientX - from.x, dy: event.clientY - from.y, ms: event.timeStamp - from.at }, from.area);
    if (delta) onSwipe(delta);
  }

  function onPointerCancel(event: ReactPointerEvent<HTMLDivElement>) {
    down.current.delete(event.pointerId);
    if (swipe.current?.id === event.pointerId) swipe.current = null;
  }

  let picture: ReactNode = null;
  if (near) {
    if (view.kind === "trace" && deck.picker) {
      picture = (
        <LitPhoto
          photoUrl={deck.picker.photoUrl}
          trace={deck.picker.trace}
          look={warm}
          effect="steady"
          dusk={0}
          duskMs={0}
          lit={0}
          fadeMs={0}
          label="Your house, by day"
          className="absolute inset-0"
        />
      );
    } else if (view.kind === "photo") {
      picture = <DeckImage photo={{ url: view.url, focus: [0.5, 0.5] }} alt="Your house, by day" />;
    } else if (view.kind === "drawing") {
      picture = (
        <div className="absolute inset-x-[6%] top-[6%] bottom-[5%]">
          <RunsDrawing runs={runs} lit={lit} tone="night" label="Our drawing of your house" className="absolute inset-0 size-full" />
        </div>
      );
    }
  }

  return (
    <div
      data-testid="your-house-page"
      data-house-view={view.kind}
      className="h-full w-full"
      style={{ touchAction: "none" }}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <BandPage
        picture={<div ref={photoBox} className="absolute inset-0">{picture}</div>}
        headline={words.headline}
        bandHeight={view.kind === "trace" ? TRAY_HEIGHT_CSS : undefined}
        more={layer ? <MoreButton more={more} label={layer.label} /> : null}
      >
        {line ? bandWords({ ...words, words: line }) : null}
      </BandPage>
      {layer ? (
        <MoreLayer open={more.open} onClose={() => more.set(false)} label={layer.label}>
          <div
            data-deck-box="layer"
            className="flex h-full w-full flex-col pr-16 pl-16"
            // Clear of Back below the words, bottom left.
            style={{ paddingTop: 88, paddingBottom: "calc(var(--deck-clear, 78px) + 24px)" }}
          >
            <h2 className={DECK_TYPE.moreLabel}>{say(layer.label)}</h2>
            <div className="relative mt-6 min-h-0 flex-1" data-testid="your-house-drawing">
              {more.open ? (
                <RunsDrawing runs={runs} lit={lit} labels tone="night" ground="none" className="absolute inset-0 size-full" />
              ) : null}
            </div>
            <div className="mt-6 flex flex-col gap-2">
              <p className={DECK_TYPE.body}>{say(deckLine(lines, "house_drawing_caption"))}</p>
              {layer.lines.map((text, at) => (
                <p key={at} className={cn(DECK_TYPE.body, "text-muted-foreground")}>
                  {say(text)}
                </p>
              ))}
            </div>
          </div>
        </MoreLayer>
      ) : null}
    </div>
  );
}
