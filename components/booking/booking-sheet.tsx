"use client";

import { CircleHelp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { holdTime, moveBooking, releaseMyHold, renewMyHold } from "@/app/(app)/app/schedule/actions";
import {
  bookFromSheet,
  saveSheetLead,
  sheetBookableLeads,
  sheetContext,
  sheetDistanceWarnings,
  sheetLead,
  type BookableLead,
  type SheetNotes,
} from "@/app/(app)/app/schedule/sheet-actions";
import {
  AddressScreen,
  BookScreen,
  EveryoneScreen,
  ExistingScreen,
  FindOutScreen,
  PhotosScreen,
  SoffitScreen,
  WhoScreen,
} from "@/components/booking/sheet-screens";
import { TimePicker } from "@/components/schedule/time-picker";
import { Button } from "@/components/ui/button";
import { DialogPanel } from "@/components/ui/dialog-panel";
import {
  canSaveLead,
  draftProblems,
  draftToLeadInput,
  emptyDraft,
  firstScreenToVisit,
  nextScreen,
  previousScreen,
  savedFingerprint,
  SCREEN_TITLES,
  STEPS,
  stepOf,
  type SheetDraft,
  type SheetScreen,
} from "@/lib/booking/sheet";
import { bookingSheet, useSheetRequest, type SheetRequest } from "@/lib/booking/sheet-store";
import { getPublicEnv } from "@/lib/env";
import type { PhotoSlot } from "@/lib/leads/door";
import type { PickedAddress } from "@/lib/places";
import { toBoardSlots, type BoardSlot } from "@/lib/schedule/board";
import { createClient } from "@/lib/supabase/client";
import { calgaryDateOf, calgaryToday, formatDay, formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";

const CHECK_IN_MS = 20_000;
const DRAFT_KEY = (userId: string) => `vesper.booking-sheet.${userId}`;
const DRAFT_MAX_AGE_MS = 3 * 3600_000;

type View = SheetScreen | "loading" | "times" | "existing" | "done" | "move-confirm" | "moved" | "not-bookable";

// What the phone keeps while the sheet is open, so a reload (an iPhone
// sometimes reloads the app after the camera) brings it back as it was.
type Stored = {
  request: SheetRequest;
  view: View;
  draft: SheetDraft;
  heldAt: string | null;
  skipDone: boolean;
  savedPrint: string | null;
  name: string;
  savedAt: number;
};

function readStored(userId: string): Stored | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY(userId));
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}
function writeStored(userId: string, value: Stored | null) {
  try {
    if (value) window.localStorage.setItem(DRAFT_KEY(userId), JSON.stringify(value));
    else window.localStorage.removeItem(DRAFT_KEY(userId));
  } catch {
    // Private mode or storage off: the sheet still works, it just can't
    // come back after a reload.
  }
}

// "7:30 p.m. tonight", or "Sat, Nov 14 at 7:30 p.m."
export function timePhrase(startsAt: string): string {
  return calgaryDateOf(startsAt) === calgaryToday()
    ? `${formatTime(startsAt)} tonight`
    : `${formatDay(calgaryDateOf(startsAt))} at ${formatTime(startsAt)}`;
}

// The booking sheet's home in the app layout. It opens when something asks
// it to (bookingSheet.open), and after a reload when the phone still holds
// the time it was booking. Off while the owner views the app as someone:
// the sheet starts with a hold, which is a write.
export function BookingSheetHost({ enabled, userId }: { enabled: boolean; userId: string }) {
  const request = useSheetRequest();
  const [restored, setRestored] = useState<Stored | null>(null);
  const checked = useRef(false);

  useEffect(() => {
    if (!enabled || checked.current) return;
    checked.current = true;
    const stored = readStored(userId);
    if (!stored) return;
    if (Date.now() - stored.savedAt > DRAFT_MAX_AGE_MS || !stored.heldAt) {
      writeStored(userId, null);
      return;
    }
    renewMyHold()
      .then((result) => {
        if (result.status === "held" && result.startsAt === stored.heldAt) {
          setRestored(stored);
          bookingSheet.open(stored.request);
        } else {
          writeStored(userId, null);
        }
      })
      .catch(() => {});
  }, [enabled, userId]);

  if (!enabled || !request) return null;
  return (
    <BookingSheet
      key={JSON.stringify(request)}
      request={request}
      userId={userId}
      restored={restored}
      onClosed={() => setRestored(null)}
    />
  );
}

