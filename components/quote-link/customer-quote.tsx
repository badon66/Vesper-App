"use client";

import { Check, Loader2, Maximize2, MessageSquare, Phone, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bookInstall, recordVisit, saveSelection } from "@/app/q/[token]/actions";
import { PinchZoom } from "@/components/meeting/pinch-zoom";
import { Disclosure } from "@/components/quote-link/disclosure";
import { PointIconMark } from "@/components/quote-link/point-icon";
import { ClosedQuote, ContactButtons } from "@/components/quote-link/quote-shell";
import { DialogPanel } from "@/components/ui/dialog-panel";
import { formatMoney, screenTotal, type QuoteLine, type QuoteRun, type QuoteTotals } from "@/lib/pricing";
import { offerCoverage, type PricedOffer } from "@/lib/quotes/offers";
import { fillLine } from "@/lib/deck";
import {
  christmasSeason,
  customerChoice,
  customerChoiceInSentence,
  inTouchAbout,
  leavesRunsOut,
  lineAmount,
  linkLooks,
  linkOffers,
  nextStepsFor,
  offerChoice,
  offerPicture,
  openingOffer,
  otherColoursLine,
  phoneHref,
  priceHoldPassed,
  seeItPicture,
  showsSeeIt,
  smsWithBody,
  type CustomerQuote,
  type LinkPicture,
} from "@/lib/quote-link/view";
import { calgaryDateOf, formatFullDate, formatLongDay } from "@/lib/time";
import { cn } from "@/lib/utils";

// The customer's quote (Keenan, 2026-11-02; reworked 2026-11-04 as a sales
// page, phone first; round 9, 2026-11-10, Keenan's options in place of
// Start smaller and Your lights, settled by the five seats). Top to bottom:
// their house and the price of the option on screen, the Christmas banner,
// what they're getting, See it on your house (round 13: one picture of
// their house with a row of Looks, the phone scenes by name, and a row of
// Options; with one option and no scene the picture sits in Your price as
// in round 10), Your options (a row per option, biggest first, then what's
// in the one on screen), track colour,
// what happens next, two things to tap open, and a bar that stays put with
// Call, Text and Book my install. Prices come from lib/pricing.ts over the
// quote's own stored prices; the page sends an option's id, never a price.
// Once Keenan marks the quote accepted, the page shows only what was agreed.

type View = CustomerQuote & { mockupUrl: string | null; pictures: LinkPicture[]; galleryUrls: string[] };
// offer: the option's id; null on a link booked before options.
type Booked = { at: string; option: string; offer: string | null };

const FAILED = "That didn’t go through. Check your signal and try again, or call or text us.";
const SLOW = "Still sending. If it doesn’t go through, call or text us.";

export function CustomerQuoteView({ token, view }: { token: string; view: View }) {
  // A visit, once per opening, even when React runs the effect twice.
  // Keenan's own visits are left out on the server.
  const visited = useRef(false);
  useEffect(() => {
    if (visited.current) return;
    visited.current = true;
    void recordVisit(token).catch(() => undefined);
  }, [token]);

  return view.quote.accepted ? <AgreedQuote view={view} /> : <LiveQuote token={token} view={view} />;
}

