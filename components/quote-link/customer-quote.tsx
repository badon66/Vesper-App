"use client";

import { Check, Loader2, Maximize2, MessageSquare, Phone, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bookInstall, recordVisit, saveSelection } from "@/app/q/[token]/actions";
import { PinchZoom } from "@/components/meeting/pinch-zoom";
import { Disclosure } from "@/components/quote-link/disclosure";
import { HouseDiagram, SEGMENT_CROPS, WHOLE_HOUSE, type Crop } from "@/components/quote-link/house-diagram";
import { useCountTo } from "@/components/quote-link/motion";
import { PointIconMark } from "@/components/quote-link/point-icon";
import { ClosedQuote, ContactButtons } from "@/components/quote-link/quote-shell";
import { DialogPanel } from "@/components/ui/dialog-panel";
import { formatMoney, screenTotal, type QuoteLine } from "@/lib/pricing";
import { HOUSE_SEGMENTS, segmentsFor, segmentStates, type HouseSegment, type SegmentState } from "@/lib/quote-link/house";
import {
  customerChoice,
  customerChoiceInSentence,
  christmasSeason,
  lineAmount,
  optionName,
  phoneHref,
  priceHoldPassed,
  priceSelection,
  runName,
  smsWithBody,
  type CustomerQuote,
} from "@/lib/quote-link/view";
import { calgaryDateOf, formatFullDate, formatLongDay } from "@/lib/time";
import { cn } from "@/lib/utils";

// The customer's quote (Keenan, 2026-11-02; reworked 2026-11-04 as a sales
// page, phone first, settled by debate in decisions.md). Top to bottom:
// their house and price, the Christmas banner, what they're getting, their
// lights on a house diagram, Start smaller, track colour, three things to
// tap open, and a bar that stays put with Call, Text and Book my install.
// Prices come from lib/pricing.ts over the quote's own stored prices; the
// page never sends a price anywhere. One total follows their switches.

type View = CustomerQuote & { mockupUrl: string | null; galleryUrls: string[] };
type Booked = { at: string; option: string };

const FAILED = "That didn’t go through. Check your signal and try again, or call or text us.";
const SLOW = "Still sending. If it doesn’t go through, call or text us.";

