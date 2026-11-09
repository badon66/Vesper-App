import { photoSlotLabel, type PhotoSlot } from "@/lib/leads/door";
import { formatMeetingTime, MEETING_STATUS_LABELS, type MeetingStatus } from "@/lib/schedule/meetings";
import { STATUS_LABELS, type LeadStatus } from "@/lib/leads/status";
import { choiceLabel } from "@/lib/quote-link/view";
import { cancelWindowWords, isOutcomeReason, plannedInstallLine } from "@/lib/quotes/outcome";
import { formatDay } from "@/lib/time";
import type { Database, Json } from "@/types/database";

export type TimelineEvent = {
  type: Database["public"]["Enums"]["event_type"];
  from_status: LeadStatus | null;
  to_status: LeadStatus | null;
  payload: Json | null;
};

const FIELD_LABELS: Record<string, string> = {
  first_name: "name",
  last_name: "name",
  phone: "phone",
  email: "email",
  address_line: "address",
  city: "city",
  postal_code: "postal code",
  neighbourhood: "neighbourhood",
  lat: "map position",
  lng: "map position",
  place_id: "map position",
  house_type: "house type",
  setter_read: "setter's read",
  hot_buttons: "hot buttons",
  confirm_by: "call or text to confirm",
  est_feet: "estimated feet",
  notes: "notes",
  source: "source",
  assigned_to: "setter",
  follow_up_on: "follow-up day",
  track_colour_id: "track colour",
  track_ral_code: "track colour",
  // The soffit's own code from the RAL colour book (2026-11-09).
  soffit_ral_code: "soffit colour code",
  soffit_ral_code_2: "second soffit colour code",
};

// The Find out questions, named the way the form asks them.
const FIND_OUT_LABELS: Record<string, string> = {
  owns_home: "owns the home",
  wants_price: "wants a price",
  soffit_colour: "soffit colour",
  soffit_note: "soffit colour",
  // Round 6: a split soffit's second colour.
  soffit_colour_2: "second soffit colour",
  christmas_lights_now: "Christmas lights now",
  looked_into_before: "looked into it before",
  areas_wanted: "which areas",
  install_timing: "timing",
  // Round 2: the question asked at the door, and the questions marked Not
  // collected (which change with the answers).
  both_decision_makers: "everyone who decides",
  not_collected: "what wasn't collected",
};

const PHOTO_SLOT_VALUES: readonly string[] = ["front", "left_corner", "right_corner", "soffit", "soffit_book", "soffit_book_2"];

