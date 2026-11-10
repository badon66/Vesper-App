"use client";

import { useEffect, useState, type ReactNode } from "react";

import { CornerPair } from "@/components/drawings/corner-pair";
import { HouseDayDrawing } from "@/components/drawings/house-drawing";
import { LitHouse } from "@/components/drawings/lit-house";
import { useBoxSize } from "@/components/lights/light-canvas";
import { Wordmark } from "@/components/brand/wordmark";
import { DayNightSlider } from "@/components/meeting/day-night-slider";
import {
  BandPage,
  DeckButton,
  DeckImage,
  DECK_TYPE,
  Lines,
  MoreLayer,
  say,
  SlotExample,
  SlotPicture,
  SplitPage,
  slotHasPicture,
  useDeck,
  type DrawingOptions,
} from "@/components/meeting/deck-parts";
import { PinchZoom } from "@/components/meeting/pinch-zoom";
import { SLOT_BY_KEY, type Look, type PageWords } from "@/lib/deck";
import { pairLayout } from "@/lib/drawings/pair";
import {
  companyLines,
  fullWarrantyShows,
  moreWords,
  pairView,
  serviceCallLine,
  slotView,
  warrantyLines,
  type SlotView,
} from "@/lib/meeting/deck-pages";
import type { DeckPayload } from "@/lib/meeting/state";
import { cn } from "@/lib/utils";

// The deck's pages (round 7, the settled spec's pages[]; round 9, the
// meeting as one story), each laid out as the spec gives it. Every word
// comes from Settings (deck.words, its pages and its lines) or the warranty
// text. A page mounts its pictures only while it is on screen or next to it
// (`near`), so an older iPad never holds every 3200 px photo at once. Your
// house, the colour page and What happens next have their own files.
//
// Until Keenan's photos exist, the drawings zoom in page by page (round 7
// review): the whole house on page 2, the garage and lower eave on page 3's
// day and night pair, tight on the garage and entry on page 4, each crop
// filling its picture edge to edge like a photo.

// What every page with a More gets from the deck: whether its layer is open,
// and a way to open or close it (the deck locks the pager while it is open).
export type MoreState = { open: boolean; set: (open: boolean) => void };

type PageProps = { deck: DeckPayload; near: boolean; more: MoreState; fillEmpty: boolean };

const altOf = (key: string) => SLOT_BY_KEY.get(key)?.name ?? "";

// A band page's picture. A photo fills the area. The whole house (page 2)
// sits inside it with room around it; a crop (page 4's garage and entry)
// fills it edge to edge, cut like a photo; the phone scene lays itself out
// in the whole area.
function bandPicture(view: SlotView, key: string): ReactNode {
  if (view.kind === "fallback") {
    if (view.fallback === "drawing_house_entry") {
      return <SlotPicture view={view} alt={altOf(key)} drawing={{ fit: "cover" }} />;
    }
    if (view.fallback === "drawing_phone") return <SlotPicture view={view} alt={altOf(key)} />;
    return (
      <div className="absolute inset-x-[6%] top-[6%] bottom-[5%]">
        <SlotPicture view={view} alt={altOf(key)} />
      </div>
    );
  }
  return <SlotPicture view={view} alt={altOf(key)} />;
}

// A More's picture, filling the left 56% panel: Keenan's photo, the
// example, or its drawing straight on the layer's card (no box of its own),
// centred and sized to fill the panel. What's in it draws the eave in
// section, lit. Up close (Hidden by day) shows something different (round 7
// after-review): the day side's close-up of one eave, the soffit, fascia
// and slim track on the paper tone, filling the panel like a photo.
// Null when it falls back to the words alone.
const MORE_DRAWING: Record<string, DrawingOptions> = {
  "hidden_by_day.more": { eave: "day", fit: "cover" },
};

function morePicture(view: SlotView, key: string): ReactNode | null {
  if (!slotHasPicture(view)) return null;
  return <SlotPicture view={view} alt={altOf(key)} drawing={MORE_DRAWING[key] ?? { ground: "none" }} />;
}

