"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";

import { confirmedTonight, type Confirmation, type DeckColour } from "@/components/meeting/colour-page";
import { DeckContext, type DeckContextValue, type EmptySlotRenderer } from "@/components/meeting/deck-parts";
import { CoverPage, HiddenByDayPage, PhonePage, WhatVesperPage, type MoreState } from "@/components/meeting/deck-pages";
import { ExitHold } from "@/components/meeting/exit-hold";
import { NextStepsPage } from "@/components/meeting/next-steps-page";
import { QuoteScreen } from "@/components/meeting/quote-screen";
import { TalkingPoints } from "@/components/meeting/talking-points";
import { WarrantyPage } from "@/components/meeting/warranty-page";
import type { DeckPageKey } from "@/lib/deck";
import { coolWhiteOf, warmWhiteOf } from "@/lib/lights/looks";
import { blackFridayOn, offerPrice, recapParts, settleBlackFriday } from "@/lib/meeting/black-friday-state";
import {
  bottomRowWidth,
  coverLine,
  DECK_CLEAR_CSS,
  DECK_ROW,
  DECK_ROW_BOTTOM_CSS,
  DECK_SIZES,
  deckPages,
  entryOf,
  frontPhotoOf,
  GALLERY_HERO_COUNT,
  galleryItems,
  isNear,
  mockupJobs,
  measuredFeet,
  nextLabelParts,
  shownInstallDay,
  startIndex,
  stepFor,
  type DeckLead,
  type DeckPage,
} from "@/lib/meeting/deck-pages";
import {
  colourTimingFor,
  quoteFingerprint,
  quoteInputs,
  quoteOffers,
  startingPoint,
  type DeckPayload,
  type MeetingPayload,
  type MeetingStored,
  type QuoteUIState,
} from "@/lib/meeting/state";
import { useReducedMotion } from "@/lib/motion";
import { smartApostrophes } from "@/lib/typography";
import { cn } from "@/lib/utils";

// The deck (round 7, the settled spec; round 9, the meeting as one story;
// round 10, mockups per house): every page in Keenan's order, swiped
// sideways, nothing internal anywhere but his talking points, which show
// only while he presses and holds their mark (top right). Always dark navy,
// whatever the device's theme. Meeting mode renders it for one lead; the
// rehearsal view renders the same deck under its own bar. The cover, their
// Main mockup, their Day and Night mockups, their scenes on a phone, the
// warranty, Your price (with the colour and its initials) and What happens
// next; a page missing its mockup is skipped. No drawing of the house
// anywhere, and no light picker (Keenan, 2026-11-11: it left the meeting,
// traced or not). A quiet "Next: {headline}" sits right of the forward
// chevron on every page but the last.
//
// CONTRACT
//   <Deck
//     deck             the deck's payload (MeetingPayload.deck, or the
//                      rehearsal's own loadDeckPayload with no lead)
//     meeting          the lead's whole payload; null with no lead (rehearsal
//                      only), which skips the mockup pages and the price
//     mode?            "meeting" (default): keeps the iPad's copy in
//                      localStorage, guards against an edge swipe back, and
//                      saves through the meeting's server actions.
//                      "rehearsal": reads and writes nothing on the iPad,
//                      acts Save and Confirm out on screen, and never calls a
//                      server action.
//     renderEmptySlot? rehearsal only (not its Customer view): what fills an
//                      empty slot instead of its fallback, drawn in a box it
//                      should fill (absolute inset-0 is set on the box). With
//                      it, no page is skipped for want of a photo.
//     onExit           where holding the X (or Escape) goes
//     className?       the deck's frame; default "relative h-full w-full".
//                      Meeting mode passes "fixed inset-0 z-50".
//     startPage?       rehearsal only: the page to open on, by key, so the
//                      rehearsal keeps Keenan on his page when it remounts the
//                      deck for another lead or the Customer view. A meeting
//                      opens as #start, #quote or a reload says, and ignores it.
//     onPage?          told the page in view each time it changes
//   />
// Layers (a page's More, the contact sheet, the colour chooser, Pick a day) mount inside
// the deck, so a frame smaller than the screen keeps them. While one is open
// the pager is locked, the dots and chevrons hide (Back is the way out), and
// any page change closes it. The deck's root sets --deck-band (the band's
// height), the type sizes, --deck-row-bottom (the
// bottom row's foot) and --deck-clear (where a picture ends above that row)
// as CSS variables, in container units of the deck's own frame.

