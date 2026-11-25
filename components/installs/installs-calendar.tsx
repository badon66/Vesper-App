"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import { saveInstallDay } from "@/app/(app)/app/(owner)/admin/installs/actions";
import { Button } from "@/components/ui/button";
import { DialogPanel } from "@/components/ui/dialog-panel";
import { dayLine, daySummary, monthLabel, monthWeeks, type InstallDayView } from "@/lib/installs/calendar";
import { formatLongDay } from "@/lib/time";
import { cn } from "@/lib/utils";

// Round 23 (Keenan, 2026-11-17): Keenan's install calendar. A month view,
// laid out for the iPad: each day says whether it's open, how many spots
// are left and who's booked. A tap opens the day: open it or close it, set
// its own number of jobs, and every booked name opens the lead. Closing a
// day with installs on it asks first and lists who needs moving; it never
// moves anyone.

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const NAMES_SHOWN = 3;
const jobs = (count: number) => `${count} ${count === 1 ? "job" : "jobs"}`;

export function InstallsCalendar({
  month,
  today,
  days,
  defaultLimit,
  prev,
  next,
}: {
  month: string;
  today: string;
  days: InstallDayView[];
  defaultLimit: number;
  prev: string;
  next: string;
}) {
  const byDay = new Map(days.map((view) => [view.day, view]));
  const [chosen, setChosen] = useState<string | null>(null);
  const view = chosen ? (byDay.get(chosen) ?? null) : null;
  const openCount = days.filter((day) => day.open && !day.past).length;

  return (
    <div className="flex flex-col gap-5" data-testid="installs-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl font-bold">Installs</h1>
          <p className="max-w-prose text-pretty text-muted-foreground">
            Tap a day to open it for installs or close it. Customers pick from the open days. An open day takes {jobs(defaultLimit)} unless you give it its own number (
            <Link href="/app/admin/settings" className="underline underline-offset-4">
              Settings
            </Link>
            ).
          </p>
        </div>
        <nav aria-label="Months" className="flex items-center gap-1">
          <Button asChild variant="outline" size="icon" className="size-11">
            <Link href={`/app/admin/installs?m=${prev}`} aria-label={`Back to ${monthLabel(prev)}`} data-testid="installs-prev">
              <ChevronLeft aria-hidden="true" />
            </Link>
          </Button>
          <h2 className="min-w-44 text-center text-lg font-semibold" data-testid="installs-month">
            {monthLabel(month)}
          </h2>
          <Button asChild variant="outline" size="icon" className="size-11">
            <Link href={`/app/admin/installs?m=${next}`} aria-label={`On to ${monthLabel(next)}`} data-testid="installs-next">
              <ChevronRight aria-hidden="true" />
            </Link>
          </Button>
        </nav>
      </div>

      {openCount === 0 ? (
        <p className="rounded-xl border px-4 py-3 text-pretty text-muted-foreground" data-testid="installs-none-open">
          No open install days in {monthLabel(month)} yet. Until you open some, customers see that you&apos;ll be in touch to set their day.
        </p>
      ) : null}

      <div role="grid" aria-label={`Install days, ${monthLabel(month)}`} className="flex flex-col gap-1.5">
        <div role="row" className="grid grid-cols-7 gap-1.5">
          {WEEKDAYS.map((name) => (
            <span key={name} role="columnheader" className="text-center text-sm text-muted-foreground">
              {name}
            </span>
          ))}
        </div>
        {monthWeeks(month).map((week, at) => (
          <div key={at} role="row" className="grid grid-cols-7 gap-1.5">
            {week.map((day, column) => {
              const one = day ? byDay.get(day) : undefined;
              if (!day || !one) return <span key={column} role="gridcell" aria-hidden="true" />;
              return <DayCell key={day} view={one} today={today} onOpen={() => setChosen(day)} />;
            })}
          </div>
        ))}
      </div>

      {view ? <DayPanel key={view.day} view={view} defaultLimit={defaultLimit} onClose={() => setChosen(null)} /> : null}
    </div>
  );
}

