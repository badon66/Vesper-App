"use client";

import type { ReactNode } from "react";

import { CornerPair } from "@/components/drawings/corner-pair";
import { HouseDayDrawing } from "@/components/drawings/house-drawing";
import { LitHouse } from "@/components/drawings/lit-house";
import { Wordmark } from "@/components/brand/wordmark";
import { DayNightSlider } from "@/components/meeting/day-night-slider";
import {
  BandPage,
  DeckButton,
  DeckImage,
  DECK_TYPE,
  Lines,
  MoreLayer,
  SlotExample,
  SlotPicture,
  SplitPage,
  slotHasPicture,
  useDeck,
} from "@/components/meeting/deck-parts";
import { PinchZoom } from "@/components/meeting/pinch-zoom";
import { NO_PAYMENT_LINE, SLOT_BY_KEY, type PageWords } from "@/lib/deck";
import {
  companyLines,
  fullWarrantyShows,
  installSteps,
  moreWords,
  pairView,
  serviceCallLine,
  slotView,
  warrantyLines,
  type SlotView,
} from "@/lib/meeting/deck-pages";
import type { DeckPayload } from "@/lib/meeting/state";
import { cn } from "@/lib/utils";

// The deck's pages (round 7, the settled spec's pages[]), each laid out as
// the spec gives it. Every word comes from Settings (deck.words) or the
// warranty text, except the built lines the spec gives word for word. A
// page mounts its pictures only while it is on screen or next to it
// (`near`), so an older iPad never holds every 3200 px photo at once.

// What every page with a More gets from the deck: whether its layer is open,
// and a way to open or close it (the deck locks the pager while it is open).
export type MoreState = { open: boolean; set: (open: boolean) => void };

type PageProps = { deck: DeckPayload; near: boolean; more: MoreState; fillEmpty: boolean };

const altOf = (key: string) => SLOT_BY_KEY.get(key)?.name ?? "";

// A drawing sits inside the photo area with room around it; a photo fills it.
function framed(view: SlotView, key: string, inset = "inset-x-[6%] top-[6%] bottom-[5%]"): ReactNode {
  if (view.kind === "fallback") {
    return (
      <div className={cn("absolute", inset)}>
        <SlotPicture view={view} alt={altOf(key)} />
      </div>
    );
  }
  return <SlotPicture view={view} alt={altOf(key)} />;
}

// A More's picture on the left 56%: Keenan's photo, the example, or its
// drawing with room around it; null when it falls back to the words alone.
function morePicture(view: SlotView, key: string): ReactNode | null {
  if (!slotHasPicture(view)) return null;
  if (view.kind === "fallback" && view.fallback === "drawing_eave") {
    return (
      <div className="absolute inset-0 flex items-center justify-center px-12">
        <SlotPicture view={view} alt={altOf(key)} className="static size-auto w-full max-w-[600px]" />
      </div>
    );
  }
  return framed(view, key, "inset-x-10 inset-y-14");
}

function MoreButton({ more, label }: { more: MoreState; label: string }) {
  return (
    <DeckButton onClick={() => more.set(true)} aria-haspopup="dialog" aria-expanded={more.open}>
      {label}
    </DeckButton>
  );
}

function BandWords({ words }: { words: PageWords }) {
  return words.words.trim() ? <p className={DECK_TYPE.body}>{words.words.trim()}</p> : null;
}

// ---------------------------------------------------------------- cover

