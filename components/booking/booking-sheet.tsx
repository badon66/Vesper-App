"use client";

import { Check, ChevronDown, CircleHelp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { findLeadsAtPlace, type DuplicateLead } from "@/app/(app)/app/leads/actions";
import {
  extendMyHold,
  holdTime,
  moveBooking,
  myHoldStatus,
  releaseMyHold,
  type HoldStatus,
} from "@/app/(app)/app/schedule/actions";
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
import { ActionMessage } from "@/components/action-message";
import {
  AddressScreen,
  BookScreen,
  ExistingScreen,
  HouseScreen,
  QuestionsScreen,
  WhoScreen,
} from "@/components/booking/sheet-screens";
import { NoteText } from "@/components/booking/step-notes";
import { Wordmark } from "@/components/brand/wordmark";
import { ViewAsBar } from "@/components/view-as-bar";
import { TimePicker } from "@/components/schedule/time-picker";
import { Button } from "@/components/ui/button";
import { DialogPanel } from "@/components/ui/dialog-panel";
import { useViewAs } from "@/components/view-as-context";
import {
  DRAFT_TTL_MS,
  draftHasContent,
  draftIdFor,
  removeDraft,
  removeDraftsForLead,
  upsertDraft,
  type SheetDraftRecord,
} from "@/lib/booking/drafts";
import { loadDrafts, saveDrafts } from "@/lib/booking/drafts-browser";
import {
  clockFrom,
  formatCountdown,
  holdPhase,
  phaseAnnouncement,
  remainingMs,
  type HoldClock,
} from "@/lib/booking/hold-clock";
import {
  canSaveLead,
  DOOR_QUESTIONS,
  draftAnswers,
  draftProblems,
  draftToLeadInput,
  emptyDraft,
  firstScreenToVisit,
  isScreenComplete,
  LEARNED_QUESTIONS,
  markScreenNotCollected,
  nextScreen,
  previousScreen,
  savedFingerprint,
  SCREEN_QUESTIONS,
  SCREEN_TITLES,
  SCREENS,
  screenOpenQuestions,
  stepCount,
  STEPS,
  stepOf,
  withAnswer,
  type SheetDraft,
  type SheetScreen,
} from "@/lib/booking/sheet";
import { bookingSheet, useSheetRequest, type SheetRequest, type SheetTimer } from "@/lib/booking/sheet-store";
import { getPublicEnv } from "@/lib/env";
import type { PhotoSlot } from "@/lib/leads/door";
import { COUNTED_QUESTIONS, isQuestionDone, type CountedQuestion } from "@/lib/leads/questions";
import { normalizePhone } from "@/lib/phone";
import type { PickedAddress } from "@/lib/places";
import { toBoardSlots, type BoardSlot } from "@/lib/schedule/board";
import { sentence, timePhrase } from "@/lib/schedule/meetings";
import { createClient } from "@/lib/supabase/client";
import { calgaryDateOf, formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { VIEW_AS_NOTHING_SAVED } from "@/lib/view-as";

// How often the sheet checks its hold with the database. The countdown on
// screen runs on its own between checks; a check keeps it honest.
const SYNC_MS = 30_000;
const DEFAULT_HOLD_MINUTES = 5;
const OPEN_KEY = (userId: string) => `vesper.booking-sheet.${userId}`;

type View = SheetScreen | "loading" | "times" | "existing" | "done" | "move-confirm" | "moved" | "not-bookable";

// What the phone keeps while the sheet is open, so a reload (an iPhone
// sometimes reloads the app after the camera) brings it back as it was.
type OpenSheet = {
  request: SheetRequest;
  view: View;
  draft: SheetDraft;
  heldAt: string | null;
  skipDone: boolean;
  savedPrint: string | null;
  name: string;
  sheetId: string;
  returnTo: SheetScreen | null;
  savedAt: number;
};
type Restored = OpenSheet & { clock: HoldClock | null };

function readOpen(userId: string): OpenSheet | null {
  try {
    const raw = window.localStorage.getItem(OPEN_KEY(userId));
    return raw ? (JSON.parse(raw) as OpenSheet) : null;
  } catch {
    return null;
  }
}
function writeOpen(userId: string, value: OpenSheet | null) {
  try {
    if (value) window.localStorage.setItem(OPEN_KEY(userId), JSON.stringify(value));
    else window.localStorage.removeItem(OPEN_KEY(userId));
  } catch {
    // Private mode or storage off: the sheet still works, it just can't
    // come back after a reload.
  }
}

function clockOf(timer: { expiresAt?: string; now?: string } | null | undefined): HoldClock | null {
  if (!timer?.expiresAt) return null;
  return clockFrom({ expires_at: timer.expiresAt, now: timer.now }, Date.now());
}

// Leaving the sheet keeps what was entered on this phone, for Home's
// Unfinished list: a new person once anything is entered, a saved lead once
// a time was picked for it or something changed since its last save.
function storeDraft(args: {
  userId: string;
  sheetId: string;
  draft: SheetDraft;
  screen: SheetScreen | null;
  heldAt: string | null;
  savedPrint: string | null;
}) {
  const { userId, sheetId, draft, screen, heldAt, savedPrint } = args;
  if (!screen) return;
  const worth = draft.leadId ? heldAt !== null || savedFingerprint(draft) !== savedPrint : draftHasContent(draft);
  if (!worth) return;
  let list = loadDrafts(userId);
  if (draft.leadId) list = removeDraft(list, `new:${sheetId}`);
  const record: SheetDraftRecord = { id: draftIdFor(draft, sheetId), savedAt: Date.now(), screen, draft };
  saveDrafts(userId, upsertDraft(list, record));
}

// While Keenan views the app as someone, a hold is acted out on this screen.
function actedOutClock(minutes: number): HoldClock {
  return { expiresAt: Date.now() + minutes * 60_000, offset: 0 };
}

// The booking sheet's home in the app layout. It opens when something asks
// it to (bookingSheet.open), and after a reload with what was typed: holding
// the same time, or saying the hold ran out and offering it again when it's
// still free. While Keenan views the app as someone it opens as it would
// for them, and nothing is held or saved.
export function BookingSheetHost({ enabled, userId }: { enabled: boolean; userId: string }) {
  const request = useSheetRequest();
  const { viewingAs } = useViewAs();
  const [restored, setRestored] = useState<Restored | null>(null);
  const checked = useRef(false);

  useEffect(() => {
    if (!enabled || viewingAs || checked.current) return;
    checked.current = true;
    const stored = readOpen(userId);
    if (!stored) return;
    if (Date.now() - stored.savedAt > DRAFT_TTL_MS || !stored.heldAt) {
      writeOpen(userId, null);
      return;
    }
    myHoldStatus()
      .then((status) => {
        const same = status.status === "held" && status.startsAt === stored.heldAt;
        if (!same && !draftHasContent(stored.draft)) {
          writeOpen(userId, null);
          return;
        }
        setRestored({ ...stored, clock: same ? clockOf(status) : null });
        bookingSheet.open(stored.request);
      })
      .catch(() => {});
  }, [enabled, viewingAs, userId]);

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

// Where a sheet starts, before anything is loaded.
function startingPoint(request: SheetRequest, userId: string, restored: Restored | null) {
  if (restored) {
    return { view: restored.view, draft: restored.draft, name: restored.name, returnTo: restored.returnTo, record: null };
  }
  if (request.kind === "draft") {
    const record = loadDrafts(userId).find((item) => item.id === request.draftId) ?? null;
    const typed = [record?.draft.first_name.trim(), record?.draft.last_name.trim()].filter(Boolean).join(" ");
    return record
      ? { view: "times" as View, draft: record.draft, name: typed, returnTo: record.screen, record }
      : { view: "not-bookable" as View, draft: emptyDraft(), name: "", returnTo: null, record: null };
  }
  const view: View = request.kind === "book" ? "who" : request.kind === "move" ? "times" : "loading";
  return { view, draft: emptyDraft(), name: request.kind === "move" ? request.leadName : "", returnTo: null, record: null };
}

function BookingSheet({
  request,
  userId,
  restored,
  onClosed,
}: {
  request: SheetRequest;
  userId: string;
  restored: Restored | null;
  onClosed: () => void;
}) {
  const router = useRouter();
  const { viewingAs, name: viewedName } = useViewAs();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const addressFormRef = useRef<HTMLFormElement>(null);
  const pickedRef = useRef<PickedAddress | null>(null);
  const timeButtonRef = useRef<HTMLButtonElement>(null);
  const menuWrapRef = useRef<HTMLDivElement>(null);
  const swipe = useRef<{ x: number; y: number; at: number } | null>(null);
  const runningOut = useRef(false);
  const actedOutLength = useRef(DEFAULT_HOLD_MINUTES);
  const menuId = useId();
  const isMove = request.kind === "move";

  const [start] = useState(() => startingPoint(request, userId, restored));
  const [sheetId] = useState(
    () =>
      restored?.sheetId ??
      (request.kind === "draft" && request.draftId.startsWith("new:") ? request.draftId.slice(4) : crypto.randomUUID()),
  );
  const [context, setContext] = useState<{
    notes: SheetNotes;
    holdMinutes: number;
    board: BoardSlot[];
    today: string;
    windowDays: number;
    asSales: boolean;
  } | null>(null);
  const [view, setView] = useState<View>(start.view);
  const [returnTo, setReturnTo] = useState<SheetScreen | null>(start.returnTo);
  const [draft, setDraft] = useState<SheetDraft>(start.draft);
  const [skipDone, setSkipDone] = useState(restored?.skipDone ?? request.kind === "draft");
  const [savedPrint, setSavedPrint] = useState<string | null>(restored?.savedPrint ?? null);
  const [name, setName] = useState(start.name);
  const [heldAt, setHeldAt] = useState<string | null>(restored?.heldAt ?? (request.kind === "book" ? request.startsAt : null));
  const [clock, setClock] = useState<HoldClock | null>(() => {
    if (restored) return restored.clock;
    if (request.kind !== "book") return null;
    return request.timer ? clockOf(request.timer) : viewingAs ? actedOutClock(DEFAULT_HOLD_MINUTES) : null;
  });
  const [now, setNow] = useState(() => Date.now());
  const [lost, setLost] = useState<{ text: string; canHoldAgain: boolean } | null>(null);
  const [extending, setExtending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [photos, setPhotos] = useState<Partial<Record<PhotoSlot, string>>>({});
  const [photosBusy, setPhotosBusy] = useState(false);
  const [skipOpen, setSkipOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; fix: SheetScreen | null } | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [letGoOpen, setLetGoOpen] = useState(false);
  const [existing, setExisting] = useState<BookableLead[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [notBookable, setNotBookable] = useState<string | null>(
    request.kind === "draft" && !start.record && !restored
      ? "This unfinished booking is gone. Unfinished bookings are kept on the phone for 24 hours."
      : null,
  );
  const [done, setDone] = useState<{ startsAt: string; leadId: string | null } | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateLead[]>([]);
  // The address step's typed text and whether it has a map position, as the
  // setter changes it: the step is done once both are in.
  const [addressLive, setAddressLive] = useState<{ addressLine: string; positioned: boolean } | null>(null);
  const mapsKey = getPublicEnv().NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? null;
  const holdMinutes = context?.holdMinutes ?? DEFAULT_HOLD_MINUTES;

  const remaining = clock ? remainingMs(clock, now) : 0;
  const phase = clock ? holdPhase(remaining) : "run_out";
  const held = Boolean(heldAt && clock && phase !== "run_out");

  // ------------------------------------------------------------ opening
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  useEffect(() => {
    let cancelled = false;
    sheetContext().then((result) => {
      if (cancelled || !result.ok) return;
      setContext({
        notes: result.notes,
        holdMinutes: result.holdMinutes,
        board: result.board,
        today: result.today,
        windowDays: result.windowDays,
        asSales: result.asSales,
      });
      // An acted-out hold lasts what Settings says, like a real one.
      if (viewingAs && result.holdMinutes !== actedOutLength.current) {
        const change = (result.holdMinutes - actedOutLength.current) * 60_000;
        actedOutLength.current = result.holdMinutes;
        setClock((current) => (current ? { ...current, expiresAt: current.expiresAt + change } : current));
      }
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
    // A saved person's photos, and whether they can still be booked.
    const savedLead = restored?.draft.leadId ?? (request.kind === "draft" ? start.record?.draft.leadId : null);
    if (savedLead) {
      sheetLead(savedLead).then((lead) => {
        if (cancelled || !lead.ok) return;
        setPhotos(lead.photos);
        if (!restored) setSavedPrint(savedFingerprint(lead.draft));
        setDraft((current) => ({
          ...current,
          photo_slots: Array.from(new Set([...current.photo_slots, ...lead.draft.photo_slots])),
        }));
        if (!lead.bookable) {
          setNotBookable(lead.notBookableReason);
          setView("not-bookable");
          if (request.kind === "draft") saveDrafts(userId, removeDraft(loadDrafts(userId), request.draftId));
        }
      });
    }
    return () => {
      cancelled = true;
    };
  }, [request, restored, start, userId, viewingAs]);

  // Each new screen starts at its top and announces itself.
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
    headingRef.current?.focus({ preventScroll: true });
  }, [view]);

  // ------------------------------------------------------------ the hold
  const explainLost = useCallback(
    async (startsAt: string, ranOut: boolean) => {
      let text = ranOut ? `Your hold on ${formatTime(startsAt)} ran out.` : `Your hold on ${formatTime(startsAt)} let go.`;
      let canHoldAgain = false;
      if (viewingAs) {
        setLost({ text: `${text} It's still free.`, canHoldAgain: true });
        return;
      }
      try {
        const { data } = await createClient().rpc("schedule_board", { p_as_sales: true });
        const slot = toBoardSlots(data ?? []).find((item) => item.startsAt === startsAt);
        if (!slot) text += " That time is no longer on the schedule. Pick another time.";
        else if (slot.state === "open" || (slot.state === "held" && slot.heldByViewer)) {
          text += " It's still free.";
          canHoldAgain = true;
        } else if (slot.state === "held") text += ` ${slot.holderName ?? "Someone"} is booking it now. Pick another time.`;
        else if (slot.state === "booked") text += " It has just been booked. Pick another time.";
        else text += " It can't be booked now. Pick another time.";
      } catch {
        text += " Check your signal.";
      }
      setLost({ text, canHoldAgain });
    },
    [viewingAs],
  );

  // The timer reached zero on screen: the database has the last word.
  const runOut = useCallback(
    async (startsAt: string) => {
      if (runningOut.current) return;
      runningOut.current = true;
      setClock(null);
      try {
        if (viewingAs) {
          await explainLost(startsAt, true);
          return;
        }
        const status = await myHoldStatus().catch((): HoldStatus => ({ status: "expired" }));
        if (status.status === "held" && status.startsAt === startsAt) {
          setClock(clockOf(status));
          setNow(Date.now());
          return;
        }
        await explainLost(startsAt, true);
      } finally {
        runningOut.current = false;
      }
    },
    [viewingAs, explainLost],
  );

  // The countdown, once a second.
  useEffect(() => {
    if (!clock || !heldAt || done) return;
    const tick = () => {
      const at = Date.now();
      setNow(at);
      if (remainingMs(clock, at) <= 0) void runOut(heldAt);
    };
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [clock, heldAt, done, runOut]);

  // Every so often, and whenever the phone wakes, the hold is checked with
  // the database, so the countdown always shows its time.
  const holding = clock !== null;
  useEffect(() => {
    if (viewingAs || !heldAt || !holding || done || view === "moved") return;
    let stopped = false;
    async function sync() {
      if (document.visibilityState !== "visible" || !heldAt) return;
      try {
        const status = await myHoldStatus();
        if (stopped) return;
        if (status.status === "held" && status.startsAt === heldAt) {
          const next = clockOf(status);
          if (next) setClock(next);
          setNow(Date.now());
        } else {
          setClock(null);
          void explainLost(heldAt, status.status === "expired");
        }
      } catch {
        // No signal: the countdown on screen keeps going, and the next check
        // tries again.
      }
    }
    const timer = window.setInterval(() => void sync(), SYNC_MS);
    const wake = () => void sync();
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
    };
  }, [viewingAs, heldAt, holding, done, view, explainLost]);

  // While a run-out time is offered again, it is checked every few seconds,
  // so "It's still free" never outlives someone else picking it.
  const offeringAgain = Boolean(lost?.canHoldAgain);
  useEffect(() => {
    if (viewingAs || !heldAt || !offeringAgain || done) return;
    const startsAt = heldAt;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void explainLost(startsAt, true);
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [viewingAs, heldAt, offeringAgain, done, explainLost]);

  // Back after a reload with the hold gone: say so, as a run-out would.
  useEffect(() => {
    if (!restored?.heldAt || restored.clock) return;
    const startsAt = restored.heldAt;
    const timer = window.setTimeout(() => void explainLost(startsAt, true), 0);
    return () => window.clearTimeout(timer);
  }, [restored, explainLost]);

  // The screen stays on while a time is held, so a phone that would lock in
  // the middle of the conversation doesn't run the clock down unseen.
  useEffect(() => {
    if (!held || done || view === "moved") return;
    const wakeLock = typeof navigator !== "undefined" ? navigator.wakeLock : undefined;
    if (!wakeLock) return;
    let lock: WakeLockSentinel | null = null;
    let stopped = false;
    const take = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      try {
        lock = await wakeLock.request("screen");
        if (stopped) void lock.release().catch(() => {});
      } catch {
        lock = null;
      }
    };
    void take();
    const again = () => void take();
    document.addEventListener("visibilitychange", again);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", again);
      void lock?.release().catch(() => {});
    };
  }, [held, done, view]);

  // A reply about the caller's hold: held with a fresh timer, or gone.
  async function applyHoldReply(reply: HoldStatus | { status: "refused"; message: string }, startsAt: string) {
    if (reply.status === "held" && reply.startsAt === startsAt) {
      setClock(clockOf(reply));
      setNow(Date.now());
      setLost(null);
      return;
    }
    if (reply.status === "refused") {
      setError({ text: reply.message, fix: null });
      return;
    }
    if (reply.status === "none") {
      // The hold is gone altogether: ask for the time again, as a new hold.
      const again = await holdTime(startsAt, {
        leadId: draft.leadId,
        meetingId: request.kind === "move" ? request.meetingId : null,
      });
      if (again.ok) {
        setClock(clockOf(again));
        setNow(Date.now());
        setLost(null);
        return;
      }
      setClock(null);
      setLost({ text: `${again.message} Pick another time.`, canHoldAgain: false });
      return;
    }
    setClock(null);
    await explainLost(startsAt, true);
  }

  // Add 5 minutes, or Hold it again once it ran out: the database adds the
  // hold length to the caller's own hold, or takes it back while it's free.
  async function addMinutes() {
    setMenuOpen(false);
    if (!heldAt || extending) return;
    if (viewingAs) {
      const at = Date.now();
      setClock((current) => {
        const base = current && remainingMs(current, at) > 0 ? current.expiresAt : at;
        return { expiresAt: base + holdMinutes * 60_000, offset: 0 };
      });
      setNow(at);
      setLost(null);
      return;
    }
    setExtending(true);
    try {
      await applyHoldReply(await extendMyHold(), heldAt);
    } catch {
      setError({ text: "No signal. Try again in a moment.", fix: null });
    } finally {
      setExtending(false);
    }
  }

  // ------------------------------------------------------------ keeping what was entered
  // The draft as it stands, with the address step's typed values read in.
  function currentDraft(): SheetDraft {
    return view === "address" ? readAddressForm(draft) : draft;
  }

  // Never while Keenan views the app as someone, and not for a move.
  function keepDraft(current: SheetDraft, screen: SheetScreen | null) {
    if (viewingAs || isMove) return;
    storeDraft({ userId, sheetId, draft: current, screen, heldAt, savedPrint });
  }

  const draftScreen: SheetScreen | null = isScreen(view) ? view : returnTo;
  const settled = done !== null || view === "moved" || view === "not-bookable" || view === "loading";
  useEffect(() => {
    if (viewingAs || isMove || settled) return;
    storeDraft({ userId, sheetId, draft, screen: draftScreen, heldAt, savedPrint });
  }, [viewingAs, isMove, settled, userId, sheetId, draft, draftScreen, heldAt, savedPrint]);

  useEffect(() => {
    if (viewingAs || settled) return;
    writeOpen(userId, { request, view, draft, heldAt, skipDone, savedPrint, name, sheetId, returnTo, savedAt: Date.now() });
  }, [viewingAs, settled, userId, request, view, draft, heldAt, skipDone, savedPrint, name, sheetId, returnTo]);

  function forgetDraft(current: SheetDraft) {
    if (viewingAs) return;
    writeOpen(userId, null);
    let list = removeDraft(removeDraft(loadDrafts(userId), draftIdFor(current, sheetId)), `new:${sheetId}`);
    if (current.leadId) list = removeDraftsForLead(list, current.leadId);
    if (request.kind === "draft") list = removeDraft(list, request.draftId);
    saveDrafts(userId, list);
  }

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

  // ------------------------------------------------------------ the time menu
  useEffect(() => {
    if (!menuOpen) return;
    menuWrapRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const outside = (event: PointerEvent) => {
      if (!menuWrapRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [menuOpen]);

  function menuKeys(event: React.KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(menuWrapRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setMenuOpen(false);
      timeButtonRef.current?.focus();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      items[(at + 1) % items.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      items[(at - 1 + items.length) % items.length]?.focus();
    } else if (event.key === "Tab") {
      setMenuOpen(false);
    }
  }

  // ------------------------------------------------------------ moving between screens
  const change = useCallback((patch: Partial<SheetDraft>) => {
    setError(null);
    setDraft((current) => ({ ...current, ...patch }));
  }, []);

  const answer = useCallback((question: CountedQuestion, value: string | null) => {
    setError(null);
    setDraft((current) => withAnswer(current, question, value));
  }, []);

  function go(next: View) {
    setError(null);
    setMenuOpen(false);
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

  // Which screen fixes a field the server didn't accept.
  function screenForField(field: string | null): SheetScreen | null {
    if (!field) return null;
    if (field === "first_name" || field === "last_name" || field === "phone") return "who";
    if (field.startsWith("address") || field === "lat" || field === "lng") return "address";
    if (field === "soffit_colour" || field === "soffit_note") return "house";
    const screen = (Object.keys(SCREEN_QUESTIONS) as SheetScreen[]).find((key) =>
      (SCREEN_QUESTIONS[key] ?? []).includes(field as CountedQuestion),
    );
    return screen ?? null;
  }

  async function save(current: SheetDraft): Promise<SheetDraft | null> {
    if (viewingAs) return current;
    const result = await saveSheetLead(current.leadId, draftToLeadInput(current));
    if (!result.ok) {
      const fix = screenForField(result.errors ? Object.keys(result.errors)[0] : null);
      setError({ text: result.error, fix: fix === view ? null : fix });
      return null;
    }
    const saved = { ...current, leadId: result.leadId };
    setDraft(saved);
    setSavedPrint(savedFingerprint(saved));
    return saved;
  }

  // Whether the screen on show is done, and if not, what Next says.
  function needs(screen: SheetScreen, current: SheetDraft): string | null {
    switch (screen) {
      case "who":
        if (current.first_name.trim() === "") return "Add their name first";
        return screenOpenQuestions("who", current).length > 0 ? "Add the phone first" : null;
      case "door":
      case "learned":
        return screenOpenQuestions(screen, current).length > 0 ? "Answer the rest first" : null;
      case "address": {
        const ready = addressLive
          ? addressLive.addressLine.trim() !== "" && addressLive.positioned
          : isScreenComplete("address", current);
        return ready ? null : "Add the address first";
      }
      case "house":
        if (current.soffit_colour === null) return "Pick the soffit first";
        return isScreenComplete("house", current) ? null : "Photos first";
      case "book":
        return null;
    }
  }

  // Next while a screen isn't done: show what's missing.
  function showMissing(screen: SheetScreen, current: SheetDraft) {
    const root = bodyRef.current;
    if (!root) return;
    let target: HTMLElement | null = null;
    if (screen === "who") {
      target = root.querySelector(current.first_name.trim() === "" ? "#sheet-first-name" : "#sheet-phone");
    } else if (screen === "door" || screen === "learned") {
      const open = screenOpenQuestions(screen, current)[0];
      target = open ? root.querySelector(`[data-question="sheet-${open}"] input`) : null;
    } else if (screen === "address") {
      target = root.querySelector("#lead-address");
    } else if (screen === "house") {
      target = current.soffit_colour === null ? root.querySelector('[data-question="sheet-soffit"] input') : root.querySelector('[data-slot="front"] button');
    }
    target?.scrollIntoView({ block: "center" });
    target?.focus({ preventScroll: true });
  }

  // Next, or a swipe to the left. A screen is done when every question on
  // it has an answer or Not collected. Saves the lead when it can and
  // something changed, then moves on.
  async function advance() {
    if (!isScreen(view) || busy) return;
    setError(null);
    if (view === "book") {
      setBusy(true);
      try {
        await book(draft);
      } finally {
        setBusy(false);
      }
      return;
    }
    let current = draft;
    if (view === "address") {
      current = readAddressForm(draft);
      setDraft(current);
    }
    if (!isScreenComplete(view, current)) {
      showMissing(view, current);
      return;
    }
    if (view === "who" && !current.not_collected.includes("phone")) {
      const phone = normalizePhone(current.phone);
      if (!phone.ok) {
        setError({ text: phone.error, fix: null });
        return;
      }
    }
    setBusy(true);
    try {
      const destination = nextScreen(view, current, skipDone);
      // A lead is saved once every question has an answer or Not collected,
      // and a new person once they have an address too, so the photos have a
      // lead to attach to.
      const answers = draftAnswers(current);
      const allAnswered = COUNTED_QUESTIONS.every((question) => isQuestionDone(answers[question]));
      const needsSave =
        allAnswered &&
        ((!current.leadId && canSaveLead(current) && SCREENS.indexOf(destination) > SCREENS.indexOf("address")) ||
          (current.leadId !== null && savedFingerprint(current) !== savedPrint));
      if (needsSave) {
        const saved = await save(current);
        if (!saved) return;
        current = saved;
      }
      if (destination === "book") setSkipDone(true);
      setAddressLive(null);
      go(destination);
    } finally {
      setBusy(false);
    }
  }

  async function book(current: SheetDraft) {
    if (!heldAt) return;
    if (viewingAs) {
      setError({ text: VIEW_AS_NOTHING_SAVED, fix: null });
      return;
    }
    if (!current.leadId && !canSaveLead(current)) {
      setError({ text: "Add their first name and the address first, so they can be saved.", fix: current.first_name.trim() ? "address" : "who" });
      return;
    }
    if (!current.leadId || savedFingerprint(current) !== savedPrint) {
      const saved = await save(current);
      if (!saved) return;
      current = saved;
    }
    const result = await bookFromSheet({
      leadId: current.leadId as string,
      startsAt: heldAt,
      everyone: current.everyone === true,
      skip: current.skip,
      skipNote: current.skip_note,
    });
    if (!result.ok) {
      // A time that's gone is explained once, by the hold notice, which
      // offers to pick another time.
      if (result.code === "slot_held" || result.code === "slot_taken" || result.code === "slot_closed" || result.code === "not_a_slot") {
        setClock(null);
        void explainLost(heldAt, false);
      } else {
        setError({ text: result.message, fix: null });
      }
      return;
    }
    forgetDraft(current);
    setDone({ startsAt: heldAt, leadId: current.leadId });
    go("done");
    router.refresh();
  }

  // Leaving the address screen any way at all keeps what was typed there.
  function keepAddress() {
    if (view === "address") setDraft((current) => readAddressForm(current));
    setAddressLive(null);
  }

  function back() {
    keepAddress();
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
    setMenuOpen(false);
    keepAddress();
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
      // The person typed in so far is dropped for the lead picked instead.
      if (!viewingAs) saveDrafts(userId, removeDraft(loadDrafts(userId), `new:${sheetId}`));
      setDraft(lead.draft);
      setPhotos(lead.photos);
      setName(lead.name);
      setSkipDone(true);
      setSavedPrint(savedFingerprint(lead.draft));
      setReturnTo(null);
      go(firstScreenToVisit(lead.draft));
    } finally {
      setBusy(false);
    }
  }

  function onTimeHeld(startsAt: string, timer: SheetTimer | null) {
    setHeldAt(startsAt);
    setClock(timer ? clockOf(timer) : viewingAs ? actedOutClock(holdMinutes) : null);
    setNow(Date.now());
    setLost(null);
    if (isMove) {
      go("move-confirm");
      return;
    }
    go(returnTo ?? (skipDone ? firstScreenToVisit(draft) : "who"));
    setReturnTo(null);
  }

  async function confirmMove() {
    if (request.kind !== "move" || !heldAt) return;
    if (viewingAs) {
      setError({ text: VIEW_AS_NOTHING_SAVED, fix: null });
      return;
    }
    setBusy(true);
    try {
      const result = await moveBooking(request.meetingId, heldAt);
      if (!result.ok) {
        setError({ text: result.message, fix: null });
        return;
      }
      writeOpen(userId, null);
      go("moved");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  function close() {
    if (!viewingAs) writeOpen(userId, null);
    dialogRef.current?.close();
    bookingSheet.close();
    onClosed();
    router.refresh();
  }

  // Let go: the time is free for anyone at once, and what was entered stays
  // in Unfinished on Home.
  async function letGo(then?: "open-lead") {
    setLetGoOpen(false);
    setMenuOpen(false);
    const current = currentDraft();
    if (!done) keepDraft(current, draftScreen);
    if (heldAt && held && !viewingAs) {
      try {
        await releaseMyHold();
      } catch {
        // The hold runs out by itself.
      }
    }
    close();
    if (then === "open-lead" && current.leadId) router.push(`/app/leads/${current.leadId}`);
  }

  // Escape, or a phone's back gesture: closes the time menu first, then asks
  // before letting a held time go.
  function onCancel(event: React.SyntheticEvent) {
    event.preventDefault();
    if (menuOpen) {
      setMenuOpen(false);
      timeButtonRef.current?.focus();
      return;
    }
    if (view === "done" || view === "moved" || view === "not-bookable" || view === "loading" || !held) {
      if (!done) keepDraft(currentDraft(), draftScreen);
      close();
    } else setLetGoOpen(true);
  }

  // ------------------------------------------------------------ swiping between screens
  function onTouchStart(event: React.TouchEvent) {
    const target = event.target as HTMLElement;
    const ignored = target.closest('input, textarea, select, [contenteditable="true"], [role="listbox"], [data-swipe-ignore]');
    if (event.touches.length !== 1 || !isScreen(view) || ignored) {
      swipe.current = null;
      return;
    }
    const touch = event.touches[0];
    swipe.current = { x: touch.clientX, y: touch.clientY, at: event.timeStamp };
  }

  function onTouchEnd(event: React.TouchEvent) {
    const from = swipe.current;
    swipe.current = null;
    if (!from || !isScreen(view) || busy || photosBusy || menuOpen) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - from.x;
    const dy = touch.clientY - from.y;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5 || event.timeStamp - from.at > 800) return;
    // A swipe never books: Book is a tap.
    if (dx < 0 && view !== "book") void advance();
    if (dx > 0 && view !== "who") back();
  }

  // ------------------------------------------------------------ drawing it
  const when = heldAt ? timePhrase(heldAt) : null;
  const problems = draftProblems(draft);
  const place: SheetScreen | null = isScreen(view) ? view : (view === "times" || view === "existing") && returnTo ? returnTo : null;
  const step = place ? stepOf(place) : null;
  const note = step && context ? context.notes[step] : null;
  const partLabel = isScreen(view) ? STEPS.find((item) => item.key === stepOf(view))?.label : null;
  const personName = [draft.first_name, draft.last_name].filter((part) => part.trim()).join(" ") || name || "this person";
  const need = isScreen(view) ? needs(view, draft) : null;
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
          ? sentence(`Booked for ${done ? timePhrase(done.startsAt) : ""}`)
          : view === "move-confirm"
            ? `Move ${name} to ${when ?? ""}?`
            : view === "moved"
              ? sentence(`Moved to ${when ?? ""}`)
              : view === "not-bookable"
                ? request.kind === "draft" && !start.record
                  ? "Nothing to pick up"
                  : "This lead can't be booked"
                : view === "loading"
                  ? "Opening"
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
        {/* ------------------------------------------------ top: the wordmark, the held time, the steps */}
        <header className="border-b pt-[env(safe-area-inset-top)]">
          {/* The sheet covers the app's gold bar, so it carries its own. */}
          {viewingAs ? <ViewAsBar name={viewedName ?? "someone"} ended={false} /> : null}
          <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-4 py-2">
            <Wordmark className="text-sm min-[420px]:text-base" />
            {done || view === "moved" ? (
              <p className="inline-flex min-h-12 items-center gap-2 text-sm font-semibold" data-testid="sheet-held" data-held="booked">
                <Check aria-hidden="true" className="size-4" />
                {heldAt ? formatTime(heldAt) : ""} {view === "moved" ? "moved" : "booked"}
              </p>
            ) : !heldAt ? (
              <p className="inline-flex min-h-12 items-center text-sm font-semibold text-muted-foreground" data-testid="sheet-held" data-held="none">
                {isMove ? "Moving a booking" : "No time held yet"}
              </p>
            ) : (
              <div ref={menuWrapRef} className="relative">
                <button
                  ref={timeButtonRef}
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  aria-controls={menuOpen ? menuId : undefined}
                  aria-label={`${formatTime(heldAt)}. ${
                    held ? `${formatCountdown(remaining)} left on your hold.` : extending ? "Holding it again." : "Your hold ran out."
                  } Hold options`}
                  onClick={() => setMenuOpen((open) => !open)}
                  data-testid="sheet-held"
                  data-held={held ? "yes" : "no"}
                  data-phase={held ? phase : "run_out"}
                  className={cn(
                    "flex min-h-12 items-center gap-2 rounded-md border px-3 py-1 text-right outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    held && phase === "plenty" && "border-primary",
                    held && phase === "under_a_minute" && "border-2 border-foreground bg-secondary",
                    !held && "border-dashed border-input text-muted-foreground",
                  )}
                >
                  <span className="flex flex-col items-end">
                    <span className="text-base leading-tight font-bold tabular-nums min-[420px]:text-lg">{formatTime(heldAt)}</span>
                    <span
                      className={cn("text-xs leading-tight tabular-nums min-[420px]:text-sm", phase === "under_a_minute" && held ? "font-bold" : "text-muted-foreground")}
                      data-testid="sheet-countdown"
                    >
                      {held ? `${formatCountdown(remaining)} left` : extending ? "Holding" : "Ran out"}
                    </span>
                  </span>
                  <ChevronDown aria-hidden="true" className={cn("size-4 shrink-0", menuOpen && "rotate-180")} />
                </button>
                {menuOpen ? (
                  <div
                    id={menuId}
                    role="menu"
                    aria-label="Hold options"
                    onKeyDown={menuKeys}
                    data-testid="hold-menu"
                    className="absolute top-full right-0 z-20 mt-1 flex w-60 flex-col overflow-hidden rounded-md border bg-background py-1 shadow-lg"
                  >
                    {held ? (
                      <MenuItem onClick={() => void addMinutes()}>Add {holdMinutes} minutes</MenuItem>
                    ) : lost?.canHoldAgain ? (
                      <MenuItem onClick={() => void addMinutes()}>Hold it again</MenuItem>
                    ) : null}
                    {view === "times" ? null : <MenuItem onClick={pickAnother}>Change time</MenuItem>}
                    <MenuItem
                      onClick={() => {
                        setMenuOpen(false);
                        if (held) setLetGoOpen(true);
                        else void letGo();
                      }}
                    >
                      {held ? "Let go" : "Close"}
                    </MenuItem>
                  </div>
                ) : null}
              </div>
            )}
          </div>
          {isScreen(view) ? <Progress screen={view} /> : <div className="h-2" aria-hidden="true" />}
          <p className="sr-only" aria-live="polite">
            {held && phase === "under_a_minute" ? phaseAnnouncement(phase) : ""}
          </p>
        </header>

        {/* ------------------------------------------------ the screen */}
        <div
          ref={bodyRef}
          className="flex-1 overflow-y-auto overscroll-contain"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          data-testid="sheet-body"
        >
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-4 min-[420px]:gap-5">
            <div className="flex flex-col gap-1">
              {partLabel ? (
                <p className="text-sm font-semibold text-muted-foreground min-[420px]:text-base" data-testid="sheet-part">
                  {partLabel}
                  {skipDone && name && view !== "book" ? <span data-testid="sheet-for">, booking {name}</span> : null}
                </p>
              ) : null}
              <div className="flex items-start justify-between gap-2">
                <h2
                  id="sheet-title"
                  ref={headingRef}
                  tabIndex={-1}
                  className="text-2xl font-bold text-balance outline-none min-[420px]:text-[1.75rem] min-[420px]:leading-tight"
                  data-testid="sheet-heading"
                >
                  {title}
                </h2>
                {isScreen(view) && step && (context === null || note) ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="-mt-1 -mr-2 shrink-0"
                    aria-label={`What to talk about: ${STEPS.find((item) => item.key === step)?.label}`}
                    onClick={() => setNoteOpen(true)}
                    data-testid="sheet-note-button"
                  >
                    <CircleHelp className="size-6" />
                  </Button>
                ) : null}
              </div>
              {view === "times" && request.kind === "draft" && !heldAt && returnTo ? (
                <p className="text-sm text-pretty text-muted-foreground min-[420px]:text-base">
                  Then you&apos;re back where you left off: {SCREEN_TITLES[returnTo].replace(/\?$/, "")}.
                </p>
              ) : null}
            </div>

            {view === "loading" ? <p className="text-sm text-muted-foreground">One moment.</p> : null}
            {view === "not-bookable" ? <p className="text-base text-pretty">{notBookable}</p> : null}
            {view === "times" && context ? (
              <TimePicker
                initial={context.board}
                today={context.today}
                windowDays={context.windowDays}
                asSales={context.asSales}
                viewerId={viewingAs ? userId : null}
                initialDay={heldAt ? calgaryDateOf(heldAt) : request.kind === "move" ? calgaryDateOf(request.from) : null}
                mode="sheet"
                leadId={draft.leadId}
                meetingId={isMove ? request.meetingId : null}
                onHeld={onTimeHeld}
              />
            ) : null}
            {view === "times" && !context ? <p className="text-sm text-muted-foreground">One moment.</p> : null}
            {view === "existing" ? <ExistingScreen leads={existing ?? []} loading={existing === null} onPick={(id) => void pickExisting(id)} /> : null}
            {view === "who" ? (
              <WhoScreen
                draft={draft}
                onChange={change}
                onAnswer={answer}
                onExisting={request.kind === "book" && !draft.leadId ? () => void openExisting() : null}
              />
            ) : null}
            {view === "door" ? (
              <QuestionsScreen
                screen="door"
                questions={DOOR_QUESTIONS}
                draft={draft}
                onAnswer={answer}
                onMarkRest={() => setDraft((current) => markScreenNotCollected("door", current))}
              />
            ) : null}
            {view === "learned" ? (
              <QuestionsScreen
                screen="learned"
                questions={LEARNED_QUESTIONS}
                draft={draft}
                onAnswer={answer}
                onMarkRest={() => setDraft((current) => markScreenNotCollected("learned", current))}
              />
            ) : null}
            {view === "address" ? (
              <AddressScreen
                draft={draft}
                formRef={addressFormRef}
                apiKey={mapsKey}
                duplicates={duplicates}
                onEdited={setAddressLive}
                onPicked={(picked) => {
                  pickedRef.current = picked;
                  setError(null);
                  if (picked) findLeadsAtPlace(picked.placeId, draft.leadId).then(setDuplicates, () => setDuplicates([]));
                  else setDuplicates([]);
                }}
              />
            ) : null}
            {view === "house" ? (
              <HouseScreen
                draft={draft}
                userId={userId}
                photos={photos}
                onChange={change}
                onBusyChange={setPhotosBusy}
                skipOpen={skipOpen}
                onSkipOpen={() => setSkipOpen(true)}
                onAddress={() => go("address")}
                local={viewingAs}
              />
            ) : null}
            {view === "book" ? (
              <BookScreen draft={draft} name={personName} heldAt={heldAt} warnings={warnings} onFix={(screen) => go(screen)} />
            ) : null}
            {view === "done" && done ? (
              <p className="text-base text-pretty" data-testid="sheet-done">
                {personName}
                {draft.address_line ? `, ${draft.address_line}` : ""}. It shows on Schedule and on their lead.
              </p>
            ) : null}
            {view === "moved" ? <p className="text-base">{name} is moved. The old time is free again.</p> : null}

            {error ? (
              error.fix === null ? (
                <div data-testid="sheet-error">
                  <ActionMessage text={error.text} className="font-semibold" />
                </div>
              ) : (
                <div role="alert" className="flex flex-wrap items-center gap-3 text-sm font-semibold text-destructive" data-testid="sheet-error">
                  <span className="text-pretty">{error.text}</span>
                  <Button type="button" variant="outline" size="sm" onClick={() => go(error.fix as SheetScreen)}>
                    Go there
                  </Button>
                </div>
              )
            ) : null}
          </div>
        </div>

        {/* ------------------------------------------------ bottom: always there, Next at the bottom right */}
        <footer className="border-t bg-background pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-2 px-4 py-2">
            {heldAt && !done && view !== "moved" && lost && !held ? (
              <div role="alert" className="flex flex-col gap-2 rounded-md border border-foreground/60 px-3 py-2" data-testid="sheet-hold-lost">
                <p className="text-sm font-semibold text-pretty">{lost.text}</p>
                <div className="flex flex-wrap gap-2">
                  {lost.canHoldAgain ? (
                    <Button type="button" size="sm" disabled={extending} onClick={() => void addMinutes()}>
                      {extending ? "Holding" : "Hold it again"}
                    </Button>
                  ) : null}
                  {view !== "times" ? (
                    <Button type="button" variant="outline" size="sm" onClick={pickAnother}>
                      Pick another time
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
            {held && phase === "under_a_minute" && !done && view !== "moved" ? (
              <div className="flex items-center justify-between gap-3 rounded-md border-2 border-foreground px-3 py-1.5" data-testid="hold-warning">
                <p className="text-sm font-semibold text-pretty">{sentence(`Under a minute left on ${heldAt ? formatTime(heldAt) : "this time"}`)}</p>
                <Button type="button" size="sm" variant="outline" disabled={extending} onClick={() => void addMinutes()}>
                  Add {holdMinutes} minutes
                </Button>
              </div>
            ) : null}
            <BottomBar
              view={view}
              hasTime={Boolean(heldAt)}
              busy={busy || photosBusy}
              saving={busy}
              uploading={photosBusy}
              need={need}
              canBook={problems.length === 0 && held}
              missing={problems.length}
              heldTime={heldAt ? formatTime(heldAt) : null}
              onBack={back}
              onNext={() => (need && isScreen(view) ? showMissing(view, view === "address" ? readAddressForm(draft) : draft) : void advance())}
              onMove={() => void confirmMove()}
              onClose={() => {
                if (!done) keepDraft(currentDraft(), draftScreen);
                close();
              }}
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
        {context === null ? <p className="text-base text-muted-foreground">One moment.</p> : <NoteText text={note ?? ""} />}
      </DialogPanel>

      <DialogPanel
        open={letGoOpen}
        onClose={() => setLetGoOpen(false)}
        title={when ? `Let go of ${when}?` : "Close?"}
        testId="sheet-let-go"
        actions={
          <>
            <Button type="button" variant="outline" onClick={() => void letGo()}>
              Let go
            </Button>
            <Button type="button" onClick={() => setLetGoOpen(false)}>
              Keep holding
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-base text-pretty">
            {request.kind === "move"
              ? `${name}'s booking stays at ${formatTime(request.from)}. Anyone can then pick this time.`
              : viewingAs
                ? "Anyone can then pick this time."
                : draft.leadId
                  ? `${personName} stays saved as a lead, and what you entered stays in Unfinished on Home. Anyone can then pick this time.`
                  : "What you entered stays in Unfinished on Home for 24 hours. Anyone can then pick this time."}
          </p>
          {draft.leadId && !isMove ? (
            <Button type="button" variant="link" size="sm" className="self-start px-0" onClick={() => void letGo("open-lead")}>
              Let go and open their lead to set a follow-up day
            </Button>
          ) : null}
        </div>
      </DialogPanel>
    </dialog>
  );
}

function isScreen(view: View): view is SheetScreen {
  return (SCREENS as View[]).includes(view);
}

function MenuItem({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex min-h-12 w-full items-center px-4 text-left text-base font-semibold outline-none hover:bg-muted focus-visible:bg-muted"
    >
      {children}
    </button>
  );
}

// The steps as one bar of segments, grouped by part of the visit, with
// "Step 3 of 6, 3 left" beside it.
function Progress({ screen }: { screen: SheetScreen }) {
  const { number, total, left } = stepCount(screen);
  const firstOfPart = new Set(STEPS.slice(1).map((part) => part.screens[0]));
  return (
    <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 pb-2">
      <ol className="flex flex-1 items-center gap-1" aria-hidden="true">
        {SCREENS.map((item, index) => (
          <li
            key={item}
            className={cn("h-1.5 flex-1 rounded-full", index < number ? "bg-foreground" : "bg-input", firstOfPart.has(item) && "ml-2")}
          />
        ))}
      </ol>
      <p className="shrink-0 text-sm font-semibold tabular-nums min-[420px]:text-base" data-testid="sheet-step-count">
        Step {number} of {total}
        {left > 0 ? <span className="font-normal text-muted-foreground">, {left} left</span> : null}
      </p>
    </div>
  );
}

function BottomBar({
  view,
  hasTime,
  busy,
  saving,
  uploading,
  need,
  canBook,
  missing,
  heldTime,
  onBack,
  onNext,
  onMove,
  onClose,
  onOpenLead,
}: {
  view: View;
  hasTime: boolean;
  busy: boolean;
  // Saving or booking.
  saving: boolean;
  uploading: boolean;
  // What the screen still needs, said on Next; null when it's done.
  need: string | null;
  canBook: boolean;
  missing: number;
  heldTime: string | null;
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
      <div className="grid grid-cols-2 gap-3 py-1">
        <Button type="button" variant="outline" size="lg" onClick={onClose}>
          Close
        </Button>
        <span />
      </div>
    );
  }
  if (view === "times" || view === "existing") {
    return (
      <div className="grid grid-cols-2 gap-3 py-1">
        <Button type="button" variant="outline" size="lg" onClick={onBack} disabled={busy}>
          Back
        </Button>
        <span />
      </div>
    );
  }
  if (view === "move-confirm") {
    return (
      <div className="grid grid-cols-2 gap-3 py-1">
        <Button type="button" variant="outline" size="lg" onClick={onBack} disabled={busy}>
          Back
        </Button>
        <Button type="button" size="lg" onClick={onMove} disabled={busy}>
          {busy ? "Moving" : "Move"}
        </Button>
      </div>
    );
  }
  const first = view === "who";
  const booking = view === "book";
  return (
    <div className="grid grid-cols-2 gap-3 py-1">
      <Button type="button" variant="outline" size="lg" className="min-[420px]:h-14 min-[420px]:text-lg" onClick={onBack} disabled={busy || first}>
        Back
      </Button>
      <Button
        type="button"
        size="lg"
        variant={need ? "outline" : "default"}
        className={cn("min-[420px]:h-14 min-[420px]:text-lg", need && "border-dashed px-3 text-sm min-[420px]:text-base")}
        onClick={onNext}
        disabled={busy || (booking && !canBook)}
        data-testid="sheet-next"
        data-ready={need ? "no" : "yes"}
      >
        {saving
          ? booking
            ? "Booking"
            : "Saving"
          : uploading
            ? "Uploading photos"
            : booking
              ? canBook
                ? `Book ${heldTime ?? ""}`
                : missing > 0
                  ? `Fix ${missing} first`
                  : "Time not held"
              : need ?? "Next"}
      </Button>
    </div>
  );
}