function LiveQuote({ token, view }: { token: string; view: View }) {
  const { quote, words } = view;
  // The options worth showing, biggest first, each with its price.
  const shown = useMemo(() => linkOffers(quote), [quote]);
  const many = shown.length > 1;

  const serverBooked: Booked | null =
    view.bookedAt && view.bookedOption ? { at: view.bookedAt, option: view.bookedOption, offer: view.bookedOffer } : null;
  const [booked, setBooked] = useState<Booked | null>(serverBooked);

  // It opens on the option they booked, else the one chosen at the
  // meeting, else the biggest.
  const [chosenId, setChosenId] = useState<string | null>(() =>
    openingOffer(shown, { booked: view.bookedOffer, meeting: quote.meetingOffer }),
  );
  const selected: PricedOffer | null = shown.find((priced) => priced.offer.id === chosenId) ?? shown[0] ?? null;
  // See it on your house (round 13): the look on screen, by name, or none
  // (the option's own picture, else the Main). Picking an option, here or
  // in the price below, goes back to that option's picture.
  const [look, setLook] = useState<string | null>(null);
  const seeIt = showsSeeIt(view.pictures, shown.length);
  const totals: QuoteTotals | null = selected?.totals ?? null;
  const name = selected?.offer.name ?? "";
  const total = totals ? screenTotal(totals.subtotal, quote.gstEnabled) : "";
  const minimum = quote.minJobTotal && quote.minJobTotal > 0 ? quote.minJobTotal : null;
  const atMinimum = Boolean(totals?.minimumApplied) && minimum !== null;
  const holdPassed = priceHoldPassed(view.validUntil, view.today);
  const everyLines = useMemo(() => shown.flatMap((priced) => (priced.totals ? [priced.totals.lines] : [])), [shown]);
  const steps = nextStepsFor(view);

  const [phase, setPhase] = useState<"quote" | "confirm" | "sending" | "thanks" | "closed">("quote");
  const [thanks, setThanks] = useState<{ option: string; total: string; preview: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  const sending = phase === "sending";
  const heading = useRef<HTMLHeadingElement>(null);
  // When the confirm step opened. Its Yes sits right where Book my install
  // was, so a quick second tap would land on it; taps in the first half
  // second are ignored (the critique, 2026-11-04).
  const confirmOpenedAt = useRef(0);
  // When the press on Yes began: a press that starts in that first half
  // second doesn't count even if it lifts after it.
  const yesPressedAt = useRef(0);

  // The option they're looking at, saved a moment after they settle on
  // one, for Keenan's card. The page itself opens on what they booked.
  const firstChoice = useRef(true);
  const selectedId = selected?.offer.id ?? null;
  useEffect(() => {
    if (firstChoice.current) {
      firstChoice.current = false;
      return;
    }
    if (!selectedId) return;
    const timer = window.setTimeout(() => {
      void saveSelection(token, selectedId).catch(() => undefined);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [token, selectedId]);

  // A screen reader hears the option and its total once, when they settle.
  const [announced, setAnnounced] = useState("");
  const firstAnnounce = useRef(true);
  const announcement = selected ? `${name}, ${total}` : "";
  useEffect(() => {
    if (firstAnnounce.current) {
      firstAnnounce.current = false;
      return;
    }
    const timer = window.setTimeout(() => setAnnounced(announcement), 400);
    return () => window.clearTimeout(timer);
  }, [announcement]);

  // A send that takes long says so, instead of a silent "Sending".
  useEffect(() => {
    if (!sending) return;
    const timer = window.setTimeout(() => setSlow(true), 8000);
    return () => window.clearTimeout(timer);
  }, [sending]);

  async function book() {
    if (!selected) return;
    const offer = selected.offer.id;
    setPhase("sending");
    setError(null);
    setSlow(false);
    try {
      const result = await bookInstall(token, offer);
      if (result.ok) {
        if (!result.preview) setBooked({ at: new Date().toISOString(), option: result.option, offer });
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
    return (
      <ThankYou
        firstName={view.firstName}
        thanks={thanks}
        installOn={view.nextSteps.installOn}
        company={view.company}
        onBack={backToQuote}
      />
    );
  }

  const matchesBooked = booked !== null && selected !== null && booked.offer === selected.offer.id;
  const textHref = smsWithBody(view.company.phone, `Hi Keenan, a question about the quote for ${view.address}: `);
  const choose = (id: string) => {
    if (sending) return;
    setChosenId(id);
    setLook(null);
  };

  return (
    <>
      <main className="mx-auto flex max-w-xl flex-col pb-36" data-testid="quote-live">
        {/* 1. Their house and the price of the option on screen. */}
        <section aria-labelledby="quote-for" className="flex flex-col">
          {view.mockupUrl ? (
            <Mockup
              url={view.mockupUrl}
              caption={selected && leavesRunsOut(quote.runs.length, selected.offer.runs) ? words.link_mockup_caption : null}
            />
          ) : null}
          <div className="flex flex-col px-5 pt-6">
            <Greeting firstName={view.firstName} headingRef={heading} />
            {selected && totals ? (
              <>
                <p className="mt-4 text-base font-semibold text-pretty text-muted-foreground" data-testid="hero-option">
                  {name}
                </p>
                {/* A row tapped further down changes this out of view; the
                    polite announcer under Your options says the option and
                    its total once they settle, so it isn't heard twice. */}
                <p className="mt-1 text-[2.75rem] leading-none font-bold tracking-tight" data-testid="hero-total">
                  <Money subtotal={totals.subtotal} gstEnabled={quote.gstEnabled} />
                </p>
              </>
            ) : null}
            <PriceHold validUntil={view.validUntil} passed={holdPassed} className="mt-3" />
            <ul className="mt-4 flex flex-col gap-1 text-base" data-testid="quote-promises">
              <li className="font-semibold">No payment until your install is complete.</li>
              {quote.financingOffered ? (
                <li data-testid="quote-financing">
                  Financing is available.{" "}
                  <a
                    href={smsWithBody(view.company.phone, "Hi Keenan, can you tell me about financing?")}
                    className="-my-3 inline-block py-3 font-semibold underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Just ask.
                  </a>
                </li>
              ) : null}
            </ul>
          </div>
        </section>

        {booked ? (
          <p role="status" className="mx-5 mt-6 rounded-md border px-4 py-3 text-base text-pretty" data-testid="quote-booked-before">
            On {formatLongDay(calgaryDateOf(booked.at))} you asked us to book your install:{" "}
            {customerChoiceInSentence(booked.option)}. Keenan will be in touch {inTouchAbout(view.nextSteps.installOn)}.
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
        <ProductPoints points={view.productPoints} />

        {/* 4. See it on your house (round 13): one picture, the Looks and
            the Options under it. Tapping an option here picks it in the
            price below; picking one there swaps the picture. */}
        {seeIt && selected ? (
          <SeeItOnYourHouse
            pictures={view.pictures}
            offers={shown}
            selectedId={selected.offer.id}
            selectedName={name}
            look={look}
            caption={leavesRunsOut(quote.runs.length, selected.offer.runs) ? words.link_mockup_caption : null}
            disabled={sending}
            onLook={setLook}
            onOption={choose}
          />
        ) : null}

        {/* 5. Your options: a row per option to pick from, then what's in
            it, line by line. With one option and no scene, its picture
            sits here, as before. */}
        <section aria-labelledby="your-options" className="mt-12 px-5" data-testid="quote-options">
          <h2 id="your-options" className="text-xl font-bold">
            {many ? "Your options" : "Your price"}
          </h2>
          {selected && totals ? (
            <>
              {seeIt ? null : (
                <OptionPicture
                  pictures={view.pictures}
                  offerId={selected.offer.id}
                  name={name}
                  caption={leavesRunsOut(quote.runs.length, selected.offer.runs) ? words.link_mockup_caption : null}
                />
              )}
              <div className="mt-1">
                <Disclosure title="What do these mean?" variant="inline" testId="quote-explainer">
                  <PartsExplained />
                </Disclosure>
              </div>

              {many ? (
                <fieldset className="mt-4" data-testid="option-rows">
                  <legend className="sr-only">Your options</legend>
                  {/* 12 px between rows: room for the meeting's tag, which
                      sits on its row's top edge. */}
                  <div className="flex flex-col gap-3">
                    {shown.map((priced) => (
                      <OptionRow
                        key={priced.offer.id}
                        priced={priced}
                        runs={quote.runs}
                        selected={priced.offer.id === selected.offer.id}
                        meeting={priced.offer.id === quote.meetingOffer}
                        meetingTag={words.link_meeting_tag}
                        gstEnabled={quote.gstEnabled}
                        disabled={sending}
                        onChoose={choose}
                      />
                    ))}
                  </div>
                </fieldset>
              ) : null}

              <h3 className="mt-8 text-lg font-bold text-pretty" data-testid="whats-in">
                {fillLine(words.whats_in, { name })}
              </h3>
              {/* With a list, each row already says what its option covers. */}
              {many ? null : (
                <p className="mt-1 text-sm text-pretty text-muted-foreground" data-testid="whats-in-coverage">
                  {offerCoverage(quote.runs, selected.offer)}
                </p>
              )}
              <Breakdown
                every={everyLines}
                current={totals.lines}
                beforeMinimum={totals.beforeMinimum}
                subtotal={totals.subtotal}
                gstEnabled={quote.gstEnabled}
              />
              <div className="quote-row" data-shown={atMinimum} aria-hidden={!atMinimum}>
                <div>
                  {/* Keenan's words, at the total; the box keeps it calm, never red. */}
                  <div className="mt-3 rounded-md border px-4 py-3" data-testid="minimum-note">
                    {minimum ? <MinimumWords minimum={minimum} /> : null}
                  </div>
                </div>
              </div>
              <p className="mt-5 text-base text-pretty" data-testid="quote-includes">
                {words.price_includes}
              </p>
              {/* Balanced, so two short sentences break between them, not after "Call or". */}
              <p className="mt-2 text-base font-semibold text-balance" data-testid="quote-something-else">
                {words.link_something_else}
              </p>
              <p aria-live="polite" className="sr-only">
                {announced}
              </p>
            </>
          ) : (
            <p className="mt-3 text-base text-pretty" data-testid="quote-options-empty">
              {words.price_empty}
            </p>
          )}
        </section>

        {/* 5. Track colour: one colour rule, the same as the iPad. */}
        <section aria-labelledby="track-colour" className="mt-12 px-5">
          <h2 id="track-colour" className="text-xl font-bold">
            Track colour
          </h2>
          {quote.trackColourName ? (
            <p className="mt-3 font-semibold" data-testid="quote-colour">
              Your colour: {quote.trackColourName}.
            </p>
          ) : null}
          <p className="mt-2 text-pretty" data-testid="quote-colour-stock">
            {words.colour_stock}
          </p>
          <p className="mt-2 text-pretty" data-testid="quote-colour-rush">
            {otherColoursLine({ season: christmasSeason(view.today), rushFee: quote.rushFee, rush: quote.colourTiming === "rush" })}
          </p>
        </section>

        {/* 6. What happens next: the meeting's four steps, in its words. */}
        <NextSteps steps={steps} whatWeNeed={view.nextSteps.whatWeNeed} />

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
          <Warranty warranty={view.warranty} serviceCallFee={view.serviceCallFee} />
        </section>

        <Footer company={view.company} />
      </main>

      {/* 8. The bar that stays put. */}
      <BookBar
        callHref={phoneHref(view.company.phone, "tel")}
        textHref={textHref}
        canBook={selected !== null}
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
          <ChoiceCard option={name} total={total} testIds={{ option: "confirm-option", total: "confirm-total" }} />
          {holdPassed && view.validUntil ? (
            <p className="font-semibold text-pretty">
              Prices may have changed since {formatFullDate(view.validUntil)}. We’ll confirm before booking.
            </p>
          ) : null}
          <p className="text-pretty">
            There’s nothing to sign or pay today. Keenan will be in touch {inTouchAbout(view.nextSteps.installOn)} and go
            through the agreement.
          </p>
        </div>
      </DialogPanel>
    </>
  );
}

// After Keenan marks the quote accepted (round 9): only what was agreed.
// The option, its total, the track colour, the install day if there is one
// and the payment line; what's in it, line by line; and Call and Text. The
// other options' prices, Your options and Book my install are gone, and no
// status word is shown.
function AgreedQuote({ view }: { view: View }) {
  const { quote, words } = view;
  // A quote accepted before options has no option to name; the rest stands.
  const agreed = offerChoice(quote, quote.acceptedOffer);
  const textHref = smsWithBody(view.company.phone, `Hi Keenan, a question about the install at ${view.address}: `);

  return (
    <>
      <main className="mx-auto flex max-w-xl flex-col pb-36" data-testid="quote-agreed">
        <section aria-labelledby="quote-for" className="flex flex-col">
          {view.mockupUrl ? (
            <Mockup
              url={view.mockupUrl}
              caption={agreed && leavesRunsOut(quote.runs.length, agreed.offer.runs) ? words.link_mockup_caption : null}
            />
          ) : null}
          <div className="flex flex-col px-5 pt-6">
            <Greeting firstName={view.firstName} />
            {agreed ? (
              <>
                <p className="mt-4 text-base font-semibold text-pretty text-muted-foreground" data-testid="agreed-choice">
                  Your choice: {agreed.name}
                </p>
                <p className="mt-1 text-[2.75rem] leading-none font-bold tracking-tight" data-testid="agreed-total">
                  <Money subtotal={agreed.totals.subtotal} gstEnabled={quote.gstEnabled} />
                </p>
              </>
            ) : null}
            <ul className="mt-5 flex flex-col gap-1.5 text-base" data-testid="agreed-summary">
              {quote.trackColourName ? <li data-testid="agreed-colour">Your track colour: {quote.trackColourName}</li> : null}
              {view.nextSteps.installOn ? (
                <li data-testid="agreed-day">Your install day: {formatLongDay(view.nextSteps.installOn)}</li>
              ) : null}
              <li className="font-semibold">No payment until your install is complete.</li>
            </ul>
          </div>
        </section>

        {agreed ? (
          <section aria-labelledby="whats-in" className="mt-12 px-5">
            <h2 id="whats-in" className="text-xl font-bold text-pretty" data-testid="whats-in">
              {fillLine(words.whats_in, { name: agreed.name })}
            </h2>
            <OptionPicture
              pictures={view.pictures}
              offerId={agreed.offer.id}
              name={agreed.name}
              caption={leavesRunsOut(quote.runs.length, agreed.offer.runs) ? words.link_mockup_caption : null}
            />
            <p className="mt-4 text-sm text-pretty text-muted-foreground" data-testid="whats-in-coverage">
              {offerCoverage(quote.runs, agreed.offer)}
            </p>
            <Breakdown
              every={[agreed.totals.lines]}
              current={agreed.totals.lines}
              beforeMinimum={agreed.totals.beforeMinimum}
              subtotal={agreed.totals.subtotal}
              gstEnabled={quote.gstEnabled}
            />
          </section>
        ) : null}

        <section aria-label="More about your install" className="mt-12 border-t" data-testid="quote-more">
          {view.nextSteps.whatWeNeed ? <WhatWeNeed text={view.nextSteps.whatWeNeed} variant="row" /> : null}
          <Warranty warranty={view.warranty} serviceCallFee={view.serviceCallFee} />
        </section>

        <Footer company={view.company} />
      </main>

      <BookBar
        callHref={phoneHref(view.company.phone, "tel")}
        textHref={textHref}
        canBook={false}
        booked={false}
        update={false}
        sending={false}
        slow={false}
        error={null}
        onBook={() => undefined}
      />
    </>
  );
}

function Greeting({ firstName, headingRef }: { firstName: string; headingRef?: React.Ref<HTMLHeadingElement> }) {
  return (
    <h1 id="quote-for" ref={headingRef} tabIndex={-1} className="text-2xl font-bold text-balance outline-none">
      {firstName.trim() ? `${firstName.trim()}, here’s your quote` : "Here’s your quote"}
    </h1>
  );
}

// A total as a customer reads it: "$3,450" with a small "+ GST" while GST
// is on. It changes at once with the option; it never counts.
function Money({ subtotal, gstEnabled }: { subtotal: number; gstEnabled: boolean }) {
  return (
    <span className="tabular-nums">
      {formatMoney(subtotal)}
      {gstEnabled ? (
        <>
          {" "}
          <span className="text-[0.5em] font-semibold">+ GST</span>
        </>
      ) : null}
    </span>
  );
}

// One option as a radio row, in two lines: the radio, its name and its
// total; then what it covers, across the full width, two lines at most
// (the critique, 2026-11-10: rows ran 105 to 113 px). The one on screen has
// a 2 px navy border and a filled navy radio; gold stays Book my install's
// alone. The meeting's choice carries a small navy tag on the row's top
// edge, like the iPad's "Your choice", so it adds no height. A native radio
// underneath, so arrow keys and screen readers work as they expect.
function OptionRow({
  priced,
  runs,
  selected,
  meeting,
  meetingTag,
  gstEnabled,
  disabled,
  onChoose,
}: {
  priced: PricedOffer;
  runs: QuoteRun[];
  selected: boolean;
  meeting: boolean;
  meetingTag: string;
  gstEnabled: boolean;
  disabled: boolean;
  onChoose: (id: string) => void;
}) {
  const { offer, totals } = priced;
  if (!totals) return null;
  return (
    <label
      className={cn(
        "relative flex min-h-11 cursor-pointer flex-col gap-0.5 rounded-md transition-colors duration-150",
        "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background",
        // 14 px of border and padding on top (clear of the meeting's tag)
        // and 10 below, selected or not, so a row whose coverage takes two
        // lines stays within 88 px and choosing one never moves the others.
        selected
          ? "border-2 border-navy px-[0.8125rem] pt-3 pb-2"
          : "border border-border px-[0.875rem] pt-[0.8125rem] pb-[0.5625rem] hover:bg-muted",
      )}
      data-testid="option-row"
      data-offer={offer.id}
      data-selected={selected}
    >
      <input
        type="radio"
        name="quote-option"
        value={offer.id}
        checked={selected}
        disabled={disabled}
        onChange={() => onChoose(offer.id)}
        className="sr-only"
      />
      <span className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-150",
            selected ? "border-navy bg-navy" : "border-input bg-background",
          )}
        >
          {selected ? <span className="size-2.5 rounded-full bg-white" /> : null}
        </span>
        <span className="line-clamp-2 min-w-0 flex-1 text-base leading-snug font-semibold">{offer.name}</span>
        <span className="shrink-0 text-lg leading-tight font-bold whitespace-nowrap tabular-nums" data-testid="option-total">
          {formatMoney(totals.subtotal)}
          {gstEnabled ? (
            <>
              {" "}
              <span className="text-xs font-semibold text-muted-foreground">+ GST</span>
            </>
          ) : null}
        </span>
      </span>
      {/* Feet included: it's what they compare the options by. */}
      <span className="line-clamp-2 text-sm leading-[1.3] text-pretty text-muted-foreground" data-testid="option-coverage">
        {offerCoverage(runs, offer)}
      </span>
      {/* 18 px tall, centred on the top border. */}
      {meeting ? (
        <span
          className="absolute -top-[0.5625rem] right-3 rounded-sm border border-navy bg-background px-1.5 text-[0.8125rem] leading-4 font-semibold text-navy"
          data-testid="option-meeting-tag"
        >
          {meetingTag}
        </span>
      ) : null}
    </label>
  );
}

// "Your choice" and its total, on the confirm sheet and the thank-you.
function ChoiceCard({ option, total, testIds }: { option: string; total: string; testIds: { option: string; total: string } }) {
  return (
    <dl className="flex flex-col divide-y rounded-md border">
      <div className="flex flex-col gap-0.5 px-4 py-3">
        <dt className="text-sm font-semibold text-muted-foreground">Your choice</dt>
        <dd className="font-semibold text-pretty" data-testid={testIds.option}>
          {customerChoice(option)}
        </dd>
      </div>
      {total ? (
        <div className="flex flex-col gap-0.5 px-4 py-3">
          <dt className="text-sm font-semibold text-muted-foreground">Total</dt>
          <dd className="text-xl font-bold tabular-nums" data-testid={testIds.total}>
            {total}
          </dd>
        </div>
      ) : null}
    </dl>
  );
}

function ProductPoints({ points }: { points: CustomerQuote["productPoints"] }) {
  if (points.length === 0) return null;
  return (
    <section aria-labelledby="getting" className="mt-12 px-5">
      <h2 id="getting" className="text-xl font-bold">
        What you’re getting
      </h2>
      <ul className="mt-5 flex flex-col gap-4" data-testid="quote-points">
        {points.map((point, at) => (
          <li key={at} className="flex gap-3.5">
            <PointIconMark icon={point.icon} className="mt-0.5 size-5 shrink-0 text-navy" />
            <span className="text-base text-pretty">{point.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// What happens next: four numbered steps, the same as the meeting's last
// page, with What we'll need behind a tap.
function NextSteps({ steps, whatWeNeed }: { steps: ReturnType<typeof nextStepsFor>; whatWeNeed: string | null }) {
  return (
    <section aria-labelledby="next-steps" className="mt-12 px-5" data-testid="quote-next-steps">
      <h2 id="next-steps" className="text-xl font-bold">
        What happens next
      </h2>
      <ol className="mt-5 flex flex-col gap-5">
        {steps.map((step, at) => (
          <li key={step.key} className="flex gap-4" data-testid={`next-step-${step.key}`}>
            <span
              aria-hidden="true"
              className="flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-navy text-sm font-bold tabular-nums"
            >
              {at + 1}
            </span>
            <div className="min-w-0 pt-1">
              <p className="font-semibold">{step.label}</p>
              <p className={cn("mt-0.5 text-base text-pretty", step.key === "pay" && "font-semibold")}>
                {step.key === "colour" && step.done ? (
                  <Check aria-hidden="true" className="mr-1.5 -mt-0.5 inline size-4 text-navy" strokeWidth={2.5} />
                ) : null}
                {step.text}
              </p>
            </div>
          </li>
        ))}
      </ol>
      {whatWeNeed ? (
        <div className="mt-6">
          <WhatWeNeed text={whatWeNeed} variant="inline" />
        </div>
      ) : null}
    </section>
  );
}

function WhatWeNeed({ text, variant }: { text: string; variant: "row" | "inline" }) {
  return (
    <Disclosure title="What we’ll need" variant={variant} testId="quote-what-we-need">
      <ul className="flex flex-col gap-2.5 text-base text-pretty">
        {text
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
    </Disclosure>
  );
}

function Warranty({ warranty, serviceCallFee }: { warranty: string; serviceCallFee: number | null }) {
  if (!warranty.trim()) return null;
  return (
    <Disclosure title="Warranty" testId="quote-warranty">
      <ul className="flex flex-col gap-2.5 text-base text-pretty">
        {warranty
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
      {serviceCallFee ? (
        <p className="mt-4 font-semibold" data-testid="quote-service-call">
          Service call fee for years 6 to 10: {formatMoney(serviceCallFee)}
        </p>
      ) : null}
    </Disclosure>
  );
}

function Footer({ company }: { company: CustomerQuote["company"] }) {
  return (
    <footer className="mt-10 flex flex-col gap-1 px-5 text-sm text-pretty text-muted-foreground" data-testid="quote-footer">
      <p className="font-semibold text-foreground">{company.name}</p>
      <p>{company.address}</p>
      <a
        href={phoneHref(company.phone, "tel")}
        className="-mx-1 inline-flex min-h-11 items-center self-start rounded-sm px-1 text-foreground tabular-nums underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {company.phone}
      </a>
      <a
        href={`mailto:${company.email}?subject=${encodeURIComponent("My Vesper quote")}`}
        className="-mx-1 inline-flex min-h-11 items-center self-start rounded-sm px-1 text-foreground underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {company.email}
      </a>
    </footer>
  );
}

// Keenan's two lines for an option under the minimum, word for word.
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

// "Price held until March 2, 2027." under the total; after that date the
// page still works and says so, in navy rather than the quiet grey.
function PriceHold({ validUntil, passed, className }: { validUntil: string | null; passed: boolean; className?: string }) {
  if (!validUntil) return null;
  return passed ? (
    <p className={cn("text-sm font-semibold text-pretty", className)} data-testid="quote-price-hold">
      Prices may have changed since {formatFullDate(validUntil)}. We’ll confirm before booking.
    </p>
  ) : (
    <p className={cn("text-sm text-muted-foreground", className)} data-testid="quote-price-hold">
      Price held until {formatFullDate(validUntil)}.
    </p>
  );
}

// A breakdown line's place, the same for every option: "Control box" and
// "Control boxes (2)" are one line whose count differs.
const lineKey = (line: QuoteLine) => (/^Control box/.test(line.label) ? "Control box" : line.label);

// The option's price line by line, in the same rows and words as the iPad,
// ending on one Total. A line one option has and another hasn't (upper
// access, extra work only with upper runs, the top-up to the minimum) eases
// in and out rather than jumping. Under the minimum, "Before the minimum"
// shows the lines' own sum, discount taken (not called a subtotal, which
// the PDF uses for the total before GST), so the top-up visibly raises that
// rather than cancelling the discount (the critique, 2026-11-04).
function Breakdown({
  every,
  current,
  beforeMinimum,
  subtotal,
  gstEnabled,
}: {
  // Every shown option's lines, so a line can ease in and out between them.
  every: QuoteLine[][];
  current: QuoteLine[];
  beforeMinimum: number;
  subtotal: number;
  gstEnabled: boolean;
}) {
  const keyed = (lines: QuoteLine[]) => {
    const seen = new Map<string, number>();
    return lines.map((line) => {
      const base = lineKey(line);
      const count = seen.get(base) ?? 0;
      seen.set(base, count + 1);
      return { key: `${base}#${count}`, line };
    });
  };
  const now = new Map(keyed(current).map(({ key, line }) => [key, line]));
  // Every line any option has, each in its place in the options' own order.
  const rows: { key: string; line: QuoteLine }[] = [];
  for (const lines of [...every, current]) {
    let after = -1;
    for (const entry of keyed(lines)) {
      const found = rows.findIndex((row) => row.key === entry.key);
      if (found >= 0) {
        after = found;
        continue;
      }
      rows.splice(after + 1, 0, entry);
      after += 1;
    }
  }
  const isMinimum = (line: QuoteLine) => line.label.startsWith("To reach");
  return (
    <dl className="mt-4 flex flex-col border-t" data-testid="quote-lines">
      {rows.map(({ key, line: other }) => {
        const line = now.get(key) ?? other;
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
      <div className="flex items-baseline justify-between gap-4 border-t border-navy py-3" data-testid="line-total">
        <dt className="text-lg font-bold">Total</dt>
        <dd className="shrink-0 text-2xl font-bold">
          <Money subtotal={subtotal} gstEnabled={gstEnabled} />
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

function LineRow({ label, detail, amount }: { label: string; detail?: string | null; amount: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b py-2.5">
      <dt className="min-w-0">
        <span className="font-medium">{label}</span>
        {detail ? <span className="block text-sm text-muted-foreground">{detail}</span> : null}
      </dt>
      <dd className="shrink-0 font-semibold tabular-nums">{amount}</dd>
    </div>
  );
}

// "What do these mean?": the roof words the options use, in plain words
// (round 10: the house drawing is gone, so words alone).
const EXPLAINED: { title: string; text: string }[] = [
  {
    title: "Eave",
    text: "The level edge of a roof, where the gutter runs. The track sits on the soffit, the underside of that edge.",
  },
  { title: "Gable", text: "The two sloped edges of a peak." },
  { title: "Garage line", text: "The roof edge over the garage door." },
  { title: "Sides", text: "The roof edges down each side of the house." },
  { title: "Porch", text: "The small roof over your front door." },
];

function PartsExplained() {
  return (
    <div className="flex flex-col gap-4" data-testid="parts-explained">
      <ul className="flex flex-col gap-3">
        {EXPLAINED.map((item) => (
          <li key={item.title}>
            <p className="text-base text-pretty">
              <span className="font-semibold">{item.title}:</span> {item.text}
            </p>
          </li>
        ))}
      </ul>
      <p className="text-base text-pretty">Upper is the second storey. Lower is the main floor.</p>
    </div>
  );
}

// The bar fixed to the bottom: Call, Text, and the one gold button on the
// page. Once they've asked to book the option on screen, it says so
// instead; after the quote is accepted, or with no option to book, it
// holds Call and Text alone.
function BookBar({
  callHref,
  textHref,
  canBook,
  booked,
  update,
  sending,
  slow,
  error,
  onBook,
}: {
  callHref: string;
  textHref: string;
  canBook: boolean;
  booked: boolean;
  update: boolean;
  sending: boolean;
  slow: boolean;
  error: string | null;
  onBook: () => void;
}) {
  const contact = cn(
    "inline-flex h-12 shrink-0 items-center justify-center gap-1.5 rounded-md border border-input bg-background px-3 text-base font-semibold outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
    !canBook && "flex-1",
  );
  return (
    <aside aria-label={canBook ? "Book your install" : "Call or text us"} className="fixed inset-x-0 bottom-0 z-20 border-t bg-background pb-[env(safe-area-inset-bottom)]" data-testid="quote-bar">
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
        {!canBook ? null : booked ? (
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
  installOn,
  company,
  onBack,
}: {
  firstName: string;
  thanks: { option: string; total: string; preview: boolean };
  // The install day planned at the meeting, if any: Keenan confirms it
  // rather than setting one.
  installOn: string | null;
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
          Keenan will be in touch within one business day {inTouchAbout(installOn)} and go through the agreement.
        </p>
        <p className="text-base text-pretty text-muted-foreground">
          There’s nothing to sign or pay today. No payment until your install is complete.
        </p>
      </div>
      <ChoiceCard option={thanks.option} total={thanks.total} testIds={{ option: "thanks-option", total: "thanks-total" }} />
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

// See it on your house (round 13, Keenan, 2026-11-11): one picture of
// their house with two rows of buttons under it. Looks are the house's
// phone scenes by name; tapping one shows the house in that look, and
// tapping it again goes back. Options are the offers they are shown;
// tapping one shows that offer's picture (its own, else the Main) and
// picks it in the price below. The picture keeps the option picture's test
// ids, since it is that picture, moved up.
function SeeItOnYourHouse({
  pictures,
  offers,
  selectedId,
  selectedName,
  look,
  caption,
  disabled,
  onLook,
  onOption,
}: {
  pictures: LinkPicture[];
  offers: PricedOffer[];
  selectedId: string;
  selectedName: string;
  look: string | null;
  caption: string | null;
  disabled: boolean;
  onLook: (look: string | null) => void;
  onOption: (id: string) => void;
}) {
  const looks = linkLooks(pictures);
  const onScreen = seeItPicture(pictures, selectedId, look);
  if (!onScreen) return null;
  const lookOn = onScreen.kind === "look" ? onScreen.picture.name.trim() : null;
  const chip = (on: boolean) =>
    cn(
      "inline-flex min-h-12 items-center rounded-md px-4 text-base font-semibold outline-none transition-colors duration-150",
      "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60",
      on ? "border-2 border-navy bg-navy px-[0.9375rem] text-white" : "border border-border bg-background text-foreground hover:bg-muted",
    );
  return (
    <section aria-labelledby="see-it" className="mt-12 px-5" data-testid="see-it">
      <h2 id="see-it" className="text-xl font-bold">
        See it on your house
      </h2>
      <div
        className="mt-4"
        data-testid="option-picture"
        data-own={onScreen.kind === "own"}
        data-kind={onScreen.kind}
        data-look={lookOn ?? undefined}
      >
        <Mockup
          key={onScreen.picture.url}
          url={onScreen.picture.url}
          caption={onScreen.kind === "own" ? null : caption}
          alt={
            lookOn
              ? `Your house in the ${lookOn} look, as a mockup`
              : onScreen.kind === "own"
                ? `Your house with ${selectedName}, as a mockup`
                : "Your house with Vesper lights on, as a mockup"
          }
          openLabel={lookOn ? `Open the ${lookOn} picture full screen` : `Open the picture for ${selectedName} full screen`}
          inset
          ids={{ image: "option-mockup", caption: "option-mockup-caption", viewer: "option-mockup-viewer" }}
        />
      </div>
      {looks.length > 0 ? (
        <div role="group" aria-labelledby="see-it-looks" className="mt-4" data-testid="see-it-looks">
          <p id="see-it-looks" className="text-sm font-semibold text-muted-foreground">
            Looks
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {looks.map((picture) => {
              const lookName = picture.name.trim();
              const on = lookOn === lookName;
              return (
                <button
                  key={lookName}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onLook(on ? null : lookName)}
                  className={chip(on)}
                  data-testid="see-it-look"
                  data-look={lookName}
                >
                  {lookName}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      <div role="group" aria-labelledby="see-it-options" className="mt-4" data-testid="see-it-options">
        <p id="see-it-options" className="text-sm font-semibold text-muted-foreground">
          {offers.length > 1 ? "Options" : "Your option"}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {offers.map((priced) => {
            // Pressed while its picture is the one on screen: a look takes
            // the picture, the price below keeps the option.
            const on = lookOn === null && priced.offer.id === selectedId;
            return (
              <button
                key={priced.offer.id}
                type="button"
                aria-pressed={on}
                disabled={disabled}
                onClick={() => onOption(priced.offer.id)}
                className={chip(on)}
                data-testid="see-it-option"
                data-offer={priced.offer.id}
              >
                {priced.offer.name}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// The picture for the option on screen (Keenan, 2026-11-10): its own
// mockup, else the Main, else nothing, and the offers take the room. The
// Main standing in for an option that leaves runs out says it shows every
// run. Keyed by its address, so a new picture starts fresh.
function OptionPicture({
  pictures,
  offerId,
  name,
  caption,
}: {
  pictures: LinkPicture[];
  offerId: string;
  name: string;
  caption: string | null;
}) {
  const chosen = offerPicture(pictures, offerId);
  if (!chosen) return null;
  return (
    <div className="mt-4" data-testid="option-picture" data-own={chosen.own}>
      <Mockup
        key={chosen.picture.url}
        url={chosen.picture.url}
        caption={chosen.own ? null : caption}
        alt={chosen.own ? `Your house with ${name}, as a mockup` : "Your house with Vesper lights on, as a mockup"}
        openLabel={`Open the picture for ${name} full screen`}
        inset
        ids={{ image: "option-mockup", caption: "option-mockup-caption", viewer: "option-mockup-viewer" }}
      />
    </div>
  );
}

// Their mockup, full width in a 3:2 frame on navy, so the whole picture
// shows; the expand button (or a tap anywhere on it) opens it full screen
// to pinch and zoom. Space is kept for it while it loads. When the option
// on screen doesn't cover every run, a caption says the mockup shows them
// all, so nobody thinks they're getting lights they're not.
// The hero shows the Main (round 10); each option's own picture uses the
// same frame, inset in its section, with its own test ids.
const HERO_IDS = { image: "quote-mockup", caption: "mockup-caption", viewer: "mockup-viewer" };

function Mockup({
  url,
  caption,
  alt = "Your house with Vesper lights on, as a mockup",
  openLabel = "Open the picture of your house full screen",
  inset = false,
  ids = HERO_IDS,
}: {
  url: string;
  caption: string | null;
  alt?: string;
  openLabel?: string;
  inset?: boolean;
  ids?: { image: string; caption: string; viewer: string };
}) {
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
        aria-label={openLabel}
        className={cn(
          "group relative block aspect-[3/2] w-full overflow-hidden bg-navy outline-none focus-visible:outline-solid focus-visible:outline-3 focus-visible:-outline-offset-4 focus-visible:outline-white",
          inset && "rounded-md",
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a private photo behind a ten-minute signed link */}
        <img
          ref={picture}
          src={url}
          alt={alt}
          className="block size-full object-contain"
          onError={() => setBroken(true)}
          data-testid={ids.image}
        />
        <span
          aria-hidden="true"
          className="absolute right-3 bottom-3 flex size-11 items-center justify-center rounded-md border border-white/40 bg-navy text-white"
        >
          <Maximize2 className="size-5" strokeWidth={1.5} />
        </span>
      </button>
      {caption ? (
        <figcaption className={cn("pt-2 text-sm text-pretty text-muted-foreground", !inset && "px-5")} data-testid={ids.caption}>
          {caption}
        </figcaption>
      ) : null}
      <MockupViewer url={url} alt={alt} open={open} onClose={close} testId={ids.viewer} />
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
function MockupViewer({
  url,
  alt,
  open,
  onClose,
  testId,
}: {
  url: string;
  alt: string;
  open: boolean;
  onClose: () => void;
  testId: string;
}) {
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
      data-testid={testId}
    >
      {open ? (
        <div className="relative size-full">
          {broken ? (
            <div className="flex size-full items-center justify-center">
              <PictureNeedsRefresh dark />
            </div>
          ) : (
            <PinchZoom src={url} alt={alt} crossOrigin={null} onError={() => setBroken(true)} />
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
