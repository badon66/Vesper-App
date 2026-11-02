"use client";

import { Check, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bookInstall, recordVisit, saveSelection } from "@/app/q/[token]/actions";
import { PinchZoom } from "@/components/meeting/pinch-zoom";
import { ContactButtons, ExpiredQuote } from "@/components/quote-link/quote-shell";
import { DialogPanel } from "@/components/ui/dialog-panel";
import { formatMoney, screenTotal, type QuoteLine } from "@/lib/pricing";
import { optionName, priceSelection, runDetail, runName, type CustomerQuote } from "@/lib/quote-link/view";
import { calgaryDateOf, formatLongDay } from "@/lib/time";
import { cn } from "@/lib/utils";

// The customer's quote, live (Keenan, 2026-11-02; shape confirmed: white
// like a document, Book my install in a bar fixed to the bottom). Their
// name and address, the mockup, the Recommended package line by line, Start
// smaller with a switch per run, the warranty, and the ways to ask. Prices
// come from lib/pricing.ts over the quote's own stored prices; the page
// never sends a price anywhere. Book my install asks once before it books,
// and once booked the page says so instead of offering it again.

type View = CustomerQuote & { mockupUrl: string | null };
type Booked = { at: string; option: string };

const FAILED = "That didn't go through. Check your signal and try again, or call or text us.";
const SLOW = "Still sending. If it doesn't go through, call or text us.";

