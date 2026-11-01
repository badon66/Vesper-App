"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { holdTime } from "@/app/(app)/app/schedule/actions";
import {
  eveningLabel,
  eveningsOf,
  initials,
  isBookable,
  pickEvening,
  toBoardSlots,
  type BoardSlot,
} from "@/lib/schedule/board";
import { holdStore } from "@/lib/schedule/hold-store";
import { createClient } from "@/lib/supabase/client";
import { formatLongDay, formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";

const POLL_MS = 3_000;

export type PickerMode = "book" | "hold" | "move" | "view";

// The time picker (Keenan, 2026-11-01). Opens on tonight, or when tonight
// has nothing left says so and opens the next evening with an opening; any
// evening in the window is one tap away. A held time shows the holder's
// initials and cannot be picked; a booked one is greyed out. It reads the
// board from the database every few seconds, so holds and bookings on other
// phones show up without a refresh. Tapping a time asks the database to hold
// it; the database decides.
export function TimePicker({
  initial,
  today,
  windowDays,
  asSales,
  viewerId,
  mode,
  leadId,
  meetingId,
  initialDay,
  tonightOnly = false,
  onHeld,
  onDayChange,
  onBoardChange,
}: {
  initial: BoardSlot[];
  today: string;
  windowDays: number;
  asSales: boolean;
  viewerId: string | null;
  mode: PickerMode;
  leadId?: string | null;
  meetingId?: string | null;
  initialDay?: string | null;
  tonightOnly?: boolean;
  onHeld?: (startsAt: string) => void;
  onDayChange?: (day: string) => void;
  onBoardChange?: () => void;
}) {
  const router = useRouter();
  const [slots, setSlots] = useState(initial);
  const evenings = useMemo(() => eveningsOf(slots, today, windowDays), [slots, today, windowDays]);
  const opening = useMemo(() => pickEvening(eveningsOf(initial, today, windowDays), today), [initial, today, windowDays]);
  const [day, setDay] = useState(initialDay ?? opening.day);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const bookedKey = useRef(bookedSignature(initial));

  const read = useCallback(async () => {
    const { data, error } = await createClient().rpc("schedule_board", {
      p_as_sales: asSales,
      ...(viewerId ? { p_viewer: viewerId } : {}),
    });
    if (error || !data) return;
    const next = toBoardSlots(data);
    setSlots(next);
    const key = bookedSignature(next);
    if (key !== bookedKey.current) {
      bookedKey.current = key;
      onBoardChange?.();
    }
  }, [asSales, viewerId, onBoardChange]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void read();
    }, POLL_MS);
    const wake = () => {
      if (document.visibilityState === "visible") void read();
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    window.addEventListener("focus", wake);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
      window.removeEventListener("focus", wake);
    };
  }, [read]);

  function choose(nextDay: string) {
    setDay(nextDay);
    setMessage(null);
    onDayChange?.(nextDay);
  }

  async function tap(slot: BoardSlot) {
    setMessage(null);
    if (slot.state === "held" && !slot.heldByViewer) {
      setMessage(`${slot.holderName ?? "Someone"} is booking this time.`);
      return;
    }
    if (!isBookable(slot) || mode === "view") return;
    setPending(slot.startsAt);
    const result = await holdTime(slot.startsAt, { leadId, meetingId });
    setPending(null);
    if (!result.ok) {
      setMessage(result.message);
      void read();
      return;
    }
    void read();
    // The hold keeper lets a hold go when the screen isn't a booking screen,
    // so the booking screen tells it about the hold after the move there.
    if (mode === "hold") {
      holdStore.set({ startsAt: slot.startsAt });
      onHeld?.(slot.startsAt);
    } else if (mode === "move" && meetingId) {
      router.push(`/app/schedule/book?move=${meetingId}&start=${encodeURIComponent(slot.startsAt)}`);
    } else if (mode === "book") {
      router.push(`/app/schedule/book?start=${encodeURIComponent(slot.startsAt)}${leadId ? `&lead=${leadId}` : ""}`);
    }
  }

  const evening = evenings.find((item) => item.day === day) ?? evenings[0];
  const daySlots = evening?.slots ?? [];
  const tonightFullNote = !tonightOnly && opening.tonightFull && day === opening.day && day !== today;

  return (
    <div className="flex flex-col gap-4" data-testid="time-picker">
      {!tonightOnly ? (
        <div className="-mx-4 overflow-x-auto px-4" role="group" aria-label="Evenings">
          <div className="flex w-max gap-2">
            {evenings.map((item) => (
              <button
                key={item.day}
                type="button"
                onClick={() => choose(item.day)}
                aria-pressed={item.day === day}
                className={cn(
                  "flex min-h-14 min-w-20 flex-col items-center justify-center rounded-md border px-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  item.day === day ? "border-primary bg-primary text-primary-foreground" : "bg-background",
                  item.slots.length === 0 && item.day !== day && "text-muted-foreground",
                )}
              >
                <span>{eveningLabel(item.day, today)}</span>
                <span className="text-xs font-normal">
                  {item.slots.length === 0 ? "No meetings" : item.open === 0 ? "Full" : `${item.open} open`}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <p className="text-sm font-semibold" data-testid="picker-day">
          {day === today ? "Tonight" : formatLongDay(day)}
        </p>
        {tonightFullNote ? (
          <p className="text-sm text-muted-foreground" data-testid="tonight-full">
            Nothing left tonight. This is the next evening with an opening.
          </p>
        ) : null}
      </div>

      {message ? (
        <p role="alert" className="text-sm font-semibold text-destructive" data-testid="picker-message">
          {message}
        </p>
      ) : null}
      {daySlots.length === 0 ? (
        <p className="text-sm text-muted-foreground">No meetings this evening.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label={`Times, ${eveningLabel(day, today)}`}>
          {daySlots.map((slot) => (
            <li key={slot.startsAt}>
              <SlotButton
                slot={slot}
                pending={pending === slot.startsAt}
                disabled={mode === "view" || pending !== null}
                onTap={() => void tap(slot)}
              />
            </li>
          ))}
        </ul>
      )}

    </div>
  );
}

function bookedSignature(slots: BoardSlot[]): string {
  return slots
    .filter((slot) => slot.meetingId)
    .map((slot) => slot.meetingId)
    .join(",");
}

function SlotButton({
  slot,
  pending,
  disabled,
  onTap,
}: {
  slot: BoardSlot;
  pending: boolean;
  disabled: boolean;
  onTap: () => void;
}) {
  const time = formatTime(slot.startsAt);
  const heldByOther = slot.state === "held" && !slot.heldByViewer;
  const mine = slot.state === "held" && slot.heldByViewer;
  const greyed = slot.state === "booked" || slot.state === "blocked" || slot.state === "closed";
  const detail =
    slot.state === "booked"
      ? [slot.setterIsViewer ? "Your booking" : "Booked", slot.neighbourhood, slot.setterIsViewer ? null : slot.setterName]
          .filter(Boolean)
          .join(" · ")
      : slot.state === "blocked"
        ? "Blocked"
        : slot.state === "closed"
          ? "Closed"
          : heldByOther
            ? `${slot.holderName ?? "Someone"} is booking`
            : mine
              ? "You're holding this"
              : pending
                ? "Holding"
                : "Open";
  return (
    <button
      type="button"
      onClick={onTap}
      disabled={disabled || greyed}
      data-time={slot.startsAt}
      data-state={mine ? "mine" : slot.state}
      aria-label={`${time}, ${detail}`}
      className={cn(
        "relative flex min-h-20 w-full flex-col items-start justify-center rounded-md border px-4 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed",
        slot.state === "open" && "border-primary bg-background",
        mine && "border-primary bg-primary text-primary-foreground",
        heldByOther && "border-dashed bg-muted",
        greyed && "bg-muted text-muted-foreground opacity-70",
      )}
    >
      <span className="text-2xl font-bold tabular-nums">{time}</span>
      <span className="text-sm">{detail}</span>
      {heldByOther ? (
        <span
          aria-hidden="true"
          className="absolute top-2 right-2 flex size-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground"
          data-testid="holder-initials"
        >
          {initials(slot.holderName)}
        </span>
      ) : null}
    </button>
  );
}