export type DeckMode = "meeting" | "rehearsal";

export type DeckProps = {
  deck: DeckPayload;
  meeting: MeetingPayload | null;
  mode?: DeckMode;
  renderEmptySlot?: EmptySlotRenderer;
  onExit: () => void;
  className?: string;
  startPage?: DeckPageKey;
  onPage?: (key: DeckPageKey) => void;
};

const ROOT_STYLE = {
  containerType: "size",
  WebkitTouchCallout: "none",
  "--deck-headline": DECK_SIZES.headline,
  "--deck-body": DECK_SIZES.body,
  "--deck-small": DECK_SIZES.small,
  "--deck-wordmark": DECK_SIZES.wordmark,
  "--deck-address": DECK_SIZES.address,
  "--deck-name": DECK_SIZES.name,
  "--deck-warranty": DECK_SIZES.warranty,
  "--deck-more-label": DECK_SIZES.moreLabel,
  "--deck-more-body": DECK_SIZES.moreBody,
  "--deck-band": DECK_SIZES.band,
  "--deck-row-bottom": DECK_ROW_BOTTOM_CSS,
  "--deck-clear": DECK_CLEAR_CSS,
} as CSSProperties;

// The bottom row's Previous and Next discs: 48 px, the iPad's tap size.
const CHEVRON_PX = 48;

const ROOT_CLASS =
  "dark overflow-hidden bg-background text-foreground select-none [&_input]:select-text [&_textarea]:select-text";

const storageKey = (leadId: string) => `vesper.meeting.${leadId}`;

