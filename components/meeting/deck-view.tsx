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

import { PickerPage } from "@/components/meeting/picker-page";
import { ColourPage, type Confirmation, type DeckColour } from "@/components/meeting/colour-page";
import { DeckContext, type DeckContextValue, type EmptySlotRenderer } from "@/components/meeting/deck-parts";
import {
  CoverPage,
  HiddenByDayPage,
  InstallDayPage,
  MockupPage,
  PhonePage,
  WarrantyPage,
  WhatVesperPage,
  WhitesPage,
  type MoreState,
} from "@/components/meeting/deck-pages";
import { ExitHold } from "@/components/meeting/exit-hold";
import { GalleryPage } from "@/components/meeting/gallery-page";
import { QuoteScreen } from "@/components/meeting/quote-screen";
import type { DeckPageKey } from "@/lib/deck";
import { CUSTOM_CHOICE, leadTrackColour, trackColourText } from "@/lib/leads/track-colour";
import { coolWhiteOf, warmWhiteOf } from "@/lib/lights/looks";
import {
  coverLine,
  DECK_SIZES,
  deckPages,
  entryOf,
  GALLERY_HERO_COUNT,
  galleryItems,
  isNear,
  startIndex,
  stepFor,
  type DeckPage,
} from "@/lib/meeting/deck-pages";
import {
  quoteFingerprint,
  startingPoint,
  type DeckPayload,
  type MeetingPayload,
  type MeetingStored,
  type PickerStored,
  type QuoteUIState,
} from "@/lib/meeting/state";
import { useReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";

// The deck (round 7, the settled spec): every page in the spec's order, swiped
// sideways, nothing internal anywhere. Always dark navy, whatever the
// device's theme. Meeting mode renders it for one lead; the rehearsal view
// renders the same deck under its own bar.
//
// CONTRACT
//   <Deck
//     deck             the deck's payload (MeetingPayload.deck, or the
//                      rehearsal's own loadDeckPayload with no lead)
//     meeting          the lead's whole payload; null with no lead (rehearsal
//                      only), which skips the picker, mockup, colour and price
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
// Layers (a page's More, the contact sheet, the colour chooser) mount inside
// the deck, so a frame smaller than the screen keeps them. The deck's root
// sets --deck-band (the band's and the picker tray's height) and the type
// sizes as CSS variables, in container units of the deck's own frame.

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
  "--deck-band": DECK_SIZES.band,
} as CSSProperties;

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

