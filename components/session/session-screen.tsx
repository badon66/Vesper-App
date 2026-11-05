"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useActionState, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  bumpKnockSession,
  endKnockSession,
  fixKnockStart,
  startKnockSession,
  type KnockBumpResult,
  type KnockState,
  type KnockSummary,
} from "@/app/(app)/app/knock-actions";
import { ActionMessage } from "@/components/action-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useViewAs } from "@/components/view-as-context";
import { submitKeepingValues } from "@/lib/forms/submit";
import { timeOutLabel } from "@/lib/knock/session";
import { calgaryClock, calgaryDateOf, calgaryInstant, formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { VIEW_AS_NOTHING_SAVED } from "@/lib/view-as";

export type KnockSessionView = {
  id: string;
  neighbourhood: string;
  started_at: string;
  doors_knocked: number;
  conversations: number;
};

// Leads and bookings of the running session so far, for the summary that
// View as acts out.
export type SessionSoFar = { leads: number; bookings: number };

type Counts = { doors: number; conversations: number };
const ZERO: Counts = { doors: 0, conversations: 0 };
const initialState: KnockState = {};

// "5:16 p.m." already ends a sentence; "17:16" needs the full stop.
const sentenceEnd = (text: string) => (text.endsWith(".") ? text : `${text}.`);

// The Session tab (Keenan, 2026-11-05). Not knocking: the neighbourhood and
// Start knocking, then who else is out today. Knocking: where and since
// when, the counters, tonight's open times, New lead, Unfinished and End
// knocking. While Keenan views the app as someone, starting, counting,
// fixing the start and ending are acted out on this screen only, and it
// says nothing was saved.
export function SessionScreen({
  session,
  lastNeighbourhood,
  recent,
  soFar,
  renderedAt,
  saved,
  times,
  unfinished,
  outToday,
}: {
  session: KnockSessionView | null;
  lastNeighbourhood: string | null;
  recent: string[];
  soFar: SessionSoFar;
  // The server's clock when the page was drawn, so the first paint matches.
  renderedAt: number;
  // "Lead saved. On to the next door.", after a save while knocking.
  saved: ReactNode;
  times: ReactNode;
  unfinished: ReactNode;
  outToday: ReactNode;
}) {
  const { viewingAs } = useViewAs();
  const [summary, setSummary] = useState<KnockSummary | null>(null);
  // A session this screen just ended stays ended, even before the server's
  // next drawing arrives.
  const [endedId, setEndedId] = useState<string | null>(null);
  const [actedOut, setActedOut] = useState<{ session: KnockSessionView | null } | null>(null);
  const shown = viewingAs && actedOut ? actedOut.session : session;
  const live = shown && shown.id !== endedId ? shown : null;

  if (live) {
    return (
      <Knocking
        key={live.id}
        session={live}
        actedOut={viewingAs}
        soFar={viewingAs && live.id === "view-as" ? { leads: 0, bookings: 0 } : soFar}
        renderedAt={renderedAt}
        saved={saved}
        times={times}
        unfinished={unfinished}
        onEnded={(next) => {
          setSummary(next);
          setEndedId(live.id);
          if (viewingAs) setActedOut({ session: null });
          // End knocking sits at the bottom; the summary shows at the top.
          window.scrollTo({ top: 0 });
        }}
      />
    );
  }
  return (
    <div className="flex flex-col gap-6">
      {summary ? <Summary summary={summary} actedOut={viewingAs} onClose={() => setSummary(null)} /> : null}
      <StartKnocking
        lastNeighbourhood={summary?.neighbourhood ?? lastNeighbourhood}
        recent={recent}
        onActedOutStart={
          viewingAs
            ? (neighbourhood) => {
                setSummary(null);
                setEndedId(null);
                setActedOut({
                  session: {
                    id: "view-as",
                    neighbourhood: neighbourhood || "this neighbourhood",
                    started_at: new Date().toISOString(),
                    doors_knocked: 0,
                    conversations: 0,
                  },
                });
              }
            : null
        }
      />
      {unfinished}
      {outToday}
    </div>
  );
}

// ---------------------------------------------------------------- not knocking

function StartKnocking({
  lastNeighbourhood,
  recent,
  onActedOutStart,
}: {
  lastNeighbourhood: string | null;
  recent: string[];
  onActedOutStart: ((neighbourhood: string) => void) | null;
}) {
  const [state, formAction, pending] = useActionState(startKnockSession, initialState);
  const [value, setValue] = useState(lastNeighbourhood ?? "");
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  return (
    <section aria-labelledby="start-heading" className="flex flex-col gap-4">
      <div>
        <h1 id="start-heading" className="text-2xl font-bold">
          Start knocking
        </h1>
        <p className="mt-1 text-sm text-pretty text-muted-foreground">
          Count doors and conversations as you go. Leads you add while it runs link to it.
        </p>
      </div>
      <form
        onSubmit={(event) => {
          if (onActedOutStart) {
            event.preventDefault();
            onActedOutStart(value.trim());
            return;
          }
          submitKeepingValues(formAction)(event);
        }}
        className="flex flex-col gap-3"
      >
        <Label htmlFor="knock-neighbourhood">Neighbourhood</Label>
        <Input
          id="knock-neighbourhood"
          name="neighbourhood"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          autoComplete="off"
          autoCapitalize="words"
          enterKeyHint="go"
          className="h-12 text-base"
        />
        {recent.length > 0 ? (
          <div role="group" aria-label="Recent neighbourhoods" className="flex flex-wrap gap-2">
            {recent.map((name) => (
              <button
                key={name}
                type="button"
                aria-pressed={same(name, value)}
                onClick={() => setValue(name)}
                className={cn(
                  "min-h-11 rounded-full border px-4 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  same(name, value) ? "border-2 border-foreground bg-secondary" : "bg-background",
                )}
              >
                {name}
              </button>
            ))}
          </div>
        ) : null}
        <ActionMessage text={state.error} />
        <Button type="submit" size="lg" className="h-14 text-lg" disabled={pending}>
          {pending ? "Starting" : "Start knocking"}
        </Button>
      </form>
    </section>
  );
}

function Summary({ summary, actedOut, onClose }: { summary: KnockSummary; actedOut: boolean; onClose: () => void }) {
  const stats = [
    { label: "Doors", value: summary.doors },
    { label: "Conversations", value: summary.conversations },
    { label: "Leads", value: summary.leads },
    { label: "Bookings", value: summary.bookings },
  ];
  return (
    <section
      role="status"
      aria-labelledby="summary-heading"
      className="flex flex-col gap-3 rounded-xl border border-primary bg-accent p-4 text-accent-foreground"
      data-testid="session-summary"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="summary-heading" className="text-lg font-bold text-pretty">
            Done in {summary.neighbourhood}
          </h2>
          <p className="text-sm">
            {formatTime(summary.startedAt)} to {sentenceEnd(formatTime(summary.endedAt))} Out{" "}
            {timeOutLabel(summary.startedAt, new Date(summary.endedAt).getTime()).toLowerCase()}.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={onClose}>
          Close
        </Button>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
        {stats.map((stat) => (
          <div key={stat.label} className="flex flex-row-reverse items-baseline justify-end gap-2">
            <dt className="text-sm">{stat.label}</dt>
            <dd className="text-xl font-bold tabular-nums">{stat.value}</dd>
          </div>
        ))}
      </dl>
      {actedOut ? <ActionMessage text={VIEW_AS_NOTHING_SAVED} /> : null}
    </section>
  );
}

// ---------------------------------------------------------------- knocking

function Knocking({
  session,
  actedOut,
  soFar,
  renderedAt,
  saved,
  times,
  unfinished,
  onEnded,
}: {
  session: KnockSessionView;
  // View as: everything changes on screen only.
  actedOut: boolean;
  soFar: SessionSoFar;
  renderedAt: number;
  saved: ReactNode;
  times: ReactNode;
  unfinished: ReactNode;
  onEnded: (summary: KnockSummary) => void;
}) {
  const counts = useKnockCounts(session, actedOut);
  const [startedAt, setStartedAt] = useState(session.started_at);
  const [fixing, setFixing] = useState(false);
  const [fixNote, setFixNote] = useState<string | null>(null);
  const now = useMinuteClock(renderedAt);

  return (
    <div className="flex flex-col gap-4">
      {saved}
      <header className="flex flex-col">
        <h1 className="text-2xl font-bold text-pretty">Knocking in {session.neighbourhood}</h1>
        <div className="flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
          <span data-testid="session-started">
            Started {sentenceEnd(formatTime(startedAt))}{" "}
            <span data-clock>Out {timeOutLabel(startedAt, now).toLowerCase()}.</span>
          </span>
          {fixing ? null : (
            <button
              type="button"
              onClick={() => setFixing(true)}
              className="inline-flex min-h-11 items-center font-semibold text-foreground underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-testid="fix-start"
            >
              Fix start time
            </button>
          )}
        </div>
        {fixNote ? <ActionMessage text={fixNote} /> : null}
      </header>
      {fixing ? (
        <FixStart
          sessionId={session.id}
          startedAt={startedAt}
          actedOut={actedOut}
          onDone={(fixed, note) => {
            if (fixed) setStartedAt(fixed);
            setFixNote(note);
            setFixing(false);
          }}
        />
      ) : null}

      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-3">
          <Counter label="Doors" count={counts.shown.doors} onAdd={() => counts.tap("doors", 1)} onUndo={() => counts.tap("doors", -1)} />
          <Counter
            label="Conversations"
            count={counts.shown.conversations}
            onAdd={() => counts.tap("conversations", 1)}
            onUndo={() => counts.tap("conversations", -1)}
          />
        </div>
        {counts.note === VIEW_AS_NOTHING_SAVED ? (
          <ActionMessage text={counts.note} />
        ) : (
          <p aria-live="polite" className="text-sm text-muted-foreground">
            {counts.note ?? (counts.saving ? "Saving" : "All taps saved.")}
          </p>
        )}
      </div>

      {times}

      {unfinished}

      <EndKnocking
        session={session}
        startedAt={startedAt}
        counts={counts.shown}
        saving={counts.saving}
        actedOut={actedOut}
        soFar={soFar}
        onStopTaps={counts.stop}
        onEnded={onEnded}
      />
    </div>
  );
}

// New lead, for a door that wants a follow-up instead of a time, smaller
// than the counters and the times.
function NewLeadButton() {
  return (
    <Button asChild variant="outline" className="h-11 w-full">
      <Link href="/app/leads/new">
        <Plus aria-hidden="true" className="size-5" />
        New lead
      </Link>
    </Button>
  );
}

// The minute, for "Out 1 h 12 min". The first paint uses the server's clock
// so it matches; then it follows the phone's, a minute at a time.
function subscribeClock(onChange: () => void) {
  const timer = window.setInterval(onChange, 15_000);
  document.addEventListener("visibilitychange", onChange);
  return () => {
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onChange);
  };
}
const toMinute = (ms: number) => Math.floor(ms / 60_000) * 60_000;
const thisMinute = () => toMinute(Date.now());

