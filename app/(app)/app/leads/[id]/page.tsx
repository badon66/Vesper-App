import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment } from "react";
import { z } from "zod";
import { LeadPosition } from "@/components/leads/lead-position";
import { NoteForm } from "@/components/leads/note-form";
import { MeetingCard } from "@/components/schedule/meeting-card";
import { PhotoPicker } from "@/components/leads/photo-picker";
import { PhotoSlots } from "@/components/leads/photo-slots";
import { StatusBadge } from "@/components/leads/status-badge";
import { StatusControl } from "@/components/leads/status-control";
import { TrackColourForm } from "@/components/leads/track-colour-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth/profile";
import { findOutAnswerList, type PhotoSlot } from "@/lib/leads/door";
import { lostReasons, namesById } from "@/lib/leads/queries";
import { formatMeetingTime, isLive, positionSourceText, sentence } from "@/lib/schedule/meetings";
import { meetingsForLead } from "@/lib/schedule/queries";
import {
  HOUSE_TYPE_OPTIONS,
  labelFor,
  leadName,
  SOURCE_OPTIONS,
  STATUS_LABELS,
  statusChoices,
} from "@/lib/leads/status";
import {
  leadTrackColour,
  needsPowderCoating,
  sortTrackColours,
  trackColourText,
} from "@/lib/leads/track-colour";
import { describeEvent } from "@/lib/leads/timeline";
import { formatPhone } from "@/lib/phone";
import { PHOTO_BUCKET } from "@/lib/photos";
import { mapsLink } from "@/lib/places";
import { createClient } from "@/lib/supabase/server";
import { followUpSentence } from "@/lib/leads/attention";
import { calgaryToday, formatDate, formatDateTime, requestTime } from "@/lib/time";

export const metadata: Metadata = {
  title: "Lead",
};

