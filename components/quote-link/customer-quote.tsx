"use client";

import { Check, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bookInstall, recordVisit, saveSelection } from "@/app/q/[token]/actions";
import { PinchZoom } from "@/components/meeting/pinch-zoom";
import { ContactButtons, ExpiredQuote } from "@/components/quote-link/quote-shell";
import { formatMoney, screenTotal, type QuoteLine } from "@/lib/pricing";
import { priceSelection, runDetail, runName, type CustomerQuote } from "@/lib/quote-link/view";
import { calgaryDateOf, formatLongDay } from "@/lib/time";
import { cn } from "@/lib/utils";

// The customer's quote, live (Keenan, 2026-11-02; shape confirmed: white
// like a document, Book my install in a bar fixed to the bottom). Their
// name and address, the mockup, the Recommended package line by line, Start
// smaller with a switch per run, the warranty, and the ways to ask. Prices
// come from lib/pricing.ts over the quote's own stored prices; the page
// never sends a price anywhere.

type View = CustomerQuote & { mockupUrl: string | null };

const FAILED = "That didn't go through. Check your signal and try again, or call or text us.";

export function CustomerQuoteView({ token, view }: { token: string; view: View }) {
  const { quote } = view;
  // The runs with feet are the parts of the job; positions stay the quote's own.
  const parts = useMemo(
    () => quote.runs.map((run, at) => ({ run, at })).filter(({ run }) => Math.round(run.feet) > 0),
    [quote.runs],
  );
  const [on, setOn] = useState<Set<number>>(() => {
    const saved = view.selection?.filter((at) => parts.some((part) => part.at === at)) ?? [];
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

  const [phase, setPhase] = useState<"quote" | "sending" | "thanks" | "expired">("quote");
  const [booked, setBooked] = useState<{ option: string; total: string; preview: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A visit, once per opening. Keenan's own visits are left out on the server.
  useEffect(() => {
    void recordVisit(token).catch(() => undefined);
  }, [token]);

  // Their choice, saved a moment after they stop switching.
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

  async function book() {
    setPhase("sending");
    setError(null);
    try {
      const result = await bookInstall(token, positions ?? []);
      if (result.ok) {
        setBooked({ option: result.option, total: result.total, preview: Boolean(result.preview) });
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
    }
  }

  if (phase === "expired") return <ExpiredQuote company={view.company} />;
  if (phase === "thanks" && booked) {
    return <ThankYou firstName={view.firstName} booked={booked} company={view.company} onBack={() => setPhase("quote")} />;
  }

  const fullName = [view.firstName, view.lastName].filter(Boolean).join(" ");
  const onlyOne = on.size === 1;
  const toggle = (at: number) =>
    setOn((current) => {
      const next = new Set(current);
      if (next.has(at)) {
        if (next.size > 1) next.delete(at);
      } else {
        next.add(at);
      }
      return next;
    });

  return (
    <>
      <main className="mx-auto flex max-w-xl flex-col px-4 pt-7 pb-44" data-testid="quote-live">
        <section aria-labelledby="quote-for" className="flex flex-col gap-1">
          <h1 id="quote-for" className="text-3xl font-bold text-balance">
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

        {view.bookedAt ? (
          <p role="status" className="mt-6 rounded-md border border-input px-4 py-3 text-base text-pretty" data-testid="quote-booked-before">
            You asked to book your install on {formatLongDay(calgaryDateOf(view.bookedAt))}
            {view.bookedOption ? ` (${view.bookedOption})` : ""}. Keenan will be in touch within a day.
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
            <h2 id="start-smaller" className="text-2xl font-bold">
              Start smaller
            </h2>
            <p className="mt-1 text-pretty text-muted-foreground">
              Switch off any part you&apos;d like to leave for later. The prices stay as quoted, and the control box is
              always included.
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
                      aria-disabled={locked}
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
                          locked && "opacity-60",
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
              <p className="mt-2 text-sm text-muted-foreground">At least one part stays in.</p>
            ) : null}
            <div className="mt-5 flex flex-col rounded-md bg-muted px-4 py-4" aria-live="polite" data-testid="smaller-summary">
              <p className="text-sm font-semibold text-muted-foreground">
                {allOn ? "With every part on, this is the Recommended package" : "Your total with these parts"}
              </p>
              <p className="text-3xl font-bold tabular-nums" data-testid="smaller-total">
                {screenTotal(current.subtotal, quote.gstEnabled)}
              </p>
              {!allOn && recommended.subtotal > current.subtotal ? (
                <p className="text-sm text-pretty">
                  {formatMoney(recommended.subtotal - current.subtotal)} less than the Recommended package.
                </p>
              ) : null}
              {!allOn ? <Breakdown lines={current.lines} className="mt-3 text-sm" testId="smaller-lines" /> : null}
            </div>
            {!allOn ? (
              <button
                type="button"
                onClick={() => setOn(new Set(parts.map((part) => part.at)))}
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
                    <Check aria-hidden="true" className="mt-1 size-4 shrink-0 text-muted-foreground" />
                    <span>{line}</span>
                  </li>
                ))}
            </ul>
          </section>
        ) : null}

        <section aria-labelledby="questions" className="mt-12 flex flex-col gap-4">
          <h2 id="questions" className="text-2xl font-bold">
            Questions?
          </h2>
          <ContactButtons company={view.company} />
          <p className="text-sm text-pretty text-muted-foreground">
            {view.company.name}, {view.company.address}
          </p>
        </section>
      </main>

      <BookBar
        label={allOn ? "Recommended package" : "Your smaller start"}
        total={screenTotal(current.subtotal, quote.gstEnabled)}
        sending={phase === "sending"}
        error={error}
        onBook={() => void book()}
      />
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
        <span>Financing is available. Just ask.</span>
      </li>
    </ul>
  );
}

// The bar fixed to the bottom: the total they're looking at, and the one
// gold button on the page.
function BookBar({
  label,
  total,
  sending,
  error,
  onBook,
}: {
  label: string;
  total: string;
  sending: boolean;
  error: string | null;
  onBook: () => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background pb-[env(safe-area-inset-bottom)]">
      {error ? (
        <p role="alert" className="mx-auto max-w-xl px-4 pt-3 text-sm font-semibold text-pretty text-destructive">
          {error}
        </p>
      ) : null}
      <div className="mx-auto flex max-w-xl items-center gap-4 px-4 py-3">
        <div className="min-w-0 flex-1" aria-live="polite">
          <p className="truncate text-xs font-semibold text-muted-foreground">{label}</p>
          <p className="text-xl font-bold tabular-nums" data-testid="bar-total">
            {total}
          </p>
        </div>
        <button
          type="button"
          onClick={onBook}
          disabled={sending}
          className="inline-flex h-12 shrink-0 items-center rounded-md bg-primary px-5 text-base font-semibold text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-70"
        >
          {sending ? "Sending" : "Book my install"}
        </button>
      </div>
    </div>
  );
}

function ThankYou({
  firstName,
  booked,
  company,
  onBack,
}: {
  firstName: string;
  booked: { option: string; total: string; preview: boolean };
  company: CustomerQuote["company"];
  onBack: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 pt-10 pb-16" data-testid="quote-thanks">
      {booked.preview ? (
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
            {booked.option}
          </dd>
        </div>
        {booked.total ? (
          <div className="flex flex-col gap-0.5 px-4 py-3">
            <dt className="text-sm font-semibold text-muted-foreground">Total</dt>
            <dd className="text-xl font-bold tabular-nums" data-testid="thanks-total">
              {booked.total}
            </dd>
          </div>
        ) : null}
      </dl>
      <ContactButtons company={company} />
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
function Mockup({ url }: { url: string }) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    opener.current?.focus();
  }, []);
  return (
    <figure className="-mx-4 mt-7 sm:mx-0">
      <button
        ref={opener}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open the picture of your house full screen"
        className="block w-full overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-ring sm:rounded-md"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a private photo behind a ten-minute signed link */}
        <img src={url} alt="Your house with Vesper lights on, as a mockup" className="block w-full" data-testid="quote-mockup" />
      </button>
      <figcaption className="px-4 pt-2 text-sm text-muted-foreground sm:px-0">
        Your house with the lights on. Tap the picture to look closer.
      </figcaption>
      {open ? <MockupViewer url={url} onClose={close} /> : null}
    </figure>
  );
}

function MockupViewer({ url, onClose }: { url: string; onClose: () => void }) {
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeButton.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label="Your house with the lights on" className="fixed inset-0 z-50 bg-black" data-testid="mockup-viewer">
      <PinchZoom src={url} alt="Your house with Vesper lights on, as a mockup" />
      <button
        ref={closeButton}
        type="button"
        onClick={onClose}
        className="absolute right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] inline-flex h-12 items-center gap-2 rounded-md bg-white px-5 text-base font-semibold text-navy outline-none focus-visible:ring-2 focus-visible:ring-gold"
      >
        <X aria-hidden="true" className="size-5" />
        Close
      </button>
    </div>
  );
}
