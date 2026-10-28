"use client";

import { useActionState, useRef, useState } from "react";
import {
  bumpKnockSession,
  endKnockSession,
  startKnockSession,
  type KnockBumpResult,
  type KnockState,
} from "@/app/(app)/app/knock-actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { submitKeepingValues } from "@/lib/forms/submit";
import { formatTime } from "@/lib/time";

export type KnockSessionView = {
  id: string;
  neighbourhood: string;
  started_at: string;
  doors_knocked: number;
  conversations: number;
};

type Counts = { doors: number; conversations: number };

// "5:16 a.m." already ends a sentence; "17:16" needs the full stop.
const sentenceEnd = (text: string) => (text.endsWith(".") ? text : `${text}.`);
const ZERO: Counts = { doors: 0, conversations: 0 };
const initialState: KnockState = {};

export function KnockCard({
  session,
  lastNeighbourhood,
}: {
  session: KnockSessionView | null;
  lastNeighbourhood: string | null;
}) {
  return session ? (
    <ActiveSession session={session} />
  ) : (
    <StartSession lastNeighbourhood={lastNeighbourhood} />
  );
}

function StartSession({ lastNeighbourhood }: { lastNeighbourhood: string | null }) {
  const [state, formAction, pending] = useActionState(startKnockSession, initialState);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Knock session</CardTitle>
        <CardDescription>
          Count doors and conversations as you go. Leads you add while it runs
          link to it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submitKeepingValues(formAction)} className="flex flex-col gap-3">
          <Label htmlFor="knock-neighbourhood">Neighbourhood</Label>
          <Input
            id="knock-neighbourhood"
            name="neighbourhood"
            defaultValue={lastNeighbourhood ?? ""}
            autoComplete="off"
            autoCapitalize="words"
          />
          {state.error ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {state.error}
            </p>
          ) : null}
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? "Starting" : "Start knocking"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// The counters change the moment a button is tapped. Taps are queued and
// sent one batch at a time; a failed batch goes back in the queue and is
// retried, so fast tapping never loses a count.
function ActiveSession({ session }: { session: KnockSessionView }) {
  const [shown, setShown] = useState<Counts>({
    doors: session.doors_knocked,
    conversations: session.conversations,
  });
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [endState, endAction, ending] = useActionState(endKnockSession, initialState);
  const confirmed = useRef<Counts>({
    doors: session.doors_knocked,
    conversations: session.conversations,
  });
  const queued = useRef<Counts>(ZERO);
  const sending = useRef<Counts>(ZERO);
  const flushing = useRef(false);
  const stopped = useRef(false);

  function total(): Counts {
    return {
      doors: confirmed.current.doors + sending.current.doors + queued.current.doors,
      conversations:
        confirmed.current.conversations +
        sending.current.conversations +
        queued.current.conversations,
    };
  }

  function tap(kind: keyof Counts, delta: 1 | -1) {
    if (stopped.current) return;
    if (total()[kind] + delta < 0) return;
    queued.current = { ...queued.current, [kind]: queued.current[kind] + delta };
    setShown(total());
    void flush();
  }

  async function flush() {
    if (flushing.current) return;
    flushing.current = true;
    setSaving(true);
    try {
      while (
        !stopped.current &&
        (queued.current.doors !== 0 || queued.current.conversations !== 0)
      ) {
        sending.current = queued.current;
        queued.current = ZERO;
        let result: KnockBumpResult;
        try {
          result = await bumpKnockSession(
            session.id,
            sending.current.doors,
            sending.current.conversations,
          );
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Knocking in {session.neighbourhood}</CardTitle>
        <CardDescription>
          Started at {sentenceEnd(formatTime(session.started_at))} New leads link to this session.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Counter
            label="Doors"
            count={shown.doors}
            onAdd={() => tap("doors", 1)}
            onUndo={() => tap("doors", -1)}
          />
          <Counter
            label="Conversations"
            count={shown.conversations}
            onAdd={() => tap("conversations", 1)}
            onUndo={() => tap("conversations", -1)}
          />
        </div>
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {note ?? (saving ? "Saving" : "All taps saved.")}
        </p>
        {confirmEnd ? (
          <form action={endAction} className="flex flex-col gap-3">
            <input type="hidden" name="id" value={session.id} />
            <p className="text-sm font-semibold">
              End this session? You can start a new one any time.
            </p>
            <div className="flex gap-3">
              <Button type="submit" className="flex-1" disabled={ending || saving}>
                {ending ? "Ending" : "Yes, end it"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setConfirmEnd(false)}
              >
                Keep going
              </Button>
            </div>
            {endState.error ? (
              <p role="alert" className="text-sm font-medium text-destructive">
                {endState.error}
              </p>
            ) : null}
          </form>
        ) : (
          <Button type="button" variant="outline" onClick={() => setConfirmEnd(true)}>
            End session
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function Counter({
  label,
  count,
  onAdd,
  onUndo,
}: {
  label: string;
  count: number;
  onAdd: () => void;
  onUndo: () => void;
}) {
  const name = label.toLowerCase();
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={onAdd}
        aria-label={`Add one to ${name}, now ${count}`}
        className="flex h-32 touch-manipulation flex-col items-center justify-center gap-1 rounded-xl bg-primary text-primary-foreground outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:bg-primary/85 disabled:pointer-events-none disabled:opacity-50"
      >
        <span className="text-5xl font-bold tabular-nums" aria-hidden="true">
          {count}
        </span>
        <span className="text-base font-semibold" aria-hidden="true">
          {label} +1
        </span>
      </button>
      <Button
        type="button"
        variant="outline"
        className="touch-manipulation"
        onClick={onUndo}
        aria-label={`Take one off ${name}`}
      >
        Undo
      </Button>
    </div>
  );
}