export function CustomerQuoteView({ token, view }: { token: string; view: View }) {
  const { quote } = view;
  // The runs with feet are the parts of the job; positions stay the quote's own.
  const parts = useMemo(
    () => quote.runs.map((run, at) => ({ run, at })).filter(({ run }) => Math.round(run.feet) > 0),
    [quote.runs],
  );
  const serverBooked: Booked | null = view.bookedAt && view.bookedOption ? { at: view.bookedAt, option: view.bookedOption } : null;
  const [booked, setBooked] = useState<Booked | null>(serverBooked);

  // The page opens at the full quote. Once they have asked to book, it
  // opens at their latest choice, so the page matches what they asked for.
  const [on, setOn] = useState<Set<number>>(() => {
    const saved = serverBooked ? (view.selection?.filter((at) => parts.some((part) => part.at === at)) ?? []) : [];
    return new Set(saved.length > 0 ? saved : parts.map((part) => part.at));
  });
  const allOn = parts.every(({ at }) => on.has(at));
  const positionsKey = allOn ? "all" : parts.filter(({ at }) => on.has(at)).map(({ at }) => at).join(",");
  const positions = useMemo(
    () => (positionsKey === "all" ? null : positionsKey.split(",").map(Number)),
    [positionsKey],
  );

  const full = useMemo(() => priceSelection(quote, null), [quote]);
  const current = useMemo(() => priceSelection(quote, positions), [quote, positions]);
  const option = optionName(quote.runs, positions);
  const total = screenTotal(current.subtotal, quote.gstEnabled);
  const minimum = quote.minJobTotal && quote.minJobTotal > 0 ? quote.minJobTotal : null;
  const atMinimum = current.minimumApplied && minimum !== null;
  const holdPassed = priceHoldPassed(view.validUntil, view.today);
  const states = useMemo(
    () => segmentStates(parts.map(({ run, at }) => ({ run, on: on.has(at) }))),
    [parts, on],
  );

  const [phase, setPhase] = useState<"quote" | "confirm" | "sending" | "thanks" | "closed">("quote");
  const [thanks, setThanks] = useState<{ option: string; total: string; preview: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  const sending = phase === "sending";
  const heading = useRef<HTMLHeadingElement>(null);
  const smallerHeading = useRef<HTMLHeadingElement>(null);
  // When the confirm step opened. Its Yes sits right where Book my install
  // was, so a quick second tap would land on it; taps in the first half
  // second are ignored (the critique, 2026-11-04).
  const confirmOpenedAt = useRef(0);
  // When the press on Yes began: a press that starts in that first half
  // second doesn't count even if it lifts after it.
  const yesPressedAt = useRef(0);

  // A visit, once per opening, even when React runs the effect twice.
  // Keenan's own visits are left out on the server.
  const visited = useRef(false);
  useEffect(() => {
    if (visited.current) return;
    visited.current = true;
    void recordVisit(token).catch(() => undefined);
  }, [token]);

  // Their choice, saved a moment after they stop switching (for Keenan's
  // card). After they've asked to book, only a new booking changes it, so
  // a return visit opens at what they booked.
  const firstChoice = useRef(true);
  const hasBooked = booked !== null;
  useEffect(() => {
    if (firstChoice.current) {
      firstChoice.current = false;
      return;
    }
    if (hasBooked) return;
    const timer = window.setTimeout(() => {
      void saveSelection(token, positions ?? []).catch(() => undefined);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [token, positions, hasBooked]);

  // A screen reader hears the new total once, when the switching settles,
  // never the counting digits.
  const [announced, setAnnounced] = useState("");
  const firstTotal = useRef(true);
  useEffect(() => {
    if (firstTotal.current) {
      firstTotal.current = false;
      return;
    }
    const timer = window.setTimeout(() => setAnnounced(`Total now ${total}`), 500);
    return () => window.clearTimeout(timer);
  }, [total]);

  // A send that takes long says so, instead of a silent "Sending".
  useEffect(() => {
    if (!sending) return;
    const timer = window.setTimeout(() => setSlow(true), 8000);
    return () => window.clearTimeout(timer);
  }, [sending]);

  async function book() {
    setPhase("sending");
    setError(null);
    setSlow(false);
    try {
      const result = await bookInstall(token, positions ?? []);
      if (result.ok) {
        if (!result.preview) setBooked({ at: new Date().toISOString(), option: result.option });
        setThanks({ option: result.option, total: result.total, preview: Boolean(result.preview) });
        setPhase("thanks");
        window.scrollTo({ top: 0 });
      } else if (result.code === "closed") {
        setPhase("closed");
        window.scrollTo({ top: 0 });
      } else {
        setError(result.message);
        setPhase("quote");
      }
    } catch {
      setError(FAILED);
      setPhase("quote");
    } finally {
      setSlow(false);
    }
  }

  // Back from the thank-you, focus lands on the greeting, not lost.
  const backToQuote = useCallback(() => {
    setPhase("quote");
    window.requestAnimationFrame(() => heading.current?.focus());
  }, []);

  if (phase === "closed") return <ClosedQuote company={view.company} />;
  if (phase === "thanks" && thanks) {
    return <ThankYou firstName={view.firstName} thanks={thanks} company={view.company} onBack={backToQuote} />;
  }

  const onlyOne = on.size === 1;
  const matchesBooked = booked !== null && booked.option === option;
  const toggle = (at: number) => {
    if (sending) return;
    setOn((now) => {
      const next = new Set(now);
      if (next.has(at)) {
        if (next.size > 1) next.delete(at);
      } else {
        next.add(at);
      }
      return next;
    });
  };
  const switchAllOn = () => {
    setOn(new Set(parts.map((part) => part.at)));
    window.requestAnimationFrame(() => smallerHeading.current?.focus());
  };
  const textHref = smsWithBody(view.company.phone, `Hi Keenan, a question about the quote for ${view.address}: `);
  const minimumWords = minimum ? <MinimumWords minimum={minimum} /> : null;

  return (
    <>
      <main className="mx-auto flex max-w-xl flex-col pb-36" data-testid="quote-live">
        {/* 1. Their house and their price. */}
        <section aria-labelledby="quote-for" className="flex flex-col">
          {view.mockupUrl ? <Mockup url={view.mockupUrl} /> : null}
          <div className="flex flex-col px-5 pt-6">
            <h1 id="quote-for" ref={heading} tabIndex={-1} className="text-2xl font-bold text-balance outline-none">
              {view.firstName.trim() ? `${view.firstName.trim()}, here’s your quote` : "Here’s your quote"}
            </h1>
            <p className="mt-3 text-[2.75rem] leading-none font-bold tracking-tight" data-testid="hero-total">
              <CountedTotal subtotal={current.subtotal} gstEnabled={quote.gstEnabled} />
            </p>
            {!allOn ? (
              <p className="mt-2 text-sm text-muted-foreground tabular-nums" data-testid="hero-full">
                Full quote {screenTotal(full.subtotal, quote.gstEnabled)}
              </p>
            ) : null}
            <PriceHold validUntil={view.validUntil} passed={holdPassed} className="mt-2" />
            <ul className="mt-4 flex flex-col gap-1 text-base" data-testid="quote-promises">
              <li className="font-semibold">No payment until your install is complete.</li>
              <li>
                Financing is available.{" "}
                <a
                  href={smsWithBody(view.company.phone, "Hi Keenan, can you tell me about financing?")}
                  className="-my-3 inline-block py-3 font-semibold underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Just ask.
                </a>
              </li>
            </ul>
          </div>
        </section>

        {booked ? (
          <p role="status" className="mx-5 mt-6 rounded-md border px-4 py-3 text-base text-pretty" data-testid="quote-booked-before">
            On {formatLongDay(calgaryDateOf(booked.at))} you asked us to book your install:{" "}
            {customerChoiceInSentence(booked.option)}. Keenan will be in touch to set the date.
          </p>
        ) : null}

        {/* 2. A reason to act now, while Keenan has it on (September 1 to November 30). */}
        {view.christmas ? (
          <section aria-label="Christmas" className="mt-6 bg-accent px-5 py-5" data-testid="quote-christmas">
            <p className="text-base font-semibold text-pretty">{view.christmas.title}</p>
            {view.christmas.text ? <p className="mt-1 text-base text-pretty">{view.christmas.text}</p> : null}
          </section>
        ) : null}

        {/* 3. What makes it worth it, in Keenan's words from Settings. */}
        {view.productPoints.length > 0 ? (
          <section aria-labelledby="getting" className="mt-12 px-5">
            <h2 id="getting" className="text-xl font-bold">
              What you’re getting
            </h2>
            <ul className="mt-5 flex flex-col gap-4" data-testid="quote-points">
              {view.productPoints.map((point, at) => (
                <li key={at} className="flex gap-3.5">
                  <PointIconMark icon={point.icon} className="mt-0.5 size-5 shrink-0 text-navy" />
                  <span className="text-base text-pretty">{point.text}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* 4. Their lights, and where they go on a house. */}
        {parts.length > 0 ? (
          <section aria-labelledby="your-lights" className="mt-12 px-5">
            <h2 id="your-lights" className="text-xl font-bold">
              Your lights
            </h2>
            <ul className="mt-3 flex flex-col text-base" data-testid="quote-runs">
              {parts.map(({ run, at }) => (
                <li
                  key={at}
                  className={cn(
                    "flex items-baseline justify-between gap-4 py-1 transition-colors duration-200",
                    !on.has(at) && "text-muted-foreground",
                  )}
                >
                  <span className="min-w-0 text-pretty">{runName(run, at)}</span>
                  <span className="shrink-0 tabular-nums">{Math.round(run.feet)} ft</span>
                </li>
              ))}
            </ul>
            <div className="mt-2">
              <Disclosure title="What do these mean?" variant="inline" testId="quote-explainer">
                <PartsExplained />
              </Disclosure>
            </div>
            <figure className="mt-4" data-testid="quote-house">
              <HouseDiagram states={states} />
              <figcaption className="mt-2 text-sm text-muted-foreground">Gold marks your lights.</figcaption>
            </figure>
          </section>
        ) : null}

        {/* 5. Start smaller, with the price line by line, under the house. */}
        <section aria-labelledby="start-smaller" className="mt-8 px-5">
          <h2 id="start-smaller" ref={smallerHeading} tabIndex={-1} className="text-xl font-bold outline-none">
            {parts.length > 1 ? "Start smaller" : "Your price"}
          </h2>
          {parts.length > 1 ? (
            <>
              <p className="mt-1 text-pretty text-muted-foreground">Switch off any part you’d like to leave for later.</p>
              <ul className="mt-4 flex flex-col divide-y border-t border-b-2 border-b-navy" data-testid="start-smaller">
                {parts.map(({ run, at }) => {
                  const isOn = on.has(at);
                  const locked = isOn && onlyOne;
                  return (
                    <li key={at}>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={isOn}
                        aria-disabled={locked || sending}
                        aria-describedby={locked ? "smaller-hint" : undefined}
                        aria-label={`${runName(run, at)}, ${Math.round(run.feet)} feet`}
                        onClick={() => toggle(at)}
                        className="flex min-h-[3.25rem] w-full items-center gap-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                      >
                        <RunMark run={run} on={isOn} />
                        <span className={cn("min-w-0 flex-1 text-pretty transition-colors duration-200", !isOn && "text-muted-foreground")}>
                          <span className="font-medium">{runName(run, at)}</span>
                          <span className="ml-2 text-base text-muted-foreground tabular-nums">{Math.round(run.feet)} ft</span>
                        </span>
                        <span
                          aria-hidden="true"
                          className={cn(
                            "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 transition-colors duration-150",
                            isOn ? "border-navy bg-navy" : "border-input bg-background",
                          )}
                        >
                          <span
                            className={cn(
                              "quote-switch-thumb size-5 rounded-full",
                              isOn ? "translate-x-[1.375rem] bg-white" : "translate-x-0.5 bg-input",
                            )}
                          />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {onlyOne ? (
                <p id="smaller-hint" className="mt-2 text-sm text-muted-foreground">
                  At least one part stays in.
                </p>
              ) : null}
            </>
          ) : null}

          {/* The total sits right under the switches, so a flip and its new
              figure share the screen; the lines that make it up follow. */}
          <div className={cn("flex items-baseline justify-between gap-4 pt-3", parts.length > 1 ? "mt-1" : "mt-4 border-t-2 border-navy")}>
            <span className="text-lg font-bold">Total</span>
            <span className="text-3xl font-bold tracking-tight" data-testid="smaller-total">
              <CountedTotal subtotal={current.subtotal} gstEnabled={quote.gstEnabled} />
            </span>
          </div>
          <div className="quote-row" data-shown={atMinimum} aria-hidden={!atMinimum}>
            <div>
              {/* Keenan's words, at the total; the box keeps it calm, never red. */}
              <div className="mt-3 rounded-md border px-4 py-3" data-testid="minimum-note">
                {minimumWords}
              </div>
            </div>
          </div>
          {parts.length > 1 && !allOn ? (
            <button
              type="button"
              onClick={switchAllOn}
              className="mt-2 inline-flex min-h-11 items-center self-start text-base font-semibold underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-testid="switch-all-on"
            >
              Switch all back on
            </button>
          ) : null}
          <Breakdown full={full.lines} current={current.lines} beforeMinimum={current.beforeMinimum} totalSubtotal={current.subtotal} gstEnabled={quote.gstEnabled} />
          <p aria-live="polite" className="sr-only">
            {announced}
          </p>
        </section>

        {/* 6. Track colour, in Keenan's words. */}
        <section aria-labelledby="track-colour" className="mt-12 px-5">
          <h2 id="track-colour" className="text-xl font-bold">
            Track colour
          </h2>
          {quote.trackColourName ? (
            <p className="mt-3 font-semibold" data-testid="quote-colour">
              Your colour: {quote.trackColourName}.
            </p>
          ) : null}
          <p className="mt-2 text-pretty">
            White is our stock colour. It costs nothing extra and fits this season’s schedule.
          </p>
          <p className="mt-2 text-pretty" data-testid="quote-colour-rush">
            <TrackColourOptions
              season={christmasSeason(view.today)}
              rushFee={quote.rushFee !== null && quote.rushFee > 0 ? quote.rushFee : null}
              rush={quote.colourTiming === "rush"}
            />
          </p>
        </section>

        {/* 7. Tap to open, closed until tapped. See our work leads once
            there are photos; until then it is hidden. */}
        <section aria-label="More about your install" className="mt-12 border-t" data-testid="quote-more">
          {view.galleryUrls.length > 0 ? (
            <Disclosure title="See our work" meta={`${view.galleryUrls.length} ${view.galleryUrls.length === 1 ? "photo" : "photos"}`} testId="quote-gallery">
              <ul className="flex flex-col gap-3">
                {view.galleryUrls.map((url, at) => (
                  <li key={url}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- Vesper's own photos behind ten-minute signed links */}
                    <img src={url} alt={`A Vesper install, photo ${at + 1}`} loading="lazy" className="block aspect-[3/2] w-full rounded-md bg-muted object-cover" />
                  </li>
                ))}
              </ul>
            </Disclosure>
          ) : null}
          {view.warranty.trim() ? (
            <Disclosure title="Warranty" testId="quote-warranty">
              <ul className="flex flex-col gap-2.5 text-base text-pretty">
                {view.warranty
                  .split(/\n+/)
                  .map((line) => line.trim())
                  .filter(Boolean)
                  .map((line, at) => (
                    <li key={at} className="flex gap-3">
                      <span aria-hidden="true" className="mt-2.5 size-1.5 shrink-0 rounded-full bg-navy/50" />
                      <span>{line}</span>
                    </li>
                  ))}
              </ul>
              {view.serviceCallFee ? (
                <p className="mt-4 font-semibold" data-testid="quote-service-call">
                  Service call fee for years 6 to 10: {formatMoney(view.serviceCallFee)}
                </p>
              ) : null}
            </Disclosure>
          ) : null}
          {view.installDay ? (
            <Disclosure title={view.installDay.title} testId="quote-install-day">
              <div className="flex flex-col gap-2.5 text-base text-pretty">
                {view.installDay.body
                  .split(/\n+/)
                  .map((line) => line.trim())
                  .filter(Boolean)
                  .map((line, at) => (
                    <p key={at}>{line}</p>
                  ))}
              </div>
            </Disclosure>
          ) : null}
        </section>

        <footer className="mt-10 flex flex-col gap-1 px-5 text-sm text-pretty text-muted-foreground" data-testid="quote-footer">
          <p className="font-semibold text-foreground">{view.company.name}</p>
          <p>{view.company.address}</p>
          <a
            href={phoneHref(view.company.phone, "tel")}
            className="-mx-1 inline-flex min-h-11 items-center self-start rounded-sm px-1 text-foreground tabular-nums underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {view.company.phone}
          </a>
          <a
            href={`mailto:${view.company.email}?subject=${encodeURIComponent("My Vesper quote")}`}
            className="-mx-1 inline-flex min-h-11 items-center self-start rounded-sm px-1 text-foreground underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {view.company.email}
          </a>
        </footer>
      </main>

      {/* 8. The bar that stays put. */}
      <BookBar
        callHref={phoneHref(view.company.phone, "tel")}
        textHref={textHref}
        booked={matchesBooked}
        update={booked !== null && !matchesBooked}
        sending={sending}
        slow={slow}
        error={error}
        onBook={() => {
          setError(null);
          confirmOpenedAt.current = performance.now();
          yesPressedAt.current = 0;
          setPhase("confirm");
        }}
      />

      <DialogPanel
        open={phase === "confirm"}
        onClose={() => setPhase("quote")}
        title={booked ? "Update your choice?" : "Book your install?"}
        testId="book-confirm"
        actions={
          <>
            <button
              type="button"
              onClick={() => setPhase("quote")}
              className="inline-flex h-12 items-center rounded-md border border-input px-5 text-base font-semibold outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            >
              Back
            </button>
            <button
              type="button"
              onPointerDown={() => {
                yesPressedAt.current = performance.now();
              }}
              onClick={() => {
                // A keyboard press has no pointer down: its click is the press.
                const pressed = yesPressedAt.current > confirmOpenedAt.current ? yesPressedAt.current : performance.now();
                yesPressedAt.current = 0;
                if (pressed - confirmOpenedAt.current < 500) return;
                void book();
              }}
              className="inline-flex h-12 items-center rounded-md bg-primary px-5 text-base font-semibold text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {booked ? "Yes, update it" : "Yes, book my install"}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-4 text-base">
          <dl className="flex flex-col divide-y rounded-md border">
            <div className="flex flex-col gap-0.5 px-4 py-3">
              <dt className="text-sm font-semibold text-muted-foreground">Your choice</dt>
              <dd className="font-semibold text-pretty" data-testid="confirm-option">
                {customerChoice(option)}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5 px-4 py-3">
              <dt className="text-sm font-semibold text-muted-foreground">Total</dt>
              <dd className="text-xl font-bold tabular-nums" data-testid="confirm-total">
                {total}
              </dd>
            </div>
          </dl>
          {holdPassed && view.validUntil ? (
            <p className="font-semibold text-pretty">
              Prices may have changed since {formatFullDate(view.validUntil)}. We’ll confirm before booking.
            </p>
          ) : null}
          <p className="text-pretty">
            There’s nothing to sign or pay today. Keenan will be in touch to set your install date and go through the
            agreement.
          </p>
        </div>
      </DialogPanel>
    </>
  );
}

// The other colours, in Keenan's words. From September 1 to November 30 the
// rush colour fee is "to have it before Christmas". From December 1 nothing
// promises Christmas: the spring option only, colour matching included; a
// quote Keenan priced for this season still names its fee, "to have it
// sooner", so the line never contradicts their own breakdown (Keenan,
// 2026-11-05). A fee that isn't set drops its clause.
function TrackColourOptions({ season, rushFee, rush }: { season: boolean; rushFee: number | null; rush: boolean }) {
  if (season) {
    return (
      <>
        Any other colour is powder coated: nothing extra if it can wait for spring
        {rushFee !== null ? `, or the ${formatMoney(rushFee)} rush colour fee to have it before Christmas` : ""}.
      </>
    );
  }
  if (rush && rushFee !== null) {
    return <>Any other colour is powder coated: nothing extra if it can wait for spring, or the {formatMoney(rushFee)} rush colour fee to have it sooner.</>;
  }
  return <>Any other colour is powder coated for a spring install, with colour matching included at no extra cost.</>;
}

// Keenan's two lines for a choice under the minimum, word for word.
function MinimumWords({ minimum }: { minimum: number }) {
  return (
    <>
      <p className="font-semibold text-pretty">
        That’s under our {formatMoney(minimum)} minimum, so this option comes to {formatMoney(minimum)}.
      </p>
      <p className="mt-1 text-pretty text-muted-foreground">
        Need a repair or something smaller? Call or text us and we’ll see what we can do.
      </p>
    </>
  );
}

// "Price held until March 2, 2027" under the total; after that date the
// page still works and says so, in navy rather than the quiet grey.
function PriceHold({ validUntil, passed, className }: { validUntil: string | null; passed: boolean; className?: string }) {
  if (!validUntil) return null;
  return passed ? (
    <p className={cn("text-sm font-semibold text-pretty", className)} data-testid="quote-price-hold">
      Prices may have changed since {formatFullDate(validUntil)}. We’ll confirm before booking.
    </p>
  ) : (
    <p className={cn("text-sm text-muted-foreground", className)} data-testid="quote-price-hold">
      Price held until {formatFullDate(validUntil)}
    </p>
  );
}

// The total counting to its new value. A screen reader reads the exact
// figure; the counting digits are for the eye only.
function CountedTotal({ subtotal, gstEnabled }: { subtotal: number; gstEnabled: boolean }) {
  const shown = useCountTo(subtotal);
  const settled = shown === subtotal;
  return (
    <>
      <span aria-hidden="true" className="tabular-nums">
        {formatMoney(settled ? subtotal : Math.round(shown))}
        {gstEnabled ? <span className="ml-1.5 text-[0.5em] font-semibold">+ GST</span> : null}
      </span>
      <span className="sr-only">{screenTotal(subtotal, gstEnabled)}</span>
    </>
  );
}

// The price line by line. A line that drops off (upper access when every
// upper run is off, extra work only with upper runs) or appears (the top-up
// to the minimum) eases in and out rather than jumping. Under the minimum,
// "Before the minimum" shows the lines' own sum, discount taken (not called a
// subtotal, which the PDF uses for the total before GST), so the top-up visibly
// raises that rather than cancelling the discount; the column closes on its
// total for anyone checking the sum downwards (the critique, 2026-11-04).
function Breakdown({
  full,
  current,
  beforeMinimum,
  totalSubtotal,
  gstEnabled,
}: {
  full: QuoteLine[];
  current: QuoteLine[];
  beforeMinimum: number;
  totalSubtotal: number;
  gstEnabled: boolean;
}) {
  const keyed = (lines: QuoteLine[]) => {
    const seen = new Map<string, number>();
    return lines.map((line) => {
      const count = seen.get(line.label) ?? 0;
      seen.set(line.label, count + 1);
      return { key: `${line.label}#${count}`, line };
    });
  };
  const now = new Map(keyed(current).map(({ key, line }) => [key, line]));
  const rows = [...keyed(full)];
  for (const entry of keyed(current)) if (!rows.some((row) => row.key === entry.key)) rows.push(entry);
  const isMinimum = (line: QuoteLine) => line.label.startsWith("To reach");
  return (
    <dl className="mt-5 flex flex-col border-t" data-testid="quote-lines">
      {rows.map(({ key, line: before }) => {
        const line = now.get(key) ?? before;
        const shown = now.has(key);
        return (
          <div key={key} className="quote-row" data-shown={shown} aria-hidden={!shown} data-line={line.label}>
            <div>
              {isMinimum(line) ? <SumRow label="Before the minimum" amount={lineAmount(beforeMinimum)} testId="line-before-minimum" /> : null}
              <LineRow label={line.label} detail={line.detail} amount={lineAmount(line.amount)} />
            </div>
          </div>
        );
      })}
      <div className="flex items-baseline justify-between gap-4 border-t border-navy py-2.5" data-testid="line-total">
        <dt className="font-bold">Total</dt>
        <dd className="shrink-0 font-bold">
          <CountedTotal subtotal={totalSubtotal} gstEnabled={gstEnabled} />
        </dd>
      </div>
    </dl>
  );
}

// A sum inside the breakdown: a hairline above and a quiet label, so nobody
// adding the column counts it as one more line.
function SumRow({ label, amount, testId }: { label: string; amount: string; testId?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-b border-t-navy/40 py-2.5" data-testid={testId}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="shrink-0 font-semibold tabular-nums">{amount}</dd>
    </div>
  );
}

function LineRow({ label, detail, amount, testId }: { label: string; detail?: string | null; amount: string; testId?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b py-2.5" data-testid={testId}>
      <dt className="min-w-0">
        <span className="font-medium">{label}</span>
        {detail ? <span className="block text-sm text-muted-foreground">{detail}</span> : null}
      </dt>
      <dd className="shrink-0 font-semibold tabular-nums">{amount}</dd>
    </div>
  );
}

// Beside each switch: a small close-up of that run's own part of the house,
// lit while the run is on and dashed once it's off, so the house answers the
// thumb wherever the page is scrolled. A run drawn nowhere ("other") keeps
// the space empty so the names still line up.
function RunMark({ run, on }: { run: CustomerQuote["quote"]["runs"][number]; on: boolean }) {
  const segments = segmentsFor(run);
  if (segments.length === 0) return <span aria-hidden="true" className="w-14 shrink-0" />;
  const states = Object.fromEntries(
    HOUSE_SEGMENTS.map((segment) => [segment, segments.includes(segment) ? (on ? "on" : "off") : "none"]),
  ) as Record<HouseSegment, SegmentState>;
  return <HouseDiagram states={states} mini decorative crop={SEGMENT_CROPS[segments[0]]} px={56} className="w-14 shrink-0" />;
}

// "What do these mean?": the same house, small, one part lit at a time,
// cropped to that part so even the porch and the sides read at the small
// size (the screenshot review, 2026-11-04).
const EXPLAINED: { title: string; text: string; lit: HouseSegment[]; crop: Crop }[] = [
  {
    title: "Eave",
    text: "The level edge of a roof, where the gutter runs. The track sits on the soffit, the underside of that edge.",
    lit: ["lower-eave", "upper-eave"],
    crop: WHOLE_HOUSE,
  },
  { title: "Gable", text: "The two sloped edges of a peak.", lit: ["garage-gable", "upper-gable"], crop: WHOLE_HOUSE },
  { title: "Garage line", text: "The roof edge over the garage door.", lit: ["garage"], crop: [0, 84, 120, 67] },
  { title: "Sides", text: "The roof edges down each side of the house.", lit: ["lower-sides", "upper-sides"], crop: [189, 40, 161, 90] },
  { title: "Porch", text: "The small roof over your front door.", lit: ["porch"], crop: [182, 128, 110, 61.5] },
];

function PartsExplained() {
  return (
    <div className="flex flex-col gap-4" data-testid="parts-explained">
      <ul className="flex flex-col gap-3">
        {EXPLAINED.map((item) => {
          const states = Object.fromEntries(
            (["garage-gable", "garage", "lower-eave", "porch", "upper-eave", "upper-gable", "lower-sides", "upper-sides"] as const).map(
              (segment) => [segment, item.lit.includes(segment) ? "on" : "none"],
            ),
          ) as Record<HouseSegment, "on" | "none">;
          return (
            <li key={item.title} className="flex items-center gap-4">
              <HouseDiagram states={states} mini crop={item.crop} label={`${item.title}, lit on a small drawing of a house`} className="w-32 shrink-0" />
              <p className="min-w-0 text-base text-pretty">
                <span className="font-semibold">{item.title}:</span> {item.text}
              </p>
            </li>
          );
        })}
      </ul>
      <p className="text-base text-pretty">Upper is the second storey. Lower is the main floor.</p>
    </div>
  );
}

// The bar fixed to the bottom: Call, Text, and the one gold button on the
// page. Once they've asked to book this choice, it says so instead.
function BookBar({
  callHref,
  textHref,
  booked,
  update,
  sending,
  slow,
  error,
  onBook,
}: {
  callHref: string;
  textHref: string;
  booked: boolean;
  update: boolean;
  sending: boolean;
  slow: boolean;
  error: string | null;
  onBook: () => void;
}) {
  const contact =
    "inline-flex h-12 shrink-0 items-center justify-center gap-1.5 rounded-md border border-input bg-background px-3 text-base font-semibold outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <aside aria-label="Book your install" className="fixed inset-x-0 bottom-0 z-20 border-t bg-background pb-[env(safe-area-inset-bottom)]" data-testid="quote-bar">
      {error ? (
        <p role="alert" className="mx-auto max-w-xl px-4 pt-3 text-sm font-semibold text-pretty text-destructive">
          {error}
        </p>
      ) : slow ? (
        <p role="status" className="mx-auto max-w-xl px-4 pt-3 text-sm font-semibold text-pretty">
          {SLOW}
        </p>
      ) : null}
      <div className="mx-auto flex max-w-xl items-center gap-2 px-4 py-2.5">
        <a href={callHref} className={contact} data-testid="bar-call">
          <Phone aria-hidden="true" className="size-[1.125rem]" />
          Call
        </a>
        <a href={textHref} className={contact} data-testid="bar-text">
          <MessageSquare aria-hidden="true" className="size-[1.125rem]" />
          Text
        </a>
        {booked ? (
          <p className="min-w-0 flex-1 text-right text-sm text-pretty" data-testid="bar-requested">
            <span className="block font-semibold">Install requested</span>
            <span className="block text-muted-foreground">Keenan will be in touch.</span>
          </p>
        ) : (
          <button
            type="button"
            onClick={() => {
              if (!sending) onBook();
            }}
            aria-disabled={sending}
            aria-busy={sending}
            className={cn(
              "inline-flex h-12 min-w-0 flex-1 items-center justify-center rounded-md bg-primary px-4 text-base font-semibold whitespace-nowrap text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              sending && "cursor-progress",
            )}
            data-testid="bar-book"
          >
            {sending ? (
              <>
                <Loader2 aria-hidden="true" className="mr-2 size-4 animate-spin" />
                Sending
              </>
            ) : update ? (
              "Update my choice"
            ) : (
              "Book my install"
            )}
          </button>
        )}
      </div>
    </aside>
  );
}

function ThankYou({
  firstName,
  thanks,
  company,
  onBack,
}: {
  firstName: string;
  thanks: { option: string; total: string; preview: boolean };
  company: CustomerQuote["company"];
  onBack: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-5 pt-10 pb-16" data-testid="quote-thanks">
      {thanks.preview ? (
        <p role="status" className="rounded-md border border-input px-4 py-3 text-sm font-semibold text-pretty" data-testid="thanks-preview">
          Preview only. You’re signed in to Vesper on this device, so nothing was saved and no notification was sent.
        </p>
      ) : null}
      <span className="flex size-12 items-center justify-center rounded-full bg-navy text-white" aria-hidden="true">
        <Check className="size-6" />
      </span>
      <div className="flex flex-col gap-3">
        <h1 ref={heading} tabIndex={-1} className="text-3xl font-bold text-balance outline-none">
          Thank you{firstName.trim() ? `, ${firstName.trim()}` : ""}
        </h1>
        <p className="text-lg text-pretty">
          Keenan will be in touch within one business day to set your install date and go through the agreement.
        </p>
        <p className="text-base text-pretty text-muted-foreground">
          There’s nothing to sign or pay today. No payment until your install is complete.
        </p>
      </div>
      <dl className="flex flex-col divide-y rounded-md border">
        <div className="flex flex-col gap-0.5 px-4 py-3">
          <dt className="text-sm font-semibold text-muted-foreground">Your choice</dt>
          <dd className="font-semibold text-pretty" data-testid="thanks-option">
            {customerChoice(thanks.option)}
          </dd>
        </div>
        {thanks.total ? (
          <div className="flex flex-col gap-0.5 px-4 py-3">
            <dt className="text-sm font-semibold text-muted-foreground">Total</dt>
            <dd className="text-xl font-bold tabular-nums" data-testid="thanks-total">
              {thanks.total}
            </dd>
          </div>
        ) : null}
      </dl>
      <div className="flex flex-col gap-3">
        <p className="font-semibold text-pretty">Changed your mind? Call or text Keenan.</p>
        <ContactButtons company={company} />
      </div>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-11 items-center self-start text-base font-semibold underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        See your quote again
      </button>
    </main>
  );
}

// Their mockup, full width in a 3:2 frame on navy, so the whole picture
// shows; the expand button (or a tap anywhere on it) opens it full screen
// to pinch and zoom. Space is kept for it while it loads.
function Mockup({ url }: { url: string }) {
  const [open, setOpen] = useState(false);
  const [broken, setBroken] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const picture = useRef<HTMLImageElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    opener.current?.focus();
  }, []);
  // A picture that failed before the page came alive never fires onError
  // here; check once on arrival.
  useEffect(() => {
    const image = picture.current;
    if (image && image.complete && image.naturalWidth === 0) setBroken(true);
  }, []);
  if (broken) return <PictureNeedsRefresh />;
  return (
    <figure className="relative">
      <button
        ref={opener}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open the picture of your house full screen"
        className="group block aspect-[3/2] w-full overflow-hidden bg-navy outline-none focus-visible:outline-solid focus-visible:outline-3 focus-visible:-outline-offset-4 focus-visible:outline-white"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a private photo behind a ten-minute signed link */}
        <img
          ref={picture}
          src={url}
          alt="Your house with Vesper lights on, as a mockup"
          className="block size-full object-contain"
          onError={() => setBroken(true)}
          data-testid="quote-mockup"
        />
        <span
          aria-hidden="true"
          className="absolute right-3 bottom-3 flex size-11 items-center justify-center rounded-md border border-white/40 bg-navy text-white"
        >
          <Maximize2 className="size-5" strokeWidth={1.5} />
        </span>
      </button>
      <MockupViewer url={url} open={open} onClose={close} />
    </figure>
  );
}

function PictureNeedsRefresh({ className, dark = false }: { className?: string; dark?: boolean }) {
  return (
    <div
      className={cn("flex flex-col items-start gap-3 px-5 py-6", dark ? "text-white" : "bg-muted", className)}
      role="status"
      data-testid="mockup-refresh"
    >
      <p className="text-base text-pretty">The picture needs a refresh. Reload the page to see it again.</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className={cn(
          "inline-flex h-12 items-center rounded-md px-5 text-base font-semibold outline-none focus-visible:ring-2",
          dark ? "bg-white text-navy focus-visible:ring-gold" : "border border-input bg-background focus-visible:ring-ring",
        )}
      >
        Reload
      </button>
    </div>
  );
}

// A real modal dialog: it sits above the page, keeps focus inside, and
// Escape closes it. The picture is the one already on the page.
function MockupViewer({ url, open, onClose }: { url: string; open: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
    if (!open) return;
    // The page behind stays put while they zoom.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);
  return (
    <dialog
      ref={dialog}
      aria-label="Your house with the lights on"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden border-0 bg-black p-0 text-white backdrop:bg-black"
      data-testid="mockup-viewer"
    >
      {open ? (
        <div className="relative size-full">
          {broken ? (
            <div className="flex size-full items-center justify-center">
              <PictureNeedsRefresh dark />
            </div>
          ) : (
            <PinchZoom src={url} alt="Your house with Vesper lights on, as a mockup" crossOrigin={null} onError={() => setBroken(true)} />
          )}
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-4 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <p className="text-sm text-white/80">Pinch or double-tap to zoom.</p>
            <button
              type="button"
              onClick={onClose}
              autoFocus
              className="inline-flex h-12 items-center gap-2 rounded-md bg-white px-5 text-base font-semibold text-navy outline-none focus-visible:ring-2 focus-visible:ring-gold"
            >
              <X aria-hidden="true" className="size-5" />
              Close
            </button>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