export default async function LeadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ photos?: string | string[]; booked?: string; moved?: string }>;
}) {
  const me = await requireProfile();
  const { id } = await params;
  const { photos: photosParam, booked: bookedParam, moved: movedParam } = await searchParams;
  if (!z.uuid().safeParse(id).success) notFound();

  const supabase = await createClient();
  const { data: lead } = await supabase.from("leads").select("*").eq("id", id).maybeSingle();
  if (!lead) notFound();

  const isOwner = me.role === "owner";
  const canEdit = isOwner || lead.created_by === me.id || lead.assigned_to === me.id;
  const [{ data: photoRows }, { data: events }, reasons, sessionResult, { data: colourRows }, meetingRows, { data: outcomeSettings }] = await Promise.all([
    supabase.from("lead_photos").select("id, storage_path, slot").eq("lead_id", id).order("created_at"),
    supabase
      .from("lead_events")
      .select("id, type, from_status, to_status, payload, actor_id, created_at")
      .eq("lead_id", id)
      .order("created_at", { ascending: false })
      .limit(200),
    lostReasons(supabase),
    lead.knock_session_id
      ? supabase.from("knock_sessions").select("neighbourhood").eq("id", lead.knock_session_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("track_colours").select("id, name, ral_code, sort_order, active"),
    meetingsForLead(supabase, id),
    isOwner
      ? supabase.from("settings").select("not_qualified_reasons").eq("id", 1).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const meetings = meetingRows.map((meeting) => ({ ...meeting, lead }));
  const liveMeeting = meetings.find((meeting) => isLive(meeting.status));
  const canBook = canEdit && (lead.status === "new" || lead.status === "follow_up") && !liveMeeting;
  const justBooked = bookedParam ? meetings.find((meeting) => meeting.id === bookedParam) : undefined;

  // Track colour. The owner gets the whole RAL Classic list, to name a
  // custom number as he types it; everyone else only the names shown.
  const colours = sortTrackColours(colourRows ?? []);
  const colourById = new Map(colours.map((colour) => [colour.id, colour]));
  const listColour = lead.track_colour_id ? colourById.get(lead.track_colour_id) : undefined;
  const ralCodes = [lead.track_ral_code, listColour?.ral_code].filter((code): code is string => Boolean(code));
  const ralQuery = supabase.from("ral_classic_colours").select("code, name");
  const { data: ralRows } = isOwner
    ? await ralQuery
    : ralCodes.length > 0
      ? await ralQuery.in("code", ralCodes)
      : { data: [] };
  const ralNames = new Map((ralRows ?? []).map((row) => [row.code, row.name]));
  const trackColour = leadTrackColour(lead, colourById, ralNames);
  const trackOptions = colours
    .filter((colour) => colour.active || colour.id === lead.track_colour_id)
    .map((colour) => ({ value: colour.id, label: colour.active ? colour.name : `${colour.name} (retired)` }));

  const paths = (photoRows ?? []).map((photo) => photo.storage_path);
  const signed =
    paths.length > 0
      ? ((await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 3600)).data ?? [])
      : [];
  const urlByPath = new Map(
    signed.flatMap((item) => (item.path && item.signedUrl ? [[item.path, item.signedUrl] as const] : [])),
  );
  const slotUrls: Partial<Record<PhotoSlot, string>> = {};
  const extraUrls: string[] = [];
  for (const photo of photoRows ?? []) {
    const url = urlByPath.get(photo.storage_path);
    if (!url) continue;
    if (photo.slot) slotUrls[photo.slot] = url;
    else extraUrls.push(url);
  }
  const names = await namesById(supabase, [
    lead.created_by,
    lead.assigned_to,
    ...(events ?? []).map((event) => event.actor_id),
    ...meetings.flatMap((meeting) => [meeting.setter_id, meeting.booked_by, meeting.outcome_by]),
  ]);
  const owner = names.get(lead.created_by) ?? "someone";
  const choices = canEdit ? statusChoices(me.role, lead.status) : [];
  const session = sessionResult.data;
  const today = calgaryToday();
  const followUp = lead.status === "follow_up" && lead.follow_up_on ? lead.follow_up_on : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Link
          href="/app/leads"
          className="inline-flex min-h-11 w-fit items-center gap-1 text-sm font-semibold text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
          Leads
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">{leadName(lead)}</h1>
          <StatusBadge status={lead.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          Added by {owner} on {formatDate(lead.created_at)}
          {session ? `, while knocking in ${session.neighbourhood}` : ""}.
        </p>
        {followUp ? (
          <p className={followUp < today ? "text-sm font-semibold text-destructive" : "text-sm font-semibold"}>
            {followUpSentence(followUp, today)}
          </p>
        ) : null}
        {!canEdit ? (
          <p role="status" className="rounded-md bg-muted px-3 py-2 text-sm">
            Read only. This is {owner}&apos;s lead.
          </p>
        ) : null}
        {justBooked ? (
          <p role="status" className="rounded-md border border-primary px-3 py-2 text-sm font-semibold" data-testid="booked-notice">
            {sentence(`Booked for ${formatMeetingTime(justBooked.starts_at)}`)} Confirm the time with the homeowner before you leave.
          </p>
        ) : null}
        {movedParam === "1" && liveMeeting ? (
          <p role="status" className="rounded-md border border-primary px-3 py-2 text-sm font-semibold">
            {sentence(`Moved to ${formatMeetingTime(liveMeeting.starts_at)}`)}
          </p>
        ) : null}
        {photosParam === "failed" ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            The lead saved, but its photos didn&apos;t attach. Add them again below.
          </p>
        ) : null}
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            {canBook ? (
              <Button asChild className="w-fit">
                <Link href={`/app/schedule/book?lead=${lead.id}`}>Book a meeting</Link>
              </Button>
            ) : null}
            <Button asChild variant="outline" className="w-fit">
              <Link href={`/app/leads/${lead.id}/edit`}>Edit lead</Link>
            </Button>
          </div>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Contact</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          {lead.phone ? (
            <Button asChild size="lg" className="w-full sm:w-fit">
              <a href={`tel:${lead.phone}`}>Call {formatPhone(lead.phone)}</a>
            </Button>
          ) : (
            <p className="text-muted-foreground">No phone yet. Booking a meeting will need one.</p>
          )}
          {lead.email ? (
            <a
              href={`mailto:${lead.email}`}
              className="inline-flex min-h-11 w-fit items-center font-semibold underline underline-offset-4"
            >
              {lead.email}
            </a>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Address</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <p className="text-base font-semibold">{lead.address_line}</p>
          <p className="text-muted-foreground">
            {[lead.neighbourhood, lead.city, lead.postal_code].filter(Boolean).join(", ")}
          </p>
          <a
            href={mapsLink(lead)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 w-fit items-center font-semibold underline underline-offset-4"
          >
            Open in Google Maps
          </a>
          {lead.lat === null ? (
            <p className="text-muted-foreground">
              No map position yet. Booking needs one.
              {canEdit ? " Edit the lead and pick the address from the suggestions to add one." : ""}
            </p>
          ) : (
            <p className="text-muted-foreground" data-testid="position-source">
              Map position: {positionSourceText(lead.position_source, lead.position_accuracy_m)}.
            </p>
          )}
          {lead.lat === null && canEdit ? <LeadPosition leadId={lead.id} /> : null}
        </CardContent>
      </Card>

      <Card data-testid="lead-meetings">
        <CardHeader>
          <CardTitle>Meetings</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {meetings.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No meetings yet.{canBook ? " Book one once Before you book is ready." : ""}
            </p>
          ) : (
            meetings.map((meeting) => (
              <MeetingCard
                key={meeting.id}
                meeting={meeting}
                names={names}
                now={requestTime()}
                canChange={canEdit}
                isOwner={isOwner}
                reasons={outcomeSettings?.not_qualified_reasons ?? []}
                showLead={false}
              />
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Find out</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm" data-testid="find-out-answers">
            {findOutAnswerList(lead).map((item) => (
              <Fragment key={item.field}>
                <dt className="text-muted-foreground">{item.question}</dt>
                <dd className={item.answer ? "font-semibold" : "text-muted-foreground"}>
                  {item.answer ?? "Not answered"}
                </dd>
              </Fragment>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Photos</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <PhotoSlots userId={me.id} mode="attach" leadId={lead.id} saved={slotUrls} canTake={canEdit} />
          {extraUrls.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">More photos</h3>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label="More photos">
                {extraUrls.map((url, index) => (
                  <li key={url} className="overflow-hidden rounded-md border">
                    <a href={url} target="_blank" rel="noopener noreferrer" className="block outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      {/* eslint-disable-next-line @next/next/no-img-element -- private photos behind short-lived signed links must not go through the image cache */}
                      <img src={url} alt={`Extra photo ${index + 1} of the house`} className="aspect-square w-full object-cover" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {canEdit ? (
            <PhotoPicker userId={me.id} mode="attach" leadId={lead.id} buttonLabel="More photos" />
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>House</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">House type</dt>
            <dd>{labelFor(HOUSE_TYPE_OPTIONS, lead.house_type) || "Not noted"}</dd>
            <dt className="text-muted-foreground">Came from</dt>
            <dd>{labelFor(SOURCE_OPTIONS, lead.source)}</dd>
          </dl>
          {lead.notes ? <p className="mt-4 text-sm whitespace-pre-wrap">{lead.notes}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Track colour</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          <div data-testid="track-colour">
            <p className={trackColour.kind === "none" ? "text-muted-foreground" : "text-base font-semibold"}>
              {trackColourText(trackColour)}
              {trackColour.kind === "list" && trackColour.retired ? " (retired from the list)" : ""}
            </p>
            {needsPowderCoating(trackColour) ? (
              <p className="font-semibold">Needs powder coating.</p>
            ) : null}
            <p className="text-muted-foreground">
              White is the only stock track colour.{isOwner ? "" : " Keenan sets the track colour."}
            </p>
          </div>
          {isOwner ? (
            <TrackColourForm
              leadId={lead.id}
              options={trackOptions}
              current={{
                choice: lead.track_ral_code ? "custom" : lead.track_colour_id,
                ralCode: lead.track_ral_code,
              }}
              ralNames={Object.fromEntries(ralNames)}
            />
          ) : null}
        </CardContent>
      </Card>

      {canEdit ? (
        <Card>
          <CardHeader>
            <CardTitle>Status</CardTitle>
          </CardHeader>
          <CardContent>
            {choices.length > 0 ? (
              <StatusControl
                key={`${lead.status}-${lead.follow_up_on ?? ""}`}
                leadId={lead.id}
                current={lead.status}
                choices={choices}
                lostReasons={reasons}
                followUpOn={lead.follow_up_on}
                today={today}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                This lead is at {STATUS_LABELS[lead.status]}. From here Keenan moves it along.
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {canEdit ? (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <NoteForm leadId={lead.id} />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="flex flex-col gap-4" aria-label="Timeline">
            {(events ?? []).map((event) => (
              <li key={event.id} className="flex flex-col gap-1 border-l-2 border-border pl-3">
                <p className={event.type === "note" ? "text-sm whitespace-pre-wrap" : "text-sm font-semibold"}>
                  {describeEvent(event)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {event.actor_id ? (names.get(event.actor_id) ?? "Someone") : "Vesper"},{" "}
                  {formatDateTime(event.created_at)}
                </p>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
