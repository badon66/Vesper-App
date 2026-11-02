"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { confirmColourInitials } from "@/app/(app)/meeting/actions";
import { DayNightSlider } from "@/components/meeting/day-night-slider";
import { PinchZoom } from "@/components/meeting/pinch-zoom";
import { QuoteScreen } from "@/components/meeting/quote-screen";
import { Wordmark } from "@/components/brand/wordmark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { labelFor, SOFFIT_OPTIONS } from "@/lib/leads/status";
import {
  quoteFingerprint,
  startingPoint,
  type MeetingPayload,
  type MeetingStored,
  type QuoteUIState,
} from "@/lib/meeting/state";
import type { PresentationKind } from "@/lib/presentation";
import { formatMoney } from "@/lib/pricing";
import { formatDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";

// Meeting mode (M5): the customer-facing deck. One idea per screen, swiped
// sideways, nothing internal anywhere. Always dark navy, whatever the
// device theme: this is the brand at dusk, and the customer is watching.

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

export function MeetingMode({ payload }: { payload: MeetingPayload }) {
  // The iPad's own copy lives in localStorage, which only the browser has.
  // The server and the first browser render both show the cover; the deck
  // then starts from that copy, so the two renders always agree.
  const inBrowser = useSyncExternalStore(subscribeNever, () => true, () => false);
  if (!inBrowser) {
    return (
      <div className="dark fixed inset-0 z-50 bg-background text-foreground">
        <CoverScreen lead={payload.lead} />
      </div>
    );
  }
  return <MeetingDeck payload={payload} />;
}

type Screen = { key: string; label: string; node: React.ReactNode };

function MeetingDeck({ payload }: { payload: MeetingPayload }) {
  const { lead, pricing } = payload;
  const pager = useRef<HTMLDivElement>(null);
  const [start] = useState(() => startingPoint(payload, readStored(lead.id), Date.now()));
  const [index, setIndex] = useState(start.index);
  const [quote, setQuote] = useState<QuoteUIState>(start.quote);
  const [quoteId, setQuoteId] = useState<string | null>(start.quoteId);
  const [savedAt, setSavedAt] = useState<string | null>(start.savedAt);
  const [savedQuote, setSavedQuote] = useState<string | null>(start.savedQuote);
  const [initialsDraft, setInitialsDraft] = useState(start.initialsDraft);
  const dirty = savedQuote === null || quoteFingerprint(quote) !== savedQuote;

  // Everything the meeting holds stays on the iPad as it changes.
  useEffect(() => {
    writeStored(lead.id, {
      version: 1,
      quote,
      quoteId,
      savedAt,
      initialsDraft,
      savedQuote,
      screen: { index, at: Date.now() },
    });
  }, [lead.id, quote, quoteId, savedAt, initialsDraft, savedQuote, index]);

  // Turn the page from code: the chevrons, the keys, and a swipe on the
  // mockup. Reads the pager itself, so it never works from a stale index.
  const goBy = useCallback((delta: number) => {
    const box = pager.current;
    if (!box || box.clientWidth === 0) return;
    const count = Math.round(box.scrollWidth / box.clientWidth);
    const current = Math.round(box.scrollLeft / box.clientWidth);
    const next = Math.min(count - 1, Math.max(0, current + delta));
    box.scrollTo({ left: next * box.clientWidth, behavior: "smooth" });
  }, []);

  const goTo = useCallback((next: number) => {
    const box = pager.current;
    if (box) box.scrollTo({ left: next * box.clientWidth, behavior: "smooth" });
  }, []);

  const screens = useMemo<Screen[]>(() => {
    const list: Screen[] = [];
    list.push({ key: "cover", label: "Vesper", node: <CoverScreen lead={lead} /> });
    for (const page of payload.pages) {
      if (page.kind === "hidden_by_day") {
        const [day, night] = page.images;
        if (!day || !night) continue;
        list.push({
          key: page.kind,
          label: page.title,
          node: (
            <div className="relative h-full w-full">
              <DayNightSlider dayUrl={day} nightUrl={night} />
              <PageCaption title={page.title} body={page.body} />
            </div>
          ),
        });
      } else if (page.kind === "gallery") {
        const urls = page.images.filter((url): url is string => Boolean(url));
        if (urls.length === 0) continue;
        list.push({ key: page.kind, label: page.title, node: <GalleryScreen title={page.title} urls={urls} /> });
      } else if (page.kind === "warranty") {
        list.push({
          key: page.kind,
          label: page.title,
          node: <WarrantyScreen title={page.title} text={payload.warrantyText} serviceCallFee={payload.serviceCallFee} />,
        });
      } else {
        list.push({ key: page.kind, label: page.title, node: <TextScreen kind={page.kind} title={page.title} body={page.body} /> });
      }
    }
    if (payload.mockupUrl) {
      list.push({
        key: "mockup",
        label: "This house",
        node: (
          <div className="relative h-full w-full">
            <PinchZoom src={payload.mockupUrl} alt={`${lead.addressLine}, with the lights on`} onSwipe={goBy} />
            <PageCaption title="This house" body="" />
          </div>
        ),
      });
    }
    list.push({
      key: "colour",
      label: "The colour",
      node: <ColourScreen lead={lead} initialsDraft={initialsDraft} onInitialsDraft={setInitialsDraft} />,
    });
    list.push({
      key: "quote",
      label: "The price",
      node: (
        <QuoteScreen
          leadId={lead.id}
          pricing={pricing}
          colourKind={lead.colourKind}
          colourText={lead.colourText}
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
          today={payload.today}
        />
      ),
    });
    return list;
  }, [payload, lead, pricing, quote, quoteId, savedAt, dirty, initialsDraft, goBy]);

  const current = Math.min(index, screens.length - 1);

  // Back to the screen it was on, without the slide.
  const resumeAt = Math.min(start.index, screens.length - 1);
  useEffect(() => {
    const box = pager.current;
    if (box && resumeAt > 0) box.scrollTo({ left: resumeAt * box.clientWidth, behavior: "instant" });
  }, [resumeAt]);

  function onScroll() {
    const box = pager.current;
    if (!box || box.clientWidth === 0) return;
    const next = Math.round(box.scrollLeft / box.clientWidth);
    if (next !== index) setIndex(next);
  }

  return (
    <div className="dark fixed inset-0 z-50 bg-background text-foreground">
      <div
        ref={pager}
        onScroll={onScroll}
        tabIndex={0}
        onKeyDown={(event) => {
          // Arrow keys belong to the field being typed in, not the deck.
          if ((event.target as HTMLElement).closest("input, textarea, select, [contenteditable='true']")) return;
          if (event.key === "ArrowRight") goBy(1);
          if (event.key === "ArrowLeft") goBy(-1);
        }}
        className="flex h-full w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain outline-none"
        aria-label="Meeting screens"
      >
        {screens.map((screen) => (
          <section key={screen.key} aria-label={screen.label} className="h-full w-full shrink-0 snap-center overflow-hidden">
            {screen.node}
          </section>
        ))}
      </div>

      {/* The way out: small and out of the customer's eye line. */}
      <Link
        href={`/app/leads/${lead.id}`}
        aria-label="Leave meeting mode"
        className="absolute top-[max(0.5rem,env(safe-area-inset-top))] left-2 z-20 inline-flex size-11 items-center justify-center rounded-md text-muted-foreground/50 outline-none hover:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="size-5" />
      </Link>

      {/* Quiet over navy, still findable over a bright day photo. */}
      {current > 0 ? (
        <button
          type="button"
          aria-label="Previous screen"
          onClick={() => goBy(-1)}
          className="absolute top-1/2 left-1 z-20 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-background/40 text-foreground/50 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronLeft className="size-6" />
        </button>
      ) : null}
      {current < screens.length - 1 ? (
        <button
          type="button"
          aria-label="Next screen"
          onClick={() => goBy(1)}
          className="absolute top-1/2 right-1 z-20 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-background/40 text-foreground/50 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight className="size-6" />
        </button>
      ) : null}

      <div className="absolute inset-x-0 bottom-[max(0.25rem,env(safe-area-inset-bottom))] z-20 flex justify-center">
        <ol aria-label="Where you are" className="flex rounded-full bg-background/50 px-1">
          {screens.map((screen, at) => (
            <li key={screen.key}>
              <button
                type="button"
                aria-label={screen.label}
                aria-current={at === current ? "true" : undefined}
                onClick={() => goTo(at)}
                className="flex size-9 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring lg:size-11"
              >
                <span className={cn("size-1.5 rounded-full", at === current ? "bg-primary" : "bg-foreground/40")} />
              </button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- screens

// The text pages share one frame, so the headline sits at the same height
// on every page and long words scroll instead of being cut off.
const PAGE_FRAME = "mx-auto flex h-full w-full max-w-4xl flex-col overflow-y-auto px-10 pt-[14vh] pb-20 lg:px-16";

function CoverScreen({ lead }: { lead: MeetingPayload["lead"] }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-8 text-center">
      <Wordmark className="text-4xl lg:text-5xl" />
      <p className="text-lg text-muted-foreground lg:text-xl">
        {lead.addressLine}
        {lead.neighbourhood ? `, ${lead.neighbourhood}` : ""}
      </p>
    </div>
  );
}

// A text page: the title talks, the body supports, Keenan narrates.
function TextScreen({ kind, title, body }: { kind: PresentationKind; title: string; body: string }) {
  const blocks = body.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  const steps =
    kind === "install_day" ? body.split(/\n+/).map((line) => line.trim()).filter(Boolean) : null;
  return (
    <div className={cn(PAGE_FRAME, "gap-8")}>
      <h2 className="text-4xl font-bold text-balance lg:text-6xl">{title}</h2>
      {steps ? (
        <ol className="flex flex-col gap-4">
          {steps.map((step, at) => (
            <li key={at} className="flex items-baseline gap-5 text-xl text-pretty lg:text-2xl">
              <span className="font-bold text-primary tabular-nums">{at + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      ) : (
        blocks.map((block, at) => (
          <p key={at} className="max-w-3xl text-xl leading-relaxed text-pretty whitespace-pre-line lg:text-2xl">
            {block}
          </p>
        ))
      )}
    </div>
  );
}

// A quiet plate over a photo: solid navy at 75%, no gradients, no glass.
// Title and body carry their own fitted plates, so a short title never
// leaves an empty slab hanging over the photo.
function PageCaption({ title, body }: { title: string; body: string }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-start gap-1 px-10 pt-10 lg:px-16">
      <h2 className="w-fit rounded-md bg-background/75 px-4 py-2 text-2xl font-bold lg:text-4xl">{title}</h2>
      {body ? (
        <p className="w-fit max-w-2xl rounded-md bg-background/75 px-4 py-2 text-base text-pretty text-muted-foreground lg:text-lg">
          {body}
        </p>
      ) : null}
    </div>
  );
}

function GalleryScreen({ title, urls }: { title: string; urls: string[] }) {
  const [at, setAt] = useState(0);
  const inner = useRef<HTMLDivElement>(null);
  return (
    <div className="relative h-full w-full">
      <div
        ref={inner}
        onScroll={() => {
          const box = inner.current;
          if (box && box.clientWidth > 0) setAt(Math.round(box.scrollLeft / box.clientWidth));
        }}
        className="flex h-full w-full snap-x snap-mandatory overflow-x-auto"
        aria-label={title}
      >
        {urls.map((url, which) => (
          // eslint-disable-next-line @next/next/no-img-element -- signed, cached for offline
          <img
            key={url}
            src={url}
            alt={`Install photo ${which + 1}`}
            crossOrigin="anonymous"
            className="h-full w-full shrink-0 snap-center object-cover"
            draggable={false}
          />
        ))}
      </div>
      <PageCaption title={title} body="" />
      {urls.length > 1 ? (
        <p aria-hidden="true" className="absolute right-4 bottom-14 rounded bg-background/70 px-2 py-0.5 text-xs font-semibold lg:bottom-16">
          {at + 1} / {urls.length}
        </p>
      ) : null}
    </div>
  );
}

function WarrantyScreen({ title, text, serviceCallFee }: { title: string; text: string; serviceCallFee: number | null }) {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  return (
    <div className={cn(PAGE_FRAME, "gap-8")}>
      <h2 className="text-4xl font-bold lg:text-6xl">{title}</h2>
      <ul className="flex flex-col gap-3">
        {lines.map((line, at) => (
          <li key={at} className="flex items-baseline gap-4 text-lg text-pretty lg:text-xl">
            <span aria-hidden="true" className="size-1.5 shrink-0 translate-y-[-0.2em] rounded-full bg-primary" />
            <span>{line}</span>
          </li>
        ))}
      </ul>
      {serviceCallFee !== null ? (
        <p className="text-base text-muted-foreground lg:text-lg">
          The service call fee in years 6 to 10 is {formatMoney(serviceCallFee)}.
        </p>
      ) : null}
    </div>
  );
}

// The colour, confirmed and initialled at every meeting: this screen exists
// because white track once went on an off-white soffit.
function ColourScreen({
  lead,
  initialsDraft,
  onInitialsDraft,
}: {
  lead: MeetingPayload["lead"];
  initialsDraft: string;
  onInitialsDraft: (value: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{ initials: string; at: string } | null>(
    lead.initials && lead.initialledAt ? { initials: lead.initials, at: lead.initialledAt } : null,
  );
  const soffit = lead.soffitColour
    ? lead.soffitColour === "other" && lead.soffitNote
      ? `Other: ${lead.soffitNote}`
      : labelFor(SOFFIT_OPTIONS, lead.soffitColour) || "Not answered yet"
    : "Not answered yet";
  const colourSet = lead.colourKind !== "none";
  const typed = initialsDraft.trim() !== "";

  async function confirm() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await confirmColourInitials(lead.id, initialsDraft);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      setConfirmed({ initials: initialsDraft.trim(), at: result.initialledAt });
      onInitialsDraft("");
    } catch {
      setMessage("No signal. The initials were not saved. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn(PAGE_FRAME, "gap-10")}>
      <h2 className="text-4xl font-bold lg:text-6xl">The colour</h2>
      <dl className="flex flex-col gap-6">
        <div>
          <dt className="text-base text-muted-foreground">Your soffit</dt>
          <dd className="text-2xl font-semibold lg:text-3xl">{soffit}</dd>
        </div>
        <div>
          <dt className="text-base text-muted-foreground">Your track colour</dt>
          <dd className="text-2xl font-semibold lg:text-3xl">{colourSet ? lead.colourText : "To be confirmed with Keenan"}</dd>
        </div>
      </dl>

      <div className="flex max-w-xl flex-col gap-3">
        <p className="text-base text-pretty text-muted-foreground">
          We confirm the colour together at every meeting, so the track on the house is the one you chose.
        </p>
        {confirmed ? (
          <p className="text-lg font-semibold" data-testid="colour-confirmed">
            Confirmed with initials {confirmed.initials}, {formatDateTime(confirmed.at)}.
          </p>
        ) : null}
        <div className="flex items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="colour-initials" className="text-sm font-semibold">
              {confirmed ? "Confirm again" : "Your initials"}
            </label>
            <Input
              id="colour-initials"
              value={initialsDraft}
              onChange={(event) => onInitialsDraft(event.target.value.toUpperCase())}
              maxLength={12}
              autoCapitalize="characters"
              autoComplete="off"
              disabled={!colourSet}
              className="w-32 text-center text-xl font-bold tracking-widest"
            />
          </div>
          <Button
            type="button"
            variant={typed ? "default" : "outline"}
            onClick={() => void confirm()}
            disabled={!colourSet || busy || !typed}
          >
            {busy ? "Saving" : "Confirm"}
          </Button>
        </div>
        {!colourSet ? (
          <p className="text-sm text-muted-foreground">The initials wait until the colour is set.</p>
        ) : null}
        {message ? (
          <p role="alert" className="text-sm font-semibold text-destructive">
            {message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
