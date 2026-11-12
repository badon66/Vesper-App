"use client";

import { Check, ChevronDown, Loader2, Maximize2, MessageSquare, Phone, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { bookCustom, bookInstall, recordVisit, saveSelection, signAgreement } from "@/app/q/[token]/actions";
import { PinchZoom } from "@/components/meeting/pinch-zoom";
import { Disclosure } from "@/components/quote-link/disclosure";
import { AboutYourTrack, AgreementSection, BuildYourOwn, BuildYourOwnRow, LinkDocuments, type SignOutcome } from "@/components/quote-link/link-extras";
import { ChristmasBanner } from "@/components/quote-link/christmas-banner";
import { RooflineTracker } from "@/components/quote-link/roofline-tracker";
import { trackerSteps } from "@/lib/quote-link/tracker";
import { PointIconMark } from "@/components/quote-link/point-icon";
import { ClosedQuote, ContactButtons } from "@/components/quote-link/quote-shell";
import { DialogPanel } from "@/components/ui/dialog-panel";
import { formatMoney, screenTotal, type QuoteLine, type QuoteRun, type QuoteTotals } from "@/lib/pricing";
import { CUSTOMER_OFFER_ID, feetWords, isCustomerOffer, offerFeet, type PricedOffer } from "@/lib/quotes/offers";
import { fillLine } from "@/lib/deck";
import {
  buildableRuns,
  customerChoice,
  customerOffer,
  customOption,
  offersBuildYourOwn,
  tracksUsed,
  type LinkAgreement,
  type LinkDocument,
  customerChoiceInSentence,
  inTouchAbout,
  leavesRunsOut,
  lineAmount,
  linkLooks,
  linkOffers,
  offerChoice,
  offerPicture,
  openingOffer,
  colourSectionLines,
  phoneHref,
  priceHoldPassed,
  seeItPicture,
  showsSeeIt,
  smsWithBody,
  type CustomerQuote,
  type LinkPicture,
} from "@/lib/quote-link/view";
import { christmasBanner, trackColourKind } from "@/lib/quote-link/christmas";
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

type View = CustomerQuote & {
  mockupUrl: string | null;
  pictures: LinkPicture[];
  galleryUrls: string[];
  // Take 3: the documents Keenan ticked or uploaded, and the agreement.
  documents: LinkDocument[];
  agreement: LinkAgreement | null;
};

const sameRuns = (a: readonly number[] | null, b: readonly number[]) =>
  a !== null && a.length === b.length && a.every((value, at) => value === b[at]);
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

  return view.quote.accepted ? <AgreedQuote token={token} view={view} /> : <LiveQuote token={token} view={view} />;
}

