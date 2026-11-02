"use client";

import { Minus, Pencil, Plus } from "lucide-react";
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
import { calgaryDateOf, calgaryInstant, formatDay, formatLongDay, formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";

export type OwnerEveningTools = {
  day: string;
  blocks: { id: string; startsAt: string; endsAt: string; reason: string | null }[];
  template: { start: string; minutes: number; count: number; own: boolean; usualDay: boolean };
};

// The Schedule tab (Keenan, 2026-11-01 and 2026-11-02): the times for the
// booking window, with holds, bookings and blocked times on the board
// itself. Tapping an open time holds it and opens the booking sheet. Keenan
// also gets two small buttons at the right of the header: Block time and a
// pencil for the evening's times. Setters never see them.
export function ScheduleBoard({
  board,
  today,
  windowDays,
  asSales,
  viewerId,
  initialDay,
  owner,
}: {
  board: BoardSlot[];
  today: string;
  windowDays: number;
  asSales: boolean;
  viewerId: string | null;
  initialDay: string;
  owner: OwnerEveningTools | null;
}) {
  const router = useRouter();
  const [blockOpen, setBlockOpen] = useState(false);
  const [dayOpen, setDayOpen] = useState(false);
  // Each opening starts fresh on the evening's current times.
  const [dayOpenings, setDayOpenings] = useState(0);
  const [unblock, setUnblock] = useState<OwnerEveningTools["blocks"][number] | null>(null);
  const refresh = useCallback(() => router.refresh(), [router]);
  const onDayChange = useCallback(
    (day: string) => {
      if (owner) router.replace(`/app/schedule?day=${day}`, { scroll: false });
    },
    [owner, router],
  );
  const onUnavailableTap = useCallback(
    (slot: BoardSlot) => {
      if (!owner) return;
      if (slot.state === "booked" && slot.meetingId) {
        document.getElementById(`meeting-${slot.meetingId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      const block = owner.blocks.find((item) => item.startsAt < slot.endsAt && item.endsAt > slot.startsAt);
      if (block) setUnblock(block);
    },
    [owner],
  );
  const daySlots = board.filter((slot) => slot.day === (owner?.day ?? initialDay));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Schedule</h1>
          <p className="mt-1 text-sm text-pretty text-muted-foreground">Tap an open time to hold it and book.</p>
        </div>
        {owner ? (
          <div className="flex shrink-0 items-center gap-2" data-testid="owner-schedule-tools">
            <Button type="button" variant="outline" size="sm" onClick={() => setBlockOpen(true)}>
              Block time
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Change this evening's times"
              onClick={() => {
                setDayOpenings((count) => count + 1);
                setDayOpen(true);
              }}
            >
              <Pencil className="size-5" />
            </Button>
          </div>
        ) : null}
      </div>

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

      {owner ? (
        <>
          <BlockTimeDialog open={blockOpen} onClose={() => setBlockOpen(false)} day={owner.day} slots={daySlots} />
          <DayTimesDialog key={`${owner.day}-${dayOpenings}`} open={dayOpen} onClose={() => setDayOpen(false)} tools={owner} />
          <UnblockDialog block={unblock} onClose={() => setUnblock(null)} />
        </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- Block time

function BlockTimeDialog({ open, onClose, day, slots }: { open: boolean; onClose: () => void; day: string; slots: BoardSlot[] }) {
  const router = useRouter();
  const [choice, setChoice] = useState<string>("evening");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const blockable = slots.filter((slot) => slot.state === "open" || slot.state === "closed");
  const evening = slots.length > 0 ? { startsAt: slots[0].startsAt, endsAt: slots[slots.length - 1].endsAt } : null;

  function block() {
    const target = choice === "evening" ? evening : slots.find((slot) => slot.startsAt === choice);
    if (!target) return;
    setMessage(null);
    startTransition(async () => {
      const result = await addTimeBlock(target.startsAt, target.endsAt, reason);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      setReason("");
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
          <Button type="button" onClick={block} disabled={pending || !evening}>
            {pending ? "Blocking" : "Block"}
          </Button>
        </>
      }
    >
      {!evening ? (
        <p className="text-sm text-muted-foreground">This evening has no meeting times to block.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-semibold">What to block</legend>
            <ChoiceRow name="block-choice" value="evening" checked={choice === "evening"} onPick={setChoice}>
              The whole evening
            </ChoiceRow>
            <div className="grid grid-cols-2 gap-2">
              {blockable.map((slot) => (
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
          <p className="text-sm text-pretty text-muted-foreground">A time with a booking or someone holding it can&apos;t be blocked.</p>
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

function DayTimesDialog({ open, onClose, tools }: { open: boolean; onClose: () => void; tools: OwnerEveningTools }) {
  const router = useRouter();
  const [start, setStart] = useState(tools.template.start);
  const [minutes, setMinutes] = useState(tools.template.minutes);
  const [count, setCount] = useState(tools.template.count);
  const [dayPlan, setDayPlan] = useState<DaySchedulePreview | null>(null);
  const [allPlan, setAllPlan] = useState<DaySchedulePreview | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // What the change would do, read again as the numbers change.
  useEffect(() => {
    if (!open || !/^\d{2}:\d{2}$/.test(start)) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const input = { day: tools.day, start, minutes, count };
      const [day, all] = await Promise.all([
        previewDaySchedule({ ...input, scope: "day" }),
        tools.template.usualDay ? previewDaySchedule({ ...input, scope: "all" }) : Promise.resolve(null),
      ]);
      if (cancelled) return;
      setDayPlan(day && day.ok && "times" in day ? day : null);
      setAllPlan(all && all.ok && "times" in all ? all : null);
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, start, minutes, count, tools.day, tools.template.usualDay]);

  const times = previewTimes(tools.day, start, minutes, count);
  const lastStart = times.length > 0 ? times[times.length - 1] : null;
  const pastMidnight = lastStart === null;

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

  const allNeedsConfirm = Boolean(allPlan && (allPlan.misaligned.length > 0 || allPlan.holds.length > 0 || allPlan.ownDaysKept.length > 0));

  return (
    <DialogPanel
      open={open}
      onClose={onClose}
      title={confirmAll ? "Change the times for all days?" : `Times, ${formatLongDay(tools.day)}`}
      testId="day-times"
      actions={
        confirmAll ? (
          <>
            <Button type="button" variant="outline" onClick={() => setConfirmAll(false)}>
              Back
            </Button>
            <Button type="button" onClick={() => save("all")} disabled={pending}>
              {pending ? "Saving" : "Change all days"}
            </Button>
          </>
        ) : (
          <>
            {tools.template.usualDay ? (
              <Button
                type="button"
                variant="outline"
                disabled={pending || pastMidnight}
                onClick={() => (allNeedsConfirm ? setConfirmAll(true) : save("all"))}
              >
                All days
              </Button>
            ) : null}
            <Button type="button" onClick={() => save("day")} disabled={pending || pastMidnight}>
              {pending ? "Saving" : "Just this day"}
            </Button>
          </>
        )
      }
    >
      {confirmAll && allPlan ? (
        <div className="flex flex-col gap-3 text-sm" data-testid="day-times-all">
          <p className="text-base text-pretty">
            Every evening without its own times gets {count} meetings of {minutes} minutes from {formatTime(times[0] ?? "")}. Settings change to match.
          </p>
          <Warnings plan={allPlan} showDay />
          {allPlan.ownDaysKept.length > 0 ? (
            <p className="text-pretty">
              These evenings keep their own times: {allPlan.ownDaysKept.map((day) => formatDay(day)).join(", ")}.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="day-start">First meeting starts</Label>
            <Input id="day-start" type="time" step={300} value={start} onChange={(event) => setStart(event.target.value)} className="w-40" />
          </div>
          <Stepper label="Meeting length" unit="minutes" value={minutes} min={15} max={180} step={5} onChange={setMinutes} />
          <Stepper label="Number of meetings" value={count} min={1} max={12} step={1} onChange={setCount} />
          <div className="rounded-md border px-3 py-2" data-testid="day-times-preview">
            <p className="text-sm font-semibold">{pastMidnight ? "The last meeting would start after midnight." : "Times"}</p>
            {!pastMidnight ? <p className="text-base tabular-nums">{times.map((time) => formatTime(time)).join(", ")}</p> : null}
          </div>
          {dayPlan ? <Warnings plan={dayPlan} /> : null}
          {tools.template.own ? (
            <Button type="button" variant="link" size="sm" className="self-start px-0" onClick={() => save("usual")} disabled={pending}>
              Use the usual times for this evening
            </Button>
          ) : null}
          {!tools.template.usualDay ? (
            <p className="text-sm text-pretty text-muted-foreground">This isn&apos;t a usual meeting day, so these times are for this evening only.</p>
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

// Warns before saving: a booking that won't line up stays where it is, and
// a time someone is holding lets go.
function Warnings({ plan, showDay = false }: { plan: DaySchedulePreview; showDay?: boolean }) {
  if (plan.misaligned.length === 0 && plan.holds.length === 0) return null;
  const at = (iso: string) => (showDay ? `${formatDay(calgaryDateOf(iso))} at ${formatTime(iso)}` : formatTime(iso));
  return (
    <div role="status" className="flex flex-col gap-2 rounded-md border border-primary px-3 py-2 text-sm" data-testid="day-times-warning">
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
          value={String(value)}
          onChange={(event) => {
            const next = Number(event.target.value.replace(/\D/g, ""));
            if (Number.isFinite(next) && next > 0) onChange(Math.min(max, next));
          }}
          onBlur={() => onChange(Math.min(max, Math.max(min, Math.round(value / step) * step || min)))}
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
        "flex min-h-11 cursor-pointer items-center rounded-md border px-3 text-base font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
        checked ? "border-foreground bg-foreground text-background" : "border-input bg-background",
      )}
    >
      <input type="radio" name={name} value={value} checked={checked} onChange={() => onPick(value)} className="sr-only" />
      {children}
    </label>
  );
}
