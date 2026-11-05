"use client";

import { Check, ChevronDown, CircleHelp } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
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
  sheetBookedAt,
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
  BookPhone,
  BookScreen,
  ExistingScreen,
  PhotosScreen,
  QuestionsScreen,
  WhoScreen,
} from "@/components/booking/sheet-screens";
import { NoteText } from "@/components/booking/step-notes";
import { Wordmark } from "@/components/brand/wordmark";
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
  addressPlaced,
  bookingBlockers,
  bookNeed,
  canSaveLead,
  DOOR_QUESTIONS,
  draftAnswers,
  draftProblems,
  draftToLeadInput,
  emptyDraft,
  firstScreenToVisit,
  leadDraftFromSheet,
  LEARNED_QUESTIONS,
  markScreenNotCollected,
  nextScreen,
  previousScreen,
  PROBLEM_SCREENS,
  savedFingerprint,
  SCREEN_QUESTIONS,
  SCREEN_TITLES,
  SCREENS,
  screenMissing,
  screenOpenQuestions,
  sheetMissing,
  stepCount,
  STEPS,
  stepOf,
  withAnswer,
  withDraftDefaults,
  type SheetDraft,
  type SheetScreen,
} from "@/lib/booking/sheet";
import { bookingSheet, useSheetRequest, type SheetRequest, type SheetTimer } from "@/lib/booking/sheet-store";
import { getPublicEnv } from "@/lib/env";
import type { PhotoSlot } from "@/lib/leads/door";
import { draftKey } from "@/lib/leads/draft";
import { timed } from "@/lib/answer-within";
import { handOffToNewLead } from "@/lib/leads/hand-off";
import { COUNTED_QUESTIONS, isQuestionDone, type CountedQuestion } from "@/lib/leads/questions";
import { normalizePhone } from "@/lib/phone";
import type { PickedAddress } from "@/lib/places";
import { toBoardSlots, type BoardSlot } from "@/lib/schedule/board";
import { bookButtonLabel, formatMeetingTime, heldTimeLabel, sentence, timePhrase } from "@/lib/schedule/meetings";
import { createClient } from "@/lib/supabase/client";
import { calgaryDateOf, formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { VIEW_AS_EXIT_PATH, VIEW_AS_NOTHING_SAVED } from "@/lib/view-as";

// How often the sheet checks its hold with the database. The countdown on
// screen runs on its own between checks; a check keeps it honest.
const SYNC_MS = 30_000;
// A save, a booking or a hold that hasn't answered within the app's answer
// limit (lib/answer-within.ts) is treated as lost to the signal, so the
// sheet never sits on "Saving". This is what it says then.
type SheetError = { text: string; fix: SheetScreen | null };
const SLOW = "That's taking too long. Check your signal and try again.";
// Next never stops on a save that didn't go through (round 3): it moves on
// and says so calmly. Everything stays on the phone and Book saves it.
const NOT_SAVED_YET = "Not saved yet, the signal is weak. It's kept on this phone, and Book saves it.";
// Book with no answer back (2026-11-03): the sheet asks whether the lead
// booked anyway before it says anything, and says only what it knows.
const CHECK_WITHIN_MS = 10_000;
const NOT_BOOKED_YET = "Not booked yet. Check your signal and tap Book again.";
const NO_ANSWER_YET = "No signal to check whether it booked. Tap Book again once you have signal: it can't book twice.";

// A booking that may have gone through without its answer reaching the phone.
type Unanswered = { leadId: string; startsAt: string };

// Whether the lead now has its booking at that time: true, false, or null
// when that can't be told either, because there's still no signal.
async function bookedAlready(leadId: string, startsAt: string): Promise<boolean | null> {
  try {
    const reply = await timed(sheetBookedAt({ leadId, startsAt }), CHECK_WITHIN_MS);
    return reply.ok ? reply.booked : null;
  } catch {
    return null;
  }
}

// Classes the first thing a step still needs wears for a moment.
const ATTENTION = ["ring-2", "ring-primary", "ring-offset-4", "ring-offset-background"];
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
        // Drafts kept before round 3 lack its fields: fill them in first, or
        // an empty sheet would count as having something in it.
        if (!same && !draftHasContent(withDraftDefaults(stored.draft))) {
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
    return { view: restored.view, draft: withDraftDefaults(restored.draft), name: restored.name, returnTo: restored.returnTo, record: null };
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
  const pathname = usePathname();
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
  // A Book whose answer never arrived. Until the sheet knows how it went, a
  // hold that goes missing is checked against the lead's bookings first:
  // booking is what uses a hold up, so it may simply have booked.
  const unanswered = useRef<Unanswered | null>(null);
  const finishLate = useRef<(booked: Unanswered) => void>(() => {});
  const actedOutLength = useRef(DEFAULT_HOLD_MINUTES);
  const menuId = useId();
  const isMove = request.kind === "move";

  const [start] = useState(() => startingPoint(request, userId, restored));
  const [sheetId] = useState(
    () =>
      restored?.sheetId ??
      (request.kind === "draft" && request.draftId.startsWith("new:") ? request.draftId.slice(4) : crypto.randomUUID()),
  );
  const [contextFailed, setContextFailed] = useState(false);
  const [contextTry, setContextTry] = useState(0);
  // Try again shows the wait at once, then loads the times and notes afresh.
  const retryContext = () => {
    setContextFailed(false);
    setContextTry((n) => n + 1);
  };
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
  const [error, setError] = useState<SheetError | null>(null);
  // Why the last save didn't go through, for Next, which moves on anyway.
  const saveError = useRef<SheetError | null>(null);
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
  // Round 3: the steps the setter has been on, for the progress bar's
  // markers (a step passed with something missing), and whether this step
  // was opened from Book's list, so Next goes back to Book.
  const [visited, setVisited] = useState<SheetScreen[]>(() => (isScreen(start.view) ? [start.view] : []));
  const [fromBook, setFromBook] = useState(false);
  // The address step stays alive out of sight while Use where I'm standing
  // is still listening or the nearest address is on its way, so a result
  // that lands after Next or a swipe still counts (round 3); and after it
  // failed out of sight, until the setter goes back to see why.
  const [addressWorking, setAddressWorking] = useState(false);
  const [addressFailedAway, setAddressFailedAway] = useState(false);
  const viewNow = useRef(view);
  useEffect(() => {
    viewNow.current = view;
  });
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

  // The times and Keenan's notes; on no signal it says so and offers to try again.
  useEffect(() => {
    let cancelled = false;
    timed(sheetContext()).then(
      (result) => {
        if (cancelled) return;
        if (!result.ok) {
          setContextFailed(true);
          return;
        }
        setContextFailed(false);
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
      },
      () => {
        if (!cancelled) setContextFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [contextTry, viewingAs]);

  useEffect(() => {
    let cancelled = false;
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
          // A draft kept before round 3 never asked the optional answers:
          // the lead's own come back, so a save can't blank them.
          ...(current.extras === false
            ? { house_type: lead.draft.house_type, setter_read: lead.draft.setter_read, hot_buttons: lead.draft.hot_buttons, confirm_by: lead.draft.confirm_by, extras: true }
            : {}),
        }));
        if (!lead.bookable) {
          setNotBookable(lead.notBookableReason);
          setView("not-bookable");
          if (request.kind === "draft") saveDrafts(userId, removeDraft(loadDrafts(userId), request.draftId));
        }
      }, () => {});
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

  if (isScreen(view) && !visited.includes(view)) setVisited([...visited, view]);
  if (view === "address" && addressFailedAway) setAddressFailedAway(false);

  // ------------------------------------------------------------ the hold
  const explainLost = useCallback(
    async (startsAt: string, ranOut: boolean) => {
      let text = ranOut ? `Your hold on ${formatTime(startsAt)} ran out.` : `Your hold on ${formatTime(startsAt)} let go.`;
      // A Book that got no answer for this time is the likeliest reason.
      const pending = unanswered.current;
      if (pending && pending.startsAt === startsAt && !viewingAs) {
        const booked = await bookedAlready(pending.leadId, startsAt);
        if (booked === true) {
          finishLate.current(pending);
          return;
        }
        if (booked === null) {
          setLost({ text: `${text} It may have booked: check your signal.`, canHoldAgain: false });
          return;
        }
      }
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
      // A Book that got no answer may be what used the hold up.
      const pending = unanswered.current;
      if (pending && pending.startsAt === startsAt && (await bookedAlready(pending.leadId, startsAt)) === true) {
        finishLate.current(pending);
        return;
      }
      // The hold is gone altogether: ask for the time again, as a new hold.
      const again = await timed(
        holdTime(startsAt, {
          leadId: draft.leadId,
          meetingId: request.kind === "move" ? request.meetingId : null,
        }),
      );
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
      await applyHoldReply(await timed(extendMyHold()), heldAt);
    } catch {
      setError({ text: SLOW, fix: null });
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
  // Round 3: a new person reaches Book before their first save, so the
  // warning reads the position on the sheet whenever it has one.
  useEffect(() => {
    const at = draft.lat !== null && draft.lng !== null ? { lat: draft.lat, lng: draft.lng } : null;
    if (view !== "book" || !heldAt || (!draft.leadId && !at)) return;
    let cancelled = false;
    sheetDistanceWarnings(draft.leadId, heldAt, at)
      .then((list) => {
        if (!cancelled) setWarnings(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [view, draft.leadId, draft.lat, draft.lng, heldAt]);

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
    setFromBook(false);
    setView(next);
  }

  // A tap on one of Book's missing things: that step, with Next back to
  // Book, and the first thing it still needs brought into view and outlined
  // for a moment, once the step has opened at its top.
  function fixFromBook(screen: SheetScreen) {
    keepAddress();
    if (screen === "book") {
      showMissing("book", draft);
      return;
    }
    const current = draft;
    go(screen);
    setFromBook(true);
    window.setTimeout(() => showMissing(screen, current, false), 80);
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
    if (field === "first_name" || field === "last_name") return "who";
    if (field === "phone") return "book";
    if (field.startsWith("address") || field === "lat" || field === "lng") return "address";
    if (field === "soffit_colour" || field === "soffit_note") return "house";
    const screen = (Object.keys(SCREEN_QUESTIONS) as SheetScreen[]).find((key) =>
      (SCREEN_QUESTIONS[key] ?? []).includes(field as CountedQuestion),
    );
    return screen ?? null;
  }

  async function save(current: SheetDraft): Promise<SheetDraft | null> {
    if (viewingAs) return current;
    // A new person's first save carries a save key made once on this phone
    // (2026-11-04). It goes into the draft as the request leaves, so every
    // later try, after a reload or from Unfinished too, sends the same key
    // and gets back the lead the first try made instead of a copy.
    let keyed = current;
    // A saved lead's draft kept before round 3 never asked the optional
    // answers: they come from the lead before anything is saved, so a save
    // can never blank them. If that read can't be made, nothing is saved.
    if (current.leadId && current.extras === false) {
      const lead = await sheetLead(current.leadId).catch(() => null);
      if (!lead?.ok) {
        saveError.current = { text: SLOW, fix: null };
        setError(saveError.current);
        return null;
      }
      const extras = { house_type: lead.draft.house_type, setter_read: lead.draft.setter_read, hot_buttons: lead.draft.hot_buttons, confirm_by: lead.draft.confirm_by, extras: true };
      keyed = { ...current, ...extras };
      setDraft((latest) => (latest.extras === false ? { ...latest, ...extras } : latest));
    }
    if (!keyed.leadId && !keyed.saveKey) {
      const saveKey = crypto.randomUUID();
      keyed = { ...keyed, saveKey };
      setDraft((draft) => (draft.leadId || draft.saveKey ? draft : { ...draft, saveKey }));
    }
    let result: Awaited<ReturnType<typeof saveSheetLead>>;
    saveError.current = null;
    try {
      result = await timed(saveSheetLead(keyed.leadId, draftToLeadInput(keyed)));
    } catch {
      saveError.current = { text: SLOW, fix: null };
      setError(saveError.current);
      return null;
    }
    if (!result.ok) {
      const fix = screenForField(result.errors ? Object.keys(result.errors)[0] : null);
      saveError.current = { text: result.error, fix };
      setError({ text: result.error, fix: fix === view ? null : fix });
      return null;
    }
    // The photos taken before this first save are on the lead now. Only
    // what the save adds goes into the draft, so anything changed while it
    // was on its way stays, and differs from savedPrint, so it saves next.
    const leadId = result.leadId;
    const attached = Object.keys(keyed.photo_paths).length > 0;
    const saved = { ...keyed, leadId, photo_paths: {} };
    setDraft((latest) => ({ ...latest, saveKey: keyed.saveKey, leadId, photo_paths: attached ? {} : latest.photo_paths }));
    setSavedPrint(savedFingerprint(saved));
    if (attached) {
      sheetLead(result.leadId).then(
        (lead) => {
          if (lead.ok) setPhotos(lead.photos);
        },
        () => {},
      );
    }
    return saved;
  }

  // What Next says. Round 3: answers come out of order at the door, so on
  // every step but Book, Next always moves on; Book says what it still
  // needs, listed just above it.
  function needs(screen: SheetScreen, current: SheetDraft): string | null {
    return screen === "book" ? bookNeed(current) : null;
  }

  // Next while a screen isn't done: the first thing it still needs comes
  // into view and is outlined for a moment. A tap also moves focus there; a
  // swipe doesn't, so a phone's keyboard never jumps up mid-swipe.
  function showMissing(screen: SheetScreen, current: SheetDraft, focus = true) {
    const root = bodyRef.current;
    if (!root) return;
    let marked: HTMLElement | null = null;
    let target: HTMLElement | null = null;
    if (screen === "who") {
      target = root.querySelector(current.first_name.trim() === "" ? "#sheet-first-name" : "#sheet-phone");
      marked = target;
    } else if (screen === "door" || screen === "learned") {
      const open = screenOpenQuestions(screen, current)[0];
      marked = open ? root.querySelector(`[data-question="sheet-${open}"]`) : null;
      target = marked?.querySelector<HTMLElement>('label[data-answer]:not([data-answer="not_collected"]) input') ?? null;
    } else if (screen === "address") {
      const placed = addressLive ? addressLive.addressLine.trim() !== "" && addressLive.positioned : addressPlaced(current);
      marked = placed ? root.querySelector('[data-question="sheet-soffit"]') : root.querySelector("#lead-address");
      target = placed ? (marked?.querySelector<HTMLElement>("input") ?? null) : marked;
    } else if (screen === "house") {
      marked = root.querySelector('[aria-label="Guided photos"]');
      target = root.querySelector('[data-slot="front"] button');
    } else if (screen === "book") {
      // Book that isn't ready: the phone when it's the one thing left on
      // this screen, otherwise the list of what's still missing.
      const elsewhere = sheetMissing(current).filter((item) => item.screen !== "book");
      const whole = dialogRef.current ?? root;
      if (bookingBlockers(current).length > 0 && elsewhere.length === 0) {
        // An answer rules booking out: the note that says so, and its Keep
        // as a lead.
        marked = root.querySelector('[data-testid="book-ruled-out"]');
        target = marked?.querySelector<HTMLElement>('[data-testid="keep-as-lead"]') ?? null;
      } else if (elsewhere.length === 0 && screenMissing("book", current).length > 0) {
        target = whole.querySelector("#sheet-phone");
        marked = whole.querySelector('[data-testid="sheet-phone-block"]');
      } else if (elsewhere.length > 0) {
        marked = root.querySelector('[data-testid="book-checklist"]');
        target = marked?.querySelector<HTMLElement>("button") ?? null;
      } else {
        const first = draftProblems(current)[0];
        if (first) go(PROBLEM_SCREENS[first] ?? "who");
        return;
      }
    }
    marked?.scrollIntoView({ block: "center" });
    if (focus) target?.focus({ preventScroll: true });
    if (marked) {
      const box = marked;
      box.classList.add(...ATTENTION);
      window.setTimeout(() => box.classList.remove(...ATTENTION), 1500);
    }
  }

  // Next, or a swipe to the left. Round 3: it always moves on, answers
  // missing or not; the progress bar marks a step left with something
  // missing, and Book lists it. Saves the lead when it can and something
  // changed, then moves on.
  async function advance(viaSwipe = false) {
    void viaSwipe;
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
    setBusy(true);
    try {
      const destination = fromBook ? "book" : nextScreen(view, current, skipDone);
      // A lead is saved once every question has an answer or Not collected,
      // and a new person once they have an address too. With the phone
      // asked last, that's usually Book.
      const answers = draftAnswers(current);
      const allAnswered = COUNTED_QUESTIONS.every((question) => isQuestionDone(answers[question]));
      const phoneOk = current.not_collected.includes("phone") || normalizePhone(current.phone).ok;
      const needsSave =
        allAnswered &&
        phoneOk &&
        ((!current.leadId && canSaveLead(current) && SCREENS.indexOf(destination) > SCREENS.indexOf("address")) ||
          (current.leadId !== null && savedFingerprint(current) !== savedPrint));
      let notSaved: SheetError | null = null;
      if (needsSave) {
        const saved = await save(current);
        if (saved) current = saved;
        else notSaved = saveError.current;
      }
      if (destination === "book") setSkipDone(true);
      setAddressLive(null);
      go(destination);
      // Next always moves on (round 3). A save that didn't go through is
      // said calmly on the next step; Book saves again before it books.
      if (notSaved) setError(notSaved.text === SLOW ? { text: NOT_SAVED_YET, fix: null } : { ...notSaved, fix: notSaved.fix === destination ? null : notSaved.fix });
    } finally {
      setBusy(false);
    }
  }

  // Booked: the done screen. Also where an unanswered Book ends once the
  // sheet learns it went through.
  function finishBooked(booked: Unanswered, current: SheetDraft = draft) {
    unanswered.current = null;
    forgetDraft({ ...current, leadId: booked.leadId });
    setError(null);
    setLost(null);
    setDone({ startsAt: booked.startsAt, leadId: booked.leadId });
    go("done");
    router.refresh();
  }

  // The hold's checks run in callbacks made once; they reach the latest
  // finishBooked through this.
  useEffect(() => {
    finishLate.current = (booked) => finishBooked(booked);
  });

  async function book(current: SheetDraft) {
    if (!heldAt) return;
    // Book is the only gate (round 3): everything answered, the phone a real
    // number (or Not collected, which rules booking out anyway).
    if (!current.not_collected.includes("phone") && current.phone.trim() !== "") {
      const phone = normalizePhone(current.phone);
      if (!phone.ok) {
        setError({ text: phone.error, fix: null });
        dialogRef.current?.querySelector<HTMLElement>("#sheet-phone")?.focus();
        return;
      }
    }
    if (sheetMissing(current).length > 0 || bookingBlockers(current).length > 0) {
      showMissing("book", current);
      return;
    }
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
    const attempt: Unanswered = { leadId: current.leadId as string, startsAt: heldAt };
    let result: Awaited<ReturnType<typeof bookFromSheet>>;
    try {
      result = await timed(
        bookFromSheet({
          leadId: attempt.leadId,
          startsAt: attempt.startsAt,
          everyone: current.everyone === true,
          skip: current.skip,
          skipNote: current.skip_note,
        }),
      );
    } catch {
      // No answer: no signal, or too slow. It may have booked anyway, so ask
      // before saying anything. Booking twice can't happen, so Book again is
      // always safe.
      unanswered.current = attempt;
      const booked = await bookedAlready(attempt.leadId, attempt.startsAt);
      if (booked === true) {
        finishBooked(attempt, current);
        return;
      }
      setError({ text: booked === false ? NOT_BOOKED_YET : NO_ANSWER_YET, fix: null });
      return;
    }
    if (!result.ok) {
      // A try that got no answer may be what booked the lead or took the
      // time: if so, it's booked, not refused.
      const pending = unanswered.current;
      if (pending && pending.leadId === attempt.leadId && pending.startsAt === attempt.startsAt) {
        const booked = await bookedAlready(attempt.leadId, attempt.startsAt);
        if (booked === true) {
          finishBooked(attempt, current);
          return;
        }
        // It didn't book, and this answer is the last word on it.
        if (booked === false) unanswered.current = null;
      }
      // A time that's gone is explained once, by the hold notice, which
      // offers to pick another time.
      if (result.code === "slot_held" || result.code === "slot_taken" || result.code === "slot_closed" || result.code === "not_a_slot") {
        setClock(null);
        void explainLost(heldAt, false);
      } else {
        // The database's own Before you book check: point at the step that
        // fixes the first thing it found, so a refusal is never a dead end.
        const first = "problems" in result ? result.problems?.[0] : undefined;
        const fix = first ? (PROBLEM_SCREENS[first] ?? null) : null;
        setError({ text: result.message, fix: fix === "book" ? null : fix });
      }
      return;
    }
    finishBooked(attempt, current);
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
    // Back is always the step before, even on a step opened from Book's
    // list, where Next is the way back to Book.
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
      let result: Awaited<ReturnType<typeof moveBooking>>;
      try {
        result = await timed(moveBooking(request.meetingId, heldAt));
      } catch {
        setError({ text: SLOW, fix: null });
        return;
      }
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

  // Done (or Escape, or a back gesture, on the done screen): a booking made
  // from Session, or from New lead's Save and book while knocking, lands
  // back on Session with the saved line (Keenan, 2026-11-05).
  function finishClose() {
    const toSession = done && (pathname === "/app/session" || (request.kind === "lead" && request.backTo === "session"));
    close();
    if (toSession && done) router.replace(`/app/session?added=${done.leadId}`);
  }

  function close() {
    if (!viewingAs) writeOpen(userId, null);
    dialogRef.current?.close();
    bookingSheet.close();
    onClosed();
    router.refresh();
  }

  // Let go: the time is free for anyone at once, and what was entered stays
  // in Unfinished on Session.
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

  // Keep as a lead (round 2 polish): an answer rules booking out, so the
  // time goes back on the board at once and the person is kept: a new person
  // carries on in New lead with everything entered; a saved lead has its
  // changes saved, when they can be, and opens on its page, where a
  // follow-up day is set. Under View as nothing is released or saved, and
  // New lead gets the person in memory only.
  async function keepAsLead() {
    if (busy) return;
    setMenuOpen(false);
    setError(null);
    let current = currentDraft();
    if (current.leadId) {
      const answers = draftAnswers(current);
      const allAnswered = COUNTED_QUESTIONS.every((question) => isQuestionDone(answers[question]));
      if (!allAnswered) {
        // A lead from before round 2 with questions still open: its changes
        // wait in Unfinished, as when the time is let go.
        await letGo("open-lead");
        return;
      }
      if (savedFingerprint(current) !== savedPrint) {
        setBusy(true);
        try {
          const saved = await save(current);
          if (!saved) return;
          current = saved;
        } finally {
          setBusy(false);
        }
      }
    }
    if (heldAt && held && !viewingAs) {
      try {
        await releaseMyHold();
      } catch {
        // The hold runs out by itself.
      }
    }
    if (current.leadId) {
      forgetDraft(current);
      close();
      router.push(`/app/leads/${current.leadId}`);
      return;
    }
    const handed = leadDraftFromSheet(current, Date.now());
    handOffToNewLead(handed);
    if (!viewingAs) {
      try {
        localStorage.setItem(draftKey(userId), JSON.stringify(handed));
      } catch {
        // Private browsing or full storage: the hand-off in memory still works.
      }
      forgetDraft(current);
    }
    close();
    router.push("/app/leads/new");
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
      finishClose();
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
    if (dx < 0 && view !== "book") void advance(true);
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
  // An answer rules booking out: Keep as a lead is the gold button where it
  // shows (the phone, the door, Book), and Next steps back there.
  const ruledOut = bookingBlockers(draft).length > 0;
  const stepBack = ruledOut && (view === "door" || view === "book");
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
          {/* The sheet covers the app's gold bar, so it carries a slim one of its own. */}
          {viewingAs ? (
            <div className="flex h-5 items-center justify-between gap-3 bg-primary px-4 text-primary-foreground" data-testid="sheet-view-as">
              <p role="status" className="text-xs leading-5 font-semibold">
                Viewing as {viewedName ?? "someone"}. Read only.
              </p>
              {/* Slim, so every step still fits: the tap area reaches past
                  the strip into the space around it. */}
              <form method="post" action={VIEW_AS_EXIT_PATH}>
                <button
                  type="submit"
                  className="relative inline-flex h-5 items-center rounded-md px-2 text-xs leading-5 font-bold underline underline-offset-1 outline-none after:absolute after:-inset-x-1 after:-inset-y-2.5 after:content-[''] focus-visible:ring-2 focus-visible:ring-primary-foreground"
                >
                  Exit
                </button>
              </form>
            </div>
          ) : null}
          <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-4 py-2">
            <Wordmark className="text-sm min-[420px]:text-base" />
            {done || view === "moved" ? (
              <p className="inline-flex min-h-12 items-center gap-2 text-sm font-semibold min-[420px]:text-base" data-testid="sheet-held" data-held="booked">
                <Check aria-hidden="true" className="size-4" />
                {heldAt ? heldTimeLabel(heldAt) : ""}, {view === "moved" ? "moved" : "booked"}
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
                  aria-label={`Hold options for ${formatMeetingTime(heldAt)}`}
                  onClick={() => setMenuOpen((open) => !open)}
                  data-testid="sheet-held"
                  data-held={held ? "yes" : "no"}
                  data-phase={held ? phase : "run_out"}
                  className={cn(
                    "flex min-h-12 items-center gap-2 rounded-md px-3 py-1 text-right outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    held && phase === "plenty" && "border-2 border-primary",
                    held && phase === "under_a_minute" && "border-2 border-foreground bg-secondary",
                    !held && "border border-dashed border-input text-muted-foreground",
                  )}
                >
                  <span className="flex flex-col items-end">
                    <span className="text-base leading-tight font-bold tabular-nums min-[420px]:text-lg" data-testid="sheet-held-time">
                      {heldTimeLabel(heldAt)}
                    </span>
                    <span
                      className={cn(
                        "text-sm leading-tight tabular-nums min-[420px]:text-base",
                        held && phase === "under_a_minute" ? "font-bold" : held ? "font-medium" : "text-muted-foreground",
                      )}
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
                    className="absolute top-full right-0 z-20 mt-1 flex w-64 flex-col overflow-hidden rounded-md border bg-background py-1 shadow-sm"
                  >
                    <p role="none" className="px-4 pt-1 pb-2 text-sm text-pretty text-muted-foreground min-[420px]:text-base" data-testid="hold-menu-status">
                      {held ? `Held for you, ${formatCountdown(remaining)} left.` : lost?.canHoldAgain ? "Your hold ran out. It's still free." : "Your hold ran out."}
                    </p>
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
          {isScreen(view) ? <Progress screen={view} draft={draft} visited={visited} /> : <div className="h-2" aria-hidden="true" />}
          <p className="sr-only" aria-live="polite">
            {held && phase === "under_a_minute" ? phaseAnnouncement(phase) : ""}
          </p>
        </header>

        {/* ------------------------------------------------ the screen */}
        <div
          ref={bodyRef}
          // While Book saves and books, nothing on it can change, so what
          // is booked is what was on screen at the tap.
          inert={busy && view === "book"}
          className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain"
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
              {view === "times" && !heldAt && !isMove && ruledOut ? (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1" data-testid="times-ruled-out">
                  <p className="text-sm text-pretty min-[420px]:text-base">Their answers rule booking out for now.</p>
                  <Button type="button" variant="outline" size="sm" onClick={() => void keepAsLead()} data-testid="keep-as-lead-times">
                    Keep as a lead instead
                  </Button>
                </div>
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
            {view === "times" && !context ? (
              contextFailed ? (
                <div className="flex flex-col items-start gap-3" data-testid="times-failed">
                  <p className="text-base text-pretty">The times didn&apos;t load. Check your signal and try again.</p>
                  <Button type="button" variant="outline" onClick={retryContext}>
                    Try again
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Loading the times.</p>
              )
            ) : null}
            {view === "existing" ? <ExistingScreen leads={existing ?? []} loading={existing === null} onPick={(id) => void pickExisting(id)} /> : null}
            {view === "who" ? (
              <WhoScreen
                draft={draft}
                onChange={change}
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
                onKeepAsLead={() => void keepAsLead()}
              />
            ) : null}
            {view === "learned" ? (
              <QuestionsScreen
                screen="learned"
                questions={LEARNED_QUESTIONS}
                draft={draft}
                onAnswer={answer}
                onMarkRest={() => setDraft((current) => markScreenNotCollected("learned", current))}
                onKeepAsLead={() => void keepAsLead()}
                onChange={change}
              />
            ) : null}
            {view === "address" || (!settled && (addressWorking || addressFailedAway)) ? (
              <div hidden={view !== "address"} data-testid="sheet-address-step">
                <AddressScreen
                  draft={draft}
                  formRef={addressFormRef}
                  apiKey={mapsKey}
                  duplicates={duplicates}
                  onChange={change}
                  onEdited={setAddressLive}
                  // Every change goes straight into the draft, so the counter,
                  // Book's list and a later save always see the address as
                  // it is, even when it lands after the setter moved on.
                  onValue={(value) =>
                    setDraft((current) => ({
                      ...current,
                      address_line: value.addressLine,
                      city: value.city || "Calgary",
                      postal_code: value.postalCode,
                      neighbourhood: pickedRef.current?.neighbourhood ?? current.neighbourhood,
                      lat: value.lat,
                      lng: value.lng,
                      place_id: value.placeId,
                      position_source: value.positionSource,
                      position_accuracy_m: value.accuracy,
                    }))
                  }
                  onWorking={setAddressWorking}
                  onLocateFailed={(title) => {
                    if (viewNow.current === "address") return;
                    setAddressFailedAway(true);
                    setError({ text: `Where you're standing wasn't found. ${title}`, fix: "address" });
                  }}
                  onPicked={(picked) => {
                    pickedRef.current = picked;
                    setError(null);
                    if (picked) findLeadsAtPlace(picked.placeId, draft.leadId).then(setDuplicates, () => setDuplicates([]));
                    else setDuplicates([]);
                  }}
                />
              </div>
            ) : null}
            {view === "house" ? (
              <PhotosScreen
                draft={draft}
                userId={userId}
                photos={photos}
                onChange={change}
                onBusyChange={setPhotosBusy}
                skipOpen={skipOpen}
                onSkipOpen={() => setSkipOpen(true)}
                local={viewingAs}
              />
            ) : null}
            {view === "book" ? (
              <BookScreen
                draft={draft}
                name={personName}
                warnings={warnings}
                onFix={fixFromBook}
                onKeepAsLead={() => void keepAsLead()}
              />
            ) : null}
            {view === "done" && done ? (
              <p className="text-base text-pretty" data-testid="sheet-done">
                {personName}
                {draft.address_line ? `, ${draft.address_line}` : ""}. It shows on Schedule and on their lead.
              </p>
            ) : null}
            {view === "moved" ? <p className="text-base">{name} is moved. The old time is free again.</p> : null}
          </div>
        </div>

        {/* ------------------------------------------------ bottom: always there, Next at the bottom right */}
        <footer className="border-t bg-background pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-2 px-4 py-2">
            {view === "book" ? (
              <div inert={busy} className="contents">
                <BookPhone draft={draft} onChange={change} onAnswer={answer} />
              </div>
            ) : null}
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
                      Change time
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
              backToBook={fromBook}
              held={held}
              stepBack={stepBack}
              canBook={problems.length === 0 && held}
              bookLabel={heldAt ? bookButtonLabel(heldAt) : "Book"}
              onBack={back}
              onLetGo={() => (held ? setLetGoOpen(true) : void letGo())}
              onNext={() => (need && isScreen(view) ? showMissing(view, view === "address" ? readAddressForm(draft) : draft) : void advance())}
              onMove={() => void confirmMove()}
              onClose={() => {
                if (!done) keepDraft(currentDraft(), draftScreen);
                finishClose();
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
        {context !== null ? (
          <NoteText text={note ?? ""} />
        ) : contextFailed ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-base text-pretty">The note didn&apos;t load. Check your signal and try again.</p>
            <Button type="button" variant="outline" onClick={retryContext}>
              Try again
            </Button>
          </div>
        ) : (
          <p className="text-base text-muted-foreground">One moment.</p>
        )}
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
                  ? `${personName} stays saved as a lead, and what you entered stays in Unfinished on Session. Anyone can then pick this time.`
                  : "What you entered stays in Unfinished on Session for 24 hours. Anyone can then pick this time."}
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
      className="flex min-h-12 w-full items-center px-4 text-left text-base font-semibold outline-none hover:bg-muted focus-visible:bg-muted min-[420px]:min-h-14 min-[420px]:text-lg"
    >
      {children}
    </button>
  );
}

// The steps as one bar of segments, grouped by part of the visit, with
// "Step 3 of 6, 7 to answer" beside it (the same count as Book's button). Round 3: a step the setter has been
// on and left with something missing carries a small marker under its
// segment. It never blocks: Book lists what's missing.
function Progress({ screen, draft, visited }: { screen: SheetScreen; draft: SheetDraft; visited: SheetScreen[] }) {
  const { number, total, left } = stepCount(screen, draft);
  const firstOfPart = new Set(STEPS.slice(1).map((part) => part.screens[0]));
  const current = SCREENS.indexOf(screen);
  const marked = SCREENS.filter(
    (item, index) => item !== screen && item !== "book" && (visited.includes(item) || index < current) && screenMissing(item, draft).length > 0,
  );
  return (
    <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 pb-2">
      <ol className="flex flex-1 items-start gap-1" aria-hidden="true" data-testid="sheet-progress">
        {SCREENS.map((item, index) => (
          <li key={item} className={cn("flex flex-1 flex-col items-center gap-1", firstOfPart.has(item) && "ml-2")} data-step={item} data-missing={marked.includes(item) ? "yes" : undefined}>
            <span className={cn("h-1.5 w-full rounded-full", index < number ? "bg-foreground" : "bg-input")} />
            <span className={cn("size-1.5 rounded-full", marked.includes(item) ? "bg-foreground" : "bg-transparent")} />
          </li>
        ))}
      </ol>
      <p className="shrink-0 text-sm font-semibold tabular-nums min-[420px]:text-base" data-testid="sheet-step-count">
        Step {number} of {total}
        {left > 0 ? <span className="font-normal text-muted-foreground">, {left} to answer</span> : null}
      </p>
      {marked.length > 0 ? (
        <span className="sr-only">
          {marked.length === 1 ? "One step you've passed still needs something." : `${marked.length} steps you've passed still need something.`} Book lists it.
        </span>
      ) : null}
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
  backToBook,
  held,
  stepBack,
  canBook,
  bookLabel,
  onBack,
  onLetGo,
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
  // Opened from Book's list: Next goes back to Book (round 3).
  backToBook: boolean;
  // Whether the time is still held: once it runs out, Hold it again is the
  // one gold button, and Next steps back.
  held: boolean;
  // An answer rules booking out: Keep as a lead is the gold button on the
  // screen, so Next steps back to an outline. It still works.
  stepBack: boolean;
  canBook: boolean;
  bookLabel: string;
  onBack: () => void;
  // The first step has nothing to go back to: its corner lets the time go,
  // asking first, the same as the time menu's Let go.
  onLetGo: () => void;
  onNext: () => void;
  onMove: () => void;
  onClose: () => void;
  onOpenLead: () => void;
}) {
  if (view === "done" || view === "moved") {
    return (
      <div className="grid grid-cols-2 gap-3 py-1">
        <Button type="button" variant="outline" size="lg" className="min-[420px]:h-14 min-[420px]:text-lg" onClick={onOpenLead}>
          Open the lead
        </Button>
        <Button type="button" size="lg" className="min-[420px]:h-14 min-[420px]:text-lg" onClick={onClose}>
          Done
        </Button>
      </div>
    );
  }
  if (view === "loading" || view === "not-bookable" || ((view === "times" || view === "existing") && !hasTime)) {
    return (
      <div className="grid grid-cols-2 gap-3 py-1">
        <Button type="button" variant="outline" size="lg" className="min-[420px]:h-14 min-[420px]:text-lg" onClick={onClose}>
          Close
        </Button>
        <span />
      </div>
    );
  }
  if (view === "times" || view === "existing") {
    return (
      <div className="grid grid-cols-2 gap-3 py-1">
        <Button type="button" variant="outline" size="lg" className="min-[420px]:h-14 min-[420px]:text-lg" onClick={onBack} disabled={busy}>
          Back
        </Button>
        <span />
      </div>
    );
  }
  if (view === "move-confirm") {
    return (
      <div className="grid grid-cols-2 gap-3 py-1">
        <Button type="button" variant="outline" size="lg" className="min-[420px]:h-14 min-[420px]:text-lg" onClick={onBack} disabled={busy}>
          Back
        </Button>
        <Button type="button" size="lg" className="min-[420px]:h-14 min-[420px]:text-lg" onClick={onMove} disabled={busy || !held}>
          {busy ? "Moving" : "Move"}
        </Button>
      </div>
    );
  }
  const first = view === "who";
  const booking = view === "book";
  // Not ready, on any step Book included: dashed, and a tap goes to what's
  // missing. Book on a time that isn't held can't be tapped at all.
  const notHeldBook = booking && !need && !canBook;
  const quiet = Boolean(need) || !held || stepBack;
  return (
    <div className="grid grid-cols-2 gap-3 py-1">
      {first ? (
        <Button type="button" variant="outline" size="lg" className="min-[420px]:h-14 min-[420px]:text-lg" onClick={onLetGo} disabled={busy} data-testid="sheet-let-go-first">
          Let go
        </Button>
      ) : (
        <Button type="button" variant="outline" size="lg" className="min-[420px]:h-14 min-[420px]:text-lg" onClick={onBack} disabled={busy}>
          Back
        </Button>
      )}
      <Button
        type="button"
        size="lg"
        variant={quiet ? "outline" : "default"}
        className={cn("min-[420px]:h-14 min-[420px]:text-lg", need && "border-dashed px-3 text-sm min-[420px]:text-base")}
        onClick={onNext}
        disabled={busy || notHeldBook}
        data-testid="sheet-next"
        data-ready={need ? "no" : "yes"}
        data-step-back={stepBack ? "yes" : "no"}
      >
        {saving ? (booking ? "Booking" : "Saving") : uploading ? "Uploading photos" : need ?? (booking ? (canBook ? bookLabel : "Time not held") : backToBook ? "Back to Book" : "Next")}
      </Button>
    </div>
  );
}
