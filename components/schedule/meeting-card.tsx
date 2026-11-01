import Link from "next/link";
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
} from "@/lib/schedule/meetings";
import type { MeetingWithLead } from "@/lib/schedule/queries";
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
}) {
  const lead = meeting.lead;
  const started = new Date(meeting.starts_at).getTime() <= now;
  const live = isLive(meeting.status);
  const changed = meeting.status === "moved" || meeting.status === "cancelled";
  const who = (id: string | null) => (id ? (names.get(id) ?? "someone") : "someone");
  const position = positionSourceText(lead.position_source, lead.position_accuracy_m);

  return (
    <article
      className={cn("flex flex-col gap-3 rounded-md border p-4", changed && "bg-muted/40 text-muted-foreground")}
      data-testid="meeting-card"
      data-meeting={meeting.id}
      data-status={meeting.status}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xl font-bold tabular-nums">{showLead ? formatTime(meeting.starts_at) : formatMeetingTime(meeting.starts_at)}</p>
        <p className="text-sm font-semibold">{MEETING_STATUS_LABELS[meeting.status]}</p>
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
              ? `${who(meeting.setter_id)}'s lead`
              : `${who(meeting.setter_id)}'s lead, booked by ${who(meeting.booked_by)}`}
          </p>
        </div>
      ) : null}

      {legKm !== null && previousTime ? (
        <p className="text-sm">
          {formatKm(legKm)} in a straight line from the {formatTime(previousTime)} meeting
        </p>
      ) : null}

      {showDetails && !changed ? (
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
        </div>
      ) : null}

      {meeting.photos_skipped ? (
        <p className="text-sm font-semibold">
          Photos skipped: {PHOTO_SKIP_LABELS[meeting.photos_skipped] ?? meeting.photos_skipped}
          {meeting.photos_skip_note ? `, "${meeting.photos_skip_note}"` : ""}
        </p>
      ) : null}
      {showDetails && position ? <p className="text-sm text-muted-foreground">Map position: {position}</p> : null}
      {showDetails && lead.notes ? <p className="text-sm whitespace-pre-wrap">{lead.notes}</p> : null}

      {showDetails && photos.length > 0 ? (
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

      {live && !started && canChange ? <BookingActions meetingId={meeting.id} /> : null}
      {live && !started && !canChange && !isOwner ? (
        <p className="text-sm text-muted-foreground">Keenan marks how it went after the meeting.</p>
      ) : null}
      {isOwner && meeting.status !== "moved" && (started || hasOutcome(meeting.status)) ? (
        <OutcomeForm
          meetingId={meeting.id}
          current={meeting.status}
          currentReason={meeting.outcome_reason}
          reasons={reasons}
        />
      ) : null}
      {live && started && !isOwner ? (
        <p className="text-sm text-muted-foreground">Started. Keenan marks how it went.</p>
      ) : null}
    </article>
  );
}
