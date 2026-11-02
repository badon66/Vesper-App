"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { holdTime } from "@/app/(app)/app/schedule/actions";
import { bookingSheet } from "@/lib/booking/sheet-store";
import {
  eveningLabel,
  eveningsOf,
  initials,
  isBookable,
  pickEvening,
  toBoardSlots,
  type BoardSlot,
} from "@/lib/schedule/board";
import { createClient } from "@/lib/supabase/client";
import { formatLongDay, formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";

const POLL_MS = 3_000;

// book: tapping an open time holds it and opens the booking sheet over the
// screen (Schedule, Home). sheet: inside the sheet, a held time is handed
// back to it. view: nothing can be tapped.
export type PickerMode = "book" | "sheet" | "view";

// The time picker (Keenan, 2026-11-01 and 2026-11-02). Opens on tonight, or
// when tonight has nothing left says so and opens the next evening with an
// opening; any evening in the window is one tap away. A held time shows the
// holder's initials and cannot be picked; a booked one is greyed out. It
// reads the board from the database every few seconds, so holds and
// bookings on other phones show up without a refresh. Tapping a time asks
// the database to hold it; the database decides.
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
  onUnavailableTap,
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
  // Keenan taps a blocked time to unblock it, or a booked one to see it.
  onUnavailableTap?: (slot: BoardSlot) => void;
}) {
  const [slots, setSlots] = useState(initial);
  const evenings = useMemo(() => eveningsOf(slots, today, windowDays), [slots, today, windowDays]);
  const opening = useMemo(() => pickEvening(eveningsOf(initial, today, windowDays), today), [initial, today, windowDays]);
  const [day, setDay] = useState(initialDay ?? opening.day);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const bookedKey = useRef(bookedSignature(initial));
  const strip = useRef<HTMLDivElement>(null);

  // The chosen evening's chip is always in view, also when the page opens on
  // an evening further along the strip.
  useEffect(() => {
    const chip = strip.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
    const box = strip.current;
    if (!chip || !box) return;
    const left = chip.offsetLeft - box.offsetLeft;
    if (left < box.scrollLeft || left + chip.offsetWidth > box.scrollLeft + box.clientWidth) {
      box.scrollTo({ left: Math.max(0, left - 16) });
    }
  }, [day]);

  const read = useCallback(async () => {
    try {
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
    } catch {
      // No signal: the next read tries again.
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
    if (!isBookable(slot)) {
      if ((slot.state === "blocked" || slot.state === "booked") && onUnavailableTap) onUnavailableTap(slot);
      return;
    }
    if (mode === "view") return;
    setPending(slot.startsAt);
    try {
      const result = await holdTime(slot.startsAt, { leadId, meetingId });
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      if (mode === "book") bookingSheet.open({ kind: "book", startsAt: slot.startsAt });
      else onHeld?.(slot.startsAt);
    } catch {
      setMessage("No signal. Tap the time again.");
    } finally {
      setPending(null);
      void read();
    }
  }

  const evening = evenings.find((item) => item.day === day) ?? evenings[0];
  const daySlots = evening?.slots ?? [];
  const tonightFullNote = !tonightOnly && opening.tonightFull && day === opening.day && day !== today;

  return (
    <div className="flex flex-col gap-4" data-testid="time-picker">
      {!tonightOnly ? (
        <div ref={strip} className="-mx-4 overflow-x-auto px-4" role="group" aria-label="Evenings">
          <div className="flex w-max gap-2">
            {evenings.map((item) => (
              <button
                key={item.day}
                type="button"
                onClick={() => choose(item.day)}
                aria-pressed={item.day === day}
                className={cn(
                  "flex min-h-14 min-w-20 flex-col items-center justify-center rounded-md border px-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  item.day === day ? "border-foreground bg-foreground text-background" : "bg-background",
                  item.slots.length === 0 && item.day !== day && "text-muted-foreground",
                )}
              >
                <span>{eveningLabel(item.day, today)}</span>
                <span className="text-xs font-normal">{eveningSummary(item.slots)}</span>
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
          <p className="text-sm text-pretty text-muted-foreground" data-testid="tonight-full">
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
        <p className="text-sm text-muted-foreground">No meeting times this evening.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label={`Times, ${eveningLabel(day, today)}`}>
          {daySlots.map((slot) => (
            <li key={slot.startsAt}>
              <SlotButton
                slot={slot}
                pending={pending === slot.startsAt}
                disabled={mode === "view" || pending !== null}
                ownerTaps={Boolean(onUnavailableTap)}
                onTap={() => void tap(slot)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// What an evening's chip says under its name.
function eveningSummary(slots: BoardSlot[]): string {
  if (slots.length === 0) return "No times";
  const open = slots.filter((slot) => slot.state === "open").length;
  if (open > 0) return `${open} open`;
  return slots.every((slot) => slot.state === "closed") ? "Closed" : "Full";
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
  ownerTaps,
  onTap,
}: {
  slot: BoardSlot;
  pending: boolean;
  disabled: boolean;
  ownerTaps: boolean;
  onTap: () => void;
}) {
  const time = formatTime(slot.startsAt);
  const heldByOther = slot.state === "held" && !slot.heldByViewer;
  const mine = slot.state === "held" && slot.heldByViewer;
  const booked = slot.state === "booked";
  const blocked = slot.state === "blocked";
  const closed = slot.state === "closed";
  const detail = booked
    ? slot.setterIsViewer
      ? "Your booking"
      : "Booked"
    : blocked
      ? ownerTaps
        ? "Blocked · tap to unblock"
        : "Blocked"
      : closed
        ? "Too late to book"
        : heldByOther
          ? `${slot.holderName ?? "Someone"} is booking`
          : mine
            ? "You're holding this"
            : pending
              ? "Holding"
              : "Open";
  // Blocked and booked times stay tappable for Keenan: to unblock one, or to
  // jump to a booking's details.
  const unavailable = closed || ((booked || blocked) && !ownerTaps);
  const more = booked ? [slot.neighbourhood, slot.setterIsViewer ? null : slot.setterName].filter(Boolean).join(" · ") : "";
  return (
    <button
      type="button"
      onClick={onTap}
      disabled={disabled || unavailable}
      data-time={slot.startsAt}
      data-state={mine ? "mine" : slot.state}
      aria-label={`${time}, ${detail}${more ? `, ${more}` : ""}`}
      className={cn(
        "relative flex min-h-20 w-full flex-col items-start justify-center rounded-md border px-4 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed",
        slot.state === "open" && "border-primary bg-background",
        mine && "border-primary bg-primary text-primary-foreground",
        heldByOther && "border-dashed bg-muted",
        booked && "border-foreground/40 bg-secondary text-foreground",
        (blocked || closed) && "bg-muted text-muted-foreground",
      )}
    >
      <span className="text-2xl font-bold tabular-nums">{time}</span>
      <span className="text-sm">{detail}</span>
      {more ? <span className="w-full truncate text-xs text-muted-foreground">{more}</span> : null}
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
