import { formatMoney } from "@/lib/pricing";
import { errorCode, type DbError } from "@/lib/schedule/messages";
import { calgaryDateOf, formatDay } from "@/lib/time";
import { VIEW_AS_READ_ONLY } from "@/lib/view-as";
import type { Database } from "@/types/database";

// A quote's outcome (Keenan, 2026-11-09, round 8), Keenan only, on the lead
// page: Accepted, Declined, Cancelled (a yes taken back later) and
// Installed. Only the database moves a quote to accepted, declined or
// cancelled (public.quote_accept, quote_decline, quote_cancel,
// quote_undo_acceptance and lead_mark_installed); this file holds the words
// around them, shared by the outcome card and the timeline.

// ---------------------------------------------------------------- reasons

// Why a customer said no, or took a yes back: one fixed list, stored as
// these words (quotes.decline_reason, quotes.cancel_reason, and the lead's
// lost_reason). The database checks the same five.
export const OUTCOME_REASONS = ["price", "timing", "partner said no", "went with someone else", "other"] as const;
export type OutcomeReason = (typeof OUTCOME_REASONS)[number];

// The one-tap chips, in the list's order.
export const OUTCOME_REASON_OPTIONS: readonly { value: OutcomeReason; label: string }[] = [
  { value: "price", label: "Price" },
  { value: "timing", label: "Timing" },
  { value: "partner said no", label: "Partner said no" },
  { value: "went with someone else", label: "Went with someone else" },
  { value: "other", label: "Other" },
];

export function isOutcomeReason(value: unknown): value is OutcomeReason {
  return typeof value === "string" && (OUTCOME_REASONS as readonly string[]).includes(value);
}

export function reasonLabel(reason: OutcomeReason): string {
  return OUTCOME_REASON_OPTIONS.find((option) => option.value === reason)?.label ?? reason;
}

// The note goes with Other only, and only on the quote (quotes.outcome_note,
// owner only like every quote column): never in the lead's lost_reason, an
// event or a commission note, because setters read those.
export const OUTCOME_NOTE_MAX = 300;

export type OutcomeNote = { ok: true; note: string | null } | { ok: false; code: "bad_note"; message: string };

export function cleanOutcomeNote(reason: OutcomeReason, note: string | null | undefined): OutcomeNote {
  const text = (note ?? "").trim();
  if (text === "") return { ok: true, note: null };
  if (reason !== "other") return { ok: false, code: "bad_note", message: OUTCOME_MESSAGES.bad_note };
  // Counted in characters, as Postgres counts them.
  if ([...text].length > OUTCOME_NOTE_MAX) return { ok: false, code: "bad_note", message: OUTCOME_MESSAGES.bad_note };
  return { ok: true, note: text };
}

// The lead's lost_reason, which every setter reads and the Leads card shows
// as "Lost: <reason>": the reason's words for a decline ("Lost: price"),
// and "cancelled, <reason>" for a yes taken back ("Lost: cancelled,
// timing"). Never the note.
export function lostReasonFor(kind: "declined" | "cancelled", reason: OutcomeReason): string {
  return kind === "cancelled" ? `cancelled, ${reason}` : reason;
}

// ---------------------------------------------------------- 10-day window

// A cancel inside 10 days of the acceptance, or after. Nothing stores it:
// the Cancel sheet and the timeline work it out from accepted_at, the same
// way the database does (accepted_at > now() - interval '10 days').
export const CANCEL_WINDOW_DAYS = 10;
const WINDOW_MS = CANCEL_WINDOW_DAYS * 24 * 60 * 60 * 1000;

const msOf = (moment: string | number | Date) =>
  moment instanceof Date ? moment.getTime() : typeof moment === "number" ? moment : Date.parse(moment);

export function insideCancelWindow(acceptedAt: string, now: string | number | Date = Date.now()): boolean {
  const accepted = Date.parse(acceptedAt);
  const at = msOf(now);
  if (Number.isNaN(accepted) || Number.isNaN(at)) return false;
  return accepted > at - WINDOW_MS;
}

