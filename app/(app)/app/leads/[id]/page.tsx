import { ChevronLeft } from "lucide-react";
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
import { SoffitCode } from "@/components/leads/soffit-code";
import { StatusBadge } from "@/components/leads/status-badge";
import { StatusControl } from "@/components/leads/status-control";
import { TrackColourForm } from "@/components/leads/track-colour-form";
import { BookLeadButton, OpenBookingSheet } from "@/components/booking/book-buttons";
import { MockupsCard } from "@/components/leads/mockups-card";
import { QuoteCard, type QuoteCardProps } from "@/components/quote-link/quote-card";
import { QuoteOutcome } from "@/components/quotes/quote-outcome";
import { QuoteEditorCard } from "@/components/quotes/quote-editor/quote-editor-sheet";
import { ScrollToHash } from "@/components/scroll-to-hash";
import { ToBeCompleted } from "@/components/to-finish/to-be-completed";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth/profile";
import { leadAnswerList, type PhotoSlot } from "@/lib/leads/door";
import { completenessLabel, NOTE_KEYS, NOTE_LABELS } from "@/lib/leads/questions";
import { lostReasons, namesById } from "@/lib/leads/queries";
import { formatMeetingTime, isLive, positionSourceText, sentence, timePhrase } from "@/lib/schedule/meetings";
import { meetingsForLead } from "@/lib/schedule/queries";
import {
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
import { soffitCodeBlocks, soffitCodes, trackFormKey } from "@/lib/leads/soffit-code";
import { describeEvent, isCustomerEvent } from "@/lib/leads/timeline";
import { formatPhone } from "@/lib/phone";
import { PHOTO_BUCKET } from "@/lib/photos";
import { mapsLink } from "@/lib/places";
import { createClient } from "@/lib/supabase/server";
import { followUpSentence } from "@/lib/leads/attention";
import { maySeeContact, NO_CONTACT } from "@/lib/leads/contact-rules";
import { contactFor } from "@/lib/leads/contacts";
import { NO_NOTES, notesFor } from "@/lib/leads/notes";
import { LEAD_FIELDS } from "@/lib/leads/fields";
import { guidedPhotoCount, toFinish } from "@/lib/leads/to-finish";
import { calgaryToday, formatDate, formatDateTime, requestTime } from "@/lib/time";
import { screenTotal, totalFeet } from "@/lib/pricing";
import { quoteBaseUrl, requestOrigin } from "@/lib/quote-link/server";
import { loadQuoteOutcome } from "./quote-outcome-data";
import { loadQuoteEditor } from "@/lib/quotes/editor-data";
import { loadLeadMockups } from "@/lib/leads/mockups";
import {
  FALLBACK_COMPANY,
  offerChoice,
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
  // Round 6 (2026-11-07): the notes follow the same rule, from lead_notes.
  const [contact, leadNotes] = contactShown
    ? await Promise.all([contactFor(supabase, me, row.id), notesFor(supabase, me, row.id)])
    : [NO_CONTACT, NO_NOTES];
  const lead = { ...row, ...contact, notes: leadNotes.notes };

  const isOwner = me.role === "owner";
  const canEdit = isOwner || lead.created_by === me.id || lead.assigned_to === me.id;
  const [{ data: photoRows }, { data: eventRows }, reasons, sessionResult, { data: colourRows }, meetingRows, { data: outcomeSettings }] = await Promise.all([
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
  // Notes on the timeline: the lead's setter and Keenan only (round 6). The
  // database keeps them from other setters; View as, reading with Keenan's
  // session, drops them here for the person viewed.
  const events = (eventRows ?? []).filter((event) => contactShown || event.type !== "note");
  const timelineNotes = events.filter((event) => event.type === "note");
  // The quote and its customer link, and the quote's outcome (round 8):
  // the owner's only (View as a setter never loads them).
  // Round 9: the quote editor's quote and prices, the same meeting mode
  // opens (the owner's only, never under View as).
  // Round 10: the Mockups section, Keenan's alone.
  const [quoteCard, quoteOutcome, quoteEditor, mockupData] = isOwner
    ? await Promise.all([
        loadQuoteCard(supabase, lead, outcomeSettings?.company ?? null),
        loadQuoteOutcome(supabase, lead),
        loadQuoteEditor(supabase, lead.id),
        loadLeadMockups(supabase, lead.id),
      ])
    : [null, null, null, null];
  const meetings = meetingRows.map((meeting) => ({ ...meeting, lead }));
  const liveMeeting = meetings.find((meeting) => isLive(meeting.status));
  const canBook = canEdit && (lead.status === "new" || lead.status === "follow_up") && !liveMeeting;
  const justBooked = bookedParam ? meetings.find((meeting) => meeting.id === bookedParam) : undefined;

  // Track colour and the soffit colour code. The owner gets the whole RAL
  // Classic list, to name a custom number as he types it, and so does the
  // lead's own setter, to name the soffit's code as they type it
  // (2026-11-09); everyone else only the names shown.
  const colours = sortTrackColours(colourRows ?? []);
  const colourById = new Map(colours.map((colour) => [colour.id, colour]));
  const listColour = lead.track_colour_id ? colourById.get(lead.track_colour_id) : undefined;
  const ralCodes = [lead.track_ral_code, listColour?.ral_code, ...soffitCodes(lead)].filter((code): code is string => Boolean(code));
  const ralQuery = supabase.from("ral_classic_colours").select("code, name");
  const { data: ralRows } = isOwner || canEdit
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
  // The soffit's code and colour book photo, one of each per soffit colour.
  const soffitBlocks = soffitCodeBlocks(lead, { isOwner, colours, ralNames, photoUrls: slotUrls });
  // A soffit that is no longer split keeps its second colour book photo,
  // shown with the extras so it never goes out of sight.
  if (!lead.soffit_colour_2 && slotUrls.soffit_book_2) extraUrls.push(slotUrls.soffit_book_2);
  const names = await namesById(supabase, [
    lead.created_by,
    lead.assigned_to,
    ...events.map((event) => event.actor_id),
    ...meetings.flatMap((meeting) => [meeting.setter_id, meeting.booked_by, meeting.outcome_by]),
  ]);
  const owner = names.get(lead.created_by) ?? "someone";
  const choices = canEdit ? statusChoices(me.role, lead.status) : [];
  // Round 8 (2026-11-09): on a Sold or Installed lead with an accepted
  // quote, the status comes from the quote's outcome card, so the status
  // menu gives way to a pointer to it.
  const statusFromOutcome =
    quoteOutcome !== null &&
    quoteOutcome.quote.status === "accepted" &&
    (lead.status === "sold" || lead.status === "installed");
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
  // Book now, finish later (Keenan, 2026-11-10): what's still missing on
  // the lead, for whoever can edit it, each item a tap from its field. The
  // photos are done with all three guided photos, or once a booking says
  // why they were skipped. Never the phone itself: phone_saved answers.
  const stillToDo = canEdit
    ? toFinish(
        lead,
        {
          guided: guidedPhotoCount((photoRows ?? []).map((photo) => photo.slot)),
          skipped: meetings.some((meeting) => meeting.photos_skipped !== null),
        },
        "lead",
      )
    : [];

  // Keenan's three quote cards: the quote, the customer's link and the
  // outcome. Round 13 (Keenan, 2026-11-11): once the lead has a quote they
  // come first, right under the name, above the meetings, the mockups, the
  // details and the photos, because after a meeting they are what he came
  // for. Before there is a quote the page keeps its order, with the empty
  // Quote card after the mockups.
  const quoteFirst = isOwner && quoteOutcome !== null;
  const quoteCards = (
    <>
      {quoteEditor ? (
        <QuoteEditorCard
          leadId={lead.id}
          leadName={leadName(lead)}
          context={{
            pricing: quoteEditor.pricing,
            today: quoteEditor.today,
            lead: { colourKind: trackColour.kind, colourText: trackColourText(trackColour) },
          }}
          draft={quoteEditor.draft}
          mockups={mockupData?.mockups ?? []}
          userId={me.id}
        />
      ) : null}
      {quoteCard ? <QuoteCard {...quoteCard} /> : null}
      {quoteOutcome ? (
        <QuoteOutcome
          {...quoteOutcome}
          track={{
            set: trackColour.kind !== "none",
            text: trackColourText(trackColour),
            options: trackOptions,
            current: { choice: lead.track_ral_code ? "custom" : lead.track_colour_id, ralCode: lead.track_ral_code },
            ralNames: Object.fromEntries(ralNames),
          }}
          today={today}
        />
      ) : null}
    </>
  );

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
        {/* The address sits right under the name (Keenan, 2026-11-10), the
            neighbourhood quietly after it. A name or an address still to
            come reads as itself, a step quieter. */}
        <div className="flex flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className={lead.name_to_come ? "text-2xl font-bold text-muted-foreground" : "text-2xl font-bold"}>
              {leadName(lead)}
            </h1>
            <StatusBadge status={lead.status} />
          </div>
          <p className="text-base text-pretty" data-testid="lead-address-top">
            <span className={lead.address_to_come ? "text-muted-foreground" : "font-semibold"}>{lead.address_line}</span>
            {lead.neighbourhood ? <span className="text-muted-foreground">, {lead.neighbourhood}</span> : null}
          </p>
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

      {stillToDo.length > 0 ? <ToBeCompleted items={stillToDo} /> : null}

      {quoteFirst ? quoteCards : null}

      {meetings.length > 0 ? (
        <section id="meetings" data-testid="lead-meetings" aria-labelledby="lead-meetings-heading" className="flex scroll-mt-36 flex-col gap-3">
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

      {mockupData ? <MockupsCard leadId={lead.id} userId={me.id} {...mockupData} /> : null}
      {quoteFirst ? null : quoteCards}
      <ScrollToHash />

      {statusFromOutcome ? (
        <Card data-testid="status-from-outcome">
          <CardHeader>
            <CardTitle>Status</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            <p className="text-pretty">
              {STATUS_LABELS[lead.status]}. The quote&apos;s outcome sets this lead&apos;s status from here
              {lead.status === "sold" ? ": Installed, Cancelled and Undo acceptance are on its card." : "."}
            </p>
            <a
              href="#quote-outcome"
              className="inline-flex min-h-11 w-fit items-center font-semibold underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Go to the outcome
            </a>
          </CardContent>
        </Card>
      ) : canEdit && choices.length > 0 ? (
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
          <p className={lead.address_to_come ? "text-base text-muted-foreground" : "text-base font-semibold"}>{lead.address_line}</p>
          <p className="text-muted-foreground">
            {[lead.neighbourhood, lead.city, lead.postal_code].filter(Boolean).join(", ")}
          </p>
          {/* A placeholder address has nothing to find on a map. */}
          {lead.address_to_come && lead.lat === null ? null : (
            <a
              href={mapsLink(lead)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 w-fit items-center font-semibold underline underline-offset-4"
            >
              Open in Google Maps
            </a>
          )}
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

      <Card id="find-out" className="scroll-mt-36">
        <CardHeader>
          <CardTitle>Find out</CardTitle>
          <CardDescription>{completenessLabel(lead)}. Not collected doesn&apos;t count.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
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
          {/* 2026-11-09: the soffit's own code from the RAL colour book, right
              under its colour. Optional, never counted. */}
          <SoffitCode
            leadId={lead.id}
            userId={me.id}
            blocks={soffitBlocks}
            canEdit={canEdit}
            ralNames={canEdit ? Object.fromEntries(ralNames) : {}}
          />
        </CardContent>
      </Card>

      {/* Round 6 (Keenan, 2026-11-07): every note on the lead in one place,
          for Keenan to read before the meeting: the setter's notes, a note
          on each answer, and the notes added on the timeline. Only the
          lead's own setter and Keenan see them. */}
      <Card id="notes" className="scroll-mt-36" data-testid="lead-notes">
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          {!contactShown ? (
            <p className="text-pretty text-muted-foreground" data-testid="notes-hidden">
              Notes show only to this lead&apos;s own setter and Keenan.
            </p>
          ) : (
            <>
              {NOTE_KEYS.some((key) => leadNotes.answerNotes[key]) ? (
                <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr] sm:gap-y-2" data-testid="answer-notes">
                  {NOTE_KEYS.filter((key) => leadNotes.answerNotes[key]).map((key) => (
                    <Fragment key={key}>
                      <dt className="text-muted-foreground">{NOTE_LABELS[key]}</dt>
                      <dd className="mb-2 text-pretty whitespace-pre-wrap sm:mb-0" data-note={key}>
                        {leadNotes.answerNotes[key]}
                      </dd>
                    </Fragment>
                  ))}
                </dl>
              ) : null}
              {lead.notes ? (
                <p className="whitespace-pre-wrap" data-testid="setter-free-notes">
                  {lead.notes}
                </p>
              ) : null}
              {timelineNotes.length > 0 ? (
                <ul className="flex flex-col gap-2" aria-label="Notes added later">
                  {timelineNotes.map((event) => (
                    <li key={event.id} className="border-l-2 border-border pl-3">
                      <p className="whitespace-pre-wrap">{describeEvent(event)}</p>
                      <p className="text-muted-foreground">
                        {event.actor_id === me.id ? "You" : (names.get(event.actor_id ?? "") ?? "Someone")}, {formatDateTime(event.created_at)}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : null}
              {!NOTE_KEYS.some((key) => leadNotes.answerNotes[key]) && !lead.notes && timelineNotes.length === 0 ? (
                <p className="text-muted-foreground" data-testid="no-notes">
                  No notes yet. A note on any answer, or one added on the timeline, shows here.
                </p>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <Card id="photos" className="scroll-mt-36">
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
          {/* Round 10 follow-up (Keenan, 2026-11-11): no roofline tracing
              here. The light picker left the meeting, so nothing links to
              the tracer; saved traces stay in the database untouched. */}
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
            <dd className="text-pretty" data-testid="hot-buttons">{hotButtonsLabel(lead.hot_buttons) ?? "Not noted"}</dd>
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
        </CardContent>
      </Card>

      <Card id="track-colour" className="scroll-mt-36">
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
              // Use for the track (2026-11-09) can set the colour from the
              // soffit code: the form starts again from what is saved then,
              // and keeps its "Saved." after its own save.
              key={trackFormKey(soffitBlocks)}
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
            {events.map((event) => (
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
        "runs, offers, box_count, price_per_ft, box_price, adders, discounts, colour_timing, rush_fee, upper_access_fee, upper_gable_access_fee, min_job_total, gst_enabled, gst_rate, valid_until",
      )
      .eq("lead_id", lead.id)
      .in("status", ["draft", "presented", "accepted"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("quote_links")
      .select("token, created_at, revoked_at, view_count, last_viewed_at, booked_at, booked_option, booked_selection, selection_offer, booked_offer")
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
    holdPassed: quoteRow.valid_until !== null && quoteRow.valid_until < calgaryToday(),
  };
  if (!linkRow) return card;

  const live = linkRow.revoked_at === null;
  // What they are looking at now, as the customer's page would open: the
  // database drops a choice made before the runs changed. Round 9: an
  // option by its offer id, named and priced exactly as the customer sees
  // it (its own runs and boxes); a link from before offers, by its runs.
  let looking: { option: string; total: string; offer: string | null } | null = null;
  if (live) {
    const view = parseCustomerQuote((await supabase.rpc("quote_for_customer", { p_token: linkRow.token })).data);
    if (view.state === "live") {
      const choice = offerChoice(quote, view.selectionOffer);
      if (choice) {
        looking = { option: choice.name, total: choice.total, offer: choice.id };
      } else if (!view.selectionOffer && view.selection) {
        looking = {
          option: optionName(quote.runs, view.selection),
          total: screenTotal(priceSelection(quote, view.selection).subtotal, quote.gstEnabled),
          offer: null,
        };
      }
    }
  }
  // What they booked: the option by its id, named by the offer and priced
  // from the stored quote; the name they booked under if that option has
  // since gone (no total then). A link booked before offers, by its runs.
  const bookedChoice = offerChoice(quote, linkRow.booked_offer);
  const bookedAll = linkRow.booked_option === "Recommended package";
  const bookedPositions = bookedAll ? null : (linkRow.booked_selection ?? null);
  const bookedName = bookedChoice?.name ?? linkRow.booked_option;
  const bookedTotal = linkRow.booked_offer
    ? (bookedChoice?.total ?? null)
    : bookedAll || (bookedPositions && bookedPositions.every((p) => p < quote.runs.length))
      ? screenTotal(priceSelection(quote, bookedPositions).subtotal, quote.gstEnabled)
      : null;
  const sameAsBooked =
    looking !== null &&
    (looking.offer !== null && linkRow.booked_offer ? looking.offer === linkRow.booked_offer : looking.option === bookedName);
  card.link = {
    live,
    link: quoteLinkUrl(await quoteBaseUrl(), linkRow.token),
    previewUrl: quoteLinkUrl(await requestOrigin(), linkRow.token),
    createdAt: linkRow.created_at,
    revokedAt: linkRow.revoked_at,
    views: linkRow.view_count,
    lastViewedAt: linkRow.last_viewed_at,
    looking: looking && !sameAsBooked ? { option: looking.option, total: looking.total } : null,
    booked:
      linkRow.booked_at && bookedName
        ? {
            at: linkRow.booked_at,
            option: bookedName,
            total: bookedTotal,
          }
        : null,
  };
  return card;
}
