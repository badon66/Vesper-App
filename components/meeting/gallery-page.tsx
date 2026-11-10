"use client";

import { useEffect, useRef, useState } from "react";

import { BandPage, BottomRight, DeckButton, DeckImage, DECK_TYPE, MoreLayer, say, SlotExample, useDeck, useSideSwipe } from "@/components/meeting/deck-parts";
import type { PageWords } from "@/lib/deck";
import { GALLERY_HERO_COUNT, galleryCounter, seeAllLabel, type GalleryItem } from "@/lib/meeting/deck-pages";
import { EASE_QUIET, MOTION } from "@/lib/motion";
import { cn } from "@/lib/utils";

// Homes we've lit (round 7, the settled spec's gallery): real Calgary homes
// Vesper has lit, one photo at a time above the band, the first six in
// Keenan's order (warm whites first, colour looks last). The deck's chevrons
// and arrow keys step through those photos before turning the page (the deck
// owns `at`); a swipe always turns the deck's page, so no scroller is nested
// inside the deck. Each photo's caption names the look only. "See all N"
// opens the contact sheet: 3 across at 1180, 4 at 1366, 2 px gutters, from
// the 640 px copies, clear of the exit and Back; a tap opens one full screen with its own Back, and a
// swipe there moves photo to photo. In the rehearsal view an empty slot shows
// its example among them. The band counts its photos ("2 of 6") only while
// they are the whole gallery; with more, See all N is the only total.

const itemAlt = (item: GalleryItem) =>
  item.kind === "photo" ? (item.photo.caption ? `A home we've lit, ${item.photo.caption.toLowerCase()}` : "A home we've lit") : item.slot.name;

function ItemPicture({ item, thumb = false, fit = "cover" }: { item: GalleryItem; thumb?: boolean; fit?: "cover" | "contain" }) {
  if (item.kind === "example") return <SlotExample slot={item.slot} />;
  const photo = thumb && item.photo.thumbUrl ? { ...item.photo, url: item.photo.thumbUrl } : item.photo;
  return <DeckImage photo={photo} alt={itemAlt(item)} fit={fit} />;
}

// One photo, faded in over the one it replaces (200 ms; in one step with
// Reduce Motion). Only these two are ever mounted.
function Hero({ items, at }: { items: GalleryItem[]; at: number }) {
  const { reduced } = useDeck();
  const fadeMs = reduced ? 0 : MOTION.galleryFadeMs;
  const [layers, setLayers] = useState<{ at: number; previous: number | null }>({ at, previous: null });
  if (layers.at !== at) setLayers({ at, previous: fadeMs > 0 ? layers.at : null });
  const top = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (layers.previous === null) return;
    top.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: fadeMs, easing: EASE_QUIET });
    const timer = window.setTimeout(() => setLayers((now) => ({ ...now, previous: null })), fadeMs);
    return () => window.clearTimeout(timer);
  }, [layers.previous, layers.at, fadeMs]);

  const current = items[layers.at];
  const previous = layers.previous === null ? undefined : items[layers.previous];
  return (
    <>
      {previous ? (
        <div key={`was-${layers.previous}`} className="absolute inset-0">
          <ItemPicture item={previous} />
        </div>
      ) : null}
      {current ? (
        <div key={`now-${layers.at}`} ref={top} className="absolute inset-0">
          <ItemPicture item={current} />
        </div>
      ) : null}
    </>
  );
}

