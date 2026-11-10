"use client";

import { Check, Plus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
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
import { useViewAs } from "@/components/view-as-context";
import { submitKeepingValues } from "@/lib/forms/submit";
import {
  fixedStart,
  knownSpelling,
  neighbourhoodSuggestions,
  TAP_REMINDER,
  tapReminderDue,
  timeOutLabel,
} from "@/lib/knock/session";
import { calgaryClock, calgaryDateOf, calgaryToday, formatDay, formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { VIEW_AS_NOTHING_SAVED } from "@/lib/view-as";

export type KnockSessionView = {
  id: string;
  neighbourhood: string;
  started_at: string;
  doors_knocked: number;
  conversations: number;
  // Round 4: the last counter tap, for the reminder.
  last_tap_at: string | null;
};

// Leads and bookings of the running session so far, for the summary that
// View as acts out.
export type SessionSoFar = { leads: number; bookings: number };

export type SavedLead = { id: string; name: string };

type Counts = { doors: number; conversations: number };
const ZERO: Counts = { doors: 0, conversations: 0 };
const initialState: KnockState = {};
// "Saving." only shows when a save takes longer than this, so a quick tap
// doesn't flicker.
const SLOW_SAVE_MS = 800;

// "5:16 a.m." already ends a sentence; "17:16" needs the full stop.
const sentenceEnd = (text: string) => (text.endsWith(".") ? text : `${text}.`);
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

// The Session tab (Keenan, 2026-11-05). Not knocking: the neighbourhood and
// Start knocking, then who else is out today. Knocking: where and since
// when, the counters with one status row under them, Unfinished when there
// is any, tonight's open times, then End knocking and New lead. While Keenan views the app as someone, starting, counting,
// fixing the start and ending are acted out on this screen only, and it
// says nothing was saved.
export function SessionScreen({
  session,
  lastEnded,
  lastNeighbourhood,
  recent,
  team,
  soFar,
  renderedAt,
  savedLead,
  times,
  unfinished,
  outToday,
}: {
  session: KnockSessionView | null;
  // The person's last session that ended today, shown until the next start
  // (or yesterday's, when it ended itself at midnight).
  lastEnded: KnockSummary | null;
  lastNeighbourhood: string | null;
  recent: string[];
  // The team's neighbourhoods, for suggestions as they type (round 4).
  team: string[];
  soFar: SessionSoFar;
  // The server's clock when the page was drawn, so the first paint matches.
  renderedAt: number;
  // The lead just saved while knocking, for "Lead saved. On to the next
  // door." in the status row.
  savedLead: SavedLead | null;
  times: ReactNode;
  unfinished: ReactNode;
  outToday: ReactNode;
}) {
  const { viewingAs } = useViewAs();
  const [summary, setSummary] = useState<{ value: KnockSummary; fresh: boolean } | null>(null);
  // A session this screen just ended stays ended, even before the server's
  // next drawing arrives.
  const [endedId, setEndedId] = useState<string | null>(null);
  const [actedOut, setActedOut] = useState<{ session: KnockSessionView | null } | null>(null);
  const shown = viewingAs && actedOut ? actedOut.session : session;
  const live = shown && shown.id !== endedId ? shown : null;
  // The later of the summary this screen just showed and the server's last
  // session ended today (one ended on another phone, say).
  const serverSummary = lastEnded && !(viewingAs && actedOut) ? { value: lastEnded, fresh: false } : null;
  const shownSummary =
    summary && serverSummary
      ? new Date(serverSummary.value.endedAt).getTime() > new Date(summary.value.endedAt).getTime()
        ? serverSummary
        : summary
      : (summary ?? serverSummary);

  // ?added= has done its job once the page is drawn: drop it from the
  // address, through Next's router (null state), so a reload or the next
  // action's redraw doesn't bring the saved line back.
  useEffect(() => {
    if (window.location.search.includes("added=")) window.history.replaceState(null, "", window.location.pathname);
  }, [savedLead]);

  if (live) {
    return (
      <Knocking
        key={live.id}
        session={live}
        actedOut={viewingAs}
        soFar={viewingAs && live.id === "view-as" ? { leads: 0, bookings: 0 } : soFar}
        renderedAt={renderedAt}
        savedLead={savedLead}
        times={times}
        unfinished={unfinished}
        onEnded={(next) => {
          setSummary({ value: next, fresh: true });
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
      <h1 className="sr-only">Session</h1>
      {shownSummary ? <Summary summary={shownSummary.value} focus={shownSummary.fresh} actedOut={viewingAs && Boolean(actedOut)} /> : null}
      <StartKnocking
        lastNeighbourhood={shownSummary?.value.neighbourhood ?? lastNeighbourhood}
        recent={recent}
        team={team}
        onActedOutStart={
          viewingAs
            ? (neighbourhood) => {
                setSummary(null);
                setEndedId(null);
                setActedOut({
                  session: {
                    id: "view-as",
                    neighbourhood,
                    started_at: new Date().toISOString(),
                    doors_knocked: 0,
                    conversations: 0,
                    last_tap_at: null,
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
  team,
  onActedOutStart,
}: {
  lastNeighbourhood: string | null;
  recent: string[];
  team: string[];
  onActedOutStart: ((neighbourhood: string) => void) | null;
}) {
  const [state, formAction, pending] = useActionState(startKnockSession, initialState);
  const [value, setValue] = useState(lastNeighbourhood ?? "");
  const [actedError, setActedError] = useState<string | null>(null);
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  // Round 4: the team's neighbourhoods that match what's typed, ignoring
  // capitals, so a place is spelled one way (the database keeps the first
  // spelling whatever is typed).
  // After a tap the list stays as it was, the picked one marked, until the
  // next keystroke, so nothing jumps under the thumb.
  const [frozen, setFrozen] = useState<string[] | null>(null);
  const suggestions = frozen ?? neighbourhoodSuggestions(value, team, 4, recent);
  return (
    <section aria-labelledby="start-heading" className="flex flex-col gap-3">
      <div>
        <h2 id="start-heading" className="text-2xl font-bold">
          <label htmlFor="knock-neighbourhood">Where are you knocking?</label>
        </h2>
        <p className="mt-1 text-sm text-pretty text-muted-foreground">
          Count every door you knock, and a conversation each time someone answers and talks. Leads and bookings you
          make while you&apos;re out show in your summary.
        </p>
      </div>
      <form
        onSubmit={(event) => {
          if (onActedOutStart) {
            event.preventDefault();
            // The same checks the server makes, so View as answers as it
            // would for the setter.
            const name = value.trim();
            if (name.length === 0) return setActedError("Enter the neighbourhood.");
            if (name.length > 80) return setActedError("That neighbourhood name is too long.");
            setActedError(null);
            onActedOutStart(knownSpelling(name, team));
            return;
          }
          submitKeepingValues(formAction)(event);
        }}
        className="flex flex-col gap-3"
      >
        <div className="relative">
          <Input
            id="knock-neighbourhood"
            name="neighbourhood"
            value={value}
            onChange={(event) => {
              setFrozen(null);
              setValue(event.target.value);
            }}
            // A tap into a filled field selects it, so typing replaces it,
            // and the box moves up, so the suggestions under it clear the
            // keyboard.
            onFocus={(event) => {
              event.currentTarget.select();
              const box = event.currentTarget;
              window.setTimeout(() => box.scrollIntoView({ block: "start", behavior: "smooth" }), 250);
            }}
            placeholder="The neighbourhood, like Bridgeland"
            autoComplete="off"
            autoCapitalize="words"
            enterKeyHint="go"
            // Clear of the sticky app header when it scrolls up on focus.
            className="h-12 scroll-mt-[calc(7.5rem+env(safe-area-inset-top))] pr-12 text-base"
          />
          {value ? (
            <button
              type="button"
              aria-label="Clear the neighbourhood"
              onClick={() => {
                setValue("");
                document.getElementById("knock-neighbourhood")?.focus();
              }}
              className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-md text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X aria-hidden="true" className="size-5" />
            </button>
          ) : null}
        </div>
        {suggestions.length > 0 ? (
          <div role="group" aria-labelledby="team-hoods-label" className="flex flex-col gap-2" data-testid="neighbourhood-suggestions">
            <p id="team-hoods-label" className="text-sm text-muted-foreground">
              The team has knocked
            </p>
            {suggestions.map((name) => {
              const picked = same(name, value);
              return (
                <button
                  key={name}
                  type="button"
                  aria-pressed={picked}
                  onClick={() => {
                    setFrozen(suggestions);
                    setValue(name);
                  }}
                  // Bordered like the recent chips, so they read as taps.
                  className={cn(
                    "flex min-h-11 items-center gap-2 rounded-md border px-4 text-left text-base font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    picked ? "border-2 border-foreground bg-secondary" : "bg-background",
                  )}
                >
                  {picked ? <Check aria-hidden="true" className="size-4 shrink-0" /> : null}
                  <span className="truncate">{name}</span>
                </button>
              );
            })}
          </div>
        ) : null}
        {recent.length > 0 ? (
          <div role="group" aria-label="Recent neighbourhoods" className="flex flex-wrap gap-2">
            {recent.map((name) => (
              <button
                key={name}
                type="button"
                aria-pressed={same(name, value)}
                onClick={() => setValue(name)}
                className={cn(
                  "min-h-11 rounded-md border px-4 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  same(name, value) ? "border-2 border-foreground bg-secondary" : "bg-background",
                )}
              >
                {name}
              </button>
            ))}
          </div>
        ) : null}
        <ActionMessage text={actedError ?? state.error} />
        <Button type="submit" size="lg" className="h-14 text-lg" disabled={pending}>
          {pending ? "Starting" : "Start knocking"}
        </Button>
      </form>
    </section>
  );
}

// How the session went (Keenan, 2026-11-05): from when to when, time out,
// doors, conversations, leads and bookings, as plain sentences so it stays
// short. A status, not an action, so no gold.
function Summary({ summary, focus, actedOut }: { summary: KnockSummary; focus: boolean; actedOut: boolean }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focus) heading.current?.focus({ preventScroll: true });
  }, [focus]);
  const out = timeOutLabel(summary.startedAt, new Date(summary.endedAt).getTime());
  // A session from yesterday (one that ended itself at midnight) names its day.
  const day = calgaryDateOf(summary.startedAt);
  const dayLabel = day === calgaryToday() ? "" : `${formatDay(day)}, `;
  const untapped = summary.automatic && new Date(summary.endedAt).getTime() <= new Date(summary.startedAt).getTime();
  const booked =
    summary.leads === 0
      ? ""
      : summary.leads === 1
        ? summary.bookings === 1
          ? ", booked"
          : ", not booked"
        : summary.bookings === 0
          ? ", none booked"
          : `, ${summary.bookings} of them booked`;
  return (
    <section
      role="status"
      aria-labelledby="summary-heading"
      className="flex flex-col gap-1 rounded-xl border bg-card px-4 py-3 text-card-foreground"
      data-testid="session-summary"
    >
      <h2 id="summary-heading" ref={heading} tabIndex={-1} className="text-lg font-bold text-pretty outline-none">
        Done in {summary.neighbourhood}
      </h2>
      <p className="text-sm text-muted-foreground">
        {/* A session that ended itself with nothing tapped has no time out
            to claim: just its day and when it started (round 4). */}
        {untapped
          ? `${dayLabel.replace(/, $/, ". ")}Started ${sentenceEnd(formatTime(summary.startedAt))}`
          : `${dayLabel}${formatTime(summary.startedAt)} to ${sentenceEnd(formatTime(summary.endedAt))} Out ${out === "Under a minute" ? "under a minute" : out}.`}
      </p>
      {summary.automatic ? (
        // What the database did, read from the times: it ends at the last
        // tap, or at the start when nothing was tapped (round 4).
        <p className="text-sm text-pretty" data-testid="session-ended-automatically">
          {untapped
            ? "Ended on its own at midnight. Nothing was tapped, so no time out is counted."
            : "Ended on its own at midnight, so it counts up to the last tap."}
        </p>
      ) : null}
      <p className="text-base text-pretty tabular-nums">
        {plural(summary.doors, "door", "doors")}, {plural(summary.conversations, "conversation", "conversations")},{" "}
        {plural(summary.leads, "lead", "leads")}
        {booked}.
      </p>
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
  savedLead,
  times,
  unfinished,
  onEnded,
}: {
  session: KnockSessionView;
  // View as: everything changes on screen only.
  actedOut: boolean;
  soFar: SessionSoFar;
  renderedAt: number;
  savedLead: SavedLead | null;
  times: ReactNode;
  unfinished: ReactNode;
  onEnded: (summary: KnockSummary) => void;
}) {
  const router = useRouter();
  const counts = useKnockCounts(session, actedOut);
  const [startedAt, setStartedAt] = useState(session.started_at);
  const [fixing, setFixing] = useState(false);
  const [fixNote, setFixNote] = useState<{ text: string; calm: boolean } | null>(null);
  // The saved line shows until the next tap, and a reload doesn't bring it
  // back; the next save shows it again.
  const [savedHiddenFor, setSavedHiddenFor] = useState<string | null>(null);
  const [undoNote, setUndoNote] = useState<string | null>(null);
  const now = useMinuteClock(renderedAt);
  const heading = useRef<HTMLHeadingElement>(null);
  const saved = savedLead && savedLead.id !== savedHiddenFor ? savedLead : null;
  // Round 4: any tap at all, here or before, ends the reminder for good.
  const everTapped =
    session.last_tap_at !== null ||
    counts.tapped ||
    counts.pending > 0 ||
    session.doors_knocked + session.conversations > 0 ||
    counts.shown.doors + counts.shown.conversations > 0;

  useEffect(() => {
    // Just started (the form is gone) or just arrived: the heading takes
    // focus, so a screen reader hears where the session is.
    if (!document.activeElement || document.activeElement === document.body) heading.current?.focus({ preventScroll: true });
  }, []);

  function tap(kind: keyof Counts) {
    setSavedHiddenFor(savedLead?.id ?? null);
    setFixNote(null);
    setUndoNote(null);
    counts.tap(kind, 1);
  }

  // Undo says what it took back, until the next tap.
  function undo() {
    setSavedHiddenFor(savedLead?.id ?? null);
    setFixNote(null);
    const kind = counts.lastKind;
    if (!kind) return;
    const after = counts.shown[kind] - 1;
    counts.undoLast();
    setUndoNote(kind === "doors" ? `Took back a door. Doors now ${after}.` : `Took back a conversation. Conversations now ${after}.`);
  }

  return (
    <div className="flex flex-col gap-3">
      <header className="flex flex-col">
        {/* A size down from other page titles, so long neighbourhood names
            ("Knocking in Crescent Heights") stay on one line and the
            knocking view fits one screen. */}
        <h1 ref={heading} tabIndex={-1} className="text-xl font-bold text-pretty outline-none">
          Knocking in {session.neighbourhood}
        </h1>
        <div className="flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
          <span data-testid="session-started">
            Started {sentenceEnd(formatTime(startedAt))}{" "}
            <span data-clock>Out {timeOutLabel(startedAt, now).toLowerCase()}.</span>
          </span>
          {fixing ? null : (
            <button
              type="button"
              onClick={() => {
                setFixNote(null);
                setFixing(true);
              }}
              className="-my-2.5 inline-flex min-h-11 items-center font-semibold text-foreground underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-testid="fix-start"
            >
              Fix start time
            </button>
          )}
        </div>
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

      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Counter label="Doors" count={counts.shown.doors} disabled={counts.ended} onAdd={() => tap("doors")} />
          <Counter label="Conversations" count={counts.shown.conversations} disabled={counts.ended} onAdd={() => tap("conversations")} />
        </div>
        <StatusRow
          counts={counts}
          saved={saved}
          fixNote={fixNote}
          undoNote={undoNote}
          reminder={tapReminderDue(startedAt, now, everTapped)}
          onUndo={undo}
          onStartAgain={() => router.refresh()}
        />
      </div>

      {unfinished}

      {times}

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

// One row under the counters, always the same height, so nothing ever
// pushes the counters down under the thumb: on the left what the taps are
// doing (or "Lead saved. On to the next door." after a save, or a note on
// the start time); on the right one action: Undo for the last tap, Open
// the saved lead, or Start again when the session ended on another phone.
function StatusRow({
  counts,
  saved,
  fixNote,
  undoNote,
  reminder,
  onUndo,
  onStartAgain,
}: {
  counts: KnockCounts;
  saved: SavedLead | null;
  fixNote: { text: string; calm: boolean } | null;
  undoNote: string | null;
  // Round 4: 15 minutes in with no tap yet, in the counters' own words.
  reminder: boolean;
  onUndo: () => void;
  onStartAgain: () => void;
}) {
  const undoButton =
    counts.lastKind && !counts.ended ? (
      <Button type="button" variant="ghost" className="h-11 shrink-0 px-3 font-semibold underline underline-offset-4" onClick={onUndo}>
        Undo {counts.lastKind === "doors" ? "door" : "conversation"}
      </Button>
    ) : null;

  let message: ReactNode;
  let action: ReactNode = undoButton;
  if (counts.ended) {
    message = (
      <p role="alert" className="text-sm font-semibold text-pretty">
        {counts.note ?? "This session has ended."}
      </p>
    );
    action = (
      <Button type="button" variant="outline" className="h-11 shrink-0" onClick={onStartAgain}>
        Start again
      </Button>
    );
  } else if (counts.note === VIEW_AS_NOTHING_SAVED) {
    message = <ActionMessage text={counts.note} />;
  } else if (saved) {
    message = (
      <p role="status" className="text-sm font-semibold text-pretty" data-testid="lead-saved">
        Lead saved. On to the next door.
      </p>
    );
    action = (
      <Link
        href={`/app/leads/${saved.id}`}
        className="inline-flex min-h-11 max-w-[45%] shrink-0 items-center text-sm font-semibold underline underline-offset-4"
      >
        <span className="truncate">Open {saved.name}</span>
      </Link>
    );
  } else if (fixNote) {
    message = fixNote.calm ? (
      <p role="status" className="text-sm text-pretty" data-testid="fix-start-saved">
        {fixNote.text}
      </p>
    ) : (
      <ActionMessage text={fixNote.text} />
    );
  } else if (counts.note) {
    message = (
      <p role="status" className="text-sm font-semibold text-pretty">
        {counts.pending === 1 ? "1 tap" : `${counts.pending} taps`} not saved yet. Retrying.
      </p>
    );
  } else if (undoNote) {
    message = (
      <p role="status" className="text-sm text-pretty" data-testid="undo-note">
        {undoNote}
      </p>
    );
  } else if (reminder) {
    message = (
      <p role="status" className="text-sm text-pretty" data-testid="tap-reminder">
        {TAP_REMINDER}
      </p>
    );
  } else {
    // Only a claim that's true: "All taps saved." once taps that were
    // waiting have landed; otherwise a steady line, and "Saving." when a
    // save is slow.
    message = (
      <p className="text-sm text-muted-foreground">
        {counts.slow ? "Saving." : counts.recovered && counts.pending === 0 ? "All taps saved." : "Taps save as you go."}
      </p>
    );
  }

  return (
    <div className="flex min-h-11 items-center justify-between gap-3" data-testid="tap-status" data-pending={counts.pending}>
      <div className="min-w-0">{message}</div>
      {action}
    </div>
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
  onDone: (startedAt: string | null, note: { text: string; calm: boolean } | null) => void;
}) {
  const [value, setValue] = useState(calgaryClock(startedAt));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    if (actedOut) {
      // The same rules as the server, then acted out.
      const fixed = fixedStart(calgaryDateOf(startedAt), value, Date.now());
      if (!fixed.ok) {
        setMessage(fixed.error);
        return;
      }
      onDone(fixed.startsAt, { text: VIEW_AS_NOTHING_SAVED, calm: false });
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
      onDone(result.startedAt, { text: `Start time saved: ${sentenceEnd(formatTime(result.startedAt))}`, calm: true });
    } catch {
      setMessage("No signal. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border p-3" data-testid="fix-start-panel">
      <label htmlFor="fix-start-time" className="text-sm font-semibold">
        When did you start?
      </label>
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

// ---------------------------------------------------------------- counting

type KnockCounts = {
  shown: Counts;
  saving: boolean;
  slow: boolean;
  note: string | null;
  // Taps on this phone not saved yet.
  pending: number;
  // The session ended elsewhere (or can't be counted): the counters stop.
  ended: boolean;
  // Any tap on this screen yet, and the last one, which Undo takes back.
  tapped: boolean;
  lastKind: keyof Counts | null;
  // Taps that had to wait have all landed.
  recovered: boolean;
  tap: (kind: keyof Counts, delta: 1 | -1) => void;
  undoLast: () => void;
  stop: () => void;
};

const pendingKey = (sessionId: string) => `vesper:knock-pending:${sessionId}`;

// A send still on its way from a Session screen that has since closed (the
// setter went to New lead and back, say). The next screen waits for it
// before reading the taps kept on the phone, so none goes out twice.
const flushesInFlight = new Map<string, Promise<void>>();

// The server takes at most 100 taps of each kind per call; a longer queue
// (a long stretch with no signal) goes out in turns.
const batch = (n: number) => Math.max(-100, Math.min(100, n));

function readPending(sessionId: string): Counts {
  try {
    const raw = localStorage.getItem(pendingKey(sessionId));
    if (!raw) return ZERO;
    const parsed = JSON.parse(raw) as Partial<Counts>;
    const doors = Number.isInteger(parsed.doors) ? Number(parsed.doors) : 0;
    const conversations = Number.isInteger(parsed.conversations) ? Number(parsed.conversations) : 0;
    const sane = (n: number) => Math.max(-10_000, Math.min(10_000, n));
    return { doors: sane(doors), conversations: sane(conversations) };
  } catch {
    return ZERO;
  }
}

function writePending(sessionId: string, counts: Counts) {
  try {
    if (counts.doors === 0 && counts.conversations === 0) localStorage.removeItem(pendingKey(sessionId));
    else localStorage.setItem(pendingKey(sessionId), JSON.stringify(counts));
  } catch {
    // Private browsing or full storage: the taps still send from memory.
  }
}

// The counters change the moment a button is tapped. Taps are queued and
// sent one batch at a time; a failed batch goes back in the queue and is
// retried, so fast tapping never loses a count. Taps not saved yet are also
// kept on the phone, so an app reload (the camera can cause one) sends them
// when Session opens again. Never under View as.
function useKnockCounts(session: KnockSessionView, actedOut: boolean): KnockCounts {
  const [shown, setShown] = useState<Counts>({ doors: session.doors_knocked, conversations: session.conversations });
  const [saving, setSaving] = useState(false);
  const [slow, setSlow] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [ended, setEnded] = useState(false);
  const [tapped, setTapped] = useState(false);
  const [recovered, setRecovered] = useState(false);
  const failed = useRef(false);
  // The taps on this screen, newest last, so Undo takes back the last one.
  const history = useRef<(keyof Counts)[]>([]);
  const [lastKind, setLastKind] = useState<keyof Counts | null>(null);
  const confirmed = useRef<Counts>({ doors: session.doors_knocked, conversations: session.conversations });
  const queued = useRef<Counts>(ZERO);
  const sending = useRef<Counts>(ZERO);
  const flushing = useRef(false);
  const stopped = useRef(false);
  // Until the taps kept from an earlier visit are read back, nothing is
  // written over them.
  const restored = useRef(false);
  // Whether this screen is still up: a closed one stops sending, and what it
  // hadn't sent stays on the phone for the next one.
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  function total(): Counts {
    return {
      doors: confirmed.current.doors + sending.current.doors + queued.current.doors,
      conversations: confirmed.current.conversations + sending.current.conversations + queued.current.conversations,
    };
  }

  function unsent(): Counts {
    return {
      doors: sending.current.doors + queued.current.doors,
      conversations: sending.current.conversations + queued.current.conversations,
    };
  }

  function show() {
    const waiting = unsent();
    setShown(total());
    setPending(Math.abs(waiting.doors) + Math.abs(waiting.conversations));
    // Nothing left waiting (an Undo took back the last unsaved tap, say):
    // no retry line for zero taps.
    if (waiting.doors === 0 && waiting.conversations === 0 && !stopped.current) setNote(null);
    if (!actedOut && !stopped.current && restored.current) writePending(session.id, waiting);
  }

  async function flush() {
    if (flushing.current) return;
    flushing.current = true;
    const run = sendQueued();
    flushesInFlight.set(session.id, run);
    await run;
    if (flushesInFlight.get(session.id) === run) flushesInFlight.delete(session.id);
  }

  async function sendQueued() {
    setSaving(true);
    const slowTimer = window.setTimeout(() => setSlow(true), SLOW_SAVE_MS);
    try {
      while (!stopped.current && alive.current && (queued.current.doors !== 0 || queued.current.conversations !== 0)) {
        sending.current = { doors: batch(queued.current.doors), conversations: batch(queued.current.conversations) };
        queued.current = {
          doors: queued.current.doors - sending.current.doors,
          conversations: queued.current.conversations - sending.current.conversations,
        };
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
          if (failed.current && queued.current.doors === 0 && queued.current.conversations === 0) {
            failed.current = false;
            setRecovered(true);
          }
          show();
          continue;
        }
        failed.current = true;
        queued.current = {
          doors: queued.current.doors + sending.current.doors,
          conversations: queued.current.conversations + sending.current.conversations,
        };
        sending.current = ZERO;
        if (result.fatal) {
          stopped.current = true;
          writePending(session.id, ZERO);
          setEnded(true);
          setNote(result.error.startsWith("This session has ended") ? "This session has ended." : result.error);
          show();
          break;
        }
        setNote(result.error);
        show();
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    } finally {
      window.clearTimeout(slowTimer);
      flushing.current = false;
      setSaving(false);
      setSlow(false);
    }
  }

  // Taps left on this phone by an earlier visit go out first, just after
  // the screen is up.
  useEffect(() => {
    if (actedOut) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      await (flushesInFlight.get(session.id) ?? Promise.resolve());
      if (cancelled || !alive.current) return;
      const left = readPending(session.id);
      restored.current = true;
      if (left.doors === 0 && left.conversations === 0) {
        show();
        return;
      }
      queued.current = { doors: queued.current.doors + left.doors, conversations: queued.current.conversations + left.conversations };
      show();
      void flush();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // Runs once per session shown; show and flush read refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id, actedOut]);

  function tap(kind: keyof Counts, delta: 1 | -1) {
    if (stopped.current) return;
    if (total()[kind] + delta < 0) return;
    setTapped(true);
    setRecovered(false);
    if (delta === 1) history.current = [...history.current.slice(-49), kind];
    setLastKind(history.current[history.current.length - 1] ?? null);
    if (actedOut) {
      confirmed.current = { ...confirmed.current, [kind]: confirmed.current[kind] + delta };
      setShown(total());
      setNote(VIEW_AS_NOTHING_SAVED);
      return;
    }
    queued.current = { ...queued.current, [kind]: queued.current[kind] + delta };
    show();
    void flush();
  }

  function undoLast() {
    const kind = history.current[history.current.length - 1];
    if (!kind) return;
    history.current = history.current.slice(0, -1);
    tap(kind, -1);
  }

  return {
    shown,
    saving,
    slow,
    note,
    pending,
    ended,
    tapped,
    lastKind,
    recovered,
    tap,
    undoLast,
    // Once the session ends, no more taps are sent.
    stop: () => {
      stopped.current = true;
      writePending(session.id, ZERO);
    },
  };
}

function Counter({ label, count, disabled, onAdd }: { label: string; count: number; disabled: boolean; onAdd: () => void }) {
  return (
    <button
      type="button"
      onClick={onAdd}
      disabled={disabled}
      aria-label={`${label} +1, now ${count}`}
      className="flex h-20 touch-manipulation flex-col items-center justify-center rounded-xl bg-primary text-primary-foreground outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:bg-primary/85 disabled:opacity-50"
    >
      <span className="text-4xl leading-none font-bold tabular-nums" aria-hidden="true">
        {count}
      </span>
      <span className="mt-1 text-base font-semibold" aria-hidden="true">
        {label} +1
      </span>
    </button>
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
  const question = useRef<HTMLDivElement>(null);
  const endButton = useRef<HTMLButtonElement>(null);
  const asked = useRef(false);

  // The question opens above the tab bar, never under it, and takes focus;
  // Keep going gives focus back to End knocking.
  useEffect(() => {
    if (confirm) {
      asked.current = true;
      question.current?.scrollIntoView({ block: "end" });
      question.current?.focus({ preventScroll: true });
    } else if (asked.current) {
      asked.current = false;
      endButton.current?.focus();
    }
  }, [confirm]);

  // A message under the question (no signal, say) stays in view too.
  useEffect(() => {
    if (error) question.current?.scrollIntoView({ block: "end" });
  }, [error]);

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
        automatic: false,
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

  // End knocking and New lead share a row, so the knocking view fits one
  // screen; New lead, used all evening, takes the thumb's corner. End asks
  // first, so a slip costs nothing.
  if (!confirm) {
    return (
      <div className="grid grid-cols-2 gap-3">
        <Button
          ref={endButton}
          type="button"
          variant="ghost"
          className="h-11 w-full text-muted-foreground underline underline-offset-4"
          onClick={() => setConfirm(true)}
        >
          End knocking
        </Button>
        <NewLeadButton />
      </div>
    );
  }
  return (
    <div
      ref={question}
      role="group"
      tabIndex={-1}
      aria-labelledby="end-heading"
      className="flex scroll-mb-[calc(6rem+env(safe-area-inset-bottom))] flex-col gap-3 rounded-md border p-3 outline-none"
      data-testid="end-confirm"
    >
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
