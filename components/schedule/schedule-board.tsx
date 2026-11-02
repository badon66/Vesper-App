"use client";

import { Check, Minus, Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import {
  addTimeBlock,
  previewDaySchedule,
  removeTimeBlock,
  setDaySchedule,
  type DaySchedulePreview,
  type DayScope,
} from "@/app/(app)/app/schedule/actions";
import { TimePicker } from "@/components/schedule/time-picker";
import { Button } from "@/components/ui/button";
import { DialogPanel } from "@/components/ui/dialog-panel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BoardSlot } from "@/lib/schedule/board";
import { dayPlan, openRuns, type PlanRow } from "@/lib/schedule/day-plan";
import { calgaryDateOf, calgaryInstant, formatDay, formatLongDay, formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";

type Template = { start: string; minutes: number; count: number };

export type OwnerEveningTools = {
  day: string;
  blocks: { id: string; startsAt: string; endsAt: string; reason: string | null }[];
  // The evening's times now (its own, or the usual ones), and the usual
  // times in Settings.
  template: Template & { own: boolean; usualDay: boolean; usual: Template };
};

// Classes a booking's card wears for a moment after its time is tapped.
const HIGHLIGHT = ["ring-2", "ring-primary", "ring-offset-2", "ring-offset-background"];

// The Schedule tab (Keenan, 2026-11-01 and 2026-11-02): the times for the
// booking window, with holds, bookings and blocked times on the board
// itself. Tapping an open time holds it and opens the booking sheet. Keenan
// also gets two small buttons at the right of the header (Block time and a
// pencil for the evening's times) and the evening's bookings, beside the
// board on an iPad in landscape. Setters never see them.
export function ScheduleBoard({
  board,
  today,
  windowDays,
  asSales,
  viewerId,
  initialDay,
  owner,
  children,
}: {
  board: BoardSlot[];
  today: string;
  windowDays: number;
  asSales: boolean;
  viewerId: string | null;
  initialDay: string;
  owner: OwnerEveningTools | null;
  // Keenan's bookings for the evening, from the server.
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [blockOpen, setBlockOpen] = useState(false);
  const [dayOpen, setDayOpen] = useState(false);
  // Each opening of a pop-up starts fresh on the evening as it is.
  const [openings, setOpenings] = useState(0);
  const [unblock, setUnblock] = useState<OwnerEveningTools["blocks"][number] | null>(null);
  // Keenan's evening follows the strip through the server; until it arrives,
  // the bookings dim and the tools wait, so nothing acts on the old evening.
  const [switching, startSwitch] = useTransition();
  const refresh = useCallback(() => router.refresh(), [router]);
  const onDayChange = useCallback(
    (day: string) => {
      if (owner) startSwitch(() => router.replace(`/app/schedule?day=${day}`, { scroll: false }));
    },
    [owner, router],
  );
  const onUnavailableTap = useCallback(
    (slot: BoardSlot) => {
      if (!owner) return;
      if (slot.state === "booked" && slot.meetingId) {
        const card = document.getElementById(`meeting-${slot.meetingId}`);
        if (!card) return;
        card.scrollIntoView({ behavior: "smooth", block: "start" });
        card.classList.add(...HIGHLIGHT);
        window.setTimeout(() => card.classList.remove(...HIGHLIGHT), 1600);
        return;
      }
      const block = owner.blocks.find((item) => item.startsAt < slot.endsAt && item.endsAt > slot.startsAt);
      if (block) setUnblock(block);
    },
    [owner],
  );
  const daySlots = board.filter((slot) => slot.day === (owner?.day ?? initialDay));
  const twoPanes = Boolean(owner && children);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Schedule</h1>
          <p className="mt-1 text-sm text-pretty text-muted-foreground">Tap an open time to hold it and book.</p>
        </div>
        {owner ? (
          <div className="flex shrink-0 items-center gap-2" data-testid="owner-schedule-tools">
            {daySlots.length > 0 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={switching}
                onClick={() => {
                  setOpenings((count) => count + 1);
                  setBlockOpen(true);
                }}
              >
                Block time
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Change this evening's times"
              disabled={switching}
              onClick={() => {
                setOpenings((count) => count + 1);
                setDayOpen(true);
              }}
            >
              <Pencil className="size-5" />
            </Button>
          </div>
        ) : null}
      </div>

      <div className={cn("flex flex-col gap-6", twoPanes && "lg:grid lg:grid-cols-2 lg:items-start lg:gap-8")}>
        <div className={cn(twoPanes && "lg:sticky lg:top-6")}>
          <TimePicker
            initial={board}
            today={today}
            windowDays={windowDays}
            asSales={asSales}
            viewerId={viewerId}
            mode="book"
            initialDay={initialDay}
            onDayChange={onDayChange}
            onBoardChange={refresh}
            onUnavailableTap={owner ? onUnavailableTap : undefined}
          />
        </div>
        {children ? (
          <div aria-busy={switching} className={cn("transition-opacity", switching && "opacity-50")}>
            {children}
          </div>
        ) : null}
      </div>

      {owner ? (
        <>
          <BlockTimeDialog key={`block-${owner.day}-${openings}`} open={blockOpen} onClose={() => setBlockOpen(false)} day={owner.day} slots={daySlots} />
          <DayTimesDialog key={`day-${owner.day}-${openings}`} open={dayOpen} onClose={() => setDayOpen(false)} tools={owner} slots={daySlots} />
          <UnblockDialog block={unblock} onClose={() => setUnblock(null)} />
        </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- Block time

// One time, or the whole evening: every open time, joined into runs, so a
// booked or held time is never part of a block and the database never
// refuses it for one.
function BlockTimeDialog({ open, onClose, day, slots }: { open: boolean; onClose: () => void; day: string; slots: BoardSlot[] }) {
  const router = useRouter();
  const [choice, setChoice] = useState<string>("evening");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const openSlots = slots.filter((slot) => slot.state === "open");
  const runs = openRuns(slots);
  const someTaken = openSlots.length < slots.length;
  const target = choice === "evening" ? null : openSlots.find((slot) => slot.startsAt === choice);
  const label =
    choice === "evening"
      ? someTaken
        ? `Block ${openSlots.length} open ${openSlots.length === 1 ? "time" : "times"}`
        : "Block the whole evening"
      : `Block ${target ? formatTime(target.startsAt) : ""}`;

  function block() {
    const ranges = choice === "evening" ? runs : target ? [target] : [];
    if (ranges.length === 0) return;
    setMessage(null);
    startTransition(async () => {
      for (const range of ranges) {
        const result = await addTimeBlock(range.startsAt, range.endsAt, reason);
        if (!result.ok) {
          setMessage(
            result.code === "slot_taken"
              ? "Someone booked one of these times a moment ago. Close this and look again."
              : result.code === "slot_held"
                ? `${result.message} Try again once they're done.`
                : result.message,
          );
          router.refresh();
          return;
        }
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <DialogPanel
      open={open}
      onClose={onClose}
      title={`Block time, ${formatLongDay(day)}`}
      testId="block-time"
      actions={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={block} disabled={pending || openSlots.length === 0}>
            {pending ? "Blocking" : label}
          </Button>
        </>
      }
    >
      {openSlots.length === 0 ? (
        <p className="text-sm text-pretty text-muted-foreground">Every time this evening is booked, held or blocked, so there is nothing left to block.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-semibold">What to block</legend>
            <ChoiceRow name="block-choice" value="evening" checked={choice === "evening"} onPick={setChoice}>
              The whole evening
            </ChoiceRow>
            <div className="grid grid-cols-2 gap-2">
              {openSlots.map((slot) => (
                <ChoiceRow key={slot.startsAt} name="block-choice" value={slot.startsAt} checked={choice === slot.startsAt} onPick={setChoice}>
                  {formatTime(slot.startsAt)}
                </ChoiceRow>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-col gap-2">
            <Label htmlFor="block-reason">Reason (optional)</Label>
            <Input id="block-reason" value={reason} maxLength={200} onChange={(event) => setReason(event.target.value)} />
          </div>
          <p className="text-sm text-pretty text-muted-foreground">
            {someTaken ? "Only open times are blocked. Booked times stay booked, and a time someone is holding stays theirs." : "A time someone is holding stays theirs."}
          </p>
          {message ? (
            <p role="alert" className="text-sm font-semibold text-destructive">
              {message}
            </p>
          ) : null}
        </div>
      )}
    </DialogPanel>
  );
}

function UnblockDialog({ block, onClose }: { block: OwnerEveningTools["blocks"][number] | null; onClose: () => void }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const title = block ? `Blocked: ${formatTime(block.startsAt)} to ${formatTime(block.endsAt)}` : "Blocked";

  function unblock() {
    if (!block) return;
    setMessage(null);
    startTransition(async () => {
      const result = await removeTimeBlock(block.id);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <DialogPanel
      open={block !== null}
      onClose={onClose}
      title={title}
      testId="unblock"
      actions={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            Keep it blocked
          </Button>
          <Button type="button" onClick={unblock} disabled={pending}>
            {pending ? "Unblocking" : "Unblock"}
          </Button>
        </>
      }
    >
      <p className="text-base">{block?.reason ? `Reason: ${block.reason}` : "No reason given."}</p>
      <p className="mt-2 text-sm text-pretty text-muted-foreground">Unblocking opens these times for booking again.</p>
      {message ? (
        <p role="alert" className="mt-2 text-sm font-semibold text-destructive">
          {message}
        </p>
      ) : null}
    </DialogPanel>
  );
}

// ---------------------------------------------------------------- the evening's times

function sameTemplate(a: Template, b: Template): boolean {
  return a.start === b.start && a.minutes === b.minutes && a.count === b.count;
}

function DayTimesDialog({
  open,
  onClose,
  tools,
  slots,
}: {
  open: boolean;
  onClose: () => void;
  tools: OwnerEveningTools;
  slots: BoardSlot[];
}) {
  const router = useRouter();
  const [start, setStart] = useState(tools.template.start);
  const [minutes, setMinutes] = useState(tools.template.minutes);
  const [count, setCount] = useState(tools.template.count);
  const [plans, setPlans] = useState<{ key: string; day: DaySchedulePreview | null; refused: string | null; all: DaySchedulePreview | null } | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [confirmUsual, setConfirmUsual] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const key = `${start}|${minutes}|${count}`;

  // What the change would do, read again as the numbers change. Saving waits
  // for the read that matches the numbers on screen.
  useEffect(() => {
    if (!open || !/^\d{2}:\d{2}$/.test(start)) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const input = { day: tools.day, start, minutes, count };
      const [day, all] = await Promise.all([
        previewDaySchedule({ ...input, scope: "day" }).catch(() => null),
        tools.template.usualDay ? previewDaySchedule({ ...input, scope: "all" }).catch(() => null) : Promise.resolve(null),
      ]);
      if (cancelled) return;
      setPlans({
        key: `${start}|${minutes}|${count}`,
        day: day && day.ok && "times" in day ? day : null,
        refused: day && !day.ok && "message" in day ? day.message : null,
        all: all && all.ok && "times" in all ? all : null,
      });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, start, minutes, count, tools.day, tools.template.usualDay]);

  const checking = plans?.key !== key;
  const dayRead = checking ? null : plans?.day ?? null;
  const allRead = checking ? null : plans?.all ?? null;
  const readFailed = !checking && dayRead === null;
  const times = previewTimes(tools.day, start, minutes, count);
  const pastMidnight = times.length === 0;
  const values = { start, minutes, count };
  const changesDay = !sameTemplate(values, tools.template);
  const changesAll = tools.template.usualDay && (tools.template.own || !sameTemplate(values, tools.template.usual));
  const bookings = slots
    .filter((slot) => slot.state === "booked")
    .map((slot) => ({ startsAt: slot.startsAt, endsAt: slot.endsAt, label: [slot.neighbourhood, slot.setterName].filter(Boolean).join(" · ") || null }));
  const rows = pastMidnight ? [] : dayPlan(times, minutes, bookings, tools.blocks);
  // One line by the buttons, so what saving does is always in view.
  const kept = rows.filter((row) => row.kind === "booked").length;
  const leftOff = rows.filter((row) => row.kind === "left-off").map((row) => formatTime(row.startsAt));
  const holdsLetGo = dayRead?.holds.length ?? 0;
  const summary =
    !changesDay || pastMidnight
      ? null
      : [
          kept > 0 ? `${kept} ${kept === 1 ? "booking stays" : "bookings stay"} where ${kept === 1 ? "it is" : "they are"}.` : null,
          leftOff.length > 0 ? `${leftOff.join(", ")} won't be offered.` : null,
          holdsLetGo > 0 ? `${holdsLetGo === 1 ? "A setter's hold lets go" : `${holdsLetGo} setters' holds let go`}.` : null,
        ]
          .filter(Boolean)
          .join(" ") || null;
  // Going back to the usual times, shown before it happens.
  const usual = tools.template.usual;
  const usualTimes = previewTimes(tools.day, usual.start, usual.minutes, usual.count);
  const usualRows = usualTimes.length > 0 ? dayPlan(usualTimes, usual.minutes, bookings, tools.blocks) : [];

  function save(scope: DayScope) {
    setMessage(null);
    startTransition(async () => {
      const result = await setDaySchedule({ day: tools.day, start, minutes, count, scope });
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <DialogPanel
      open={open}
      onClose={onClose}
      title={
        confirmAll
          ? "Change the times for all days?"
          : confirmUsual
            ? `Use the usual times for ${formatLongDay(tools.day)}?`
            : `Times, ${formatLongDay(tools.day)}`
      }
      testId="day-times"
      actions={
        confirmUsual ? (
          <>
            <Button type="button" variant="outline" onClick={() => setConfirmUsual(false)}>
              Back
            </Button>
            <Button type="button" onClick={() => save("usual")} disabled={pending}>
              {pending ? "Saving" : "Use the usual times"}
            </Button>
          </>
        ) : confirmAll ? (
          <>
            <Button type="button" variant="outline" onClick={() => setConfirmAll(false)}>
              Back
            </Button>
            <Button type="button" onClick={() => save("all")} disabled={pending || checking || allRead === null}>
              {pending ? "Saving" : "Change all days"}
            </Button>
          </>
        ) : (
          <>
            {summary ? (
              <p className="w-full text-sm font-semibold text-pretty" data-testid="day-times-summary">
                {summary}
              </p>
            ) : null}
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            {tools.template.usualDay ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending || checking || readFailed || pastMidnight || !changesAll}
                onClick={() => setConfirmAll(true)}
              >
                All days
              </Button>
            ) : null}
            <Button type="button" size="sm" onClick={() => save("day")} disabled={pending || checking || readFailed || pastMidnight || !changesDay}>
              {pending ? "Saving" : "Just this day"}
            </Button>
          </>
        )
      }
    >
      {confirmUsual ? (
        <div className="flex flex-col gap-3 text-sm" data-testid="day-times-usual">
          <p className="text-base text-pretty">
            This evening goes back to the usual times from Settings: {usual.count} meetings of {usual.minutes} minutes
            {usualTimes[0] ? ` from ${formatTime(usualTimes[0])}` : ""}. Bookings stay where they are, and a time someone is holding lets go if it is no
            longer one of the times.
          </p>
          <EveningPreview rows={usualRows} pastMidnight={usualTimes.length === 0} checking={false} />
        </div>
      ) : confirmAll && allRead ? (
        <div className="flex flex-col gap-3 text-sm" data-testid="day-times-all">
          <p className="text-base text-pretty">
            Every meeting evening without its own times gets {count} meetings of {minutes} minutes from {formatTime(times[0] ?? "")}, and the usual times in
            Settings change to match.
          </p>
          <Warnings plan={allRead} showDay />
          {allRead.ownDaysKept.length > 0 ? (
            <p className="text-pretty">These evenings keep their own times: {allRead.ownDaysKept.map((day) => formatDay(day)).join(", ")}.</p>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground" data-testid="day-times-state">
            {tools.template.own
              ? "This evening has its own times."
              : tools.template.usualDay
                ? "This evening uses the usual times from Settings."
                : "This isn't a usual meeting day, so times set here are for this evening only."}
          </p>
          <div className="flex flex-col gap-2">
            <Label htmlFor="day-start">First meeting starts</Label>
            <Input id="day-start" type="time" step={300} value={start} onChange={(event) => setStart(event.target.value)} className="w-40" />
          </div>
          <Stepper label="Meeting length" unit="minutes" value={minutes} min={15} max={180} step={5} onChange={setMinutes} />
          <Stepper label="Number of meetings" value={count} min={1} max={12} step={1} onChange={setCount} />
          <EveningPreview rows={rows} pastMidnight={pastMidnight} checking={checking} />
          {dayRead ? <Warnings plan={dayRead} /> : null}
          {readFailed && !pastMidnight ? (
            <p role="alert" className="text-sm font-semibold text-destructive">
              {plans?.refused ?? "Couldn't check the bookings. Check your signal; saving waits until it can."}
            </p>
          ) : null}
          {tools.template.own ? (
            <Button type="button" variant="link" size="sm" className="self-start px-0" onClick={() => setConfirmUsual(true)} disabled={pending}>
              Use the usual times for this evening
            </Button>
          ) : null}
          {tools.template.usualDay ? (
            <p className="text-sm text-pretty text-muted-foreground">
              Just this day changes {formatDay(tools.day)} only. All days changes the usual times in Settings, for every meeting evening without its own
              times.
            </p>
          ) : null}
          {message ? (
            <p role="alert" className="text-sm font-semibold text-destructive">
              {message}
            </p>
          ) : null}
        </div>
      )}
    </DialogPanel>
  );
}

// The evening as setters will see it after saving, in time order.
function EveningPreview({ rows, pastMidnight, checking }: { rows: PlanRow[]; pastMidnight: boolean; checking: boolean }) {
  return (
    <section className="rounded-md border px-3 py-2" data-testid="day-times-preview" aria-labelledby="day-times-preview-heading">
      <h3 id="day-times-preview-heading" className="text-sm font-semibold">
        {pastMidnight ? "The last meeting would start after midnight." : "What setters will see"}
      </h3>
      {!pastMidnight ? (
        <>
          <ul className="mt-1 flex flex-col">
            {rows.map((row) => (
              <li key={`${row.kind}-${row.startsAt}`} className="flex items-baseline gap-3 py-0.5 text-sm" data-kind={row.kind}>
                <span className={cn("w-20 shrink-0 font-semibold tabular-nums", row.kind === "left-off" && "text-muted-foreground line-through")}>
                  {formatTime(row.startsAt)}
                </span>
                <span className={cn("min-w-0 text-pretty", row.kind !== "open" && "text-muted-foreground")}>
                  {row.kind === "open"
                    ? "Open"
                    : row.kind === "blocked"
                      ? "Blocked"
                      : row.kind === "left-off"
                        ? `Not offered: overlaps the ${formatTime(row.because)} booking`
                        : `Booked${row.label ? `, ${row.label}` : ""}${row.aligned ? "" : ". Stays at its own time"}`}
                </span>
              </li>
            ))}
          </ul>
          {checking ? <p className="mt-1 text-xs text-muted-foreground">Checking bookings</p> : null}
        </>
      ) : null}
    </section>
  );
}

// Warns before saving: a booking that won't line up stays where it is, and a
// time someone is holding lets go.
function Warnings({ plan, showDay = false }: { plan: DaySchedulePreview; showDay?: boolean }) {
  if (plan.misaligned.length === 0 && plan.holds.length === 0) return null;
  const at = (iso: string) => (showDay ? `${formatDay(calgaryDateOf(iso))} at ${formatTime(iso)}` : formatTime(iso));
  return (
    <div role="status" className="flex flex-col gap-2 rounded-md border border-foreground/60 px-3 py-2 text-sm" data-testid="day-times-warning">
      {plan.misaligned.map((meeting) => (
        <p key={meeting.meetingId} className="text-pretty">
          <span className="font-semibold">
            The {at(meeting.startsAt)} meeting with {meeting.name}
            {meeting.neighbourhood ? ` in ${meeting.neighbourhood}` : ""}
          </span>{" "}
          won&apos;t line up with the new times. It stays at {formatTime(meeting.startsAt)}, and new times that overlap it can&apos;t be booked.
        </p>
      ))}
      {plan.holds.map((hold) => (
        <p key={hold.startsAt} className="text-pretty">
          <span className="font-semibold">{hold.holderName}</span> is holding {at(hold.startsAt)}. That hold lets go when you save.
        </p>
      ))}
    </div>
  );
}

// The times a template gives on a Calgary date, for the live preview. The
// database works them out again on save. Empty when the last meeting would
// start after midnight.
function previewTimes(day: string, start: string, minutes: number, count: number): string[] {
  const match = /^(\d{2}):(\d{2})$/.exec(start);
  if (!match) return [];
  const first = Number(match[1]) * 60 + Number(match[2]);
  if (first + minutes * (count - 1) >= 24 * 60) return [];
  return Array.from({ length: count }, (_, k) => {
    const total = first + k * minutes;
    return calgaryInstant(day, `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`);
  });
}

// A number with Less and More buttons. Typing works as typing does: the box
// can be cleared and retyped, and the number is checked when it is left.
function Stepper({
  label,
  unit,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  unit?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  const id = label.toLowerCase().replace(/\s+/g, "-");
  const [text, setText] = useState(String(value));
  const [shown, setShown] = useState(value);
  if (value !== shown) {
    setShown(value);
    setText(String(value));
  }
  const settle = (raw: string) => {
    const typed = Number(raw);
    const next = raw === "" || !Number.isFinite(typed) ? value : Math.min(max, Math.max(min, Math.round(typed / step) * step || min));
    setText(String(next));
    if (next !== value) onChange(next);
  };
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="icon" aria-label={`Less: ${label}`} disabled={value - step < min} onClick={() => onChange(Math.max(min, value - step))}>
          <Minus className="size-5" />
        </Button>
        <Input
          id={id}
          inputMode="numeric"
          value={text}
          onChange={(event) => {
            const raw = event.target.value.replace(/\D/g, "").slice(0, 3);
            setText(raw);
            const typed = Number(raw);
            if (raw !== "" && typed >= min && typed <= max && typed % step === 0) onChange(typed);
          }}
          onBlur={(event) => settle(event.target.value)}
          className="w-20 text-center tabular-nums"
        />
        <Button type="button" variant="outline" size="icon" aria-label={`More: ${label}`} disabled={value + step > max} onClick={() => onChange(Math.min(max, value + step))}>
          <Plus className="size-5" />
        </Button>
        {unit ? <span className="text-sm text-muted-foreground">{unit}</span> : null}
      </div>
    </div>
  );
}

function ChoiceRow({
  name,
  value,
  checked,
  onPick,
  children,
}: {
  name: string;
  value: string;
  checked: boolean;
  onPick: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label
      className={cn(
        "flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 text-base font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
        checked ? "border-foreground bg-foreground text-background" : "border-input bg-background",
      )}
    >
      <input type="radio" name={name} value={value} checked={checked} onChange={() => onPick(value)} className="sr-only" />
      {checked ? <Check aria-hidden="true" className="size-4 shrink-0" /> : null}
      {children}
    </label>
  );
}