function readStored(leadId: string): MeetingStored | null {
  try {
    const raw = window.localStorage.getItem(storageKey(leadId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MeetingStored;
    return parsed.version === 1 ? parsed : null;
  } catch {
    return null;
  }
}

function writeStored(leadId: string, value: MeetingStored) {
  try {
    window.localStorage.setItem(storageKey(leadId), JSON.stringify(value));
  } catch {
    // Private mode: the meeting still works, it just forgets on reload.
  }
}

const subscribeNever = () => () => {};

// Whether the quote on the iPad is the lead's accepted one, read only: its
// prices and colour timing stay as they were agreed.
function acceptedQuote(meeting: MeetingPayload | null): boolean {
  const draft = meeting?.draft as { accepted?: unknown } | null | undefined;
  return draft?.accepted === true;
}

// The iPad's own copy lives in localStorage, which only the browser has. The
// server and the first browser render both show the cover; the deck then
// starts from that copy, so the two renders always agree.
export function Deck(props: DeckProps) {
  const inBrowser = useSyncExternalStore(subscribeNever, () => true, () => false);
  if (!inBrowser) {
    return (
      <div className={cn(ROOT_CLASS, props.className ?? "relative h-full w-full")} style={ROOT_STYLE}>
        <CoverPage
          name={props.meeting?.lead.name ?? null}
          line={props.meeting ? coverLine(props.meeting.lead) : null}
          tagline={props.deck.words.lines.cover_line}
        />
      </div>
    );
  }
  return <DeckInBrowser {...props} />;
}

function DeckInBrowser({ deck, meeting, mode = "meeting", renderEmptySlot, onExit, className, startPage, onPage }: DeckProps) {
  const reduced = useReducedMotion();
  const persist = mode === "meeting" && meeting !== null;
  const fillEmpty = mode === "rehearsal" && renderEmptySlot !== undefined;
  const readOnly = mode === "rehearsal";
  const accepted = acceptedQuote(meeting);

  // Tonight, the Meetings page and the lead page open the deck with #start
  // (a fresh meeting, at the cover); prep's Draft the quote with #quote (on
  // the price page). A reload carries neither, so it picks up where it was.
  const [entry] = useState(() => entryOf(window.location.hash));
  const [start] = useState(() =>
    meeting ? startingPoint(meeting, persist ? readStored(meeting.lead.id) : null, Date.now(), entry === "start") : null,
  );
  const [colour] = useState<DeckColour>(() =>
    meeting
      ? { kind: meeting.lead.colourKind, text: meeting.lead.colourText, choice: meeting.colours.choice, ralCode: meeting.colours.ralCode }
      : { kind: "none", text: "", choice: null, ralCode: null },
  );
  // The quote, with the one colour rule applied to its colour timing (only
  // White is stock), unless it is the accepted quote, which stays as agreed.
  const [quote, setQuote] = useState<QuoteUIState | null>(() => {
    const opened = start?.quote ?? null;
    if (!opened || accepted) return opened;
    const timing = colourTimingFor(colour.kind, colour.text, opened.colourTiming);
    const timed = timing === opened.colourTiming ? opened : { ...opened, colourTiming: timing };
    // Its Black Friday line as Settings' deal works it out now.
    return meeting ? settleBlackFriday(timed, meeting.pricing) : timed;
  });

  const frontPhotoUrl = meeting ? frontPhotoOf(meeting) : null;
  const measured = quote !== null && measuredFeet(quote.runs) > 0;
  const lead = useMemo<DeckLead | null>(
    () => (meeting ? { mockupUrl: meeting.mockupUrl, mockups: meeting.mockups, frontPhotoUrl, measured } : null),
    [meeting, frontPhotoUrl, measured],
  );
  const jobs = useMemo(() => mockupJobs(meeting?.mockups ?? []), [meeting]);
  const pages = useMemo<DeckPage[]>(() => deckPages({ deck, lead, fillEmpty }), [deck, lead, fillEmpty]);
  const gallery = useMemo(() => galleryItems(deck, fillEmpty), [deck, fillEmpty]);
  const galleryCount = Math.min(gallery.length, GALLERY_HERO_COUNT);
  const [startAt] = useState(() => {
    const asked = mode === "rehearsal" && startPage ? pages.findIndex((page) => page.key === startPage) : -1;
    return asked >= 0 ? asked : startIndex(pages, entry, { index: start?.index ?? 0, screenKey: start?.screenKey ?? null });
  });
  const [index, setIndex] = useState(startAt);
  // The open layer: a page's key (its More, the contact sheet, the colour
  // chooser) or "next_steps:day" (Pick a day).
  const [layer, setLayer] = useState<string | null>(null);
  const [galleryAt, setGalleryAt] = useState(0);
  const [overlay, setOverlay] = useState<HTMLDivElement | null>(null);

  const [quoteId, setQuoteId] = useState<string | null>(start?.quoteId ?? null);
  const [savedAt, setSavedAt] = useState<string | null>(start?.savedAt ?? null);
  const [savedQuote, setSavedQuote] = useState<string | null>(start?.savedQuote ?? null);
  const [initialsDraft, setInitialsDraft] = useState(start?.initialsDraft ?? "");
  const [confirmation, setConfirmation] = useState<Confirmation>(() =>
    meeting?.lead.initials && meeting.lead.initialledAt ? { initials: meeting.lead.initials, at: meeting.lead.initialledAt } : null,
  );
  const dirty = quote !== null && (savedQuote === null || quoteFingerprint(quote) !== savedQuote);

  const pager = useRef<HTMLDivElement>(null);
  const indexRef = useRef(index);
  const current = Math.min(index, pages.length - 1);
  const currentKey = pages[current]?.key;

  useLayoutEffect(() => {
    indexRef.current = current;
  }, [current]);

  // The pages can change mid-meeting (Your house appears once Keenan measures
  // a house with no photo): stay on the page that was on screen.
  const keyRef = useRef(currentKey);
  useLayoutEffect(() => {
    const box = pager.current;
    const wanted = keyRef.current ? pages.findIndex((page) => page.key === keyRef.current) : -1;
    if (!box || wanted < 0 || wanted === indexRef.current) return;
    box.scrollLeft = wanted * box.clientWidth;
    indexRef.current = wanted;
    setIndex(wanted);
  }, [pages]);
  useEffect(() => {
    keyRef.current = currentKey;
  }, [currentKey]);

  useEffect(() => {
    if (currentKey) onPage?.(currentKey);
  }, [currentKey, onPage]);

  // Open on the page it starts at, without the slide.
  useLayoutEffect(() => {
    const box = pager.current;
    if (box) box.scrollLeft = startAt * box.clientWidth;
  }, [startAt]);

  // After a rotation or resize, straight back to the page it was on.
  useEffect(() => {
    const box = pager.current;
    if (!box || typeof ResizeObserver === "undefined") return;
    let width = box.clientWidth;
    const observer = new ResizeObserver(() => {
      if (box.clientWidth === width) return;
      width = box.clientWidth;
      box.scrollTo({ left: indexRef.current * box.clientWidth, behavior: "instant" });
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  // A real meeting: drop #start or #quote from the address (a reload then
  // resumes), and hold a step of history so an edge swipe back stays in the
  // deck instead of opening the lead page with its notes in front of the
  // customer.
  useEffect(() => {
    if (mode !== "meeting") return;
    const here = window.location.pathname + window.location.search;
    if (window.location.hash) window.history.replaceState(window.history.state, "", here);
    // The step copies the router's own state for this page, so going back
    // to it (or from it) restores the same page instead of reloading it.
    const guard = () => window.history.pushState({ ...(window.history.state ?? {}), vesperDeck: true }, "", here);
    // Once the router has written its state for this page.
    const first = window.setTimeout(guard, 0);
    window.addEventListener("popstate", guard);
    return () => {
      window.clearTimeout(first);
      window.removeEventListener("popstate", guard);
    };
  }, [mode]);

  // Everything the meeting holds stays on the iPad as it changes (never in
  // the rehearsal view).
  useEffect(() => {
    if (!persist || !meeting || !quote) return;
    writeStored(meeting.lead.id, {
      version: 1,
      quote,
      quoteId,
      savedAt,
      initialsDraft,
      savedQuote,
      screen: { index: current, at: Date.now(), key: currentKey },
    });
  }, [persist, meeting, quote, quoteId, savedAt, initialsDraft, savedQuote, current, currentKey]);

  const scrollToPage = useCallback(
    (at: number) => {
      const box = pager.current;
      if (!box || box.clientWidth === 0) return;
      const target = Math.min(pages.length - 1, Math.max(0, at));
      box.scrollTo({ left: target * box.clientWidth, behavior: reduced ? "instant" : "smooth" });
    },
    [pages.length, reduced],
  );

  // A page turn from code (a swipe on the Main mockup, a chevron, a key).
  // Changing page closes any open layer.
  const turnPage = useCallback(
    (delta: number) => {
      const box = pager.current;
      if (!box || box.clientWidth === 0) return;
      setLayer(null);
      const from = Math.round(box.scrollLeft / box.clientWidth);
      scrollToPage(from + delta);
    },
    [scrollToPage],
  );

  const goTo = useCallback(
    (at: number) => {
      setLayer(null);
      scrollToPage(at);
    },
    [scrollToPage],
  );

  // The chevrons and arrow keys step through the gallery's photos first.
  const step = useCallback(
    (delta: 1 | -1) => {
      const move = stepFor(currentKey, galleryAt, galleryCount, delta);
      if ("photo" in move) setGalleryAt(move.photo);
      else turnPage(move.page);
    },
    [currentKey, galleryAt, galleryCount, turnPage],
  );

  // Escape closes a layer, or leaves; the arrow keys step. Never while a
  // field, the colour chooser or the full-screen gallery photo has them.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("input, textarea, select, [contenteditable='true'], [data-deck-keys='own']")) return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (layer) setLayer(null);
        else onExit();
      } else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        const delta = event.key === "ArrowRight" ? 1 : -1;
        if (layer) turnPage(delta);
        else step(delta);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [layer, onExit, step, turnPage]);

  function onScroll() {
    const box = pager.current;
    if (!box || box.clientWidth === 0) return;
    const next = Math.min(pages.length - 1, Math.max(0, Math.round(box.scrollLeft / box.clientWidth)));
    if (next !== index) {
      setIndex(next);
      setLayer(null);
    }
  }

  // What happens next reads back the option chosen on the price page, priced
  // as the price page prices it.
  // With Black Friday on, the regular total struck through before the
  // Black Friday one (lib/meeting/black-friday-state.ts).
  const recap = useMemo(() => {
    if (!meeting || !quote?.chosenOffer) return null;
    const offer = quoteOffers(quote).find((item) => item.id === quote.chosenOffer);
    if (!offer) return null;
    const deal = meeting.pricing.blackFriday;
    const price = offerPrice(quoteInputs(quote, meeting.pricing), offer, deal, !accepted && blackFridayOn(quote, deal));
    const totals = price.deal ?? price.regular;
    if (!totals || !price.regular || totals.totalFeet <= 0) return null;
    return recapParts(deck.words.lines, offer.name, price.regular.subtotal, price.deal ? price.deal.subtotal : null, meeting.pricing.gstEnabled);
  }, [meeting, quote, deck.words.lines, accepted]);
  // Every change to the quote keeps its Black Friday line as the button
  // says (an edit to the runs recomputes it); the accepted quote stays as
  // agreed.
  const changeQuote = useCallback(
    (next: QuoteUIState) => setQuote(accepted || !meeting ? next : settleBlackFriday(next, meeting.pricing)),
    [accepted, meeting],
  );

  const context = useMemo<DeckContextValue>(
    () => ({
      overlay,
      reduced,
      renderEmptySlot: fillEmpty ? renderEmptySlot : undefined,
      warm: warmWhiteOf(deck.looks),
      cool: coolWhiteOf(deck.looks),
    }),
    [overlay, reduced, fillEmpty, renderEmptySlot, deck.looks],
  );

  const moreOf = (key: string): MoreState => ({ open: layer === key, set: (open) => setLayer(open ? key : null) });

  function renderPage(page: DeckPage, at: number): ReactNode {
    const near = isNear(at, current);
    switch (page.key) {
      case "cover":
        return <CoverPage name={meeting?.lead.name ?? null} line={meeting ? coverLine(meeting.lead) : null} tagline={deck.words.lines.cover_line} />;
      case "what_vesper_is": {
        const main = jobs.main ?? (meeting?.mockupUrl ? { id: "main", name: "", url: meeting.mockupUrl, main: true, day: false, night: false, scene: false, offers: [] } : null);
        return main && meeting ? (
          <WhatVesperPage deck={deck} near={near} more={moreOf(page.key)} main={main} addressLine={meeting.lead.addressLine} onSwipe={turnPage} />
        ) : null;
      }
      case "hidden_by_day":
        return jobs.day && jobs.night ? <HiddenByDayPage deck={deck} near={near} more={moreOf(page.key)} day={jobs.day} night={jobs.night} /> : null;
      case "phone_control":
        return jobs.scenes.length > 0 ? <PhonePage deck={deck} near={near} scenes={jobs.scenes} /> : null;
      case "warranty":
        return (
          <WarrantyPage
            headline={deck.words.pages.warranty.headline}
            text={deck.warranty.text}
            serviceCallFee={deck.warranty.serviceCallFee}
            gstEnabled={deck.warranty.gstEnabled}
            more={moreOf(page.key)}
            moreLabel={deck.words.pages.warranty.moreLabel.trim() || undefined}
          />
        );
      case "quote":
        return meeting && quote ? (
          <QuoteScreen
            leadId={meeting.lead.id}
            pricing={meeting.pricing}
            colourKind={colour.kind}
            colourText={colour.text}
            state={quote}
            onChange={changeQuote}
            quoteId={quoteId}
            savedAt={savedAt}
            dirty={dirty}
            onSaved={(id, at, fingerprint) => {
              setQuoteId(id);
              setSavedAt(at);
              setSavedQuote(fingerprint);
            }}
            today={meeting.today}
            readOnly={readOnly}
            lines={deck.words.lines}
            edit={moreOf("quote")}
            breakdownLayer={moreOf("quote:breakdown")}
            initialsLayer={moreOf("quote:initials")}
            locked={accepted}
            mockups={meeting.mockups}
            initials={{
              draft: initialsDraft,
              onDraft: setInitialsDraft,
              onConfirmed: setConfirmation,
              confirmed: confirmedTonight(confirmation, meeting.today),
            }}
            onYes={() => {
              const to = pages.findIndex((item) => item.key === "next_steps");
              if (to >= 0) goTo(to);
            }}
          />
        ) : null;
      case "next_steps": {
        const today = meeting?.today ?? "";
        return (
          <NextStepsPage
            deck={deck}
            words={deck.words.pages.next_steps}
            lines={deck.words.lines}
            near={near}
            fillEmpty={fillEmpty}
            recap={recap}
            installOn={quote ? shownInstallDay(quote.installOn, today) : null}
            today={today}
            onInstallOn={
              meeting && quote && !accepted ? (day) => setQuote((now) => (now ? { ...now, installOn: day } : now)) : null
            }
            more={moreOf("next_steps")}
            dayLayer={moreOf("next_steps:day")}
          />
        );
      }
      // Left the order in round 10, and the light picker on 2026-11-11
      // (lib/deck.ts RETIRED_PAGES): never shown, traced or not.
      case "light_picker":
      case "gallery":
      case "your_house":
      case "mockup":
      case "whites_first":
      case "colour":
        return null;
    }
  }

  const onGallery = currentKey === "gallery";
  const canBack = current > 0 || (onGallery && galleryAt > 0);
  const canForward = current < pages.length - 1 || (onGallery && galleryAt < galleryCount - 1);
  // "Next: Hidden by day", right of the forward chevron, as wide as the row
  // leaves before the deck's 48 px edge; the page's name takes its own line.
  // The chevrons are 48 px discs (the iPad's tap size); bottomRowWidth
  // counts DECK_ROW.chevron, so the difference is added here.
  const next = nextLabelParts(pages, current, deck.words.lines);
  const nextName = next ? smartApostrophes([next.lead, next.page].filter(Boolean).join(" ")) : "Next";
  const halfRow = bottomRowWidth(pages.length) / 2 + (CHEVRON_PX - DECK_ROW.chevron);
  const nextRoom = `calc(50cqw - ${halfRow + 12 + 48}px)`;
  // Solid Night Background discs with a Night Text chevron, so they read the
  // same wherever they sit. One that can't move keeps its place, unseen, so
  // the dots never shift.
  const disc = "flex size-12 shrink-0 items-center justify-center rounded-full bg-background text-foreground";
  const photosAhead = onGallery && galleryAt < galleryCount - 1;
  const nextWords = next ? (
    <span data-testid="deck-next-label" className="flex flex-col text-[length:var(--deck-small)] leading-[1.1] text-muted-foreground" style={{ maxWidth: nextRoom }}>
      {next.lead ? <span className="whitespace-nowrap">{smartApostrophes(next.lead)}</span> : null}
      <span className="truncate">{smartApostrophes(next.page)}</span>
    </span>
  ) : null;

  return (
    <DeckContext.Provider value={context}>
      <div
        className={cn(ROOT_CLASS, className ?? "relative h-full w-full")}
        style={ROOT_STYLE}
        onContextMenu={(event) => {
          // No Save Image or text menu outside a field.
          if (!(event.target instanceof Element && event.target.closest("input, textarea"))) event.preventDefault();
        }}
      >
        <div
          ref={pager}
          onScroll={onScroll}
          aria-label="Meeting screens"
          className="flex h-full w-full snap-x snap-mandatory overflow-y-hidden overscroll-x-contain outline-none"
          // One finger pans sideways, never zooms the deck. While a layer is
          // open the pager is locked.
          style={{ touchAction: "pan-x", overflowX: layer ? "hidden" : "auto" }}
        >
          {pages.map((page, at) => (
            <section
              key={page.key}
              aria-label={page.label}
              data-page={page.key}
              inert={at !== current}
              className="relative h-full w-full shrink-0 snap-center snap-always overflow-hidden"
            >
              {renderPage(page, at)}
            </section>
          ))}
        </div>

        {/* Keenan's talking points for the page on screen: a quiet mark he
            presses and holds; never shown otherwise. */}
        {currentKey ? <TalkingPoints key={currentKey} text={deck.talking?.[currentKey] ?? null} /> : null}

        {/* Layers mount here: over the pages, under the way out and the dots. */}
        <div ref={setOverlay} className="pointer-events-none absolute inset-0 z-30 [&>*]:pointer-events-auto" />

        {/* The bottom row's middle: Previous, the dots, Next, on the same
            centre line as the bottom-right button, away from where hands
            hold the iPad. All of it hides while a layer is open (the pager
            is locked and Back is the way out). The chevrons hide on a phone,
            where a swipe does it. */}
        {!layer ? (
          <div
            data-deck-row="nav"
            className="pointer-events-none absolute inset-x-0 z-40 flex h-14 items-center justify-center gap-1.5"
            style={{ bottom: "var(--deck-row-bottom)" }}
          >
            <button
              type="button"
              aria-label="Previous"
              onClick={() => step(-1)}
              disabled={!canBack}
              aria-hidden={canBack ? undefined : true}
              tabIndex={canBack ? undefined : -1}
              className={cn(
                disc,
                "pointer-events-auto hidden touch-none outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring sm:flex",
                !canBack && "invisible",
              )}
            >
              <ChevronLeft aria-hidden="true" className="size-6" />
            </button>
            <ol aria-label="Where you are" className="pointer-events-auto flex rounded-full bg-background px-1">
              {pages.map((page, at) => (
                <li key={page.key}>
                  <button
                    type="button"
                    aria-label={page.label}
                    aria-current={at === current ? "true" : undefined}
                    onClick={() => goTo(at)}
                    className="flex size-9 touch-none items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring lg:h-11 lg:w-10"
                  >
                    <span className={cn("size-2 rounded-full", at === current ? "bg-foreground" : "bg-foreground/35")} />
                  </button>
                </li>
              ))}
            </ol>
            {/* Forward: one button holding the chevron and "Next: {page}",
                so the words are a tap target too. It keeps a 48 px slot in
                the row, so the dots stay centred, and the words hang off
                its right. On the gallery, while photos are left, the
                chevron steps through them and the words turn the page. */}
            <span className="relative hidden size-12 shrink-0 sm:flex">
              <span className="absolute top-0 left-0 flex items-center" style={{ width: "max-content" }}>
                {photosAhead ? (
                  <>
                    <button
                      type="button"
                      aria-label="Next photo"
                      onClick={() => step(1)}
                      className={cn(disc, "pointer-events-auto touch-none outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring")}
                    >
                      <ChevronRight aria-hidden="true" className="size-6" />
                    </button>
                    {next ? (
                      <button
                        type="button"
                        aria-label={nextName}
                        onClick={() => turnPage(1)}
                        className="pointer-events-auto ml-1 flex min-h-12 touch-none items-center rounded-md px-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        data-testid="deck-next"
                      >
                        {nextWords}
                      </button>
                    ) : null}
                  </>
                ) : (
                  <button
                    type="button"
                    aria-label={nextName}
                    onClick={() => step(1)}
                    disabled={!canForward}
                    aria-hidden={canForward ? undefined : true}
                    tabIndex={canForward ? undefined : -1}
                    className={cn(
                      "group pointer-events-auto flex min-h-12 touch-none items-center gap-3 rounded-full pr-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      !canForward && "invisible",
                    )}
                    data-testid="deck-next"
                  >
                    <span className={cn(disc, "group-hover:bg-muted")}>
                      <ChevronRight aria-hidden="true" className="size-6" />
                    </span>
                    {nextWords}
                  </button>
                )}
              </span>
            </span>
          </div>
        ) : null}

        {/* The way out: top left, in from the bezel so a hand holding the
            iPad by its corner doesn't rest on it, out of the customer's eye
            line. */}
        <div
          className="absolute z-50"
          style={{ top: "max(20px, env(safe-area-inset-top, 0px))", left: "max(20px, env(safe-area-inset-left, 0px))" }}
        >
          <ExitHold onExit={onExit} label={mode === "rehearsal" ? "Hold to leave the rehearsal" : "Hold to leave meeting mode"} />
        </div>
      </div>
    </DeckContext.Provider>
  );
}