export function MoreButton({ more, label }: { more: MoreState; label: string }) {
  return (
    <DeckButton onClick={() => more.set(true)} aria-haspopup="dialog" aria-expanded={more.open}>
      {say(label)}
    </DeckButton>
  );
}

// The band's words, or nothing (so a page with no words has no right column).
export function bandWords(words: PageWords): ReactNode {
  return words.words.trim() ? <p className={DECK_TYPE.body}>{say(words.words.trim())}</p> : null;
}

// ---------------------------------------------------------------- cover

// A quiet title card while Keenan says hello: the wordmark, the address and
// (round 9) one line under it naming what's coming, the price included, so
// they listen to the product pages instead of waiting for the number. No
// photo, greeting, name or date. With no lead (rehearsal), the wordmark and
// the line. The wordmark's letters are centred, its gold dot hanging
// outside the centring.
export function CoverPage({ line, tagline }: { line: string | null; tagline?: string | null }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-8 px-16 text-center">
      <Wordmark hangDot className="text-[length:var(--deck-wordmark)] leading-none" />
      {line || tagline ? (
        <div className="flex flex-col items-center gap-4">
          {line ? <p className="text-[length:var(--deck-address)] leading-[1.3] text-muted-foreground">{say(line)}</p> : null}
          {tagline ? (
            <p className={cn(DECK_TYPE.body, "max-w-[34em]")} data-testid="deck-cover-line">
              {say(tagline)}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- What Vesper is

export function WhatVesperPage({ deck, near, more, fillEmpty }: PageProps) {
  const words = deck.words.pages.what_vesper_is;
  const hero = slotView(deck, "what_vesper_is.hero", fillEmpty);
  const layer = moreWords(words);
  return (
    <>
      <BandPage
        picture={near ? bandPicture(hero, "what_vesper_is.hero") : null}
        headline={words.headline}
        more={layer ? <MoreButton more={more} label={layer.label} /> : null}
      >
        {bandWords(words)}
      </BandPage>
      {layer ? (
        <MoreLayer
          open={more.open}
          onClose={() => more.set(false)}
          label={layer.label}
          picture={morePicture(slotView(deck, "what_vesper_is.more", fillEmpty), "what_vesper_is.more")}
          lines={layer.lines}
        />
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------- Hidden by day

function PairSide({ view, slotKey, focus }: { view: SlotView; slotKey: string; focus?: [number, number] }) {
  if (view.kind === "photo") return <DeckImage photo={view.photos[0]} alt={altOf(slotKey)} focus={focus} />;
  if (view.kind === "example") return <SlotExample slot={view.slot} />;
  return null;
}

export function HiddenByDayPage({ deck, near, more, fillEmpty }: PageProps) {
  const { warm } = useDeck();
  const words = deck.words.pages.hidden_by_day;
  const pair = pairView(deck, "hidden_by_day.day", "hidden_by_day.night", fillEmpty);
  const layer = moreWords(words);
  // Both photos crop around the day photo's focus point, so they line up.
  const dayFocus = pair.kind === "pair" && pair.sides[0].kind === "photo" ? pair.sides[0].photos[0].focus : undefined;
  // The drawn pair: the same medium crop (the garage gable, the lower eave
  // and the entry) by day and lit at night, both filling the picture, so the
  // track reads as a slim thing tucked under the soffit.
  const slider =
    pair.kind === "pair" ? (
      <DayNightSlider
        day={<PairSide view={pair.sides[0]} slotKey="hidden_by_day.day" />}
        night={<PairSide view={pair.sides[1]} slotKey="hidden_by_day.night" focus={dayFocus} />}
      />
    ) : (
      <DayNightSlider
        day={<HouseDayDrawing crop="medium" fit="cover" className="absolute inset-0" />}
        night={<LitHouse crop="medium" fit="cover" look={warm} className="absolute inset-0" />}
      />
    );
  return (
    <>
      <BandPage picture={near ? slider : null} headline={words.headline} more={layer ? <MoreButton more={more} label={layer.label} /> : null}>
        {bandWords(words)}
      </BandPage>
      {layer ? (
        <MoreLayer
          open={more.open}
          onClose={() => more.set(false)}
          label={layer.label}
          picture={morePicture(slotView(deck, "hidden_by_day.more", fillEmpty), "hidden_by_day.more")}
          lines={layer.lines}
        />
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------- Warm white, most nights (the stand-in)

// Round 9: stands in for the light picker when there is neither a roofline
// trace nor a mockup, as built (its words and its Warm or cool layer): with
// no picker on screen, nothing repeats.

// A caption under each of the pair: the two looks' names from Settings.
const CAPTION_GAP = 12;
const CAPTION_LINE = 28;

// Keenan's warm and cool photos, each whole at the photos' own shape (the
// warm one's, read once it loads), side by side or one above the other,
// whichever shows them bigger in the panel, each captioned. The cool photo
// crops around the warm photo's focus point, so the two line up.
function PhotoPair({ sides, looks }: { sides: [SlotView, SlotView]; looks: [Look, Look] }) {
  const [boxRef, box] = useBoxSize<HTMLDivElement>();
  const warmPhoto = sides[0].kind === "photo" ? sides[0].photos[0] : null;
  const [shape, setShape] = useState<{ url: string; aspect: number } | null>(null);
  useEffect(() => {
    if (!warmPhoto) return;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      if (image.naturalWidth > 0 && image.naturalHeight > 0) setShape({ url: warmPhoto.url, aspect: image.naturalWidth / image.naturalHeight });
    };
    image.src = warmPhoto.url;
    return () => {
      image.onload = null;
    };
  }, [warmPhoto]);
  const aspect = shape && warmPhoto && shape.url === warmPhoto.url ? shape.aspect : 4 / 3;
  const margin = Math.max(24, Math.min(box.width, box.height) * 0.05);
  const gap = Math.max(16, Math.min(box.width, box.height) * 0.03);
  const layout = pairLayout(box, aspect, { caption: CAPTION_GAP + CAPTION_LINE, gap, margin });
  const { width, height } = layout.drawing;
  return (
    <div ref={boxRef} className="absolute inset-0">
      {width > 0 ? (
        <div className={cn("absolute inset-0 flex items-center justify-center", layout.direction === "column" && "flex-col")} style={{ gap }}>
          {sides.map((side, at) => (
            <figure key={at} className="m-0 flex shrink-0 flex-col items-center" style={{ width }}>
              <div className="relative overflow-hidden" style={{ width, height }}>
                <PairSide
                  view={side}
                  slotKey={at === 0 ? "whites_first.warm" : "whites_first.cool"}
                  focus={at === 1 && warmPhoto ? warmPhoto.focus : undefined}
                />
              </div>
              <figcaption
                className="w-full truncate text-center text-[length:var(--deck-small)] text-muted-foreground"
                style={{ marginTop: CAPTION_GAP, lineHeight: `${CAPTION_LINE}px` }}
              >
                {say(looks[at].name)}
              </figcaption>
            </figure>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function WarmCool({ deck, fillEmpty }: { deck: DeckPayload; fillEmpty: boolean }) {
  const { warm, cool } = useDeck();
  const pair = pairView(deck, "whites_first.warm", "whites_first.cool", fillEmpty);
  if (pair.kind === "drawn") {
    return <CornerPair warm={warm} cool={cool} captions={[say(warm.name), say(cool.name)]} ground="none" className="absolute inset-0" />;
  }
  return <PhotoPair sides={pair.sides} looks={[warm, cool]} />;
}

export function WhitesPage({ deck, near, more, fillEmpty }: PageProps) {
  const words = deck.words.pages.whites_first;
  const hero = slotView(deck, "whites_first.hero", fillEmpty);
  const layer = moreWords(words);
  return (
    <>
      <BandPage
        picture={near ? bandPicture(hero, "whites_first.hero") : null}
        headline={words.headline}
        more={layer ? <MoreButton more={more} label={layer.label} /> : null}
      >
        {bandWords(words)}
      </BandPage>
      {layer ? (
        <MoreLayer
          open={more.open}
          onClose={() => more.set(false)}
          label={layer.label}
          picture={<WarmCool deck={deck} fillEmpty={fillEmpty} />}
          lines={layer.lines}
        />
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------- Run it from your phone

// Up to three of Keenan's screenshots side by side, whole, at the phone's
// own proportion; until then, the words alone.
function AppScreens({ view }: { view: SlotView }) {
  if (view.kind === "example") return <SlotExample slot={view.slot} />;
  if (view.kind !== "photo") return null;
  return (
    <div className="absolute inset-x-10 inset-y-10 flex items-center justify-center gap-6">
      {view.photos.slice(0, 3).map((photo, at) => (
        <div key={photo.url} className="relative h-full min-w-0 flex-1">
          <DeckImage photo={photo} alt={`The app, screen ${at + 1}`} fit="contain" />
        </div>
      ))}
    </div>
  );
}

export function PhonePage({ deck, near, more, fillEmpty }: PageProps) {
  const words = deck.words.pages.phone_control;
  const hero = slotView(deck, "phone_control.hero", fillEmpty);
  const screens = slotView(deck, "phone_control.screens", fillEmpty);
  const layer = moreWords(words);
  return (
    <>
      <BandPage
        picture={near ? bandPicture(hero, "phone_control.hero") : null}
        headline={words.headline}
        more={layer ? <MoreButton more={more} label={layer.label} /> : null}
      >
        {bandWords(words)}
      </BandPage>
      {layer ? (
        <MoreLayer
          open={more.open}
          onClose={() => more.set(false)}
          label={layer.label}
          picture={slotHasPicture(screens) ? <AppScreens view={screens} /> : null}
          lines={layer.lines}
        />
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------- Our 10-year warranty

// The first lines of settings.warranty_text word for word (how many is a
// number in Settings, always from the top), then the company and phone. The
// full warranty, every line exactly as stored, is one tap away, with the
// service call fee only when it is set, in the same Night Text as the
// lines above it, set apart by space alone. Nothing summed up or added.
export function WarrantyPage({ deck, near, more, fillEmpty }: PageProps) {
  const words = deck.words.pages.warranty;
  const hero = slotView(deck, "warranty.hero", fillEmpty);
  const lines = warrantyLines(deck.warranty.text);
  const upFront = lines.slice(0, deck.words.warrantyLinesUpFront);
  const fee = serviceCallLine(deck.warranty.serviceCallFee, deck.warranty.gstEnabled);
  const label = words.moreLabel.trim();
  const full = label && fullWarrantyShows(deck.warranty.text, deck.words.warrantyLinesUpFront, deck.warranty.serviceCallFee);
  const picture = slotHasPicture(hero) ? (near ? <SlotPicture view={hero} alt={altOf("warranty.hero")} /> : <span />) : null;
  return (
    <>
      <SplitPage picture={picture} headline={words.headline} more={full ? <MoreButton more={more} label={label} /> : null}>
        <Lines lines={upFront} />
        <div className={cn(DECK_TYPE.small, "flex flex-col text-muted-foreground")}>
          {companyLines(deck.company).map((line) => (
            <p key={line}>{say(line)}</p>
          ))}
        </div>
      </SplitPage>
      {full ? (
        <MoreLayer
          open={more.open}
          onClose={() => more.set(false)}
          label={label}
          lines={lines}
          lineSize="warranty"
          after={fee ? <p className={cn(DECK_TYPE.warranty, "mt-3")}>{fee}</p> : null}
        />
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------- Your house, lit (the stand-in)

// Round 9: stands in for Your house when the roofline isn't traced but the
// lead has a mockup: the mockup, pinch to zoom, as built, with its title
// ("Your house, lit") and its line ("Our drawing of your lights on your
// photo.") in the band. No More. The light picker is skipped then.
export function MockupPage({
  words,
  mockupUrl,
  addressLine,
  near,
  onSwipe,
}: {
  words: PageWords;
  mockupUrl: string;
  addressLine: string;
  near: boolean;
  onSwipe: (delta: number) => void;
}) {
  return (
    <BandPage
      picture={near ? <PinchZoom src={mockupUrl} alt={`${addressLine}, with the lights on`} onSwipe={onSwipe} /> : null}
      headline={words.headline}
    >
      {bandWords(words)}
    </BandPage>
  );
}