function LiveQuote({ token, view }: { token: string; view: View }) {
  const { quote, words } = view;
  // The options worth showing, biggest first, each with its price. The
  // customer's own last build (take 3) isn't one of Keenan's options: it is
  // Build your own, after them.
  const shown = useMemo(() => linkOffers(quote).filter((priced) => !isCustomerOffer(priced.offer)), [quote]);
  const theirs = useMemo(() => customerOffer(quote), [quote]);
  const buildable = useMemo(() => buildableRuns(quote), [quote]);
  const canBuild = offersBuildYourOwn(quote);
  const many = shown.length > 1 || canBuild;
  const tracks = useMemo(() => tracksUsed(quote), [quote]);

  const serverBooked: Booked | null =
    view.bookedAt && view.bookedOption ? { at: view.bookedAt, option: view.bookedOption, offer: view.bookedOffer } : null;
  const [booked, setBooked] = useState<Booked | null>(serverBooked);

  // It opens on the option they booked, else the one chosen at the
  // meeting, else the biggest.
  const [chosenId, setChosenId] = useState<string | null>(() =>
    openingOffer(shown, { booked: view.bookedOffer, meeting: quote.meetingOffer }),
  );
  // Build your own (take 3): on, the areas they ticked, starting from the
  // option they were looking at (whose box count it keeps). The page opens
  // on their own build when that is what they booked.
  const [wantsBuild, setWantsBuild] = useState(() => canBuild && theirs !== null && view.bookedOffer === CUSTOMER_OFFER_ID);
  const [buildRuns, setBuildRuns] = useState<number[]>(() => (theirs ? theirs.runs.filter((at) => buildable.includes(at)) : []));
  const [savedBuild, setSavedBuild] = useState<number[] | null>(() => (theirs ? [...theirs.runs] : null));
  const startFrom: PricedOffer | null = shown.find((priced) => priced.offer.id === chosenId) ?? shown[0] ?? null;
  const built = wantsBuild && canBuild ? customOption(quote, buildRuns, startFrom?.offer.id ?? null) : null;
  // Building only while their build has a price. If Keenan has since changed
  // the quote so none of their areas can be ticked, the page is back on his
  // option, never on nothing.
  const building = built !== null;
  const selected: PricedOffer | null = built
    ? { offer: built.offer, totals: built.totals, feet: offerFeet(quote.runs, built.offer), everyRun: false }
    : startFrom;
  // See it on your house (round 13): the look on screen, by name, or none
  // (the option's own picture, else the Main). Picking an option, here or
  // in the price below, goes back to that option's picture.
  const [look, setLook] = useState<string | null>(null);
  const seeIt = showsSeeIt(view.pictures, shown.length);
  // Round 17: See the breakdown, inside the picked offer's card (or under
  // Build your own); opening another card's picks that offer.
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const openBreakdown = (id: string) => {
    if (sending) return;
    if (building || selected?.offer.id !== id) {
      choose(id);
      setBreakdownOpen(true);
      return;
    }
    setBreakdownOpen((open) => !open);
  };
  // Round 17: their track colour's lines; a rush fee only when charged.
  const colourLines = colourSectionLines({
    words,
    colourName: quote.trackColourName,
    custom: quote.trackCustom,
    timing: quote.colourTiming,
    rushFee: quote.rushFee,
  });
  // Round 17: the Christmas banner, by the date for their own track colour.
  const banner = christmasBanner({
    today: view.today,
    christmas: view.christmas,
    track: trackColourKind({ name: quote.trackColourName, custom: quote.trackCustom }),
  });
  // On a laptop the picture gets its own column (2026-11-12).
  const laptopPicture = Boolean(view.mockupUrl) || (seeIt && selected !== null);
  const totals: QuoteTotals | null = selected?.totals ?? null;
  const name = selected ? customerChoice(selected.offer.name) : "";
  // Inside a sentence their own build reads "your own option".
  const nameInSentence = selected && isCustomerOffer(selected.offer) ? customerChoiceInSentence(selected.offer.name) : name;
  const total = totals ? screenTotal(totals.subtotal, quote.gstEnabled) : "";
  const minimum = quote.minJobTotal && quote.minJobTotal > 0 ? quote.minJobTotal : null;
  const atMinimum = Boolean(totals?.minimumApplied) && minimum !== null;
  const holdPassed = priceHoldPassed(view.validUntil, view.today);
  const everyLines = useMemo(() => shown.flatMap((priced) => (priced.totals ? [priced.totals.lines] : [])), [shown]);
  // Round 17: where they're at. Step 2 is done once they book, sign, or
  // Keenan marks the quote accepted.
  const tracker = trackerSteps({
    words,
    chosen: booked !== null || Boolean(view.agreement?.signed) || quote.accepted,
    sign: view.agreement !== null,
    siteVisitOn: view.progress.siteVisitOn,
    siteVisitDone: view.progress.siteVisitDone,
    installOn: view.nextSteps.installOn,
    installed: view.progress.installed,
  });

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
    if (!selectedId || building) return;
    const timer = window.setTimeout(() => {
      void saveSelection(token, selectedId).catch(() => undefined);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [token, selectedId, building]);

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
    const ownRuns = [...buildRuns];
    setPhase("sending");
    setError(null);
    setSlow(false);
    try {
      // Their own build goes as the areas they ticked; the server prices it.
      const result = building ? await bookCustom(token, ownRuns, startFrom?.offer.id ?? null) : await bookInstall(token, offer);
      if (result.ok) {
        if (!result.preview) {
          setBooked({ at: new Date().toISOString(), option: result.option, offer });
          if (building) setSavedBuild(ownRuns);
        }
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
  const backToQuote = () => {
    setPhase("quote");
    window.requestAnimationFrame(() => heading.current?.focus());
  };

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

  // The picked offer's breakdown (round 17), inside its card once opened:
  // every area, then the box, upper access, any discount and the total.
  const breakdown =
    selected && totals ? (
      <>
        <h3 className="sr-only" data-testid="whats-in">
          {fillLine(words.whats_in, { name: nameInSentence })}
        </h3>
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
      </>
    ) : null;

  const matchesBooked =
    booked !== null && selected !== null && booked.offer === selected.offer.id && (!building || sameRuns(savedBuild, buildRuns));
  const textHref = smsWithBody(view.company.phone, `Hi Keenan, a question about the quote for ${view.address}: `);
  const choose = (id: string) => {
    if (sending) return;
    setWantsBuild(false);
    setChosenId(id);
    setLook(null);
  };
  // Build your own starts from the option on screen.
  const startBuilding = () => {
    if (sending || building) return;
    const from = (startFrom?.offer.runs ?? []).filter((at) => buildable.includes(at));
    setBuildRuns(from.length > 0 ? from : buildable);
    setWantsBuild(true);
    setLook(null);
  };

  // Sign (take 3): their own build is booked first, so the agreement names
  // what the quote now holds; then the signing, which books that option.
  const sign = async (signer: string, signaturePng: string): Promise<SignOutcome> => {
    if (!selected) return { ok: false, message: "Pick an option first." };
    const offer = selected.offer.id;
    if (building && !(booked?.offer === CUSTOMER_OFFER_ID && sameRuns(savedBuild, buildRuns))) {
      const ownRuns = [...buildRuns];
      const saved = await bookCustom(token, ownRuns, startFrom?.offer.id ?? null);
      if (!saved.ok) return { ok: false, message: saved.message };
      if (!saved.preview) {
        setBooked({ at: new Date().toISOString(), option: saved.option, offer });
        setSavedBuild(ownRuns);
      }
    }
    const result = await signAgreement(token, { name: signer, signature: signaturePng, offer });
    if (!result.ok) return { ok: false, message: result.message };
    if (!result.preview) setBooked({ at: result.signedAt, option: result.option, offer });
    return { ok: true, signerName: result.signerName, signedAt: result.signedAt, preview: result.preview };
  };

  return (
    <>
      {/* Round 17: the Christmas banner, at the very top, full width. */}
      {banner ? <ChristmasBanner banner={banner} /> : null}
      <main className={cn("mx-auto flex max-w-xl flex-col pb-36", laptopPicture ? LAPTOP_PAGE : LAPTOP_SINGLE)} data-testid="quote-live">
        {/* Round 17: where they're at, near the top (on a laptop, the full
            width above the top section). */}
        <RooflineTracker steps={tracker} title={words.tracker_title} pay={words.tracker_pay} className="px-5 pt-6 pb-3 lg:pt-8 lg:pb-2" />
        <div className={laptopPicture ? LAPTOP_TOP : "contents"} data-testid="laptop-top">
        {/* 1. Their house and the price of the option on screen. With See
            it on your house, it takes the picture's place (round 17: on a
            phone too, so the house shows once, with its Looks, right under
            the price). */}
        {view.mockupUrl && !seeIt ? (
          <div className={cn(AREA.pic, "lg:px-5")}>
            <Mockup
              url={view.mockupUrl}
              caption={selected && leavesRunsOut(quote.runs.length, selected.offer.runs) ? words.link_mockup_caption : null}
              laptopFrame
            />
          </div>
        ) : null}
        <section aria-labelledby="quote-for" className={cn("flex flex-col", laptopPicture && AREA.head)}>
          <div className="flex flex-col px-5 pt-6 lg:pt-10">
            <Greeting firstName={view.firstName} headingRef={heading} />
            {selected && totals ? (
              <>
                <p className="mt-4 text-base font-semibold text-pretty text-muted-foreground" data-testid="hero-option">
                  {name}
                </p>
                {/* A row tapped further down changes this out of view; the
                    polite announcer under Your options says the option and
                    its total once they settle, so it isn't heard twice. */}
                <p className="mt-1 text-[2.75rem] leading-none font-bold tracking-tight lg:text-5xl" data-testid="hero-total">
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

          {booked ? (
            <p role="status" className="mx-5 mt-6 rounded-md border px-4 py-3 text-base text-pretty" data-testid="quote-booked-before">
              On {formatLongDay(calgaryDateOf(booked.at))} you asked us to book your install:{" "}
              {customerChoiceInSentence(booked.option)}. Keenan will be in touch {inTouchAbout(view.nextSteps.installOn)}.
            </p>
          ) : null}
        </section>

        {/* 3. See it on your house (round 13): one picture, the Looks and
            the Options under it. Tapping an option here picks it in the
            price below; picking one there swaps the picture. Round 17:
            right under the price on a phone, so it's easy to spot; beside
            the offers on a laptop. */}
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
            className={AREA.pic}
          />
        ) : null}

        {/* 4. What makes it worth it, in Keenan's words from Settings. */}
        <ProductPoints points={view.productPoints} className={laptopPicture ? "lg:hidden" : undefined} />

        {/* 5. Your options: a row per option to pick from, then what's in
            it, line by line. With one option and no scene, its picture
            sits here, as before. */}
        <section aria-labelledby="your-options" className={cn("mt-12 px-5", laptopPicture && cn(AREA.opts, "lg:mt-10"))} data-testid="quote-options">
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

              {/* Round 17: each offer a card (name, description, feet, price)
                  with See the breakdown inside it; the breakdown is the
                  picked offer's, so opening another card's picks it. */}
              <fieldset className="mt-4" data-testid="option-rows">
                <legend className="sr-only">{many ? "Your options" : "Your price"}</legend>
                {/* 12 px between rows: room for the meeting's tag, which
                    sits on its row's top edge. */}
                <div className="flex flex-col gap-3">
                  {shown.map((priced) => {
                    const picked = !building && priced.offer.id === selected.offer.id;
                    return (
                      <OptionRow
                        key={priced.offer.id}
                        priced={priced}
                        runs={quote.runs}
                        selected={many && picked}
                        radio={many}
                        meeting={priced.offer.id === quote.meetingOffer}
                        meetingTag={words.link_meeting_tag}
                        feetLine={words.price_feet}
                        gstEnabled={quote.gstEnabled}
                        disabled={sending}
                        onChoose={choose}
                        breakdownOpen={breakdownOpen && picked}
                        onBreakdown={() => openBreakdown(priced.offer.id)}
                      >
                        {picked ? breakdown : null}
                      </OptionRow>
                    );
                  })}
                  {canBuild ? (
                    <BuildYourOwnRow
                      title={words.link_build_title}
                      selected={building}
                      totals={building ? totals : null}
                      gstEnabled={quote.gstEnabled}
                      disabled={sending}
                      onChoose={startBuilding}
                    />
                  ) : null}
                </div>
                {building ? (
                  <>
                    <BuildYourOwn
                      note={words.link_build_note}
                      runs={quote.runs}
                      buildable={buildable}
                      picked={buildRuns}
                      disabled={sending}
                      onChange={setBuildRuns}
                    />
                    <button
                      type="button"
                      aria-expanded={breakdownOpen}
                      aria-controls="offer-breakdown-own"
                      disabled={sending}
                      onClick={() => setBreakdownOpen((open) => !open)}
                      className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-md text-sm font-semibold outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                      data-testid="option-breakdown-toggle"
                    >
                      <ChevronDown aria-hidden="true" className={cn("size-4 transition-transform duration-200 motion-reduce:transition-none", breakdownOpen && "rotate-180")} />
                      {breakdownOpen ? "Hide the breakdown" : "See the breakdown"}
                    </button>
                    {breakdownOpen ? (
                      <div id="offer-breakdown-own" className="pb-2" data-testid="option-breakdown">
                        {breakdown}
                      </div>
                    ) : null}
                  </>
                ) : null}
              </fieldset>
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
        </div>

        <div className={LAPTOP_BELOW} data-testid="laptop-below">
        {laptopPicture ? <ProductPoints points={view.productPoints} className="hidden lg:block" laptop /> : null}
        <div className="flex flex-col">
        {/* Take 3: each track type the options use, in plain words with a drawing. */}
        <AboutYourTrack tracks={tracks} words={words} />

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
          {colourLines.made ? (
            <>
              <p className="mt-2 text-pretty" data-testid="quote-colour-made">
                {colourLines.made}
              </p>
              <p className="mt-2 text-pretty" data-testid="quote-colour-timing">
                {colourLines.timing}
              </p>
            </>
          ) : (
            <>
              <p className="mt-2 text-pretty" data-testid="quote-colour-stock">
                {colourLines.stock}
              </p>
              <p className="mt-2 text-pretty" data-testid="quote-colour-other">
                {colourLines.other}
              </p>
            </>
          )}
        </section>

        </div>

        {/* Take 3: what Keenan ticked or uploaded for them, then the
            agreement when he asked for it to be signed here. On a laptop
            they sit under the offers. */}
        <div className="flex flex-col">
        <LinkDocuments documents={view.documents} title={words.link_docs_title} />
        {view.agreement && selected && totals ? (
          <AgreementSection
            agreement={view.agreement}
            words={words}
            optionLabel={nameInSentence}
            optionTotal={total}
            copyHref={`/q/${token}/agreement`}
            disabled={sending}
            onSign={sign}
          />
        ) : null}
        </div>

        <div className="flex flex-col">
        {/* 7. Tap to open, closed until tapped. See our work leads once
            there are photos; until then it is hidden. */}
        <section aria-label="More about your install" className="mt-12 border-t" data-testid="quote-more">
          {/* Round 17: What we'll need moved here from the old four steps. */}
          {view.nextSteps.whatWeNeed ? <WhatWeNeed text={view.nextSteps.whatWeNeed} variant="row" /> : null}
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
        </div>
        </div>
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
        summary={selected && totals ? `${name}, ${total}` : null}
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
          {view.agreement ? (
            <p className="text-pretty">There’s nothing to pay today. Keenan will be in touch {inTouchAbout(view.nextSteps.installOn)}.</p>
          ) : (
            <p className="text-pretty">
              There’s nothing to sign or pay today. Keenan will be in touch {inTouchAbout(view.nextSteps.installOn)} and go
              through the agreement.
            </p>
          )}
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
function AgreedQuote({ token, view }: { token: string; view: View }) {
  const { quote, words } = view;
  // A quote accepted before options has no option to name; the rest stands.
  const agreed = offerChoice(quote, quote.acceptedOffer);
  // Only the tracks in what was agreed.
  const agreedTracks = agreed ? tracksUsed({ runs: quote.runs, offers: [agreed.offer] }) : [];
  // Round 17: a house with scenes shows its Looks here too, with the agreed
  // option's picture first (no Options row: the choice is made).
  const [look, setLook] = useState<string | null>(null);
  const seeIt = agreed !== null && linkLooks(view.pictures).length > 0;
  const laptopPicture = Boolean(view.mockupUrl) || seeIt;
  const textHref = smsWithBody(view.company.phone, `Hi Keenan, a question about the install at ${view.address}: `);
  // Round 17: where they're at; step 2 is done once Keenan marks it accepted.
  const tracker = trackerSteps({
    words,
    chosen: true,
    sign: view.agreement !== null,
    siteVisitOn: view.progress.siteVisitOn,
    siteVisitDone: view.progress.siteVisitDone,
    installOn: view.nextSteps.installOn,
    installed: view.progress.installed,
  });

  return (
    <>
      <main className={cn("mx-auto flex max-w-xl flex-col pb-36", laptopPicture ? LAPTOP_PAGE : LAPTOP_SINGLE)} data-testid="quote-agreed">
        <RooflineTracker steps={tracker} title={words.tracker_title} pay={words.tracker_pay} className="px-5 pt-6 pb-3 lg:pt-8 lg:pb-2" />
        <div className={laptopPicture ? LAPTOP_TOP : "contents"} data-testid="laptop-top">
        {view.mockupUrl && !seeIt ? (
          <div className={cn(AREA.pic, "lg:px-5")}>
            <Mockup
              url={view.mockupUrl}
              caption={agreed && leavesRunsOut(quote.runs.length, agreed.offer.runs) ? words.link_mockup_caption : null}
              laptopFrame
            />
          </div>
        ) : null}
        <section aria-labelledby="quote-for" className={cn("flex flex-col", laptopPicture && AREA.head)}>
          <div className="flex flex-col px-5 pt-6 lg:pt-10">
            <Greeting firstName={view.firstName} />
            {agreed ? (
              <>
                <p className="mt-4 text-base font-semibold text-pretty text-muted-foreground" data-testid="agreed-choice">
                  Your choice: {customerChoice(agreed.name)}
                </p>
                <p className="mt-1 text-[2.75rem] leading-none font-bold tracking-tight lg:text-5xl" data-testid="agreed-total">
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

        {seeIt && agreed ? (
          <SeeItOnYourHouse
            pictures={view.pictures}
            offers={[]}
            selectedId={agreed.offer.id}
            selectedName={customerChoice(agreed.name)}
            look={look}
            caption={leavesRunsOut(quote.runs.length, agreed.offer.runs) ? words.link_mockup_caption : null}
            disabled={false}
            onLook={setLook}
            onOption={() => {}}
            className={AREA.pic}
          />
        ) : null}

        {agreed ? (
          <section aria-labelledby="whats-in" className={cn("mt-12 px-5", laptopPicture && cn(AREA.opts, "lg:mt-10"))}>
            <h2 id="whats-in" className="text-xl font-bold text-pretty" data-testid="whats-in">
              {fillLine(words.whats_in, { name: isCustomerOffer(agreed.offer) ? customerChoiceInSentence(agreed.name) : agreed.name })}
            </h2>
            {seeIt ? null : (
              <OptionPicture
                pictures={view.pictures}
                offerId={agreed.offer.id}
                name={customerChoice(agreed.name)}
                caption={leavesRunsOut(quote.runs.length, agreed.offer.runs) ? words.link_mockup_caption : null}
              />
            )}
            <p className="mt-4 text-sm text-pretty text-muted-foreground tabular-nums" data-testid="whats-in-feet">
              {feetWords(words.price_feet, offerFeet(quote.runs, agreed.offer))}
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
        </div>

        <div className={LAPTOP_BELOW} data-testid="laptop-below">
        <div className="flex flex-col">
          <AboutYourTrack tracks={agreedTracks} words={words} />
        </div>
        <div className="flex flex-col">
        <LinkDocuments documents={view.documents} title={words.link_docs_title} />
        {view.agreement && agreed ? (
          <AgreementSection
            agreement={view.agreement}
            words={words}
            optionLabel={isCustomerOffer(agreed.offer) ? customerChoiceInSentence(agreed.name) : agreed.name}
            optionTotal={agreed.total}
            copyHref={`/q/${token}/agreement`}
            disabled={false}
            onSign={async (signer, signaturePng) => {
              const result = await signAgreement(token, { name: signer, signature: signaturePng, offer: agreed.id });
              return result.ok
                ? { ok: true, signerName: result.signerName, signedAt: result.signedAt, preview: result.preview }
                : { ok: false, message: result.message };
            }}
          />
        ) : null}
        </div>

        <div className="flex flex-col">
        <section aria-label="More about your install" className="mt-12 border-t" data-testid="quote-more">
          {view.nextSteps.whatWeNeed ? <WhatWeNeed text={view.nextSteps.whatWeNeed} variant="row" /> : null}
          <Warranty warranty={view.warranty} serviceCallFee={view.serviceCallFee} />
        </section>

        <Footer company={view.company} />
        </div>
        </div>
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

// The link on a laptop or desktop (Keenan, 2026-11-12; fixed the same day).
// From 1024 px wide the page is two parts. The top is its own grid: the
// picture of their house, with its Looks and Options, beside the greeting,
// the price and Your options. The picture stays in view only while the
// offers scroll, because a sticky item sticks within its own grid, and
// this grid ends with the offers. Below, everything else runs in one
// centred column at a reading width, in the phone's order. Both wrappers
// are display: contents on a phone, so phones keep the single column
// exactly as it was. With no picture, one reading column.
const LAPTOP_PAGE = "lg:max-w-6xl lg:px-6 2xl:max-w-7xl";
const LAPTOP_SINGLE = "lg:max-w-2xl";
const LAPTOP_TOP =
  "contents lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start lg:gap-x-12 xl:gap-x-20 lg:[grid-template-areas:'pic_head'_'pic_opts']";
const LAPTOP_BELOW = "contents lg:mx-auto lg:mt-6 lg:flex lg:w-full lg:max-w-2xl lg:flex-col";
const AREA = {
  // Sticky only where the whole picture fits on the screen.
  pic: "lg:[grid-area:pic] lg:mt-10 [@media(min-width:1024px)_and_(min-height:760px)]:sticky [@media(min-width:1024px)_and_(min-height:760px)]:top-6",
  head: "lg:[grid-area:head] lg:pt-4",
  opts: "lg:[grid-area:opts]",
};

function Greeting({ firstName, headingRef }: { firstName: string; headingRef?: React.Ref<HTMLHeadingElement> }) {
  return (
    <h1 id="quote-for" ref={headingRef} tabIndex={-1} className="text-2xl font-bold text-balance outline-none lg:text-3xl">
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
// total; then its feet ("165 ft of lights"; round 16), on one line
// (the critique, 2026-11-10: rows ran 105 to 113 px). The one on screen has
// a 2 px navy border and a filled navy radio; gold stays Book my install's
// alone. The meeting's choice carries a small navy tag on the row's top
// edge, like the iPad's "Your choice", so it adds no height. A native radio
// underneath, so arrow keys and screen readers work as they expect.
// One offer on the link (round 17, Keenan, 2026-11-12): its name and price,
// Keenan's description, the feet ("165 ft of lights"), then See the
// breakdown, which opens inside the card to every area (its feet, its track
// where it isn't Hat track, its price) with the box, upper access, any
// discount and the total below. The card is a radio row to pick from when
// there is more than one; the breakdown shown is the picked offer's, so
// opening another card's picks it.
function OptionRow({
  priced,
  runs,
  selected,
  radio,
  meeting,
  meetingTag,
  feetLine,
  gstEnabled,
  disabled,
  onChoose,
  breakdownOpen,
  onBreakdown,
  children,
}: {
  priced: PricedOffer;
  runs: QuoteRun[];
  selected: boolean;
  // False for a quote with one offer: nothing to pick, the card just reads.
  radio: boolean;
  meeting: boolean;
  meetingTag: string;
  feetLine: string;
  gstEnabled: boolean;
  disabled: boolean;
  onChoose: (id: string) => void;
  breakdownOpen: boolean;
  onBreakdown: () => void;
  // The breakdown itself, for the picked card while it is open.
  children?: React.ReactNode;
}) {
  const { offer, totals } = priced;
  if (!totals) return null;
  const regionId = `offer-breakdown-${offer.id}`;
  const body = (
    <span className="flex items-start gap-3">
      {radio ? (
        <span
          aria-hidden="true"
          className={cn(
            "mt-px flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-150",
            selected ? "border-navy bg-navy" : "border-input bg-background",
          )}
        >
          {selected ? <span className="size-2.5 rounded-full bg-white" /> : null}
        </span>
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-baseline justify-between gap-3">
          <span className="line-clamp-2 min-w-0 text-base leading-snug font-semibold">{offer.name}</span>
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
        {offer.description ? (
          <span className="text-[0.9375rem] leading-snug text-pretty" data-testid="option-description">
            {offer.description}
          </span>
        ) : null}
        {/* The feet: what they compare the options by (round 16). */}
        <span className="text-sm leading-[1.3] text-muted-foreground tabular-nums" data-testid="option-feet">
          {feetWords(feetLine, offerFeet(runs, offer))}
        </span>
      </span>
    </span>
  );
  return (
    <div
      className={cn("relative rounded-md transition-colors duration-150", selected ? "border-2 border-navy" : "border border-border")}
      data-testid="option-row"
      data-offer={offer.id}
      data-selected={selected}
    >
      {radio ? (
        <label
          className={cn(
            "flex min-h-11 cursor-pointer flex-col rounded-md",
            "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background",
            // 14 px on top, clear of the meeting's tag, selected or not.
            selected ? "px-[0.8125rem] pt-3" : "px-[0.875rem] pt-[0.8125rem] hover:bg-muted",
          )}
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
          {body}
        </label>
      ) : (
        <div className={selected ? "px-[0.8125rem] pt-3" : "px-[0.875rem] pt-[0.8125rem]"}>{body}</div>
      )}
      <button
        type="button"
        aria-expanded={breakdownOpen}
        aria-controls={regionId}
        disabled={disabled}
        onClick={onBreakdown}
        className={cn(
          "inline-flex min-h-11 items-center gap-1.5 rounded-md text-sm font-semibold outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring",
          radio ? "ml-[3.125rem]" : "ml-[0.875rem]",
        )}
        data-testid="option-breakdown-toggle"
      >
        <ChevronDown aria-hidden="true" className={cn("size-4 transition-transform duration-200 motion-reduce:transition-none", breakdownOpen && "rotate-180")} />
        {breakdownOpen ? "Hide the breakdown" : "See the breakdown"}
      </button>
      {breakdownOpen && children ? (
        <div id={regionId} className={cn("pr-[0.875rem] pb-4", radio ? "pl-[3.125rem]" : "pl-[0.875rem]")} data-testid="option-breakdown">
          {children}
        </div>
      ) : null}
      {/* 18 px tall, centred on the top border. */}
      {meeting ? (
        <span
          className="absolute -top-[0.5625rem] right-3 rounded-sm border border-navy bg-background px-1.5 text-[0.8125rem] leading-4 font-semibold text-navy"
          data-testid="option-meeting-tag"
        >
          {meetingTag}
        </span>
      ) : null}
    </div>
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

// laptop: the copy shown below the offers on a laptop (the phone's copy sits
// above them, hidden there), with its own id and no test id.
function ProductPoints({ points, className, laptop = false }: { points: CustomerQuote["productPoints"]; className?: string; laptop?: boolean }) {
  if (points.length === 0) return null;
  const id = laptop ? "getting-laptop" : "getting";
  return (
    <section aria-labelledby={id} className={cn("mt-12 px-5", className)}>
      <h2 id={id} className="text-xl font-bold">
        What you’re getting
      </h2>
      <ul className="mt-5 flex flex-col gap-4" data-testid={laptop ? undefined : "quote-points"}>
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
// holds Call and Text alone. On a laptop (round 17) its middle names the
// option on screen and its price, "Full wrap, $5,136", following what they
// pick (Build your own and a Black Friday price included); a phone's bar
// stays as it is.
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
  summary = null,
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
  summary?: string | null;
}) {
  const contact = cn(
    "inline-flex h-12 shrink-0 items-center justify-center gap-1.5 rounded-md border border-input bg-background px-3 text-base font-semibold outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring lg:px-5",
    !canBook && "flex-1 lg:flex-none",
  );
  return (
    <aside aria-label={canBook ? "Book your install" : "Call or text us"} className="fixed inset-x-0 bottom-0 z-20 border-t bg-background pb-[env(safe-area-inset-bottom)]" data-testid="quote-bar">
      {error ? (
        <p role="alert" className="mx-auto max-w-xl px-4 pt-3 text-sm font-semibold text-pretty text-destructive lg:max-w-6xl lg:px-11 lg:text-right 2xl:max-w-7xl">
          {error}
        </p>
      ) : slow ? (
        <p role="status" className="mx-auto max-w-xl px-4 pt-3 text-sm font-semibold text-pretty lg:max-w-6xl lg:px-11 lg:text-right 2xl:max-w-7xl">
          {SLOW}
        </p>
      ) : null}
      <div className="mx-auto flex max-w-xl items-center gap-2 px-4 py-2.5 lg:max-w-6xl lg:px-11 2xl:max-w-7xl">
        <a href={callHref} className={contact} data-testid="bar-call">
          <Phone aria-hidden="true" className="size-[1.125rem]" />
          Call
        </a>
        <a href={textHref} className={contact} data-testid="bar-text">
          <MessageSquare aria-hidden="true" className="size-[1.125rem]" />
          Text
        </a>
        {summary ? (
          // The price is already read out where it changes, so this repeat
          // of it stays quiet for screen readers.
          <p
            aria-hidden="true"
            className="hidden min-w-0 flex-1 truncate px-4 text-center text-lg font-semibold tabular-nums lg:block"
            data-testid="bar-summary"
          >
            {summary}
          </p>
        ) : null}
        {!canBook ? null : booked ? (
          <p className="min-w-0 flex-1 text-right text-sm text-pretty lg:w-80 lg:flex-none lg:text-base" data-testid="bar-requested">
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
              "inline-flex h-12 min-w-0 flex-1 items-center justify-center rounded-md bg-primary px-4 text-base font-semibold whitespace-nowrap text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 lg:ml-auto lg:w-80 lg:flex-none",
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
  className,
}: {
  className?: string;
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
  // Round 17: full screen keeps the looks. Its row is the option's own
  // picture (when there is one) and each look, one always on, so they can
  // flip through their house in every look without closing it.
  const optionPictureNow = offerPicture(pictures, selectedId);
  const viewerLooks: ViewerLooks | undefined =
    looks.length > 0
      ? {
          items: [
            ...(optionPictureNow ? [{ key: OPTION_PICTURE, label: selectedName, on: lookOn === null, url: optionPictureNow.picture.url }] : []),
            ...looks.map((picture) => ({
              key: picture.name.trim(),
              label: picture.name.trim(),
              on: lookOn === picture.name.trim(),
              url: picture.url,
            })),
          ],
          onPick: (key) => onLook(key === OPTION_PICTURE ? null : key),
        }
      : undefined;
  const chip = (on: boolean) =>
    cn(
      "inline-flex min-h-12 items-center rounded-md px-4 text-base font-semibold outline-none transition-colors duration-150",
      "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60",
      on ? "border-2 border-navy bg-navy px-[0.9375rem] text-white" : "border border-border bg-background text-foreground hover:bg-muted",
    );
  return (
    <section aria-labelledby="see-it" className={cn("mt-12 px-5", className)} data-testid="see-it">
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
          url={onScreen.picture.url}
          caption={onScreen.kind === "own" ? null : caption}
          looks={viewerLooks}
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
      {offers.length > 0 ? (
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
      ) : null}
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
  laptopFrame = false,
  ids = HERO_IDS,
  looks,
}: {
  url: string;
  caption: string | null;
  alt?: string;
  openLabel?: string;
  inset?: boolean;
  // The hero, full bleed on a phone, framed like the others on a laptop.
  laptopFrame?: boolean;
  ids?: { image: string; caption: string; viewer: string };
  // Round 17: the looks to flip through in full screen.
  looks?: ViewerLooks;
}) {
  const [open, setOpen] = useState(false);
  // The picture that failed, by its address: a new picture (another look)
  // starts fresh, and full screen stays open while it changes.
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const broken = brokenUrl === url;
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
    if (image && image.complete && image.naturalWidth === 0) setBrokenUrl(image.getAttribute("src"));
  }, []);
  // A picture that fails swaps the opener for the refresh note, but full
  // screen stays mounted: open, it shows its own note (and a look that
  // still loads can be picked); closed, nothing reopens it by itself.
  return (
    <figure className="relative">
      {broken ? (
        <PictureNeedsRefresh />
      ) : (
      <button
        ref={opener}
        type="button"
        onClick={() => setOpen(true)}
        aria-label={openLabel}
        className={cn(
          "group relative block aspect-[3/2] w-full overflow-hidden bg-navy outline-none focus-visible:outline-solid focus-visible:outline-3 focus-visible:-outline-offset-4 focus-visible:outline-white",
          // Framed like the deck's pictures (2026-11-11): rounded, a hairline
          // edge and a soft shadow, so the house sits just off the white page.
          inset && "rounded-2xl border border-navy/15 shadow-[0_22px_44px_-24px_rgba(19,46,63,0.6),0_8px_18px_-12px_rgba(19,46,63,0.35)]",
          laptopFrame &&
            "lg:rounded-2xl lg:border lg:border-navy/15 lg:shadow-[0_22px_44px_-24px_rgba(19,46,63,0.6),0_8px_18px_-12px_rgba(19,46,63,0.35)]",
          "pointer-fine:cursor-zoom-in",
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a private photo behind a ten-minute signed link */}
        <img
          key={url}
          ref={picture}
          src={url}
          alt={alt}
          className={cn("block size-full object-contain", inset && "animate-in fade-in duration-300 motion-reduce:animate-none")}
          onError={() => setBrokenUrl(url)}
          data-testid={ids.image}
        />
        <span
          aria-hidden="true"
          className="absolute right-3 bottom-3 flex size-11 items-center justify-center rounded-md border border-white/40 bg-navy text-white"
        >
          <Maximize2 className="size-5" strokeWidth={1.5} />
        </span>
      </button>
      )}
      {caption && !broken ? (
        <figcaption className={cn("pt-2 text-sm text-pretty text-muted-foreground", !inset && "px-5", laptopFrame && "lg:px-0")} data-testid={ids.caption}>
          {caption}
        </figcaption>
      ) : null}
      <MockupViewer url={url} alt={alt} open={open} onClose={close} testId={ids.viewer} looks={looks} />
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

// A mouse or trackpad (pointer: fine), read without a render of its own.
const FINE = "(pointer: fine)";
function useFinePointer(): boolean {
  return useSyncExternalStore(
    (changed) => {
      const query = window.matchMedia(FINE);
      query.addEventListener("change", changed);
      return () => query.removeEventListener("change", changed);
    },
    () => window.matchMedia(FINE).matches,
    () => false,
  );
}

// Round 17: the looks in full screen. key OPTION_PICTURE is the option's own
// picture (or the Main); the others are looks by name.
const OPTION_PICTURE = "\u0000option";
type ViewerLooks = { items: { key: string; label: string; on: boolean; url: string }[]; onPick: (key: string) => void };

// A real modal dialog: it sits above the page, keeps focus inside, and
// Escape closes it. The picture is the one already on the page; with looks
// (round 17), a row of them along the bottom swaps it in place.
function MockupViewer({
  url,
  alt,
  open,
  onClose,
  testId,
  looks,
}: {
  url: string;
  alt: string;
  open: boolean;
  onClose: () => void;
  testId: string;
  looks?: ViewerLooks;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const broken = brokenUrl === url;
  const mouse = useFinePointer();
  // The looks as they stand when full screen opens, read without making the
  // dialog's effect run again on every pick.
  const looksRef = useRef(looks);
  useEffect(() => {
    looksRef.current = looks;
  });
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
    if (!open) return;
    // The looks' pictures start loading as full screen opens, so flipping
    // through them is quick (only then: a phone on data never fetches a
    // look nobody asked to see).
    for (const item of looksRef.current?.items ?? []) {
      const image = new Image();
      image.src = item.url;
    }
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
            <PinchZoom
              key={url}
              src={url}
              alt={alt}
              crossOrigin={null}
              onError={() => setBrokenUrl(url)}
              // On a computer (2026-11-12): a click closes it, the wheel or
              // a trackpad pinch zooms. A phone keeps tap to zoom only.
              onTap={mouse ? onClose : undefined}
              wheelZoom
            />
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {looks && looks.items.length > 1 ? (
            <div
              role="group"
              aria-label="Looks"
              className="pointer-events-auto -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]"
              data-testid="viewer-looks"
            >
              {looks.items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  aria-pressed={item.on}
                  onClick={() => looks.onPick(item.key)}
                  className={cn(
                    "inline-flex h-12 shrink-0 items-center rounded-md px-4 text-base font-semibold whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-gold",
                    item.on ? "bg-white text-navy" : "border border-white/45 bg-black/60 text-white hover:bg-white/15",
                  )}
                  data-testid="viewer-look"
                  data-look={item.key === OPTION_PICTURE ? "" : item.key}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-white/80 pointer-fine:hidden">Pinch or double-tap to zoom.</p>
            <p className="hidden text-sm text-white/80 pointer-fine:block">Scroll or double-click to zoom. Click or press Esc to close.</p>
            <button
              type="button"
              onClick={onClose}
              autoFocus
              className="pointer-events-auto inline-flex h-12 items-center gap-2 rounded-md bg-white px-5 text-base font-semibold text-navy outline-none focus-visible:ring-2 focus-visible:ring-gold"
            >
              <X aria-hidden="true" className="size-5" />
              Close
            </button>
          </div>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
