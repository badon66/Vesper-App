"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { confirmColourInitials } from "@/app/(app)/meeting/actions";
import { DayNightSlider } from "@/components/meeting/day-night-slider";
import { PinchZoom } from "@/components/meeting/pinch-zoom";
import { QuoteScreen, defaultQuoteState, quoteStateFromDraft, type QuoteUIState } from "@/components/meeting/quote-screen";
import { Wordmark } from "@/components/brand/wordmark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { labelFor, SOFFIT_OPTIONS, type SoffitColour } from "@/lib/leads/status";
import type { PresentationKind } from "@/lib/presentation";
import { formatMoney } from "@/lib/pricing";
import { formatDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";

// Meeting mode (M5): the customer-facing deck. One idea per screen, swiped
// sideways, nothing internal anywhere. Always dark navy, whatever the
// device theme: this is the brand at dusk, and the customer is watching.

export type MeetingPayload = {
  lead: {
    id: string;
    name: string;
    firstName: string;
    addressLine: string;
    neighbourhood: string | null;
    soffitColour: SoffitColour | null;
    soffitNote: string | null;
    colourKind: "none" | "list" | "custom";
    colourText: string;
    initials: string | null;
    initialledAt: string | null;
  };
  pages: { kind: PresentationKind; title: string; body: string; images: (string | null)[] }[];
  warrantyText: string;
  serviceCallFee: number | null;
  mockupUrl: string | null;
  pricing: {
    pricePerFt: number;
    boxPrice: number;
    neighbourDiscount: number;
    gstEnabled: boolean;
    gstRate: number;
    gstNumber: string | null;
    rushFeePerFt: number | null;
    quoteValidDays: number;
  };
  draft: {
    quoteId: string;
    runs: unknown;
    boxCount: number;
    pricePerFt: number;
    boxPrice: number;
    adders: unknown;
    discounts: unknown;
    colourTiming: string | null;
    financingOffered: boolean;
    validUntil: string | null;
    updatedAt: string;
  } | null;
  today: string;
};

// What the iPad keeps between reloads: the quote as it stands, and the
// initials typed but not yet saved. Weak signal never loses either.
type Stored = { version: 1; quote: QuoteUIState; quoteId: string | null; savedAt: string | null; initialsDraft: string };
const storageKey = (leadId: string) => `vesper.meeting.${leadId}`;

function readStored(leadId: string): Stored | null {
  try {
    const raw = window.localStorage.getItem(storageKey(leadId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Stored;
    return parsed.version === 1 ? parsed : null;
  } catch {
    return null;
  }
}

export function writeStored(leadId: string, value: Stored) {
  try {
    window.localStorage.setItem(storageKey(leadId), JSON.stringify(value));
  } catch {
    // Private mode: the meeting still works, it just forgets on reload.
  }
}

type Screen = { key: string; label: string; node: React.ReactNode };

export function MeetingMode({ payload }: { payload: MeetingPayload }) {
  const { lead, pricing } = payload;
  const pager = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const stored = useMemo(() => (typeof window === "undefined" ? null : readStored(lead.id)), [lead.id]);

  const [quote, setQuote] = useState<QuoteUIState>(() =>
    stored?.quote ?? (payload.draft ? quoteStateFromDraft(payload.draft, payload) : defaultQuoteState(payload)),
  );
  const [quoteId, setQuoteId] = useState<string | null>(stored?.quoteId ?? payload.draft?.quoteId ?? null);
  const [savedAt, setSavedAt] = useState<string | null>(stored?.savedAt ?? payload.draft?.updatedAt ?? null);
  const [initialsDraft, setInitialsDraft] = useState(stored?.initialsDraft ?? "");

  // Everything the meeting holds stays on the iPad as it changes.
  useEffect(() => {
    writeStored(lead.id, { version: 1, quote, quoteId, savedAt, initialsDraft });
  }, [lead.id, quote, quoteId, savedAt, initialsDraft]);

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
            <PinchZoom src={payload.mockupUrl} alt={`${lead.addressLine}, with the lights on`} />
            <PageCaption title="This house" body="" />
          </div>
        ),
      });
    }
    list.push({
      key: "colour",
      label: "The colour",
      node: (
        <ColourScreen
          lead={lead}
          initialsDraft={initialsDraft}
          onInitialsDraft={setInitialsDraft}
        />
      ),
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
          onSaved={(id, at) => {
            setQuoteId(id);
            setSavedAt(at);
          }}
          today={payload.today}
        />
      ),
    });
    return list;
  }, [payload, lead, pricing, quote, quoteId, savedAt, initialsDraft]);

  const goTo = useCallback((next: number) => {
    const box = pager.current;
    if (!box) return;
    box.scrollTo({ left: next * box.clientWidth, behavior: "smooth" });
  }, []);

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
          if (event.key === "ArrowRight") goTo(Math.min(screens.length - 1, index + 1));
          if (event.key === "ArrowLeft") goTo(Math.max(0, index - 1));
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

      {index > 0 ? (
        <button
          type="button"
          aria-label="Previous screen"
          onClick={() => goTo(index - 1)}
          className="absolute top-1/2 left-1 z-20 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground/40 outline-none hover:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronLeft className="size-6" />
        </button>
      ) : null}
      {index < screens.length - 1 ? (
        <button
          type="button"
          aria-label="Next screen"
          onClick={() => goTo(index + 1)}
          className="absolute top-1/2 right-1 z-20 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground/40 outline-none hover:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight className="size-6" />
        </button>
      ) : null}

      <ol aria-label="Where you are" className="absolute inset-x-0 bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-20 flex justify-center gap-2">
        {screens.map((screen, at) => (
          <li key={screen.key}>
            <button
              type="button"
              aria-label={screen.label}
              aria-current={at === index ? "true" : undefined}
              onClick={() => goTo(at)}
              className="flex size-6 items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className={cn("size-1.5 rounded-full", at === index ? "bg-primary" : "bg-muted-foreground/40")} />
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------- screens

function CoverScreen({ lead }: { lead: MeetingPayload["lead"] }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-8 text-center">
      <Wordmark className="text-4xl lg:text-5xl" />
      <p className="text-xl text-muted-foreground lg:text-2xl">Permanent roofline lighting</p>
      <p className="text-base text-muted-foreground/70">
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
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col justify-center gap-8 px-10 lg:px-16">
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
function PageCaption({ title, body }: { title: string; body: string }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 flex px-10 pt-10 lg:px-16">
      <div className="rounded-md bg-background/75 px-4 py-3">
        <h2 className="text-2xl font-bold lg:text-4xl">{title}</h2>
        {body ? <p className="mt-1 max-w-2xl text-base text-pretty text-muted-foreground lg:text-lg">{body}</p> : null}
      </div>
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
          <img key={url} src={url} alt={`Install photo ${which + 1}`} className="h-full w-full shrink-0 snap-center object-cover" draggable={false} />
        ))}
      </div>
      <PageCaption title={title} body="" />
      {urls.length > 1 ? (
        <p aria-hidden="true" className="absolute right-4 bottom-10 rounded bg-background/70 px-2 py-0.5 text-xs font-semibold">
          {at + 1} / {urls.length}
        </p>
      ) : null}
    </div>
  );
}

function WarrantyScreen({ title, text, serviceCallFee }: { title: string; text: string; serviceCallFee: number | null }) {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  return (
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col justify-center gap-8 px-10 lg:px-16">
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
      setMessage("No signal. The initials were not saved; try again before they leave.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col justify-center gap-10 px-10 lg:px-16">
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
          <Button type="button" onClick={() => void confirm()} disabled={!colourSet || busy || initialsDraft.trim() === ""}>
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
