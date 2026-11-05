import { Check, ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment } from "react";
import { z } from "zod";
import { ClearLeadDraft } from "@/components/leads/clear-lead-draft";
import { LeadPosition } from "@/components/leads/lead-position";
import { NoteForm } from "@/components/leads/note-form";
import { MeetingCard } from "@/components/schedule/meeting-card";
import { PhotoPicker } from "@/components/leads/photo-picker";
import { PhotoSlots } from "@/components/leads/photo-slots";
import { StatusBadge } from "@/components/leads/status-badge";
import { StatusControl } from "@/components/leads/status-control";
import { TrackColourForm } from "@/components/leads/track-colour-form";
import { BookLeadButton, OpenBookingSheet } from "@/components/booking/book-buttons";
import { MockupCard } from "@/components/meeting/mockup-card";
import { QuoteCard, type QuoteCardProps } from "@/components/quote-link/quote-card";
import { ScrollToHash } from "@/components/scroll-to-hash";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth/profile";
import { leadAnswerList, type PhotoSlot } from "@/lib/leads/door";
import { completenessLabel } from "@/lib/leads/questions";
import { lostReasons, namesById } from "@/lib/leads/queries";
import { formatMeetingTime, isLive, positionSourceText, sentence, timePhrase } from "@/lib/schedule/meetings";
import { leadReadiness, READINESS_NAMES, readinessNow } from "@/lib/schedule/readiness";
import { meetingsForLead } from "@/lib/schedule/queries";
import {
  CONFIRM_BY_LABEL,
  confirmByLabel,
  HOT_BUTTONS_LABEL,
  hotButtonsLabel,
  SETTER_READ_LABEL,
  setterReadLabel,
} from "@/lib/leads/extras";
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
import { describeEvent, isCustomerEvent } from "@/lib/leads/timeline";
import { formatPhone } from "@/lib/phone";
import { PHOTO_BUCKET } from "@/lib/photos";
import { mapsLink } from "@/lib/places";
import { createClient } from "@/lib/supabase/server";
import { followUpSentence } from "@/lib/leads/attention";
import { maySeeContact, NO_CONTACT } from "@/lib/leads/contact-rules";
import { contactFor } from "@/lib/leads/contacts";
import { LEAD_FIELDS } from "@/lib/leads/fields";
import { calgaryToday, formatDate, formatDateTime, requestTime } from "@/lib/time";
import { screenTotal, totalFeet } from "@/lib/pricing";
import { quoteBaseUrl, requestOrigin } from "@/lib/quote-link/server";
import {
  FALLBACK_COMPANY,
  optionName,
  parseCustomerQuote,
  priceSelection,
  quoteFromRow,
  quoteLinkUrl,
} from "@/lib/quote-link/view";

export const metadata: Metadata = {
  title: "Lead",
};

