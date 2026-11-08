import Link from "next/link";
import { ConfirmedTick } from "@/components/meetings/confirmed-tick";
import { PrepLine, type PrepGlance } from "@/components/meetings/prep-line";
import { BookingActions } from "@/components/schedule/booking-actions";
import { OutcomeForm } from "@/components/schedule/outcome-form";
import { formatKm, navigateUrl } from "@/lib/schedule/distance";
import {
  formatMeetingTime,
  hasOutcome,
  isLive,
  MEETING_STATUS_LABELS,
  PHOTO_SKIP_LABELS,
  positionSourceText,
  sentence,
  timePhrase,
} from "@/lib/schedule/meetings";
import type { MeetingWithLead } from "@/lib/schedule/queries";
import { readLine } from "@/lib/leads/extras";
import { completenessLabel } from "@/lib/leads/questions";
import { leadName } from "@/lib/leads/status";
import { formatPhone } from "@/lib/phone";
import { formatDateTime, formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";

const SLOT_LABELS: Record<string, string> = {
  front: "Front",
  left_corner: "Left corner",
  right_corner: "Right corner",
  soffit: "Soffit close-up",
};

// One meeting, as Tonight, Schedule, My bookings and the lead page show it.
// What it offers depends on who is looking: Move and Cancel for the lead's
// setter until it starts (and for Keenan), the outcome for Keenan once it
// has started. Moved and cancelled bookings stay listed, muted.
export function MeetingCard({
  meeting,
  names,
  now,
  canChange,
  isOwner,
  reasons,
  photos = [],
  legKm = null,
  previousTime = null,
  showLead = true,
  showDetails = false,
  showDay = false,
  viewerId = null,
  prep = null,
  compact = false,
  next = false,
}: {
  meeting: MeetingWithLead;
  names: Map<string, string>;
  now: number;
  canChange: boolean;
  isOwner: boolean;
  reasons: string[];
  photos?: { slot: string; url: string }[];
  legKm?: number | null;
  previousTime?: string | null;
  showLead?: boolean;
  showDetails?: boolean;
  // A list that spans several evenings (My bookings) names the day too.
  showDay?: boolean;
  // Who is looking: their own lead or booking says "you".
  viewerId?: string | null;
  // Keenan's Home (2026-11-05; round 7): Ready, or what the meeting still
  // needs, as on the Meetings page. Owner only.
  prep?: PrepGlance | null;
  // Keenan's Home (2026-11-05): a glance, not a workbench. Meeting mode,
  // Navigate and Call; the prep flags on one line; no map position, notes,
  // photos, Move or Cancel (those are on Schedule, Meetings and the lead).
  compact?: boolean;
  // Keenan's Home: his next meeting that hasn't started. Only it says Next
  // and only its Meeting mode is gold, so one gold thing leads the evening.
  next?: boolean;
}) {
  const lead = meeting.lead;
  const started = new Date(meeting.starts_at).getTime() <= now;
  const live = isLive(meeting.status);
  const changed = meeting.status === "moved" || meeting.status === "cancelled";
  const who = (id: string | null) => (id ? (names.get(id) ?? "someone") : "someone");
  const whose = (id: string | null) => (id && id === viewerId ? "Your" : `${who(id)}'s`);
  const by = (id: string | null) => (id && id === viewerId ? "you" : who(id));
  const position = positionSourceText(lead.position_source, lead.position_accuracy_m);

  return (
    <article
      id={`meeting-${meeting.id}`}
      className={cn("flex flex-col gap-3 rounded-md border p-4", changed && "bg-muted/40 text-muted-foreground")}
      data-testid="meeting-card"
      data-meeting={meeting.id}
      data-status={meeting.status}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="flex flex-wrap items-baseline gap-x-3">
          <span className={cn("font-bold tabular-nums", compact ? "text-lg" : "text-xl")}>
            {showDay ? timePhrase(meeting.starts_at) : showLead ? formatTime(meeting.starts_at) : formatMeetingTime(meeting.starts_at)}
          </span>
          {/* Round 7: Keenan's own tick for a time he confirmed with them. */}
          {isOwner && live && meeting.confirmed_at ? <ConfirmedTick /> : null}
        </p>
        {compact && (live || hasOutcome(meeting.status)) ? (
          next ? (
            <p className="text-sm font-semibold" data-testid="next-meeting">
              Next
            </p>
          ) : null
        ) : (
          <p className="text-sm font-semibold">{MEETING_STATUS_LABELS[meeting.status]}</p>
        )}
      </div>

      {showLead ? (
        <div className="flex flex-col gap-1">
          <Link
            href={`/app/leads/${lead.id}`}
            className="inline-flex min-h-11 w-fit items-center text-base font-semibold underline underline-offset-4"
          >
            {leadName(lead)}
          </Link>
          <p className="text-sm">
            {lead.address_line}
            {lead.neighbourhood ? `, ${lead.neighbourhood}` : ""}
          </p>
          <p className="text-sm text-muted-foreground">
            {meeting.setter_id === meeting.booked_by
              ? `${whose(meeting.setter_id)} lead`
              : `${whose(meeting.setter_id)} lead, booked by ${by(meeting.booked_by)}`}
            <span aria-hidden="true"> · </span>
            <span className="whitespace-nowrap" data-testid="completeness">
              {completenessLabel(lead)}
            </span>
          </p>
          {prep && readLine(lead) ? (
            // Keenan's Home (round 3): the setter's read and hot buttons, so
            // he knows before he walks in.
            <p className="text-sm font-semibold text-pretty" data-testid="setter-read-line">
              {readLine(lead)}
            </p>
          ) : null}
        </div>
      ) : null}

      {legKm !== null && previousTime ? (
        <p className="text-sm text-pretty">
          {formatKm(legKm).replace(/^under/, "Under")} in a straight line from the{" "}
          <span className="whitespace-nowrap">{formatTime(previousTime)} meeting</span>
        </p>
      ) : null}

      {prep && !changed && !started ? <PrepLine leadId={lead.id} prep={prep} compact={compact} /> : null}

      {showDetails && !changed && compact && !started ? (
        // Before the slot only: after it starts, the drive and the call are
        // done. The next meeting's gold goes to Navigate on a phone (the
        // drive is the next thing) and to Meeting mode on an iPad.
        <div className="flex flex-wrap gap-2">
          {isOwner ? (
            <a
              href={`/meeting/${lead.id}#start`}
              className={cn("inline-flex min-h-11 items-center rounded-md border px-4 text-sm font-semibold", next && "md:border-primary")}
            >
              Meeting mode
            </a>
          ) : null}
          <a
            href={navigateUrl(lead)}
            target="_blank"
            rel="noopener noreferrer"
            className={cn("inline-flex min-h-11 items-center rounded-md border px-4 text-sm font-semibold", next && "max-md:border-primary")}
          >
            Navigate
          </a>
          {lead.phone ? (
            <a
              href={`tel:${lead.phone}`}
              className="inline-flex min-h-11 items-center rounded-md border px-4 text-sm font-semibold"
              aria-label={`Call ${formatPhone(lead.phone)}`}
            >
              Call
            </a>
          ) : null}
        </div>
      ) : null}
      {showDetails && !changed && !compact ? (
        <div className="flex flex-wrap gap-2">
          {lead.phone ? (
            <a
              href={`tel:${lead.phone}`}
              className="inline-flex min-h-11 items-center rounded-md border px-4 text-sm font-semibold"
            >
              Call {formatPhone(lead.phone)}
            </a>
          ) : null}
          <a
            href={navigateUrl(lead)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center rounded-md border px-4 text-sm font-semibold"
          >
            Navigate
          </a>
          {isOwner ? (
            // A full page load on purpose: it lets the service worker keep
            // the meeting page for a reload without signal.
            <a
              href={`/meeting/${lead.id}#start`}
              className="inline-flex min-h-11 items-center rounded-md border border-primary px-4 text-sm font-semibold"
            >
              Meeting mode
            </a>
          ) : null}
        </div>
      ) : null}

      {meeting.photos_skipped ? (
        <p className="text-sm font-semibold">
          Photos skipped: {PHOTO_SKIP_LABELS[meeting.photos_skipped] ?? meeting.photos_skipped}
          {meeting.photos_skip_note ? `, "${meeting.photos_skip_note}"` : ""}
        </p>
      ) : null}
      {showDetails && !compact && position ? <p className="text-sm text-muted-foreground">Map position: {position}</p> : null}
      {showDetails && !compact && lead.notes ? <p className="text-sm whitespace-pre-wrap">{lead.notes}</p> : null}

      {showDetails && !compact && photos.length > 0 ? (
        <ul className="grid grid-cols-4 gap-2" aria-label="Photos">
          {photos.map((photo) => (
            <li key={photo.url}>
              <a href={photo.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded border">
                {/* eslint-disable-next-line @next/next/no-img-element -- private photos behind short-lived signed links */}
                <img src={photo.url} alt={`${SLOT_LABELS[photo.slot] ?? "House"} photo`} className="aspect-square w-full object-cover" />
              </a>
            </li>
          ))}
        </ul>
      ) : null}

      {meeting.status === "moved" ? (
        <p className="text-sm">{sentence(`Moved by ${who(meeting.outcome_by)}${meeting.outcome_at ? ` at ${formatDateTime(meeting.outcome_at)}` : ""}`)}</p>
      ) : null}
      {meeting.status === "cancelled" ? (
        <p className="text-sm">
          Cancelled by {who(meeting.outcome_by)}
          {meeting.outcome_at ? ` at ${formatDateTime(meeting.outcome_at)}` : ""}
          {meeting.outcome_note ? `: ${meeting.outcome_note}` : meeting.outcome_at ? "" : "."}
        </p>
      ) : null}
      {meeting.status === "not_qualified" && meeting.outcome_reason ? (
        <p className="text-sm">Reason: {meeting.outcome_reason}</p>
      ) : null}
      {meeting.status === "no_show" && meeting.outcome_note ? <p className="text-sm">Note: {meeting.outcome_note}</p> : null}

      {live && !started && canChange && !compact ? (
        <BookingActions meetingId={meeting.id} leadId={meeting.lead_id} leadName={leadName(lead)} startsAt={meeting.starts_at} />
      ) : null}
      {live && !started && !canChange && !isOwner ? (
        <p className="text-sm text-muted-foreground">Keenan marks how it went after the meeting.</p>
      ) : null}
      {isOwner && meeting.status !== "moved" && (started || hasOutcome(meeting.status)) ? (
        compact ? (
          // Home: one line until he opens it, so an evening of started
          // meetings stays a list, not a stack of forms. Marked: "Qualified.
          // Change". Not marked yet: "How did it go? Mark it".
          <details className="group flex flex-col gap-2" data-testid={hasOutcome(meeting.status) ? "outcome-marked" : "outcome-unmarked"}>
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
              <span className="font-semibold">{hasOutcome(meeting.status) ? `${MEETING_STATUS_LABELS[meeting.status]}.` : "How did it go?"}</span>
              <span className="underline underline-offset-4 group-open:hidden">{hasOutcome(meeting.status) ? "Change" : "Mark it"}</span>
            </summary>
            <OutcomeForm meetingId={meeting.id} current={meeting.status} currentReason={meeting.outcome_reason} reasons={reasons} />
          </details>
        ) : (
          <OutcomeForm
            meetingId={meeting.id}
            current={meeting.status}
            currentReason={meeting.outcome_reason}
            reasons={reasons}
          />
        )
      ) : null}
      {live && started && !isOwner ? (
        <p className="text-sm text-muted-foreground">Started. Keenan marks how it went.</p>
      ) : null}
    </article>
  );
}