export function CustomerQuoteView({ token, view }: { token: string; view: View }) {
  const { quote } = view;
  // The runs with feet are the parts of the job; positions stay the quote's own.
  const parts = useMemo(
    () => quote.runs.map((run, at) => ({ run, at })).filter(({ run }) => Math.round(run.feet) > 0),
    [quote.runs],
  );
  const serverBooked: Booked | null = view.bookedAt && view.bookedOption ? { at: view.bookedAt, option: view.bookedOption } : null;
  const [booked, setBooked] = useState<Booked | null>(serverBooked);

  // The page opens at the Recommended package. Once they have asked to
  // book, it opens at their latest choice, so the page matches what they
  // asked for.
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

  const recommended = useMemo(() => priceSelection(quote, null), [quote]);
  const current = useMemo(() => priceSelection(quote, positions), [quote, positions]);
  const option = optionName(quote.runs, positions);
  const total = screenTotal(current.subtotal, quote.gstEnabled);
  const minimum = quote.minJobTotal && quote.minJobTotal > 0 ? quote.minJobTotal : null;
  const atMinimum = current.lines.some((line) => line.label === "Minimum job total");

  const [phase, setPhase] = useState<"quote" | "confirm" | "sending" | "thanks" | "expired">("quote");
  const [thanks, setThanks] = useState<{ option: string; total: string; preview: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  const sending = phase === "sending";
  const heading = useRef<HTMLHeadingElement>(null);
  const smallerHeading = useRef<HTMLHeadingElement>(null);

  // A visit, once per opening. Keenan's own visits are left out on the server.
  useEffect(() => {
    void recordVisit(token).catch(() => undefined);
  }, [token]);

  // Their choice, saved a moment after they stop switching (for Keenan's
  // card; the page itself opens at the Recommended package).
  const firstChoice = useRef(true);
  useEffect(() => {
    if (firstChoice.current) {
      firstChoice.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      void saveSelection(token, positions ?? []).catch(() => undefined);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [token, positions]);

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
      } else if (result.code === "expired") {
        setPhase("expired");
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

  // Back from the thank-you, focus lands on their name, not lost.
  const backToQuote = useCallback(() => {
    setPhase("quote");
    window.requestAnimationFrame(() => heading.current?.focus());
  }, []);

  if (phase === "expired") return <ExpiredQuote company={view.company} />;
  if (phase === "thanks" && thanks) {
    return <ThankYou firstName={view.firstName} thanks={thanks} company={view.company} onBack={backToQuote} />;
  }

  const fullName = [view.firstName, view.lastName].filter(Boolean).join(" ");
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
  const backToRecommended = () => {
    setOn(new Set(parts.map((part) => part.at)));
    window.requestAnimationFrame(() => smallerHeading.current?.focus());
  };

  return (
    <>
      <main className="mx-auto flex max-w-xl flex-col px-4 pt-7 pb-48" data-testid="quote-live">
        <section aria-labelledby="quote-for" className="flex flex-col gap-1">
          <h1 id="quote-for" ref={heading} tabIndex={-1} className="text-3xl font-bold text-balance outline-none">
            {fullName}
          </h1>
          <p className="text-base text-pretty text-muted-foreground">
            {view.address}
            {view.city ? `, ${view.city}` : ""}
          </p>
          {view.validUntil ? (
            <p className="mt-2 text-sm font-semibold" data-testid="quote-valid-until">
              Good until {formatLongDay(view.validUntil)}
            </p>
          ) : null}
        </section>

        {booked ? (
          <p role="status" className="mt-6 rounded-md border border-input px-4 py-3 text-base text-pretty" data-testid="quote-booked-before">
            On {formatLongDay(calgaryDateOf(booked.at))} you asked us to book your install: {booked.option}. Keenan will be
            in touch to set the date.
          </p>
        ) : null}

        {view.mockupUrl ? <Mockup url={view.mockupUrl} /> : null}

        <section aria-labelledby="recommended" className="mt-10 flex flex-col">
          <h2 id="recommended" className="text-2xl font-bold">
            Recommended package
          </h2>
          <p className="mt-1 text-pretty text-muted-foreground">Everything we measured at your house.</p>
          <ul className="mt-4 flex flex-col divide-y rounded-md border" aria-label="The parts of your roofline">
            {parts.map(({ run, at }) => (
              <li key={at} className="flex items-baseline justify-between gap-4 px-4 py-3">
                <span className="min-w-0 font-semibold">{runName(run, at)}</span>
                <span className="shrink-0 text-muted-foreground tabular-nums">{runDetail(run)}</span>
              </li>
            ))}
          </ul>
          <Breakdown lines={recommended.lines} className="mt-5" testId="recommended-lines" />
          <Total subtotal={recommended.subtotal} gstEnabled={quote.gstEnabled} testId="recommended-total" />
          <Promises />
        </section>

        {parts.length > 1 ? (
          <section aria-labelledby="start-smaller" className="mt-12 flex flex-col">
            <h2 id="start-smaller" ref={smallerHeading} tabIndex={-1} className="text-2xl font-bold outline-none">
              Start smaller
            </h2>
            <p className="mt-1 text-pretty text-muted-foreground">
              Switch off any part you&apos;d like to leave for later. The prices stay as quoted, and the control box is
              always included.{minimum ? ` Jobs start at ${formatMoney(minimum)}.` : ""}
            </p>
            <ul className="mt-4 flex flex-col divide-y rounded-md border" data-testid="start-smaller">
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
                      aria-label={`${runName(run, at)}, ${Math.round(run.feet)} feet, ${run.level === "upper" ? "upper" : "lower"} level`}
                      onClick={() => toggle(at)}
                      className="flex min-h-14 w-full items-center justify-between gap-4 px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                    >
                      <span className="min-w-0">
                        <span className="block font-semibold">{runName(run, at)}</span>
                        <span className="block text-sm text-muted-foreground tabular-nums">{runDetail(run)}</span>
                      </span>
                      <span
                        aria-hidden="true"
                        className={cn(
                          "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 transition-colors",
                          isOn ? "border-navy bg-navy" : "border-input bg-muted",
                        )}
                      >
                        <span
                          className={cn(
                            "size-5 rounded-full bg-white shadow-sm transition-transform",
                            isOn ? "translate-x-[1.375rem]" : "translate-x-0.5",
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
            {!allOn ? (
              <div className="mt-5 flex flex-col rounded-md bg-muted px-4 py-4" data-testid="smaller-summary">
                <p className="text-sm font-semibold text-pretty text-muted-foreground">Your total with these parts</p>
                <p className="text-3xl font-bold tabular-nums" data-testid="smaller-total">
                  {total}
                </p>
                {recommended.subtotal > current.subtotal ? (
                  <p className="text-sm text-pretty">
                    {formatMoney(recommended.subtotal - current.subtotal)} less than the Recommended package.
                  </p>
                ) : null}
                {atMinimum && minimum ? (
                  <p className="mt-2 text-sm text-pretty" data-testid="smaller-minimum-note">
                    This is our {formatMoney(minimum)} minimum, so switching parts back on adds little or nothing until the
                    total passes {formatMoney(minimum)}.
                  </p>
                ) : null}
                <Breakdown lines={current.lines} className="mt-3 text-sm" testId="smaller-lines" />
              </div>
            ) : null}
            {!allOn ? (
              <button
                type="button"
                onClick={backToRecommended}
                className="mt-3 inline-flex min-h-11 items-center self-start text-base font-semibold underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Back to the Recommended package
              </button>
            ) : null}
          </section>
        ) : null}

        {view.warranty.trim() ? (
          <section aria-labelledby="warranty" className="mt-12 flex flex-col gap-3">
            <h2 id="warranty" className="text-2xl font-bold">
              Your warranty
            </h2>
            <ul className="flex flex-col gap-2.5 text-base text-pretty" data-testid="quote-warranty">
              {view.warranty
                .split(/\n+/)
                .map((line) => line.trim())
                .filter(Boolean)
                .map((line, at) => (
                  <li key={at} className="flex gap-3">
                    <span aria-hidden="true" className="mt-2.5 size-1.5 shrink-0 rounded-full bg-muted-foreground" />
                    <span>{line}</span>
                  </li>
                ))}
            </ul>
          </section>
        ) : null}

        <section id="questions" aria-labelledby="questions-heading" className="mt-12 flex scroll-mt-6 flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 id="questions-heading" className="text-2xl font-bold">
              Questions?
            </h2>
            <p className="text-pretty text-muted-foreground">Call or text Keenan, or send an email.</p>
          </div>
          <ContactButtons company={view.company} />
          <p className="text-sm text-pretty text-muted-foreground">
            {view.company.name}, {view.company.address}
          </p>
        </section>
      </main>

      <BookBar
        label={allOn ? "Recommended package" : option}
        total={total}
        booked={matchesBooked ? booked : null}
        update={booked !== null && !matchesBooked}
        sending={sending}
        message={slow ? SLOW : error}
        onBook={() => {
          setError(null);
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
              Not yet
            </button>
            <button
              type="button"
              onClick={() => void book()}
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
                {option}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5 px-4 py-3">
              <dt className="text-sm font-semibold text-muted-foreground">Total</dt>
              <dd className="text-xl font-bold tabular-nums" data-testid="confirm-total">
                {total}
              </dd>
            </div>
          </dl>
          <p className="text-pretty">
            There&apos;s nothing to sign or pay today. Keenan will be in touch to set your install date and go through the
            agreement.
          </p>
        </div>
      </DialogPanel>
    </>
  );
}

function Breakdown({ lines, className, testId }: { lines: QuoteLine[]; className?: string; testId: string }) {
  return (
    <dl className={cn("flex flex-col divide-y", className)} data-testid={testId}>
      {lines.map((line, at) => (
        <div key={at} className="flex items-baseline justify-between gap-4 py-2.5">
          <dt className="min-w-0">
            <span className="font-medium">{line.label}</span>
            {line.detail ? <span className="block text-sm text-muted-foreground">{line.detail}</span> : null}
          </dt>
          <dd className="shrink-0 font-semibold tabular-nums">{formatMoney(line.amount)}</dd>
        </div>
      ))}
    </dl>
  );
}

function Total({ subtotal, gstEnabled, testId }: { subtotal: number; gstEnabled: boolean; testId: string }) {
  return (
    <div className="mt-2 flex items-baseline justify-between gap-4 border-t-2 border-foreground pt-3">
      <span className="text-lg font-bold">Total</span>
      <span className="text-3xl font-bold tabular-nums" data-testid={testId}>
        {screenTotal(subtotal, gstEnabled)}
      </span>
    </div>
  );
}

// Always on the page, wherever a price is (Keenan, 2026-11-02).
function Promises() {
  return (
    <ul className="mt-5 flex flex-col gap-2 text-base" data-testid="quote-promises">
      <li className="flex gap-3">
        <Check aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        <span>No payment until your install is complete.</span>
      </li>
      <li className="flex gap-3">
        <Check aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        <span>
          Financing is available.{" "}
          <a href="#questions" className="underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Just ask.
          </a>
        </span>
      </li>
    </ul>
  );
}

// The bar fixed to the bottom: the choice and total they're looking at,
// and the one gold button on the page. Once they've asked to book this
// choice, it says so instead.
function BookBar({
  label,
  total,
  booked,
  update,
  sending,
  message,
  onBook,
}: {
  label: string;
  total: string;
  booked: Booked | null;
  update: boolean;
  sending: boolean;
  message: string | null;
  onBook: () => void;
}) {
  return (
    <aside aria-label="Book your install" className="fixed inset-x-0 bottom-0 z-20 border-t bg-background pb-[env(safe-area-inset-bottom)]">
      {message ? (
        <p role="alert" className="mx-auto max-w-xl px-4 pt-3 text-sm font-semibold text-pretty text-destructive">
          {message}
        </p>
      ) : null}
      <div className="mx-auto flex max-w-xl items-center gap-4 px-4 py-3">
        <div className="min-w-0 flex-1" aria-live="polite">
          <p className="line-clamp-2 text-sm leading-snug font-semibold" data-testid="bar-label">
            {booked ? `Install requested: ${booked.option}` : label}
          </p>
          <p className="text-xl font-bold tabular-nums" data-testid="bar-total">
            {total}
          </p>
        </div>
        {booked ? (
          <p className="shrink-0 text-sm font-semibold text-pretty text-muted-foreground" data-testid="bar-requested">
            Keenan will be in touch.
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
              "inline-flex h-12 min-w-[9.75rem] shrink-0 items-center justify-center rounded-md bg-primary px-5 text-base font-semibold text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              sending && "cursor-progress",
            )}
          >
            {sending ? "Sending" : update ? "Update my choice" : "Book my install"}
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
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 pt-10 pb-16" data-testid="quote-thanks">
      {thanks.preview ? (
        <p role="status" className="rounded-md border border-input px-4 py-3 text-sm font-semibold text-pretty" data-testid="thanks-preview">
          Preview only. You&apos;re signed in to Vesper on this device, so nothing was saved and no notification was sent.
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
          Keenan will be in touch within a day to set your install date and go through the agreement.
        </p>
        <p className="text-base text-pretty text-muted-foreground">
          There&apos;s nothing to sign or pay today. No payment until your install is complete.
        </p>
      </div>
      <dl className="flex flex-col divide-y rounded-md border">
        <div className="flex flex-col gap-0.5 px-4 py-3">
          <dt className="text-sm font-semibold text-muted-foreground">Your choice</dt>
          <dd className="font-semibold text-pretty" data-testid="thanks-option">
            {thanks.option}
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

// Their mockup, full width; a tap opens it full screen to pinch and zoom.
// Space is kept for it while it loads, so the page doesn't jump.
function Mockup({ url }: { url: string }) {
  const [open, setOpen] = useState(false);
  const [broken, setBroken] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    opener.current?.focus();
  }, []);
  if (broken) return <PictureNeedsRefresh className="-mx-4 mt-7 sm:mx-0 sm:rounded-md" />;
  return (
    <figure className="-mx-4 mt-7 sm:mx-0">
      <button
        ref={opener}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open the picture of your house full screen"
        className="block aspect-[3/2] w-full overflow-hidden bg-navy outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:rounded-md"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a private photo behind a ten-minute signed link */}
        <img
          src={url}
          alt="Your house with Vesper lights on, as a mockup"
          className="block size-full object-contain"
          onError={() => setBroken(true)}
          data-testid="quote-mockup"
        />
      </button>
      <figcaption className="px-4 pt-2 text-sm text-pretty text-muted-foreground sm:px-0">
        Your house with the lights on, as in the Recommended package. Tap the picture to look closer.
      </figcaption>
      <MockupViewer url={url} open={open} onClose={close} />
    </figure>
  );
}

function PictureNeedsRefresh({ className, dark = false }: { className?: string; dark?: boolean }) {
  return (
    <div
      className={cn("flex flex-col items-start gap-3 px-4 py-6", dark ? "text-white" : "bg-muted", className)}
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