export default async function LeadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ photos?: string | string[]; booked?: string; moved?: string; book?: string; from?: string }>;
}) {
  const me = await requireProfile();
  const { id } = await params;
  const { photos: photosParam, booked: bookedParam, moved: movedParam, book: bookParam, from: fromParam } = await searchParams;
  if (!z.uuid().safeParse(id).success) notFound();

  const supabase = await createClient();
  const { data: row } = await supabase.from("leads").select(LEAD_FIELDS).eq("id", id).maybeSingle();
  if (!row) notFound();
  // Contact privacy (2026-11-04): the phone and email only on the viewer's
  // own leads, or every lead for Keenan; View as shows the viewed setter's.
  const contactShown = maySeeContact(me, row);
  const lead = { ...row, ...(contactShown ? await contactFor(supabase, me, row.id) : NO_CONTACT) };

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
      ? supabase.from("settings").select("not_qualified_reasons, company").eq("id", 1).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  // The quote and its customer link: the owner's only (View as a setter
  // never loads them).
  const quoteCard = isOwner ? await loadQuoteCard(supabase, lead, outcomeSettings?.company ?? null) : null;
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

  // What happens next, said at the top (2026-11-03): the booked time, the
  // follow-up day, why it was lost, or that Keenan takes it from here.
  const lostLine = lead.status === "lost" ? sentence(lead.lost_reason ? `Lost: ${lead.lost_reason}` : "Lost") : null;
  const laterLine =
    choices.length === 0 && !["new", "follow_up", "meeting_booked", "lost"].includes(lead.status)
      ? `This lead is at ${STATUS_LABELS[lead.status]}. Keenan takes it from here.`
      : null;
  // Before you book, listed on the lead (the booking sheet asks the rest).
  const guidedPhotos = (["front", "left_corner", "right_corner"] as const).filter((slot) => slotUrls[slot]).length;
  const readiness = canBook ? leadReadiness(lead, guidedPhotos) : [];
  const missing = readiness.filter((item) => !item.ok).length;

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
          Added by {lead.created_by === me.id ? "you" : owner} on {formatDate(lead.created_at)}
          {session ? `, while knocking in ${session.neighbourhood}` : ""}.
        </p>
        <p className="text-sm text-muted-foreground">
          <a href="#find-out" className="inline-flex min-h-11 items-center underline underline-offset-4" data-testid="completeness">
            {completenessLabel(lead)}
          </a>
        </p>
        {followUp ? (
          <p className={followUp < today ? "text-base font-bold" : "text-base font-semibold"} data-testid="lead-next">
            {followUpSentence(followUp, today)}
          </p>
        ) : null}
        {liveMeeting && !justBooked && movedParam !== "1" ? (
          <p className="text-base font-semibold" data-testid="lead-next">
            <a href="#meetings" className="inline-flex min-h-11 items-center underline underline-offset-4">
              {sentence(`Meeting ${timePhrase(liveMeeting.starts_at)}`)}
            </a>
          </p>
        ) : null}
        {lostLine ? (
          <p className="text-base font-semibold" data-testid="lead-next">
            {lostLine}
          </p>
        ) : null}
        {laterLine ? (
          <p className="text-base text-pretty" data-testid="lead-next">
            {laterLine}
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
        {canBook && bookParam === "1" ? <OpenBookingSheet leadId={lead.id} backToSession={fromParam === "session"} /> : null}
        {(bookParam === "1" || photosParam === "failed") && lead.created_by === me.id ? <ClearLeadDraft userId={me.id} /> : null}
        {/* Gold only for the next step: Book a meeting. Call and Edit are plain. */}
        {canBook || lead.phone || canEdit ? (
          <div className="grid grid-cols-2 gap-2 pt-1 sm:flex sm:flex-wrap">
            {canBook ? <BookLeadButton leadId={lead.id} className="col-span-2 w-full sm:w-fit" /> : null}
            {lead.phone ? (
              <Button asChild variant="outline" className={canEdit ? "w-full sm:w-fit" : "col-span-2 w-full sm:w-fit"}>
                <a href={`tel:${lead.phone}`}>Call {formatPhone(lead.phone)}</a>
              </Button>
            ) : null}
            {canEdit ? (
              <Button asChild variant="outline" className={lead.phone ? "w-full sm:w-fit" : "col-span-2 w-full sm:w-fit"}>
                <Link href={`/app/leads/${lead.id}/edit`}>Edit lead</Link>
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {canBook ? (
        <Card data-testid="before-you-book">
          <CardHeader>
            <CardTitle>Before you book</CardTitle>
            <CardDescription className="text-pretty">
              {missing === 0
                ? "Ready to book. In the booking sheet you'll also confirm everyone who decides will be there."
                : `${missing === 1 ? "One thing" : `${missing} things`} to sort out. You can do them in the booking sheet too.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2" data-testid="readiness">
              {readiness.map((item) => (
                <li key={item.key} className="flex items-start gap-2 text-sm" data-ok={item.ok ? "yes" : "no"}>
                  {item.ok ? (
                    <Check role="img" aria-label="Done" className="mt-0.5 size-4 shrink-0" />
                  ) : (
                    <span role="img" aria-label="Missing" className="mt-0.5 size-4 shrink-0 rounded-full border-2 border-muted-foreground" />
                  )}
                  {item.ok ? (
                    <span>{item.label}</span>
                  ) : (
                    <span className="flex flex-1 flex-wrap items-start justify-between gap-x-3">
                      <span className="flex flex-col">
                        <span className="font-semibold">{READINESS_NAMES[item.key]}</span>
                        <span className="text-pretty text-muted-foreground">{readinessNow(item, lead, guidedPhotos)}</span>
                      </span>
                      <Link
                        href={item.key === "photos" ? "#photos" : `/app/leads/${lead.id}/edit`}
                        aria-label={`Fix: ${READINESS_NAMES[item.key]}`}
                        className="inline-flex min-h-11 min-w-11 items-center justify-center font-semibold underline underline-offset-4"
                      >
                        Fix
                      </Link>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {meetings.length > 0 ? (
        <section id="meetings" data-testid="lead-meetings" aria-labelledby="lead-meetings-heading" className="flex scroll-mt-24 flex-col gap-3">
          <h2 id="lead-meetings-heading" className="text-lg font-bold">
            Meetings
          </h2>
          {meetings.map((meeting) => (
            <MeetingCard
              key={meeting.id}
              meeting={meeting}
              names={names}
              now={requestTime()}
              canChange={canEdit}
              isOwner={isOwner}
              reasons={outcomeSettings?.not_qualified_reasons ?? []}
              showLead={false}
              viewerId={me.id}
            />
          ))}
        </section>
      ) : null}

      {isOwner ? <MockupCard leadId={lead.id} userId={me.id} mockupUrl={slotUrls.mockup ?? null} /> : null}
      {quoteCard ? <QuoteCard {...quoteCard} /> : null}
      <ScrollToHash />

      {canEdit && choices.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Status</CardTitle>
          </CardHeader>
          <CardContent>
            <StatusControl
              key={`${lead.status}-${lead.follow_up_on ?? ""}`}
              leadId={lead.id}
              current={lead.status}
              choices={choices}
              lostReasons={reasons}
              followUpOn={lead.follow_up_on}
              today={today}
            />
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
          <CardTitle>{lead.email ? "Address and email" : "Address"}</CardTitle>
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
            <p className="text-pretty text-muted-foreground">
              No map position yet.
              {canEdit ? " Edit the lead and pick the address from the suggestions to add one." : ""}
            </p>
          ) : (
            <p className="text-muted-foreground" data-testid="position-source">
              Map position: {positionSourceText(lead.position_source, lead.position_accuracy_m)}.
            </p>
          )}
          {lead.lat === null && canEdit ? <LeadPosition leadId={lead.id} /> : null}
          {lead.email ? (
            <a
              href={`mailto:${lead.email}`}
              className="inline-flex min-h-11 w-fit items-center font-semibold underline underline-offset-4"
            >
              {lead.email}
            </a>
          ) : null}
          {contactShown ? null : (
            <p className="text-pretty text-muted-foreground" data-testid="contact-hidden">
              Phone and email show only to this lead&apos;s own setter.
            </p>
          )}
        </CardContent>
      </Card>

      <Card id="find-out" className="scroll-mt-24">
        <CardHeader>
          <CardTitle>Find out</CardTitle>
          <CardDescription>{completenessLabel(lead)}. Not collected doesn&apos;t count.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-[auto_1fr]" data-testid="find-out-answers">
            {leadAnswerList(lead).map((item) => (
              <Fragment key={item.key}>
                <dt className="text-muted-foreground">{item.question}</dt>
                <dd className={item.state === "answered" ? "font-semibold" : "text-muted-foreground"} data-state={item.state} data-question={item.key}>
                  {item.state === "answered" ? item.answer : item.state === "not_collected" ? "Not collected" : "Not answered"}
                </dd>
              </Fragment>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card id="photos" className="scroll-mt-24">
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

      <Card data-testid="setter-notes">
        <CardHeader>
          <CardTitle>From the door</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Round 3 (2026-11-05): the setter's optional notes. Internal: never in meeting mode.
              On a phone each label sits above its answer, since "What would
              make them say yes" would leave the answers a narrow column. */}
          <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr] sm:gap-y-2">
            <dt className="text-muted-foreground">{SETTER_READ_LABEL}</dt>
            <dd className="mb-2 sm:mb-0" data-testid="setter-read">{setterReadLabel(lead.setter_read) ?? "Not noted"}</dd>
            <dt className="text-muted-foreground">{HOT_BUTTONS_LABEL}</dt>
            <dd className="mb-2 text-pretty sm:mb-0" data-testid="hot-buttons">{hotButtonsLabel(lead.hot_buttons) ?? "Not noted"}</dd>
            <dt className="text-muted-foreground">{CONFIRM_BY_LABEL}</dt>
            <dd data-testid="confirm-by">{confirmByLabel(lead.confirm_by) ?? "Not noted"}</dd>
          </dl>
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

      <Card id="track-colour" className="scroll-mt-24">
        <CardHeader>
          <CardTitle>Track colour</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          <div data-testid="track-colour">
            <p className={trackColour.kind === "none" ? "text-muted-foreground" : "text-base font-semibold"}>
              {trackColour.kind === "none" ? sentence(trackColourText(trackColour)) : trackColourText(trackColour)}
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
                <p className="text-sm text-muted-foreground">
                  {event.actor_id
                    ? event.actor_id === me.id
                      ? "You"
                      : (names.get(event.actor_id) ?? "Someone")
                    : isCustomerEvent(event.type)
                      ? lead.first_name
                      : "Vesper"},{" "}
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

// The Quote card's facts, from the lead's latest quote and its newest link.
// Totals come from the same lib/pricing.ts the customer's page uses.
async function loadQuoteCard(
  supabase: Awaited<ReturnType<typeof createClient>>,
  lead: { id: string; first_name: string; phone: string | null },
  company: unknown,
): Promise<QuoteCardProps> {
  const [{ data: quoteRow }, { data: linkRow }] = await Promise.all([
    supabase
      .from("quotes")
      .select(
        "runs, box_count, price_per_ft, box_price, adders, discounts, colour_timing, rush_fee_per_ft, min_job_total, gst_enabled, gst_rate, valid_until",
      )
      .eq("lead_id", lead.id)
      .in("status", ["draft", "presented", "accepted"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("quote_links")
      .select("token, created_at, revoked_at, view_count, last_viewed_at, booked_at, booked_option, booked_selection")
      .eq("lead_id", lead.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const phone =
    company && typeof company === "object" && typeof (company as { phone?: unknown }).phone === "string"
      ? ((company as { phone: string }).phone.trim() || FALLBACK_COMPANY.phone)
      : FALLBACK_COMPANY.phone;
  const quote = quoteRow ? quoteFromRow(quoteRow) : null;
  const card: QuoteCardProps = {
    leadId: lead.id,
    firstName: lead.first_name,
    phone,
    customerPhone: lead.phone,
    quote: null,
    link: null,
  };
  if (!quote || !quoteRow) return card;

  const whole = priceSelection(quote, null);
  card.quote = {
    total: screenTotal(whole.subtotal, quote.gstEnabled),
    feet: totalFeet(quote.runs),
    validUntil: quoteRow.valid_until,
    expired: quoteRow.valid_until !== null && quoteRow.valid_until < calgaryToday(),
  };
  if (!linkRow) return card;

  const live = linkRow.revoked_at === null;
  // What they are looking at now, as the customer's page would open: the
  // database drops a choice made before the runs changed.
  let looking: { option: string; total: string } | null = null;
  if (live) {
    const view = parseCustomerQuote((await supabase.rpc("quote_for_customer", { p_token: linkRow.token })).data);
    if (view.state === "live" && view.selection) {
      looking = {
        option: optionName(quote.runs, view.selection),
        total: screenTotal(priceSelection(quote, view.selection).subtotal, quote.gstEnabled),
      };
    }
  }
  const bookedAll = linkRow.booked_option === "Recommended package";
  const bookedPositions = bookedAll ? null : (linkRow.booked_selection ?? null);
  card.link = {
    live,
    link: quoteLinkUrl(await quoteBaseUrl(), linkRow.token),
    previewUrl: quoteLinkUrl(await requestOrigin(), linkRow.token),
    createdAt: linkRow.created_at,
    revokedAt: linkRow.revoked_at,
    views: linkRow.view_count,
    lastViewedAt: linkRow.last_viewed_at,
    looking: looking && looking.option !== linkRow.booked_option ? looking : null,
    booked:
      linkRow.booked_at && linkRow.booked_option
        ? {
            at: linkRow.booked_at,
            option: linkRow.booked_option,
            total:
              bookedAll || (bookedPositions && bookedPositions.every((p) => p < quote.runs.length))
                ? screenTotal(priceSelection(quote, bookedPositions).subtotal, quote.gstEnabled)
                : null,
          }
        : null,
  };
  return card;
}
