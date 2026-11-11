"use client";

import { useEffect, useState, type ReactNode } from "react";

import { CornerPair } from "@/components/drawings/corner-pair";
import { useBoxSize } from "@/components/lights/light-canvas";
import { Logo } from "@/components/brand/logo";
import { DayNightSlider } from "@/components/meeting/day-night-slider";
import {
  BandPage,
  DeckButton,
  DeckImage,
  DECK_TYPE,
  keepHyphens,
  Lines,
  MoreLayer,
  say,
  SlotExample,
  SlotPicture,
  SplitPage,
  slotHasPicture,
  PHOTO_FRAME,
  PhotoFrame,
  useDeck,
  useImageAspect,
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
import type { DeckPayload, MeetingMockup } from "@/lib/meeting/state";
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

// A brief introduction made for the iPad (round 10): the wordmark, their
// name large, their address under it, then one line naming what's coming,
// the price included. No photo, greeting or date. With no lead
// (rehearsal), the logo and the line. Since 2026-11-11 the real logo, the
// version that suits the theme (white on the dark deck).
export function CoverPage({ name, line, tagline }: { name?: string | null; line: string | null; tagline?: string | null }) {
  const shownName = name?.trim() || null;
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-10 px-16 text-center" data-testid="deck-cover">
      <Logo className="h-[calc(var(--deck-wordmark)*1.85)]" />
      {shownName || line || tagline ? (
        <div className="flex max-w-[44em] flex-col items-center gap-3">
          {shownName ? (
            <p className={cn(DECK_TYPE.headline, "text-balance")} data-testid="deck-cover-name">
              {say(shownName)}
            </p>
          ) : null}
          {line ? <p className="text-[length:var(--deck-address)] leading-[1.3] text-muted-foreground">{say(line)}</p> : null}
          {tagline ? (
            <p className={cn(DECK_TYPE.body, "mt-5 max-w-[34em]")} data-testid="deck-cover-line">
              {say(tagline)}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- Up once, there all year

// Round 10: their Main mockup (their house, lights on), as big as the page
// allows, pinch to zoom, with the page's headline and words in the band.
// Skipped without a Main (deckPages), so it is never empty.
export function WhatVesperPage({
  deck,
  near,
  more,
  main,
  addressLine,
  onSwipe,
}: Omit<PageProps, "fillEmpty"> & { main: MeetingMockup; addressLine: string; onSwipe: (delta: number) => void }) {
  const words = deck.words.pages.what_vesper_is;
  const layer = moreWords(words);
  const aspect = useImageAspect(main.url);
  return (
    <>
      <BandPage
        picture={
          near ? (
            <PhotoFrame aspect={aspect} testId="what-vesper-frame">
              <PinchZoom src={main.url} alt={`${addressLine}, with the lights on`} onSwipe={onSwipe} />
            </PhotoFrame>
          ) : null
        }
        headline={words.headline}
        more={layer ? <MoreButton more={more} label={layer.label} /> : null}
      >
        {bandWords(words)}
      </BandPage>
      {layer ? <MoreLayer open={more.open} onClose={() => more.set(false)} label={layer.label} lines={layer.lines} /> : null}
    </>
  );
}

// ---------------------------------------------------------------- Hidden by day

// Round 10: their Day and Night mockups with the slider between them, both
// cropped the same way so the house lines up. Skipped unless both exist.
export function HiddenByDayPage({ deck, near, more, day, night }: Omit<PageProps, "fillEmpty"> & { day: MeetingMockup; night: MeetingMockup }) {
  const words = deck.words.pages.hidden_by_day;
  const layer = moreWords(words);
  const centre: [number, number] = [0.5, 0.5];
  const aspect = useImageAspect(day.url);
  const slider = (
    <PhotoFrame aspect={aspect} testId="hidden-by-day-frame">
      <DayNightSlider
        day={<DeckImage photo={{ url: day.url, focus: centre }} alt="Your house by day" />}
        night={<DeckImage photo={{ url: night.url, focus: centre }} alt="Your house at night" />}
      />
    </PhotoFrame>
  );
  return (
    <>
      <BandPage picture={near ? slider : null} headline={words.headline} more={layer ? <MoreButton more={more} label={layer.label} /> : null}>
        {bandWords(words)}
      </BandPage>
      {layer ? <MoreLayer open={more.open} onClose={() => more.set(false)} label={layer.label} lines={layer.lines} /> : null}
    </>
  );
}

// ---------------------------------------------------------------- Warm white, most nights (the stand-in)

function PairSide({ view, slotKey, focus }: { view: SlotView; slotKey: string; focus?: [number, number] }) {
  if (view.kind === "photo") return <DeckImage photo={view.photos[0]} alt={altOf(slotKey)} focus={focus} />;
  if (view.kind === "example") return <SlotExample slot={view.slot} />;
  return null;
}

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
              <div className={PHOTO_FRAME} style={{ width, height }}>
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

// Round 10: their house on the left, and on the right a phone drawn on
// screen whose buttons are their scene mockups by name (the Main first,
// when there is one). Tapping a scene swaps the house picture to it, the
// way the app changes the lights. Skipped without a scene. The chosen
// button is the Night Text fill, never gold (the customer's page).
export function PhonePage({ deck, near, scenes }: { deck: DeckPayload; near: boolean; scenes: MeetingMockup[] }) {
  const { reduced } = useDeck();
  const words = deck.words.pages.phone_control;
  const [shownId, setShownId] = useState<string | null>(null);
  const shown = scenes.find((scene) => scene.id === shownId) ?? scenes[0];
  const headline = words.headline.trim();
  const aspect = useImageAspect(shown?.url);
  return (
    <div className="grid h-full w-full grid-cols-[minmax(0,1fr)_400px]" data-testid="phone-page">
      <div className="relative min-w-0 overflow-hidden" style={{ marginBottom: "var(--deck-clear, 78px)" }} data-testid="phone-house">
        {near ? (
          // Framed (2026-11-11), the frame easing to each scene's shape
          // while the scenes cross-fade inside it; clear of the left edge
          // at the page's margin.
          <PhotoFrame aspect={aspect} className="left-10" testId="phone-frame">
            {scenes.map((scene) => (
              <DeckImage
                key={scene.id}
                photo={{ url: scene.url, focus: [0.5, 0.5] }}
                alt={scene.id === shown?.id ? `Your house: ${scene.name}` : ""}
                fit="contain"
                className={cn(!reduced && "transition-opacity duration-300", scene.id === shown?.id ? "opacity-100" : "opacity-0")}
              />
            ))}
          </PhotoFrame>
        ) : null}
      </div>
      <div className="flex min-h-0 min-w-0 flex-col items-center gap-5 pt-16 pr-12 pl-6" style={{ paddingBottom: "var(--deck-clear, 78px)" }}>
        {headline ? <h2 className={cn(DECK_TYPE.headline, "self-start")}>{keepHyphens(headline)}</h2> : null}
        {words.words.trim() ? <p className={cn(DECK_TYPE.small, "self-start text-muted-foreground")}>{say(words.words.trim())}</p> : null}
        {/* The phone: a slim frame, its speaker slot, and the scenes. */}
        <div
          className="flex min-h-0 w-[260px] flex-1 flex-col rounded-[36px] border-[3px] border-foreground/80 bg-card px-4 pt-3 pb-5"
          style={{ maxHeight: 520 }}
          role="group"
          aria-label="Scenes"
        >
          <span aria-hidden="true" className="mx-auto mb-4 h-1.5 w-16 shrink-0 rounded-full bg-foreground/40" />
          <div className="flex min-h-0 flex-col gap-2.5 overflow-y-auto">
            {scenes.map((scene) => {
              const on = scene.id === shown?.id;
              return (
                <button
                  key={scene.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setShownId(scene.id)}
                  data-testid="phone-scene"
                  className={cn(
                    "flex min-h-14 w-full touch-manipulation items-center rounded-2xl border px-4 text-left text-[22px] leading-tight font-semibold outline-none [-webkit-tap-highlight-color:transparent] focus-visible:ring-2 focus-visible:ring-ring",
                    on ? "border-foreground bg-foreground text-background" : "border-input bg-background text-foreground active:bg-secondary",
                  )}
                >
                  <span className="line-clamp-2 min-w-0">{say(scene.name)}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
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
