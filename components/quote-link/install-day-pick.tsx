"use client";

import { Check, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { loadInstallDays, pickInstallDay } from "@/app/q/[token]/actions";
import { ContactButtons } from "@/components/quote-link/quote-shell";
import { pickWeeks } from "@/lib/installs/calendar";
import { earliestLine, INSTALL_WORDS, pickButtonLabel, type LinkInstall } from "@/lib/quote-link/install";
import type { CustomerQuote } from "@/lib/quote-link/view";
import { formatDay, formatLongDay } from "@/lib/time";
import { cn } from "@/lib/utils";

// Round 23 (Keenan, 2026-11-17): Pick your install day, on the customer's
// link once they've booked their option (or signed), and on the accepted
// page. Only Keenan's open days, from the earliest day for their track;
// full ones are greyed with "Full". A tap picks a day, then one button
// books it. Back later, they see their day and can change it until 2 days
// before it; after that, call or text Keenan. Phone first, navy and white
// like the rest of the page; the chosen day is navy with a tick.

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const monthShort = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", month: "short" });
const asDate = (day: string) => new Date(`${day}T12:00:00Z`);

export function InstallDayPick({
  token,
  initial,
  company,
  onPicked,
  className,
}: {
  token: string;
  initial: LinkInstall | null;
  company: CustomerQuote["company"];
  onPicked?: (day: string) => void;
  className?: string;
}) {
  const [install, setInstall] = useState<LinkInstall | null>(initial?.ready ? initial : null);
  const [loading, setLoading] = useState(!initial?.ready);
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error" | "preview"; text: string } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  // Just booked (or the page was read before they booked): read the days
  // fresh.
  useEffect(() => {
    if (initial?.ready) return;
    let live = true;
    void loadInstallDays(token).then((fresh) => {
      if (!live) return;
      setInstall(fresh?.ready ? fresh : null);
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [initial, token]);

  if (loading) {
    return (
      <section className={cn("flex items-center gap-2 px-5 py-6 text-muted-foreground", className)} aria-busy="true" data-testid="install-day-pick-loading">
        <Loader2 aria-hidden="true" className="size-4 animate-spin" />
        Getting the install days
      </section>
    );
  }
  if (!install) return null;

  const day = install.day;
  const showDays = !day || open;
  const weeks = pickWeeks(install.days, day);

  const refresh = async () => {
    const fresh = await loadInstallDays(token);
    if (fresh?.ready) setInstall(fresh);
  };

  const book = async () => {
    if (!chosen || busy) return;
    setBusy(true);
    setMessage(null);
    const result = await pickInstallDay(token, chosen).catch(() => null);
    setBusy(false);
    if (!result) {
      setMessage({ kind: "error", text: INSTALL_WORDS.failed });
      return;
    }
    if (!result.ok) {
      setMessage({ kind: "error", text: result.message });
      setChosen(null);
      await refresh();
      return;
    }
    setInstall({ ...install, day: result.day, canChange: true, days: install.days });
    setOpen(false);
    setChosen(null);
    setMessage(result.preview ? { kind: "preview", text: INSTALL_WORDS.preview } : { kind: "ok", text: `Booked for ${formatLongDay(result.day)}.` });
    if (!result.preview) onPicked?.(result.day);
    window.requestAnimationFrame(() => heading.current?.focus());
  };

  return (
    <section aria-labelledby="install-day-heading" className={cn("flex flex-col gap-4 px-5", className)} data-testid="install-day-pick">
      <h2 id="install-day-heading" ref={heading} tabIndex={-1} className="text-xl font-bold outline-none">
        {day ? INSTALL_WORDS.yours : INSTALL_WORDS.pick}
      </h2>

      {day ? (
        <div className="flex flex-col gap-3">
          <p className="text-2xl font-bold text-pretty" data-testid="install-day-yours">
            {formatLongDay(day)}
          </p>
          {install.canChange ? (
            !open ? (
              <button
                type="button"
                onClick={() => {
                  setOpen(true);
                  setMessage(null);
                }}
                className="inline-flex min-h-11 items-center self-start text-base font-semibold underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-testid="install-day-change"
              >
                {INSTALL_WORDS.change}
              </button>
            ) : null
          ) : (
            <div className="flex flex-col gap-3" data-testid="install-day-too-late">
              <p className="text-base text-pretty">{INSTALL_WORDS.tooLate}</p>
              <ContactButtons company={company} email={false} />
            </div>
          )}
        </div>
      ) : null}

      {showDays ? (
        install.days.length === 0 ? (
          <p className="text-base text-pretty" data-testid="install-day-none">
            {INSTALL_WORDS.none}
          </p>
        ) : (
          <>
            <p className="text-base text-pretty text-muted-foreground" data-testid="install-day-earliest">
              {earliestLine(install.earliest, formatLongDay)}
            </p>
            <div role="grid" aria-label={INSTALL_WORDS.pick} className="flex flex-col gap-1" data-testid="install-day-grid">
              <div role="row" className="grid grid-cols-7 gap-1">
                {WEEKDAYS.map((name) => (
                  <span key={name} role="columnheader" className="text-center text-xs text-muted-foreground">
                    {name}
                  </span>
                ))}
              </div>
              {weeks.map((week, at) => (
                <div key={at} role="row" className="grid grid-cols-7 gap-1">
                  {week.map((cell, column) => {
                    if (!cell) return <span key={column} role="gridcell" aria-hidden="true" />;
                    const date = asDate(cell.day);
                    const first = at === 0 && column === week.findIndex((one) => one !== null);
                    const monthLabel = first || date.getUTCDate() === 1 ? monthShort.format(date) : null;
                    if (cell.kind === "closed") {
                      return (
                        <span
                          key={cell.day}
                          role="gridcell"
                          aria-hidden="true"
                          className="flex h-12 flex-col items-center justify-center text-sm text-muted-foreground/60 tabular-nums"
                        >
                          {date.getUTCDate()}
                          {monthLabel ? <span className="text-[11px] leading-none">{monthLabel}</span> : null}
                        </span>
                      );
                    }
                    const full = cell.kind === "full";
                    const isYours = cell.day === day;
                    const isChosen = cell.day === chosen;
                    return (
                      <span key={cell.day} role="gridcell">
                        <button
                          type="button"
                          disabled={full || isYours || busy}
                          aria-pressed={isChosen}
                          aria-label={`${formatLongDay(cell.day)}${full ? ", full" : isYours ? ", your day" : ""}`}
                          data-day={cell.day}
                          data-kind={isYours ? "yours" : cell.kind}
                          onClick={() => {
                            setChosen(cell.day === chosen ? null : cell.day);
                            setMessage(null);
                          }}
                          className={cn(
                            "flex h-12 w-full flex-col items-center justify-center rounded-md border text-base font-semibold tabular-nums outline-none [-webkit-tap-highlight-color:transparent] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                            isChosen || isYours
                              ? "border-navy bg-navy text-white"
                              : full
                                ? "border-transparent bg-muted text-muted-foreground"
                                : "border-input bg-background text-foreground active:bg-muted",
                          )}
                        >
                          <span className="flex items-center gap-0.5 leading-none">
                            {date.getUTCDate()}
                            {isChosen || isYours ? <Check aria-hidden="true" className="size-3.5" strokeWidth={3} /> : null}
                          </span>
                          {full ? (
                            <span className="text-[11px] leading-none font-normal">Full</span>
                          ) : monthLabel ? (
                            <span className="text-[11px] leading-none font-normal">{monthLabel}</span>
                          ) : null}
                        </button>
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void book()}
                aria-disabled={!chosen || busy}
                aria-busy={busy}
                className={cn(
                  "inline-flex h-12 flex-1 items-center justify-center rounded-md bg-primary px-4 text-base font-semibold text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:flex-none sm:px-8",
                  (!chosen || busy) && "opacity-60",
                )}
                data-testid="install-day-book"
              >
                {busy ? (
                  <>
                    <Loader2 aria-hidden="true" className="mr-2 size-4 animate-spin" />
                    Saving
                  </>
                ) : (
                  pickButtonLabel(chosen, day, formatDay)
                )}
              </button>
              {day && open ? (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setChosen(null);
                  }}
                  className="inline-flex min-h-11 items-center text-base font-semibold underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {INSTALL_WORDS.keep}
                </button>
              ) : null}
            </div>
          </>
        )
      ) : null}

      <p className="text-base text-pretty" data-testid="install-day-note">
        {INSTALL_WORDS.note}
      </p>

      {message ? (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={cn("text-base font-semibold text-pretty", message.kind === "error" && "text-destructive")}
          data-testid="install-day-message"
        >
          {message.text}
        </p>
      ) : null}
    </section>
  );
}