function DayCell({ view, today, onOpen }: { view: InstallDayView; today: string; onOpen: () => void }) {
  const date = Number(view.day.slice(8));
  const full = view.open && view.left === 0;
  const shown = view.booked.slice(0, NAMES_SHOWN);
  const more = view.booked.length - shown.length;
  return (
    <span role="gridcell">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${formatLongDay(view.day)}: ${dayLine(view)}${view.booked.length > 0 ? `, ${view.booked.map((job) => job.name).join(", ")}` : ""}`}
        data-testid="install-day"
        data-day={view.day}
        data-state={view.open ? (full ? "full" : "open") : "closed"}
        className={cn(
          "flex h-16 w-full flex-col items-start gap-0.5 overflow-hidden rounded-lg border p-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-32 md:p-2",
          view.open ? "border-input bg-card hover:bg-muted/50" : "border-transparent bg-muted/40 text-muted-foreground hover:bg-muted/70",
          view.past && "opacity-60",
          view.day === today && "ring-2 ring-foreground/30",
        )}
      >
        <span className={cn("text-base leading-none font-semibold tabular-nums md:text-lg", view.open && !full && "text-foreground")}>{date}</span>
        <span
          className={cn(
            "text-[11px] leading-tight md:text-sm",
            view.open && !full ? "font-semibold text-foreground" : "text-muted-foreground",
          )}
        >
          <span className="md:hidden">{view.open ? (full ? "Full" : `${view.left} left`) : view.booked.length > 0 ? `${view.booked.length} booked` : ""}</span>
          <span className="hidden md:inline">{dayLine(view)}</span>
        </span>
        {shown.length > 0 ? (
          <span className="hidden min-w-0 flex-col md:flex">
            {shown.map((job) => (
              <span key={job.id} className="truncate text-sm text-foreground">
                {job.name}
              </span>
            ))}
            {more > 0 ? <span className="text-sm text-muted-foreground">{`+${more} more`}</span> : null}
          </span>
        ) : null}
      </button>
    </span>
  );
}

function DayPanel({ view, defaultLimit, onClose }: { view: InstallDayView; defaultLimit: number; onClose: () => void }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [limit, setLimit] = useState<number>(view.limit);

  const save = (open: boolean, ownLimit: number | null) => {
    setMessage(null);
    start(async () => {
      const result = await saveInstallDay({ day: view.day, open, limit: ownLimit });
      if (!result.ok) {
        setMessage(result.message);
        setLimit(view.limit);
        return;
      }
      setConfirmClose(false);
      router.refresh();
    });
  };
  const setOwnLimit = (value: number) => {
    const next = Math.min(20, Math.max(1, value));
    setLimit(next);
    save(true, next === defaultLimit ? null : next);
  };

  const booked = view.booked.length;
  return (
    <DialogPanel
      open
      onClose={onClose}
      title={formatLongDay(view.day)}
      testId="install-day-panel"
      actions={
        view.past ? (
          <Button type="button" variant="outline" onClick={onClose}>
            Done
          </Button>
        ) : confirmClose ? (
          <>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setConfirmClose(false)}>
              Keep it open
            </Button>
            <Button type="button" disabled={busy} onClick={() => save(false, view.ownLimit)} data-testid="install-day-close-confirm">
              {busy ? "Closing" : "Close the day"}
            </Button>
          </>
        ) : view.open ? (
          <>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => (booked > 0 ? setConfirmClose(true) : save(false, view.ownLimit))}
              data-testid="install-day-close"
            >
              Close this day
            </Button>
            <Button type="button" onClick={onClose}>
              Done
            </Button>
          </>
        ) : (
          <>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" disabled={busy} onClick={() => save(true, view.ownLimit)} data-testid="install-day-open">
              {busy ? "Opening" : "Open for installs"}
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {confirmClose ? (
          <div className="flex flex-col gap-2" data-testid="install-day-close-warning">
            <p className="font-semibold text-pretty">
              {booked === 1 ? "1 install is booked on this day." : `${booked} installs are booked on this day.`} Closing it doesn&apos;t move anyone: move
              {booked === 1 ? " it" : " each of them"} to another day from the lead.
            </p>
          </div>
        ) : (
          <p className="text-pretty" data-testid="install-day-summary">
            {view.past ? "This day has passed." : daySummary(view)}
          </p>
        )}

        {view.open && !view.past && !confirmClose ? (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold" id={`jobs-${view.day}`}>
              Jobs this day
            </span>
            <div className="flex items-center gap-3" role="group" aria-labelledby={`jobs-${view.day}`}>
              <Button type="button" variant="outline" size="icon" className="size-11" disabled={busy || limit <= 1} onClick={() => setOwnLimit(limit - 1)} aria-label="One job fewer">
                <Minus aria-hidden="true" />
              </Button>
              <span className="min-w-8 text-center text-xl font-semibold tabular-nums" data-testid="install-day-limit" aria-live="polite">
                {limit}
              </span>
              <Button type="button" variant="outline" size="icon" className="size-11" disabled={busy || limit >= 20} onClick={() => setOwnLimit(limit + 1)} aria-label="One job more">
                <Plus aria-hidden="true" />
              </Button>
              <span className="text-sm text-muted-foreground">{view.ownLimit === null ? "From Settings" : `Settings says ${defaultLimit}`}</span>
            </div>
          </div>
        ) : null}

        {booked > 0 ? (
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold">{confirmClose ? "Needs moving" : "Booked"}</span>
            <ul className="flex flex-col divide-y rounded-lg border" data-testid="install-day-booked">
              {view.booked.map((job) => (
                <li key={job.id}>
                  <Link href={`/app/leads/${job.id}`} className="flex min-h-11 items-center px-3 font-semibold underline-offset-4 hover:underline">
                    {job.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : !view.past ? (
          <p className="text-sm text-muted-foreground">Nobody booked yet.</p>
        ) : null}

        {message ? (
          <p role="alert" className="font-semibold text-pretty text-destructive" data-testid="install-day-message">
            {message}
          </p>
        ) : null}
      </div>
    </DialogPanel>
  );
}