function BookingSheet({
  request,
  userId,
  restored,
  onClosed,
}: {
  request: SheetRequest;
  userId: string;
  restored: Stored | null;
  onClosed: () => void;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const addressFormRef = useRef<HTMLFormElement>(null);
  const pickedRef = useRef<PickedAddress | null>(null);
  const isMove = request.kind === "move";

  const [notes, setNotes] = useState<SheetNotes | null>(null);
  const [board, setBoard] = useState<{ slots: BoardSlot[]; today: string; windowDays: number; asSales: boolean } | null>(null);
  const [view, setView] = useState<View>(
    restored?.view ?? (request.kind === "book" ? "who" : request.kind === "move" ? "times" : "loading"),
  );
  const [returnTo, setReturnTo] = useState<SheetScreen | null>(null);
  const [draft, setDraft] = useState<SheetDraft>(restored?.draft ?? emptyDraft());
  const [skipDone, setSkipDone] = useState(restored?.skipDone ?? false);
  const [savedPrint, setSavedPrint] = useState<string | null>(restored?.savedPrint ?? null);
  const [name, setName] = useState(restored?.name ?? (request.kind === "move" ? request.leadName : ""));
  const [heldAt, setHeldAt] = useState<string | null>(restored?.heldAt ?? (request.kind === "book" ? request.startsAt : null));
  const [held, setHeld] = useState(true);
  const [lostWhy, setLostWhy] = useState<{ text: string; canHoldAgain: boolean } | null>(null);
  const [photos, setPhotos] = useState<Partial<Record<PhotoSlot, string>>>({});
  const [photosBusy, setPhotosBusy] = useState(false);
  const [skipOpen, setSkipOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; fix: SheetScreen | null } | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [letGoOpen, setLetGoOpen] = useState(false);
  const [existing, setExisting] = useState<BookableLead[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [notBookable, setNotBookable] = useState<string | null>(null);
  const [done, setDone] = useState<{ startsAt: string; leadId: string } | null>(null);
  const mapsKey = getPublicEnv().NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? null;

  // ------------------------------------------------------------ opening
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  useEffect(() => {
    let cancelled = false;
    sheetContext().then((context) => {
      if (cancelled || !context.ok) return;
      setNotes(context.notes);
      setBoard({ slots: context.board, today: context.today, windowDays: context.windowDays, asSales: context.asSales });
    });
    if (request.kind === "lead" && !restored) {
      sheetLead(request.leadId).then((lead) => {
        if (cancelled) return;
        if (!lead.ok) {
          setNotBookable(lead.error);
          setView("not-bookable");
          return;
        }
        setDraft(lead.draft);
        setPhotos(lead.photos);
        setName(lead.name);
        setSkipDone(true);
        setSavedPrint(savedFingerprint(lead.draft));
        if (!lead.bookable) {
          setNotBookable(lead.notBookableReason);
          setView("not-bookable");
        } else {
          setView("times");
        }
      });
    }
    if (restored?.draft.leadId) {
      sheetLead(restored.draft.leadId).then((lead) => {
        if (!cancelled && lead.ok) setPhotos(lead.photos);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [request, restored]);

  // Each new screen announces itself.
  useEffect(() => {
    headingRef.current?.focus();
  }, [view]);

  // ------------------------------------------------------------ the hold
  const explainLost = useCallback(async (startsAt: string) => {
    let text = `Your hold on ${formatTime(startsAt)} let go.`;
    let canHoldAgain = false;
    try {
      const { data } = await createClient().rpc("schedule_board", { p_as_sales: true });
      const slot = toBoardSlots(data ?? []).find((item) => item.startsAt === startsAt);
      if (!slot) text += " That time is no longer on the schedule. Pick another time.";
      else if (slot.state === "open") {
        text += " It's still free.";
        canHoldAgain = true;
      } else if (slot.state === "held") text += ` ${slot.holderName ?? "Someone"} is booking it now. Pick another time.`;
      else if (slot.state === "booked") text += " It has just been booked. Pick another time.";
      else text += " It can't be booked now. Pick another time.";
    } catch {
      text += " Check your signal.";
    }
    setLostWhy({ text, canHoldAgain });
  }, []);

  useEffect(() => {
    if (!heldAt || !held || done || view === "moved") return;
    let stopped = false;
    async function checkIn() {
      if (document.visibilityState !== "visible" || !heldAt) return;
      try {
        const result = await renewMyHold();
        if (stopped) return;
        if (result.status !== "held" || result.startsAt !== heldAt) {
          setHeld(false);
          void explainLost(heldAt);
        }
      } catch {
        // No signal: the hold lasts the grace period; the next check-in tries again.
      }
    }
    const timer = window.setInterval(() => void checkIn(), CHECK_IN_MS);
    const wake = () => void checkIn();
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
    };
  }, [heldAt, held, done, view, explainLost]);

  async function holdAgain() {
    if (!heldAt) return;
    setBusy(true);
    try {
      const result = await holdTime(heldAt, { leadId: draft.leadId, meetingId: isMove ? request.meetingId : null });
      if (result.ok) {
        setHeld(true);
        setLostWhy(null);
      } else {
        setLostWhy({ text: `${result.message} Pick another time.`, canHoldAgain: false });
      }
    } finally {
      setBusy(false);
    }
  }

  // ------------------------------------------------------------ keeping it after a reload
  useEffect(() => {
    if (done || view === "moved" || view === "loading") return;
    writeStored(userId, { request, view, draft, heldAt, skipDone, savedPrint, name, savedAt: Date.now() });
  }, [userId, request, view, draft, heldAt, skipDone, savedPrint, name, done]);

  // ------------------------------------------------------------ the Book screen's distance warning
  useEffect(() => {
    if (view !== "book" || !draft.leadId || !heldAt) return;
    let cancelled = false;
    sheetDistanceWarnings(draft.leadId, heldAt).then((list) => {
      if (!cancelled) setWarnings(list);
    });
    return () => {
      cancelled = true;
    };
  }, [view, draft.leadId, heldAt]);

  // ------------------------------------------------------------ moving between screens
  const change = useCallback((patch: Partial<SheetDraft>) => {
    setError(null);
    setDraft((current) => ({ ...current, ...patch }));
  }, []);

  function go(next: View) {
    setError(null);
    setView(next);
  }

  function readAddressForm(current: SheetDraft): SheetDraft {
    const form = addressFormRef.current;
    if (!form) return current;
    const data = new FormData(form);
    const text = (key: string) => String(data.get(key) ?? "");
    const number = (key: string) => (text(key) === "" ? null : Number(text(key)));
    const source = text("position_source");
    return {
      ...current,
      address_line: text("address_line"),
      city: text("city") || "Calgary",
      postal_code: text("postal_code"),
      neighbourhood: pickedRef.current?.neighbourhood ?? current.neighbourhood,
      lat: number("lat"),
      lng: number("lng"),
      place_id: text("place_id") || null,
      position_source: source === "picked" || source === "device" ? source : null,
      position_accuracy_m: number("position_accuracy_m"),
    };
  }

  async function save(current: SheetDraft): Promise<SheetDraft | null> {
    const result = await saveSheetLead(current.leadId, draftToLeadInput(current));
    if (!result.ok) {
      const field = result.errors ? Object.keys(result.errors)[0] : null;
      const fix: SheetScreen | null =
        field === "first_name" || field === "last_name" || field === "phone"
          ? "who"
          : field === "address_line"
            ? "address"
            : null;
      setError({ text: result.error, fix: fix === view ? null : fix });
      return null;
    }
    const saved = { ...current, leadId: result.leadId };
    setDraft(saved);
    setSavedPrint(savedFingerprint(saved));
    return saved;
  }

  async function next() {
    if (!isScreen(view)) return;
    setBusy(true);
    setError(null);
    try {
      let current = draft;
      if (view === "address") {
        current = readAddressForm(draft);
        setDraft(current);
        if (!current.leadId && !canSaveLead(current)) {
          setError(
            current.first_name.trim() === ""
              ? { text: "Add their first name first, so they can be saved.", fix: "who" }
              : { text: "Add the address, or use where you're standing.", fix: null },
          );
          return;
        }
      }
      if (view === "book") {
        await book(current);
        return;
      }
      const needsSave =
        (view === "address" && !current.leadId) || (current.leadId !== null && savedFingerprint(current) !== savedPrint);
      if (needsSave) {
        const saved = await save(current);
        if (!saved) return;
        current = saved;
      }
      go(nextScreen(view, current, skipDone));
    } finally {
      setBusy(false);
    }
  }

  async function book(current: SheetDraft) {
    if (!heldAt || !current.leadId) return;
    if (savedFingerprint(current) !== savedPrint) {
      const saved = await save(current);
      if (!saved) return;
      current = saved;
    }
    const result = await bookFromSheet({
      leadId: current.leadId as string,
      startsAt: heldAt,
      everyone: current.everyone,
      skip: current.skip,
      skipNote: current.skip_note,
    });
    if (!result.ok) {
      setError({ text: result.message, fix: null });
      if (result.code === "slot_held" || result.code === "slot_taken" || result.code === "slot_closed" || result.code === "not_a_slot") {
        setHeld(false);
        void explainLost(heldAt);
      }
      return;
    }
    writeStored(userId, null);
    setDone({ startsAt: heldAt, leadId: current.leadId as string });
    go("done");
    router.refresh();
  }

  function back() {
    if (view === "times" || view === "existing") {
      go(returnTo ?? "who");
      return;
    }
    if (view === "move-confirm") {
      go("times");
      return;
    }
    if (isScreen(view)) {
      const previous = previousScreen(view);
      if (previous) go(previous);
    }
  }

  function pickAnother() {
    if (isScreen(view)) setReturnTo(view);
    go("times");
  }

  async function openExisting() {
    setReturnTo("who");
    go("existing");
    setExisting(null);
    const result = await sheetBookableLeads();
    setExisting(result.ok ? result.leads : []);
  }

  async function pickExisting(leadId: string) {
    setBusy(true);
    try {
      const lead = await sheetLead(leadId);
      if (!lead.ok) {
        setError({ text: lead.error, fix: null });
        return;
      }
      if (!lead.bookable) {
        setError({ text: lead.notBookableReason ?? "This lead can't be booked.", fix: null });
        return;
      }
      setDraft(lead.draft);
      setPhotos(lead.photos);
      setName(lead.name);
      setSkipDone(true);
      setSavedPrint(savedFingerprint(lead.draft));
      go(firstScreenToVisit(lead.draft));
    } finally {
      setBusy(false);
    }
  }

  function onTimeHeld(startsAt: string) {
    setHeldAt(startsAt);
    setHeld(true);
    setLostWhy(null);
    if (isMove) {
      go("move-confirm");
      return;
    }
    go(returnTo ?? (skipDone ? firstScreenToVisit(draft) : "who"));
  }

  async function confirmMove() {
    if (request.kind !== "move" || !heldAt) return;
    setBusy(true);
    try {
      const result = await moveBooking(request.meetingId, heldAt);
      if (!result.ok) {
        setError({ text: result.message, fix: null });
        return;
      }
      writeStored(userId, null);
      go("moved");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  function close() {
    writeStored(userId, null);
    dialogRef.current?.close();
    bookingSheet.close();
    onClosed();
    router.refresh();
  }

  async function letGo() {
    setLetGoOpen(false);
    if (heldAt && held) {
      try {
        await releaseMyHold();
      } catch {
        // The hold lets go by itself after the grace period.
      }
    }
    close();
  }

  // Escape, or a phone's back gesture, asks before letting the time go.
  function onCancel(event: React.SyntheticEvent) {
    event.preventDefault();
    if (view === "done" || view === "moved" || view === "not-bookable" || !heldAt) close();
    else setLetGoOpen(true);
  }

  // ------------------------------------------------------------ drawing it
  const when = heldAt ? timePhrase(heldAt) : null;
  const problems = draftProblems(draft);
  const step = isScreen(view) ? stepOf(view) : null;
  const note = step && notes ? notes[step] : null;
  const personName = [draft.first_name, draft.last_name].filter((part) => part.trim()).join(" ") || name || "this person";
  const title =
    view === "times"
      ? isMove
        ? `Move ${name}'s ${request.kind === "move" ? formatTime(request.from) : ""} to`
        : heldAt
          ? "Pick another time"
          : `Pick a time for ${name || "this lead"}`
      : view === "existing"
        ? "Which lead?"
        : view === "done"
          ? `Booked for ${done ? timePhrase(done.startsAt) : ""}.`
          : view === "move-confirm"
            ? `Move ${name} to ${when ?? ""}?`
            : view === "moved"
              ? `Moved to ${when ?? ""}.`
              : view === "not-bookable"
                ? "This lead can't be booked"
                : view === "loading"
                  ? "Opening"
                  : view === "book"
                    ? `Book ${when ?? ""}`
                    : SCREEN_TITLES[view];

  return (
    <dialog
      ref={dialogRef}
      onCancel={onCancel}
      aria-labelledby="sheet-title"
      data-testid="booking-sheet"
      data-view={view}
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none border-0 bg-background p-0 text-foreground backdrop:bg-background"
    >
      <div className="flex h-dvh flex-col">
        {/* ------------------------------------------------ top: the held time, "?", the steps */}
        <header className="border-b pt-[env(safe-area-inset-top)]">
          <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-4 pt-2">
            <HeldChip when={when} held={held} isMove={isMove} />
            {note ? (
              <Button type="button" variant="ghost" size="icon" aria-label="What to talk about" onClick={() => setNoteOpen(true)}>
                <CircleHelp className="size-6" />
              </Button>
            ) : (
              <span className="size-11" aria-hidden="true" />
            )}
          </div>
          {!isMove ? <Progress view={view} /> : <div className="h-3" />}
        </header>

        {/* ------------------------------------------------ the screen */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-5">
            <h2 id="sheet-title" ref={headingRef} tabIndex={-1} className="text-2xl font-bold text-balance outline-none" data-testid="sheet-heading">
              {title}
            </h2>
            {lostWhy && !held && !done ? (
              <div role="alert" className="flex flex-col gap-3 rounded-md border border-destructive px-4 py-3" data-testid="sheet-hold-lost">
                <p className="text-sm font-semibold text-pretty">{lostWhy.text}</p>
                <div className="flex flex-wrap gap-2">
                  {lostWhy.canHoldAgain ? (
                    <Button type="button" size="sm" disabled={busy} onClick={() => void holdAgain()}>
                      Hold it again
                    </Button>
                  ) : null}
                  <Button type="button" variant="outline" size="sm" onClick={pickAnother}>
                    Pick another time
                  </Button>
                </div>
              </div>
            ) : null}

            {view === "loading" ? <p className="text-sm text-muted-foreground">One moment.</p> : null}
            {view === "not-bookable" ? <p className="text-base text-pretty">{notBookable}</p> : null}
            {view === "times" && board ? (
              <TimePicker
                initial={board.slots}
                today={board.today}
                windowDays={board.windowDays}
                asSales={board.asSales}
                viewerId={null}
                mode="sheet"
                leadId={draft.leadId}
                meetingId={isMove ? request.meetingId : null}
                onHeld={onTimeHeld}
              />
            ) : null}
            {view === "existing" ? <ExistingScreen leads={existing ?? []} loading={existing === null} onPick={(id) => void pickExisting(id)} /> : null}
            {view === "who" ? <WhoScreen draft={draft} onChange={change} onExisting={draft.leadId ? null : () => void openExisting()} /> : null}
            {view === "find1" ? <FindOutScreen fields={["owns_home", "wants_price", "christmas_lights_now"]} draft={draft} onChange={change} /> : null}
            {view === "find2" ? <FindOutScreen fields={["looked_into_before", "areas_wanted", "install_timing"]} draft={draft} onChange={change} /> : null}
            {view === "everyone" ? <EveryoneScreen draft={draft} onChange={change} /> : null}
            {view === "address" ? (
              <AddressScreen
                draft={draft}
                formRef={addressFormRef}
                apiKey={mapsKey}
                onPicked={(picked) => {
                  pickedRef.current = picked;
                  setError(null);
                }}
              />
            ) : null}
            {view === "soffit" ? <SoffitScreen draft={draft} onChange={change} /> : null}
            {view === "photos" ? (
              <PhotosScreen
                draft={draft}
                userId={userId}
                photos={photos}
                onChange={change}
                onBusyChange={setPhotosBusy}
                skipOpen={skipOpen}
                onSkipOpen={() => setSkipOpen(true)}
              />
            ) : null}
            {view === "book" ? (
              <BookScreen draft={draft} name={personName} when={when ?? ""} warnings={warnings} onFix={(screen) => go(screen)} />
            ) : null}
            {view === "done" && done ? (
              <p className="text-base text-pretty" data-testid="sheet-done">
                {personName}
                {draft.address_line ? `, ${draft.address_line}` : ""}. It shows on Schedule and on their lead.
              </p>
            ) : null}
            {view === "moved" ? <p className="text-base">{name} is moved. The old time is free again.</p> : null}

            {error ? (
              <div role="alert" className="flex flex-wrap items-center gap-3 text-sm font-semibold text-destructive" data-testid="sheet-error">
                <span className="text-pretty">{error.text}</span>
                {error.fix ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => go(error.fix as SheetScreen)}>
                    Go there
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {/* ------------------------------------------------ bottom: always there, Next at the bottom right */}
        <footer className="border-t bg-background pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-1 px-4 py-2">
            <BottomBar
              view={view}
              isMove={isMove}
              hasTime={Boolean(heldAt)}
              busy={busy || photosBusy}
              canBook={problems.length === 0 && held}
              missing={problems.length}
              when={when}
              onPickAnother={pickAnother}
              onLetGo={() => (heldAt ? setLetGoOpen(true) : close())}
              onBack={back}
              onNext={() => void next()}
              onMove={() => void confirmMove()}
              onClose={close}
              onOpenLead={() => {
                const leadId = done?.leadId ?? (request.kind === "move" ? request.leadId : draft.leadId);
                close();
                if (leadId) router.push(`/app/leads/${leadId}`);
              }}
            />
          </div>
        </footer>
      </div>

      <DialogPanel
        open={noteOpen}
        onClose={() => setNoteOpen(false)}
        title={step ? `What to talk about: ${STEPS.find((item) => item.key === step)?.label}` : "What to talk about"}
        testId="sheet-note"
        actions={
          <Button type="button" onClick={() => setNoteOpen(false)}>
            Close
          </Button>
        }
      >
        <p className="text-base whitespace-pre-line text-pretty">{note}</p>
      </DialogPanel>

      <DialogPanel
        open={letGoOpen}
        onClose={() => setLetGoOpen(false)}
        title={when ? `Let go of ${when}?` : "Close?"}
        testId="sheet-let-go"
        actions={
          <>
            <Button type="button" variant="outline" onClick={() => setLetGoOpen(false)}>
              Keep holding
            </Button>
            <Button type="button" variant="destructive" onClick={() => void letGo()}>
              Let go
            </Button>
          </>
        }
      >
        <p className="text-base text-pretty">
          {draft.leadId
            ? `${personName} stays saved as a lead. Anyone can then pick this time.`
            : "What you've entered isn't saved yet: they're saved once you add the address. Anyone can then pick this time."}
        </p>
      </DialogPanel>
    </dialog>
  );
}

function isScreen(view: View): view is SheetScreen {
  return STEPS.some((step) => step.screens.includes(view as SheetScreen));
}

function HeldChip({ when, held, isMove }: { when: string | null; held: boolean; isMove: boolean }) {
  if (!when) {
    return <p className="text-sm font-semibold text-muted-foreground">{isMove ? "Moving a booking" : "No time held yet"}</p>;
  }
  return (
    <p
      className={cn(
        "inline-flex min-h-9 items-center gap-2 rounded-md border px-3 text-sm font-semibold",
        held ? "border-primary text-foreground" : "border-destructive text-destructive",
      )}
      data-testid="sheet-held"
      data-held={held ? "yes" : "no"}
    >
      <span aria-hidden="true" className={cn("size-2 rounded-full", held ? "bg-primary" : "bg-destructive")} />
      {when}
      <span className="font-normal text-muted-foreground">{held ? "held for you" : "not held"}</span>
    </p>
  );
}

function Progress({ view }: { view: View }) {
  const current = isScreen(view) ? stepOf(view) : view === "done" ? "done" : null;
  const order = STEPS.map((step) => step.key);
  const currentIndex = current === "done" ? order.length : current ? order.indexOf(current) : -1;
  return (
    <ol className="mx-auto grid w-full max-w-2xl grid-cols-3 gap-2 px-4 pt-2 pb-3" aria-label="Steps">
      {STEPS.map((step, index) => {
        const state = index < currentIndex ? "done" : index === currentIndex ? "current" : "next";
        return (
          <li key={step.key} aria-current={state === "current" ? "step" : undefined} className="flex flex-col gap-1.5">
            <span className={cn("h-1 rounded-full", state === "next" ? "bg-muted" : "bg-foreground")} />
            <span className={cn("text-xs", state === "current" ? "font-bold text-foreground" : "text-muted-foreground")}>
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function BottomBar({
  view,
  isMove,
  hasTime,
  busy,
  canBook,
  missing,
  when,
  onPickAnother,
  onLetGo,
  onBack,
  onNext,
  onMove,
  onClose,
  onOpenLead,
}: {
  view: View;
  isMove: boolean;
  hasTime: boolean;
  busy: boolean;
  canBook: boolean;
  missing: number;
  when: string | null;
  onPickAnother: () => void;
  onLetGo: () => void;
  onBack: () => void;
  onNext: () => void;
  onMove: () => void;
  onClose: () => void;
  onOpenLead: () => void;
}) {
  if (view === "done" || view === "moved") {
    return (
      <div className="grid grid-cols-2 gap-3 py-1">
        <Button type="button" variant="outline" size="lg" onClick={onOpenLead}>
          Open the lead
        </Button>
        <Button type="button" size="lg" onClick={onClose}>
          Done
        </Button>
      </div>
    );
  }
  if (view === "loading" || view === "not-bookable" || ((view === "times" || view === "existing") && !hasTime)) {
    return (
      <div className="flex justify-end py-1">
        <Button type="button" variant="outline" size="lg" onClick={onClose}>
          Close
        </Button>
      </div>
    );
  }
  const quiet = (
    <div className="flex items-center justify-between">
      <Button type="button" variant="ghost" size="sm" onClick={onPickAnother} disabled={busy || view === "times"}>
        Pick another time
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onLetGo} disabled={busy}>
        Let go
      </Button>
    </div>
  );
  if (view === "times" || view === "existing") {
    return (
      <>
        {quiet}
        <div className="grid grid-cols-2 gap-3 pb-1">
          <Button type="button" variant="outline" size="lg" onClick={onBack} disabled={busy}>
            Back
          </Button>
          <span />
        </div>
      </>
    );
  }
  if (view === "move-confirm") {
    return (
      <>
        {quiet}
        <div className="grid grid-cols-2 gap-3 pb-1">
          <Button type="button" variant="outline" size="lg" onClick={onBack} disabled={busy}>
            Back
          </Button>
          <Button type="button" size="lg" onClick={onMove} disabled={busy}>
            {busy ? "Moving" : "Move"}
          </Button>
        </div>
      </>
    );
  }
  const first = view === "who";
  const booking = view === "book";
  return (
    <>
      {isMove ? null : quiet}
      <div className="grid grid-cols-2 gap-3 pb-1">
        <Button type="button" variant="outline" size="lg" onClick={onBack} disabled={busy || first}>
          Back
        </Button>
        <Button type="button" size="lg" onClick={onNext} disabled={busy || (booking && !canBook)} data-testid="sheet-next">
          {busy ? (booking ? "Booking" : "Saving") : booking ? (canBook ? `Book ${when ?? ""}` : `${missing} to go`) : "Next"}
        </Button>
      </div>
    </>
  );
}