// The iPad's own copy lives in localStorage, which only the browser has. The
// server and the first browser render both show the cover; the deck then
// starts from that copy, so the two renders always agree.
export function Deck(props: DeckProps) {
  const inBrowser = useSyncExternalStore(subscribeNever, () => true, () => false);
  if (!inBrowser) {
    return (
      <div className={cn(ROOT_CLASS, props.className ?? "relative h-full w-full")} style={ROOT_STYLE}>
        <CoverPage line={props.meeting ? coverLine(props.meeting.lead) : null} />
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

  const pages = useMemo<DeckPage[]>(
    () => deckPages({ deck, lead: meeting ? { mockupUrl: meeting.mockupUrl } : null, fillEmpty }),
    [deck, meeting, fillEmpty],
  );
  const gallery = useMemo(() => galleryItems(deck, fillEmpty), [deck, fillEmpty]);
  const galleryCount = Math.min(gallery.length, GALLERY_HERO_COUNT);

  // Tonight, the Meetings page and the lead page open the deck with #start
  // (a fresh meeting, at the cover); prep's Draft the quote with #quote (on
  // the price page). A reload carries neither, so it picks up where it was.
  const [entry] = useState(() => entryOf(window.location.hash));
  const [start] = useState(() =>
    meeting ? startingPoint(meeting, persist ? readStored(meeting.lead.id) : null, Date.now(), entry === "start") : null,
  );
  const [startAt] = useState(() => {
    const asked = mode === "rehearsal" && startPage ? pages.findIndex((page) => page.key === startPage) : -1;
    return asked >= 0 ? asked : startIndex(pages, entry, { index: start?.index ?? 0, screenKey: start?.screenKey ?? null });
  });
  const [index, setIndex] = useState(startAt);
  const [settled, setSettled] = useState(true);
  const [layer, setLayer] = useState<DeckPageKey | null>(null);
  const [galleryAt, setGalleryAt] = useState(0);
  const [overlay, setOverlay] = useState<HTMLDivElement | null>(null);

  const [quote, setQuote] = useState<QuoteUIState | null>(start?.quote ?? null);
  const [quoteId, setQuoteId] = useState<string | null>(start?.quoteId ?? null);
  const [savedAt, setSavedAt] = useState<string | null>(start?.savedAt ?? null);
  const [savedQuote, setSavedQuote] = useState<string | null>(start?.savedQuote ?? null);
  const [initialsDraft, setInitialsDraft] = useState(start?.initialsDraft ?? "");
  const [picker, setPicker] = useState<PickerStored | null>(start?.picker ?? null);
  const [colour, setColour] = useState<DeckColour>(() =>
    meeting
      ? { kind: meeting.lead.colourKind, text: meeting.lead.colourText, choice: meeting.colours.choice, ralCode: meeting.colours.ralCode }
      : { kind: "none", text: "", choice: null, ralCode: null },
  );
  const [confirmation, setConfirmation] = useState<Confirmation>(() =>
    meeting?.lead.initials && meeting.lead.initialledAt ? { initials: meeting.lead.initials, at: meeting.lead.initialledAt } : null,
  );
  const dirty = quote !== null && (savedQuote === null || quoteFingerprint(quote) !== savedQuote);

  const pager = useRef<HTMLDivElement>(null);
  const indexRef = useRef(index);
  const settleTimer = useRef<number | undefined>(undefined);
  const current = Math.min(index, pages.length - 1);
  const currentKey = pages[current]?.key;

  useLayoutEffect(() => {
    indexRef.current = current;
  }, [current]);

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

  useEffect(() => () => window.clearTimeout(settleTimer.current), []);

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
      ...(picker ? { picker } : {}),
    });
  }, [persist, meeting, quote, quoteId, savedAt, initialsDraft, savedQuote, current, currentKey, picker]);

  const scrollToPage = useCallback(
    (at: number) => {
      const box = pager.current;
      if (!box || box.clientWidth === 0) return;
      const target = Math.min(pages.length - 1, Math.max(0, at));
      box.scrollTo({ left: target * box.clientWidth, behavior: reduced ? "instant" : "smooth" });
    },
    [pages.length, reduced],
  );

  // A page turn from code (a swipe on the picker's photo or the mockup, a
  // chevron, a key, a dot). Changing page closes any open layer.
  const turnPage = useCallback(
    (delta: number) => {
      const box = pager.current;
      if (!box || box.clientWidth === 0) return;
      setLayer(null);
      scrollToPage(Math.round(box.scrollLeft / box.clientWidth) + delta);
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
    setSettled(false);
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => setSettled(true), 150);
  }

  // A colour changed at the table: named on the iPad, asks for initials
  // again, and moves the quote's colour line to match.
  const onColourSaved = useCallback(
    (choice: string | null, ralCode: string | null) => {
      if (!meeting) return;
      const named = leadTrackColour(
        {
          track_colour_id: choice && choice !== CUSTOM_CHOICE ? choice : null,
          track_ral_code: choice === CUSTOM_CHOICE ? ralCode : null,
        },
        new Map(meeting.colours.list.map((item) => [item.id, item])),
        new Map(Object.entries(meeting.colours.ralNames)),
      );
      setColour({ kind: named.kind, text: trackColourText(named), choice, ralCode });
      setConfirmation(null);
      setQuote((now) =>
        now
          ? {
              ...now,
              colourTiming:
                named.kind === "custom" ? (now.colourTiming === "rush" ? "rush" : "factory_order") : named.kind === "list" ? "stock" : null,
            }
          : now,
      );
    },
    [meeting],
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

  const moreOf = (key: DeckPageKey): MoreState => ({ open: layer === key, set: (open) => setLayer(open ? key : null) });

  function renderPage(page: DeckPage, at: number): ReactNode {
    const near = isNear(at, current);
    const shared = { deck, near, more: moreOf(page.key), fillEmpty };
    switch (page.key) {
      case "cover":
        return <CoverPage line={meeting ? coverLine(meeting.lead) : null} />;
      case "what_vesper_is":
        return <WhatVesperPage {...shared} />;
      case "hidden_by_day":
        return <HiddenByDayPage {...shared} />;
      case "whites_first":
        return <WhitesPage {...shared} />;
      case "light_picker":
        return deck.picker && near ? (
          <PickerPage
            picker={deck.picker}
            looks={deck.looks}
            headline={deck.words.pages.light_picker.headline}
            words={deck.words.pages.light_picker.words}
            current={at === current && settled}
            stored={picker ?? undefined}
            onStored={setPicker}
            layerOpen={layer !== null}
            onSwipe={turnPage}
          />
        ) : null;
      case "phone_control":
        return <PhonePage {...shared} />;
      case "gallery":
        return (
          <GalleryPage
            words={deck.words.pages.gallery}
            items={gallery}
            at={galleryAt}
            near={near}
            sheetOpen={layer === "gallery"}
            onSheet={(open) => setLayer(open ? "gallery" : null)}
          />
        );
      case "install_day":
        return <InstallDayPage {...shared} />;
      case "warranty":
        return <WarrantyPage {...shared} />;
      case "mockup":
        return meeting?.mockupUrl ? (
          <MockupPage
            words={deck.words.pages.mockup}
            mockupUrl={meeting.mockupUrl}
            addressLine={meeting.lead.addressLine}
            near={near}
            onSwipe={turnPage}
          />
        ) : null;
      case "colour":
        return meeting ? (
          <ColourPage
            lead={meeting.lead}
            colour={colour}
            colours={meeting.colours}
            confirmation={confirmation}
            today={meeting.today}
            initialsDraft={initialsDraft}
            onInitialsDraft={setInitialsDraft}
            onConfirmed={setConfirmation}
            onColourSaved={onColourSaved}
            readOnly={readOnly}
          />
        ) : null;
      case "quote":
        return meeting && quote ? (
          <QuoteScreen
            leadId={meeting.lead.id}
            pricing={meeting.pricing}
            colourKind={colour.kind}
            colourText={colour.text}
            state={quote}
            onChange={setQuote}
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
          />
        ) : null;
    }
  }

  const onGallery = currentKey === "gallery";
  const canBack = current > 0 || (onGallery && galleryAt > 0);
  const canForward = current < pages.length - 1 || (onGallery && galleryAt < galleryCount - 1);
  const chevron =
    "absolute top-1/2 z-40 hidden size-11 -translate-y-1/2 touch-none items-center justify-center rounded-full bg-background/40 text-foreground/60 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring sm:inline-flex";

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

        {/* Layers mount here: over the pages, under the way out and the dots. */}
        <div ref={setOverlay} className="pointer-events-none absolute inset-0 z-30 [&>*]:pointer-events-auto" />

        {/* Quiet over navy, still findable over a bright photo. Hidden on a
            phone, where a swipe does it, and while a layer is open. */}
        {!layer && canBack ? (
          <button type="button" aria-label="Previous" onClick={() => step(-1)} className={cn(chevron, "left-2")}>
            <ChevronLeft className="size-6" />
          </button>
        ) : null}
        {!layer && canForward ? (
          <button type="button" aria-label="Next" onClick={() => step(1)} className={cn(chevron, "right-2")}>
            <ChevronRight className="size-6" />
          </button>
        ) : null}

        <div className="pointer-events-none absolute inset-x-0 bottom-[max(0.25rem,env(safe-area-inset-bottom))] z-40 flex justify-center">
          <ol aria-label="Where you are" className="pointer-events-auto flex rounded-full bg-background px-1">
            {pages.map((page, at) => (
              <li key={page.key}>
                <button
                  type="button"
                  aria-label={page.label}
                  aria-current={at === current ? "true" : undefined}
                  onClick={() => goTo(at)}
                  className="flex size-9 touch-none items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring lg:size-11"
                >
                  <span className={cn("size-2 rounded-full", at === current ? "bg-foreground" : "bg-foreground/35")} />
                </button>
              </li>
            ))}
          </ol>
        </div>

        {/* The way out: small, top left, out of the customer's eye line. */}
        <div className="absolute top-[max(0.5rem,env(safe-area-inset-top))] left-2 z-50">
          <ExitHold onExit={onExit} label={mode === "rehearsal" ? "Hold to leave the rehearsal" : "Hold to leave meeting mode"} />
        </div>
      </div>
    </DeckContext.Provider>
  );
}