// When the window closes, as an ISO moment.
export function cancelWindowEndsAt(acceptedAt: string): string | null {
  const accepted = Date.parse(acceptedAt);
  return Number.isNaN(accepted) ? null : new Date(accepted + WINDOW_MS).toISOString();
}

export function cancelWindowWords(inside: boolean): string {
  return inside ? `inside the ${CANCEL_WINDOW_DAYS}-day window` : `after the ${CANCEL_WINDOW_DAYS}-day window`;
}

// ---------------------------------------------------------------- display

// Every status a quote can have. "cancelled" is new in round 8; it is
// spelled out here so this compiles before and after the types catch up.
export type QuoteStatus = Database["public"]["Enums"]["quote_status"] | "cancelled";

export const QUOTE_STATUS_WORDS: Record<QuoteStatus, string> = {
  draft: "Draft",
  presented: "Presented",
  accepted: "Accepted",
  declined: "Declined",
  cancelled: "Cancelled",
  expired: "Expired",
};

// Where the card is: no answer yet, a yes (Sold), a yes installed, a no, or
// a yes taken back.
export type OutcomeState = "open" | "accepted" | "installed" | "declined" | "cancelled";

export function outcomeState(quoteStatus: QuoteStatus, leadStatus: string): OutcomeState {
  switch (quoteStatus) {
    case "accepted":
      return leadStatus === "installed" ? "installed" : "accepted";
    case "declined":
      return "declined";
    case "cancelled":
      return "cancelled";
    default:
      return "open";
  }
}

// Whether each action is offered in a state (the database checks again).
// Accept works from no answer yet, a no or a cancel (a customer who comes
// back); Undo while Sold, never after Installed.
export function outcomeActions(state: OutcomeState): {
  accept: boolean;
  decline: boolean;
  installed: boolean;
  cancel: boolean;
  undo: boolean;
} {
  return {
    accept: state === "open" || state === "declined" || state === "cancelled",
    decline: state === "open",
    installed: state === "accepted",
    cancel: state === "accepted",
    undo: state === "accepted",
  };
}

// "Nov 9": a short day for the card. A YYYY-MM-DD day is taken as is; a
// moment is read as its day in Calgary.
const monthDay = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", month: "short", day: "numeric" });

export function shortDay(dayOrMoment: string): string {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(dayOrMoment) ? dayOrMoment : calgaryDateOf(dayOrMoment);
  return monthDay.format(new Date(`${day}T12:00:00Z`));
}

export type OutcomeQuote = {
  status: QuoteStatus;
  accepted_at: string | null;
  declined_at: string | null;
  cancelled_at: string | null;
  decline_reason: string | null;
  cancel_reason: string | null;
};

export type OutcomeLead = { status: string; installed_at: string | null };

// The card's headline and the reason in words: "Accepted Nov 9",
// "Installed Nov 20", "Declined Nov 9" with "Price", "Cancelled Nov 12"
// with "Timing". Null while the quote has no answer yet.
export function outcomeTitle(quote: OutcomeQuote, lead: OutcomeLead): { title: string; reason: string | null } | null {
  const dated = (word: string, at: string | null) => (at ? `${word} ${shortDay(at)}` : word);
  const reason = (value: string | null) => (isOutcomeReason(value) ? reasonLabel(value) : null);
  switch (outcomeState(quote.status, lead.status)) {
    case "installed":
      return { title: dated("Installed", lead.installed_at), reason: null };
    case "accepted":
      return { title: dated("Accepted", quote.accepted_at), reason: null };
    case "declined":
      return { title: dated("Declined", quote.declined_at), reason: reason(quote.decline_reason) };
    case "cancelled":
      return { title: dated("Cancelled", quote.cancelled_at), reason: reason(quote.cancel_reason) };
    default:
      return null;
  }
}

// "Install planned for Fri, Nov 20." The planned day lives on the lead
// (leads.install_on); a lead with none says nothing.
export function plannedInstallLine(installOn: string | null | undefined): string | null {
  return installOn && /^\d{4}-\d{2}-\d{2}$/.test(installOn) ? `Install planned for ${formatDay(installOn)}.` : null;
}