function useMinuteClock(renderedAt: number): number {
  return useSyncExternalStore(subscribeClock, thisMinute, () => toMinute(renderedAt));
}

// Fix the start time (Keenan, 2026-11-05): for a setter who tapped Start
// late. Any time earlier today, never in the future; the server checks.
function FixStart({
  sessionId,
  startedAt,
  actedOut,
  onDone,
}: {
  sessionId: string;
  startedAt: string;
  actedOut: boolean;
  // The new start, or null when nothing changed, and what to say.
  onDone: (startedAt: string | null, note: string | null) => void;
}) {
  const [value, setValue] = useState(calgaryClock(startedAt));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    if (actedOut) {
      const day = calgaryDateOf(startedAt);
      const moment = /^\d{2}:\d{2}$/.test(value) ? calgaryInstant(day, value) : null;
      onDone(moment && new Date(moment).getTime() <= Date.now() ? moment : null, VIEW_AS_NOTHING_SAVED);
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const result = await fixKnockStart(sessionId, value);
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      onDone(result.startedAt, null);
    } catch {
      setMessage("No signal. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border p-3" data-testid="fix-start-panel">
      <Label htmlFor="fix-start-time">When did you start?</Label>
      <div className="flex items-center gap-3">
        <Input
          id="fix-start-time"
          type="time"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="h-12 w-36 text-base"
        />
        <Button type="button" variant="outline" className="h-12" onClick={() => onDone(null, null)} disabled={busy}>
          Cancel
        </Button>
        <Button type="button" className="h-12 flex-1" onClick={() => void save()} disabled={busy || !value}>
          {busy ? "Saving" : "Save"}
        </Button>
      </div>
      {message ? <ActionMessage text={message} /> : null}
    </div>
  );
}

// The counters change the moment a button is tapped. Taps are queued and
// sent one batch at a time; a failed batch goes back in the queue and is
// retried, so fast tapping never loses a count.
function useKnockCounts(session: KnockSessionView, actedOut: boolean) {
  const [shown, setShown] = useState<Counts>({ doors: session.doors_knocked, conversations: session.conversations });
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const confirmed = useRef<Counts>({ doors: session.doors_knocked, conversations: session.conversations });
  const queued = useRef<Counts>(ZERO);
  const sending = useRef<Counts>(ZERO);
  const flushing = useRef(false);
  const stopped = useRef(false);

  function total(): Counts {
    return {
      doors: confirmed.current.doors + sending.current.doors + queued.current.doors,
      conversations: confirmed.current.conversations + sending.current.conversations + queued.current.conversations,
    };
  }

  function tap(kind: keyof Counts, delta: 1 | -1) {
    if (stopped.current) return;
    if (total()[kind] + delta < 0) return;
    if (actedOut) {
      confirmed.current = { ...confirmed.current, [kind]: confirmed.current[kind] + delta };
      setShown(total());
      setNote(VIEW_AS_NOTHING_SAVED);
      return;
    }
    queued.current = { ...queued.current, [kind]: queued.current[kind] + delta };
    setShown(total());
    void flush();
  }

  async function flush() {
    if (flushing.current) return;
    flushing.current = true;
    setSaving(true);
    try {
      while (!stopped.current && (queued.current.doors !== 0 || queued.current.conversations !== 0)) {
        sending.current = queued.current;
        queued.current = ZERO;
        let result: KnockBumpResult;
        try {
          result = await bumpKnockSession(session.id, sending.current.doors, sending.current.conversations);
        } catch {
          result = { ok: false, error: "Not saved yet. Retrying.", fatal: false };
        }
        if (result.ok) {
          confirmed.current = { doors: result.doors, conversations: result.conversations };
          sending.current = ZERO;
          setNote(null);
        } else {
          queued.current = {
            doors: queued.current.doors + sending.current.doors,
            conversations: queued.current.conversations + sending.current.conversations,
          };
          sending.current = ZERO;
          setNote(result.error);
          if (result.fatal) stopped.current = true;
          else await new Promise((resolve) => setTimeout(resolve, 2000));
        }
        setShown(total());
      }
    } finally {
      flushing.current = false;
      setSaving(false);
    }
  }

  return {
    shown,
    saving,
    note,
    tap,
    // Once the session ends, no more taps are sent.
    stop: () => {
      stopped.current = true;
    },
  };
}

function Counter({ label, count, onAdd, onUndo }: { label: string; count: number; onAdd: () => void; onUndo: () => void }) {
  const name = label.toLowerCase();
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={onAdd}
        aria-label={`Add one to ${name}, now ${count}`}
        className="flex h-22 touch-manipulation flex-col items-center justify-center rounded-xl bg-primary text-primary-foreground outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:bg-primary/85"
      >
        <span className="text-4xl leading-none font-bold tabular-nums" aria-hidden="true">
          {count}
        </span>
        <span className="mt-1.5 text-base font-semibold" aria-hidden="true">
          {label} +1
        </span>
      </button>
      <Button type="button" variant="outline" className="h-10 touch-manipulation" onClick={onUndo} aria-label={`Take one off ${name}`}>
        Undo
      </Button>
    </div>
  );
}