// The contact sheet's full-screen photo: its own Back, and a sideways swipe
// or an arrow key moves photo to photo (never closing the sheet).
function FullPhoto({ items, at, onAt, onBack }: { items: GalleryItem[]; at: number; onAt: (at: number) => void; onBack: () => void }) {
  const step = (delta: 1 | -1) => onAt(Math.min(items.length - 1, Math.max(0, at + delta)));
  const swipe = useSideSwipe(step);
  const back = useRef<HTMLButtonElement>(null);
  useEffect(() => back.current?.focus({ preventScroll: true }), []);
  const item = items[at];
  return (
    <div
      className="absolute inset-0 z-20 bg-background"
      data-deck-keys="own"
      onPointerDown={(event) => {
        event.stopPropagation();
        swipe.onPointerDown(event);
      }}
      onPointerUp={(event) => {
        event.stopPropagation();
        swipe.onPointerUp(event);
      }}
      onPointerCancel={swipe.onPointerCancel}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
          event.preventDefault();
          step(event.key === "ArrowRight" ? 1 : -1);
        } else if (event.key === "Escape") {
          event.preventDefault();
          onBack();
        }
      }}
    >
      {item ? <ItemPicture item={item} fit="contain" /> : null}
      <BottomRight>
        <DeckButton ref={back} onClick={onBack}>
          Back
        </DeckButton>
      </BottomRight>
    </div>
  );
}

// The grid scrolls between a strip at the top that holds the exit and one at
// the foot that holds Back (round 7 review), so neither ever sits on a photo.
function ContactSheet({ items, label }: { items: GalleryItem[]; label: string }) {
  const [full, setFull] = useState<number | null>(null);
  return (
    <>
      <div
        data-deck-sheet=""
        className="absolute inset-x-0 top-[88px] overflow-y-auto overscroll-contain"
        style={{ touchAction: "pan-y", bottom: "var(--deck-clear, 78px)" }}
      >
        <h2 className="sr-only">{label}</h2>
        <ul className="grid grid-cols-3 gap-[2px] @min-[1280px]:grid-cols-4">
          {items.map((item, at) => (
            <li key={item.kind === "photo" ? item.photo.url : item.slot.key} className="relative aspect-[4/3] overflow-hidden bg-background">
              <button
                type="button"
                aria-label={itemAlt(item)}
                onClick={() => setFull(at)}
                // The photos fill the sheet: a sideways swipe across them
                // still closes it, like every layer (useSideSwipe).
                data-layer-swipe=""
                className="absolute inset-0 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              >
                <ItemPicture item={item} thumb />
              </button>
            </li>
          ))}
        </ul>
      </div>
      {full !== null ? <FullPhoto items={items} at={full} onAt={setFull} onBack={() => setFull(null)} /> : null}
    </>
  );
}

export function GalleryPage({
  words,
  items,
  at,
  near,
  sheetOpen,
  onSheet,
}: {
  words: PageWords;
  items: GalleryItem[];
  at: number;
  near: boolean;
  sheetOpen: boolean;
  onSheet: (open: boolean) => void;
}) {
  const heroes = items.slice(0, GALLERY_HERO_COUNT);
  const shown = Math.min(Math.max(0, at), Math.max(0, heroes.length - 1));
  const current = heroes[shown];
  const caption = current?.kind === "photo" ? current.photo.caption : current?.kind === "example" ? current.slot.name : null;
  const label = words.moreLabel.trim();
  const sheet = label && items.length > 1 ? say(seeAllLabel(label, items.length)) : null;
  const counter = galleryCounter(shown, heroes.length, items.length);

  return (
    <>
      <BandPage
        picture={near ? <Hero items={heroes} at={shown} /> : null}
        headline={words.headline}
        more={sheet ? <DeckButton onClick={() => onSheet(true)} aria-haspopup="dialog">{sheet}</DeckButton> : null}
      >
        {/* Nothing at all with one uncaptioned photo, so the band has no
            empty right column (it never steps, so nothing to announce). */}
        {caption || heroes.length > 1 ? (
          <div aria-live="polite" className="flex flex-col gap-2">
            {caption ? <p className={DECK_TYPE.body}>{say(caption)}</p> : null}
            {counter ? (
              <p className={cn(DECK_TYPE.small, "text-muted-foreground tabular-nums")} data-testid="gallery-counter">
                {counter}
              </p>
            ) : null}
          </div>
        ) : null}
      </BandPage>
      {sheet ? (
        <MoreLayer open={sheetOpen} onClose={() => onSheet(false)} label={sheet} variant="fade">
          <ContactSheet items={items} label={sheet} />
        </MoreLayer>
      ) : null}
    </>
  );
}