// A quiet title card while Keenan says hello: the wordmark and the address.
// No photo, greeting, name, date or tagline. With no lead (rehearsal), the
// wordmark alone.
export function CoverPage({ line }: { line: string | null }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-8 px-16 text-center">
      <Wordmark className="text-[length:var(--deck-wordmark)] leading-none" />
      {line ? <p className="text-[length:var(--deck-address)] leading-[1.3] text-muted-foreground">{line}</p> : null}
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
        picture={near ? framed(hero, "what_vesper_is.hero") : null}
        headline={words.headline}
        more={layer ? <MoreButton more={more} label={layer.label} /> : null}
      >
        <BandWords words={words} />
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
  const slider =
    pair.kind === "pair" ? (
      <DayNightSlider
        day={<PairSide view={pair.sides[0]} slotKey="hidden_by_day.day" />}
        night={<PairSide view={pair.sides[1]} slotKey="hidden_by_day.night" focus={dayFocus} />}
      />
    ) : (
      <DayNightSlider
        day={
          <div className="absolute inset-0 bg-white">
            <HouseDayDrawing className="absolute inset-x-[6%] top-[6%] bottom-[5%]" />
          </div>
        }
        night={
          <div className="absolute inset-0 bg-background">
            <LitHouse look={warm} className="absolute inset-x-[6%] top-[6%] bottom-[5%]" />
          </div>
        }
      />
    );
  return (
    <>
      <BandPage picture={near ? slider : null} headline={words.headline} more={layer ? <MoreButton more={more} label={layer.label} /> : null}>
        <BandWords words={words} />
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

// ---------------------------------------------------------------- Warm white, most nights

function WarmCool({ deck, fillEmpty }: { deck: DeckPayload; fillEmpty: boolean }) {
  const { warm, cool } = useDeck();
  const pair = pairView(deck, "whites_first.warm", "whites_first.cool", fillEmpty);
  if (pair.kind === "drawn") return <CornerPair warm={warm} cool={cool} className="absolute inset-x-10 inset-y-14" />;
  return (
    <div className="absolute inset-0 grid grid-cols-2 gap-1">
      {pair.sides.map((side, at) => (
        <div key={at} className="relative min-w-0">
          <PairSide view={side} slotKey={at === 0 ? "whites_first.warm" : "whites_first.cool"} />
        </div>
      ))}
    </div>
  );
}

export function WhitesPage({ deck, near, more, fillEmpty }: PageProps) {
  const words = deck.words.pages.whites_first;
  const hero = slotView(deck, "whites_first.hero", fillEmpty);
  const layer = moreWords(words);
  return (
    <>
      <BandPage
        picture={near ? framed(hero, "whites_first.hero") : null}
        headline={words.headline}
        more={layer ? <MoreButton more={more} label={layer.label} /> : null}
      >
        <BandWords words={words} />
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
    <div className="absolute inset-x-10 inset-y-14 flex items-center justify-center gap-6">
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
        picture={near ? framed(hero, "phone_control.hero", "inset-x-[6%] inset-y-[8%]") : null}
        headline={words.headline}
        more={layer ? <MoreButton more={more} label={layer.label} /> : null}
      >
        <BandWords words={words} />
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

// ---------------------------------------------------------------- How install day works

export function InstallDayPage({ deck, near, more, fillEmpty }: PageProps) {
  const words = deck.words.pages.install_day;
  const hero = slotView(deck, "install_day.hero", fillEmpty);
  const steps = installSteps(words.words);
  const layer = moreWords(words);
  const picture = slotHasPicture(hero) ? (near ? <SlotPicture view={hero} alt={altOf("install_day.hero")} /> : <span />) : null;
  return (
    <>
      <SplitPage picture={picture} headline={words.headline} more={layer ? <MoreButton more={more} label={layer.label} /> : null}>
        {steps.length > 0 ? (
          <ol className="flex flex-col gap-4">
            {steps.map((step, at) => (
              <li key={at} className={cn(DECK_TYPE.body, "flex items-baseline gap-4")}>
                <span className="w-[1ch] shrink-0 font-semibold text-muted-foreground tabular-nums">{at + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        ) : null}
        <p className={cn(DECK_TYPE.body, "border-t border-border pt-6 font-semibold")}>{NO_PAYMENT_LINE}</p>
      </SplitPage>
      {layer ? (
        <MoreLayer
          open={more.open}
          onClose={() => more.set(false)}
          label={layer.label}
          picture={morePicture(slotView(deck, "install_day.more", fillEmpty), "install_day.more")}
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
// service call fee only when it is set. Nothing summed up or added.
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
            <p key={line}>{line}</p>
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
          after={fee ? <p className="text-[24px] leading-[1.35] text-muted-foreground">{fee}</p> : null}
        />
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------- Where your lights would go

// The customer's mockup, pinch to zoom, as built. No words, no More.
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
    />
  );
}