function EndKnocking({
  session,
  startedAt,
  counts,
  saving,
  actedOut,
  soFar,
  onStopTaps,
  onEnded,
}: {
  session: KnockSessionView;
  startedAt: string;
  counts: Counts;
  saving: boolean;
  actedOut: boolean;
  soFar: SessionSoFar;
  onStopTaps: () => void;
  onEnded: (summary: KnockSummary) => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function end() {
    if (actedOut) {
      onEnded({
        neighbourhood: session.neighbourhood,
        startedAt,
        endedAt: new Date().toISOString(),
        doors: counts.doors,
        conversations: counts.conversations,
        leads: soFar.leads,
        bookings: soFar.bookings,
      });
      return;
    }
    setEnding(true);
    setError(null);
    try {
      const result = await endKnockSession(session.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onStopTaps();
      onEnded(result.summary);
    } catch {
      setError("No signal, so it didn't end yet. Try again in a moment.");
    } finally {
      setEnding(false);
    }
  }

  // New lead and End knocking share the last row, so the knocking view fits
  // one screen; End asks first, so a slip costs nothing.
  if (!confirm) {
    return (
      <div className="grid grid-cols-2 gap-3">
        <NewLeadButton />
        <Button type="button" variant="outline" className="h-11 w-full" onClick={() => setConfirm(true)}>
          End knocking
        </Button>
      </div>
    );
  }
  return (
    <div role="group" aria-labelledby="end-heading" className="flex flex-col gap-3 rounded-md border p-3" data-testid="end-confirm">
      <p id="end-heading" className="font-semibold text-pretty">
        End knocking in {session.neighbourhood}? You can start again any time.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Button type="button" variant="outline" className="h-11" onClick={() => setConfirm(false)} disabled={ending}>
          Keep going
        </Button>
        <Button type="button" className="h-11" onClick={() => void end()} disabled={ending || saving}>
          {ending ? "Ending" : saving ? "Saving taps" : "Yes, end it"}
        </Button>
      </div>
      <ActionMessage text={error} />
    </div>
  );
}