// --------------------------------------------------------------- commission

// The commission line on Keenan's card (his screen may show the amount):
// before accepting, the preview; after, the earning and where it stands.
export type CommissionLine =
  | { kind: "none"; reason: "owner_lead" | "already_paid" | null }
  | {
      kind: "earning";
      amount: number;
      setterName: string;
      status: "pending" | "paid" | "void";
      payableAt: string | null;
      paidAt: string | null;
    };

export function commissionLine(line: CommissionLine): string {
  if (line.kind === "none") {
    if (line.reason === "owner_lead") return "No commission: the lead is yours.";
    if (line.reason === "already_paid") return "No new commission: one on this lead is already paid.";
    return "No commission on this sale.";
  }
  const lead = `${formatMoney(line.amount)} to ${line.setterName}`;
  if (line.status === "paid") return line.paidAt ? `${lead}, paid ${shortDay(line.paidAt)}.` : `${lead}, paid.`;
  if (line.status === "void") return `${lead}, voided.`;
  return line.payableAt ? `${lead}, owed now. Mark it paid in Pay.` : `${lead}, coming once installed.`;
}

// What quote_accept returns: the commission it made, for Keenan's own
// screen, or why it made none.
export type AcceptResult = {
  commission: { profileId: string; amount: number } | null;
  reason: "owner_lead" | "already_paid" | null;
};

export function parseAcceptResult(value: unknown): AcceptResult {
  const row = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const made = row.commission && typeof row.commission === "object" ? (row.commission as Record<string, unknown>) : null;
  const amount = made ? Number(made.amount) : Number.NaN;
  const commission =
    made && typeof made.profile_id === "string" && Number.isFinite(amount) ? { profileId: made.profile_id, amount } : null;
  const reason = row.reason === "owner_lead" || row.reason === "already_paid" ? row.reason : null;
  return { commission, reason };
}

// ---------------------------------------------------------------- messages

// Plain words for what the outcome functions say. The database puts a
// stable code in each error's hint.
export const OUTCOME_MESSAGES = {
  not_allowed: "Only Keenan can do that.",
  read_only: VIEW_AS_READ_ONLY,
  no_quote: "That quote was not found. Refresh to see the lead as it is now.",
  no_lead: "That lead was not found.",
  // Also what the database says for a quote it can't find.
  not_open: "This quote has changed since the page opened. Refresh to see where it stands.",
  already_accepted: "Another quote on this lead is already accepted. Undo that one first.",
  track_colour_needed: "Set the track colour first. It goes on the accepted quote.",
  bad_runs: "Pick the option they said yes to.",
  bad_reason: "Pick a reason.",
  bad_note: `A note goes with Other only, up to ${OUTCOME_NOTE_MAX} characters.`,
  not_accepted: "Only an accepted quote can be cancelled. Refresh to see it.",
  not_undoable: "Only an accepted quote on a Sold lead can be undone. Refresh to see it.",
  not_sold: "Only a Sold lead with an accepted quote can be marked installed.",
  bad_date: "Pick the install day: today or earlier.",
  outcome_only: "A quote is accepted, declined or cancelled from its outcome card only.",
  quote_locked: "This quote is accepted, so its numbers are locked. Undo the acceptance to change them.",
} as const;

export type OutcomeCode = keyof typeof OUTCOME_MESSAGES;

export const OUTCOME_FALLBACK = "That didn't save. Check your signal and try again.";

// The message for a code (a database hint or an action's own).
export function outcomeMessageFor(code: string | null | undefined): string {
  return code && Object.hasOwn(OUTCOME_MESSAGES, code) ? OUTCOME_MESSAGES[code as OutcomeCode] : OUTCOME_FALLBACK;
}

// An action's failure from a database error: its code and the words to show.
export function outcomeFailure(error: DbError): { ok: false; code: string; message: string } {
  const code = errorCode(error);
  return { ok: false, code, message: outcomeMessageFor(code) };
}