function payloadObject(payload: Json | null): { [key: string]: Json | undefined } {
  return payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

// Times end in "p.m.", so a sentence ending in one needs no extra full stop.
const sentence = (text: string) => (text.endsWith(".") ? text : `${text}.`);

const instantOf = (value: Json | undefined): string | null =>
  typeof value === "string" && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : null;

// One plain sentence per timeline entry. Notes are returned as written.
export function describeEvent(event: TimelineEvent): string {
  const payload = payloadObject(event.payload);
  // Read as text: round 8's quote_cancelled and quote_acceptance_undone are
  // matched by name, whether or not the generated types have caught up.
  const type: string = event.type;
  switch (type) {
    case "created":
      return "Added the lead.";
    case "status_change": {
      const from = event.from_status ? STATUS_LABELS[event.from_status] : "no status";
      const to = event.to_status ? STATUS_LABELS[event.to_status] : "no status";
      const reason =
        typeof payload.reason === "string" && payload.reason ? ` Reason: ${payload.reason}.` : "";
      const followUp =
        typeof payload.follow_up_on === "string" && /^\d{4}-\d{2}-\d{2}$/.test(payload.follow_up_on)
          ? ` Follow up on ${formatDay(payload.follow_up_on)}.`
          : "";
      return `Moved from ${from} to ${to}.${reason}${followUp}`;
    }
    case "note":
      return typeof payload.text === "string" ? payload.text : "Added a note.";
    case "photo_added": {
      if (payload.slot === "mockup") return "Added the mockup.";
      const slot = typeof payload.slot === "string" && PHOTO_SLOT_VALUES.includes(payload.slot)
        ? (payload.slot as PhotoSlot)
        : null;
      return slot ? `Added the ${photoSlotLabel(slot).toLowerCase()} photo.` : "Added a photo.";
    }
    // Meeting mode (M5). Neither event ever carries a dollar amount.
    case "quote_created":
      return "Drafted a quote.";
    case "colour_confirmed": {
      const colour = typeof payload.colour === "string" && payload.colour ? payload.colour : null;
      const initials = typeof payload.initials === "string" && payload.initials ? payload.initials : null;
      if (colour && initials) return `The customer confirmed ${colour} track with their initials, ${initials}.`;
      return initials ? `The customer confirmed the track colour with their initials, ${initials}.` : "The customer confirmed the track colour.";
    }
    // The customer quote link (2026-11-02). The option is in words; no
    // timeline entry ever carries a price.
    case "quote_link_created":
      return "Made the quote link for the customer.";
    case "quote_link_opened":
      return "Opened the quote link.";
    case "quote_link_revoked":
      return "Turned off the quote link.";
    case "install_requested": {
      const option = typeof payload.option === "string" && payload.option ? payload.option : null;
      return option ? `Tapped Book my install: ${sentence(choiceLabel(option))}` : "Tapped Book my install.";
    }
    // A quote's outcome (round 8). Setters read these, so the payload holds
    // the quote id and fixed-list facts only: a reason from the list,
    // inside the 10-day window or not, the planned install day. Never an
    // amount, never a typed note; anything else in a payload is ignored.
    case "quote_accepted": {
      const planned = plannedInstallLine(typeof payload.install_on === "string" ? payload.install_on : null);
      return planned ? `Marked the quote accepted. ${planned}` : "Marked the quote accepted.";
    }
    case "quote_declined":
      return isOutcomeReason(payload.reason) ? `Marked the quote declined: ${payload.reason}.` : "Marked the quote declined.";
    case "quote_cancelled": {
      const when = typeof payload.inside_window === "boolean" ? `, ${cancelWindowWords(payload.inside_window)}` : "";
      if (isOutcomeReason(payload.reason)) return `Cancelled the sale: ${payload.reason}${when}.`;
      return when ? `Cancelled the sale${when}.` : "Cancelled the sale.";
    }
    case "quote_acceptance_undone":
      return "Undid the quote's acceptance.";
    case "edited": {
      const fields = Array.isArray(payload.fields)
        ? payload.fields.filter((field): field is string => typeof field === "string")
        : [];
      const unique = (labels: string[]) => Array.from(new Set(labels));
      const changed = unique(
        fields
          .filter((field) => !Object.hasOwn(FIND_OUT_LABELS, field))
          .map((field) => FIELD_LABELS[field] ?? field.replace(/_/g, " ")),
      );
      const answered = unique(
        fields.filter((field) => Object.hasOwn(FIND_OUT_LABELS, field)).map((field) => FIND_OUT_LABELS[field]),
      );
      const sentences = [
        changed.length > 0 ? `Changed the ${joinList(changed)}.` : null,
        answered.length > 0 ? `Updated Find out: ${joinList(answered)}.` : null,
      ].filter(Boolean);
      return sentences.length > 0 ? sentences.join(" ") : "Edited the lead.";
    }
    case "meeting_booked": {
      const at = instantOf(payload.starts_at);
      return at ? sentence(`Booked a meeting for ${formatMeetingTime(at)}`) : "Booked a meeting.";
    }
    case "meeting_moved": {
      const from = instantOf(payload.from_starts_at);
      const to = instantOf(payload.starts_at);
      return from && to ? sentence(`Moved the meeting from ${formatMeetingTime(from)} to ${formatMeetingTime(to)}`) : "Moved the meeting.";
    }
    case "meeting_cancelled": {
      const at = instantOf(payload.starts_at);
      return at ? `${sentence(`Cancelled the meeting on ${formatMeetingTime(at)}`)} Follow up tomorrow.` : "Cancelled the meeting.";
    }
    case "meeting_outcome": {
      const outcome = typeof payload.outcome === "string" && payload.outcome in MEETING_STATUS_LABELS
        ? MEETING_STATUS_LABELS[payload.outcome as MeetingStatus]
        : null;
      const reason = typeof payload.reason === "string" && payload.reason ? `: ${payload.reason}` : "";
      return outcome ? `Marked the meeting ${outcome}${reason}.` : "Marked the meeting.";
    }
    default: {
      const words = type.replace(/_/g, " ");
      return `${words.charAt(0).toUpperCase()}${words.slice(1)}.`;
    }
  }
}

// Events the customer makes on their quote link, with no member behind
// them: the timeline names the customer instead of "Vesper".
export function isCustomerEvent(type: TimelineEvent["type"]): boolean {
  return type === "quote_link_opened" || type === "install_requested";
}
