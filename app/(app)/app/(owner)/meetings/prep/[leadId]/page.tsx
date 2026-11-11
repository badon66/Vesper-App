import { Check, ChevronLeft, Circle, CircleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { SoffitCode } from "@/components/leads/soffit-code";
import { TrackColourForm } from "@/components/leads/track-colour-form";
import { MockupsCard } from "@/components/leads/mockups-card";
import { loadLeadMockups } from "@/lib/leads/mockups";
import { ConfirmMeeting, FillAnswers } from "@/components/meetings/prep-actions";
import { NotForYourRole } from "@/components/not-for-your-role";
import { Button } from "@/components/ui/button";
import { requireProfile } from "@/lib/auth/profile";
import { contactFor } from "@/lib/leads/contacts";
import { hotButtonsLabel, setterReadLabel } from "@/lib/leads/extras";
import { LEAD_FIELDS } from "@/lib/leads/fields";
import { notesFor } from "@/lib/leads/notes";
import { NOTE_KEYS, NOTE_LABELS } from "@/lib/leads/questions";
import { soffitCodeBlocks, trackFormKey } from "@/lib/leads/soffit-code";
import { leadName } from "@/lib/leads/status";
import { leadTrackColour, needsPowderCoating, sortTrackColours, trackColourText } from "@/lib/leads/track-colour";
import {
  confirmationDay,
  confirmationText,
  confirmationTime,
  DEFAULT_CONFIRM_TEXT,
  draftedOfferCount,
  missingAnswers,
  prepSummary,
  quoteDraftedAhead,
  smsLink,
  type PrepItem,
} from "@/lib/meetings/prep";
import { PHOTO_BUCKET } from "@/lib/photos";
import { isLive, timePhrase } from "@/lib/schedule/meetings";
import { meetingsForLead } from "@/lib/schedule/queries";
import { createClient } from "@/lib/supabase/server";
import { addDays, calgaryDateOf, calgaryToday, formatDateTime, formatTime, formatWeekday, requestTime } from "@/lib/time";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Prepare for the meeting",
};

// The prep list (Keenan, 2026-11-08): what a meeting still needs before
// Keenan walks in, each with a way to do it right here. The setter's read,
// hot buttons and the lead's notes sit at the top. Owner only: the owner
// group's layout refuses everyone else, View as included, and the page
// checks again before it reads anything. No roofline item or link to the
// tracer since 2026-11-11 (the light picker left the meeting).
export default async function PrepPage({ params }: { params: Promise<{ leadId: string }> }) {
  const me = await requireProfile();
  if (me.role !== "owner") return <NotForYourRole />;
  const { leadId } = await params;
  if (!z.uuid().safeParse(leadId).success) notFound();

  const supabase = await createClient();
  const { data: row } = await supabase.from("leads").select(LEAD_FIELDS).eq("id", leadId).maybeSingle();
  if (!row) notFound();
  const now = requestTime();
  const today = calgaryToday();

  const [contact, notes, meetingRows, { data: photoRows }, { data: colourRows }, { data: ralRows }, { data: quoteRows }, { data: settingsRow }, { data: noteEvents }, { data: bookRows }] =
    await Promise.all([
      contactFor(supabase, me, leadId),
      notesFor(supabase, me, leadId),
      meetingsForLead(supabase, leadId),
      // Round 10: the mockup is the house's Main in lead_mockups.
      supabase.from("lead_mockups").select("storage_path, created_at").eq("lead_id", leadId).eq("is_main", true).is("removed_at", null).limit(1),
      supabase.from("track_colours").select("id, name, ral_code, sort_order, active"),
      supabase.from("ral_classic_colours").select("code, name"),
      supabase.from("quotes").select("id, runs, offers, updated_at").eq("lead_id", leadId).order("updated_at", { ascending: false }),
      supabase.from("settings").select("confirm_text").eq("id", 1).maybeSingle(),
      supabase.from("lead_events").select("id, payload, created_at").eq("lead_id", leadId).eq("type", "note").order("created_at", { ascending: false }).limit(20),
      // The colour book held up to the soffit (2026-11-09): one per slot.
      supabase.from("lead_photos").select("storage_path, slot").eq("lead_id", leadId).in("slot", ["soffit_book", "soffit_book_2"]),
    ]);
  const lead = { ...row, phone: contact.phone };

  // The meeting to prepare for: the next booked one that hasn't ended.
  const meeting =
    meetingRows
      .filter((item) => isLive(item.status) && Date.parse(item.ends_at) > now)
      .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))[0] ?? null;

  const mockupPath = photoRows?.[0]?.storage_path ?? null;
  const mockupData = await loadLeadMockups(supabase, leadId);

  const colours = sortTrackColours(colourRows ?? []);
  const colourById = new Map(colours.map((colour) => [colour.id, colour]));
  const ralNames = new Map((ralRows ?? []).map((ral) => [ral.code, ral.name]));
  const trackColour = leadTrackColour(lead, colourById, ralNames);

  // The soffit colour code, beside the track colour: its number, its colour
  // book photo, and Use for the track.
  const bookPaths = (bookRows ?? []).map((photo) => photo.storage_path);
  const { data: bookSigned } =
    bookPaths.length > 0 ? await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(bookPaths, 3600) : { data: [] };
  const bookUrlByPath = new Map((bookSigned ?? []).flatMap((item) => (item.path && item.signedUrl ? [[item.path, item.signedUrl] as const] : [])));
  const bookUrls = Object.fromEntries(
    (bookRows ?? []).flatMap((photo) => {
      const signedUrl = bookUrlByPath.get(photo.storage_path);
      return photo.slot && signedUrl ? [[photo.slot, signedUrl]] : [];
    }),
  );
  const soffitBlocks = soffitCodeBlocks(lead, { isOwner: true, colours, ralNames, photoUrls: bookUrls });
  const trackOptions = colours
    .filter((colour) => colour.active || colour.id === lead.track_colour_id)
    .map((colour) => ({ value: colour.id, label: colour.active ? colour.name : `${colour.name} (retired)` }));

  // Round 9: drafted ahead once an offer covers a measured run.
  const quoteWithRuns = (quoteRows ?? []).find((quote) => quoteDraftedAhead(quote)) ?? null;
  const offerCount = draftedOfferCount(quoteWithRuns);

  const summary = prepSummary({
    hasMockup: Boolean(mockupPath),
    hasTrackColour: Boolean(lead.track_colour_id || lead.track_ral_code),
    hasQuoteWithRuns: Boolean(quoteWithRuns),
    hasMeeting: meeting !== null,
    confirmedAt: meeting?.confirmed_at ?? null,
    lead,
  });
  const missing = missingAnswers(lead);

  // The ready-made text, from the wording in Settings.
  const smsHref =
    meeting && lead.phone
      ? smsLink(
          lead.phone,
          confirmationText(settingsRow?.confirm_text || DEFAULT_CONFIRM_TEXT, {
            firstName: lead.first_name,
            day: confirmationDay(calgaryDateOf(meeting.starts_at), today, addDays(today, 1), formatWeekday(calgaryDateOf(meeting.starts_at))),
            time: confirmationTime(formatTime(meeting.starts_at)),
          }),
        )
      : null;

  const read = setterReadLabel(lead.setter_read);
  const hot = hotButtonsLabel(lead.hot_buttons);
  const answerNotes = NOTE_KEYS.filter((key) => notes.answerNotes[key]);
  const laterNotes = (noteEvents ?? [])
    .map((event) => ({ id: event.id, at: event.created_at, text: noteText(event.payload) }))
    .filter((event): event is { id: string; at: string; text: string } => Boolean(event.text));
  const address = [lead.address_line, lead.neighbourhood].filter(Boolean).join(", ");
  const name = leadName(lead);

  // One gold thing at a time (DESIGN.md): the first item still to do, or
  // Start once it's all Ready.
  const firstOpen = summary.items.find((item) => !item.done)?.key ?? null;
  const body = (item: PrepItem) => {
    const primary = item.key === firstOpen;
    switch (item.key) {
      case "mockup":
        return <MockupsCard leadId={leadId} userId={me.id} {...mockupData} bare primary={primary} />;
      case "track_colour":
        return (
          <div className="flex flex-col gap-5 text-sm">
            {/* The item's answer first, right under its name; then the
                soffit's code with Use for the track; then the form. */}
            {item.done ? (
              <p className="text-base font-semibold" data-testid="prep-track-colour">
                {trackColourText(trackColour)}
                {needsPowderCoating(trackColour) ? <span className="font-normal text-muted-foreground"> · needs powder coating</span> : null}
              </p>
            ) : null}
            <SoffitCode leadId={leadId} userId={me.id} blocks={soffitBlocks} canEdit ralNames={Object.fromEntries(ralNames)} layout="prep" />
            <TrackColourForm
              // Use for the track can set the colour: start again from what
              // is saved then, and keep "Saved." after the form's own save.
              key={trackFormKey(soffitBlocks)}
              leadId={leadId}
              options={trackOptions}
              current={{ choice: lead.track_ral_code ? "custom" : lead.track_colour_id, ralCode: lead.track_ral_code }}
              ralNames={Object.fromEntries(ralNames)}
              quiet={!primary}
            />
          </div>
        );
      case "quote":
        return (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-muted-foreground">
              {item.done
                ? `A quote with ${offerCount} ${offerCount === 1 ? "offer" : "offers"} is saved. Meeting mode opens with it.`
                : "Measure from the photos and save the runs and offers ahead, so the price is ready at the table."}
            </p>
            <Button asChild size="lg" variant={primary ? "default" : "outline"} className="h-12 px-5">
              {/* Round 9: the lead page's quote editor, the same quote
                  meeting mode opens; #edit-quote opens its sheet at once. */}
              <Link href={`/app/leads/${leadId}#edit-quote`} data-testid="prep-quote">
                {item.done ? "Edit the quote" : "Draft the quote"}
              </Link>
            </Button>
          </div>
        );
      case "confirmed":
        return meeting ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">
              Text opens Messages with the text ready to change before you send it. The wording is in Settings.
            </p>
            <ConfirmMeeting meetingId={meeting.id} phone={lead.phone} smsHref={smsHref} confirmedAt={meeting.confirmed_at} primary={primary} />
          </div>
        ) : null;
      case "answers":
        return item.done ? (
          <p className="text-sm text-muted-foreground">All six answered.</p>
        ) : (
          <FillAnswers leadId={leadId} missing={missing} primary={primary} />
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link
          href="/app/meetings"
          className="inline-flex min-h-11 w-fit items-center gap-1 text-sm font-semibold text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
          Meetings
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="text-2xl font-bold text-pretty">{name}</h1>
            {address ? <p className="text-pretty text-muted-foreground">{address}</p> : null}
            <p className="font-semibold" data-testid="prep-when">
              {meeting ? sentenceCase(timePhrase(meeting.starts_at, today)) : "No meeting booked"}
            </p>
          </div>
          <Button asChild size="lg" variant={summary.ready ? "default" : "outline"} className="h-14 shrink-0 px-10 text-lg">
            <a href={`/meeting/${leadId}#start`} aria-label={`Start the meeting with ${name}`} data-testid="prep-start">
              Start
            </a>
          </Button>
        </div>
        <p
          className={cn("flex items-center gap-2 text-base font-semibold", summary.ready ? "" : "text-pretty")}
          data-testid="prep-status"
          data-ready={summary.ready ? "true" : "false"}
        >
          {summary.ready ? <Check aria-hidden="true" className="size-5 shrink-0" /> : <CircleAlert aria-hidden="true" className="size-5 shrink-0" />}
          {summary.ready ? "Ready" : `Prepare for the meeting: ${summary.left} left`}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
        <section aria-labelledby="walk-in-heading" className="flex flex-col gap-4 rounded-xl border p-4 sm:p-5 lg:sticky lg:top-4" data-testid="prep-brief">
          <h2 id="walk-in-heading" className="text-lg font-bold">
            Before you walk in
          </h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Setter&apos;s read</dt>
            <dd className="font-semibold" data-testid="prep-read">{read ?? "Not noted"}</dd>
            <dt className="text-muted-foreground">Hot buttons</dt>
            <dd className="text-pretty font-semibold" data-testid="prep-hot-buttons">{hot ?? "Not noted"}</dd>
          </dl>
          <div className="flex flex-col gap-2 text-sm" data-testid="prep-notes">
            <h3 className="font-semibold">Notes</h3>
            {notes.notes ? <p className="whitespace-pre-wrap text-pretty">{notes.notes}</p> : null}
            {answerNotes.length > 0 ? (
              <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
                {answerNotes.map((key) => (
                  <div key={key} className="contents">
                    <dt className="text-muted-foreground">{NOTE_LABELS[key]}</dt>
                    <dd className="mb-1 text-pretty sm:mb-0">{notes.answerNotes[key]}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {laterNotes.length > 0 ? (
              <ul className="flex flex-col gap-2" aria-label="Notes added later">
                {laterNotes.map((note) => (
                  <li key={note.id} className="border-l-2 border-border pl-3">
                    <p className="whitespace-pre-wrap text-pretty">{note.text}</p>
                    <p className="text-muted-foreground">{formatDateTime(note.at)}</p>
                  </li>
                ))}
              </ul>
            ) : null}
            {!notes.notes && answerNotes.length === 0 && laterNotes.length === 0 ? (
              <p className="text-muted-foreground">No notes on this lead.</p>
            ) : null}
          </div>
          <Link href={`/app/leads/${leadId}`} className="inline-flex min-h-11 w-fit items-center text-sm font-semibold underline underline-offset-4">
            Open the lead page
          </Link>
        </section>

        <section aria-labelledby="prep-heading" className="flex flex-col gap-3">
          <h2 id="prep-heading" className="sr-only">
            The prep list
          </h2>
          <ol className="flex flex-col gap-3" data-testid="prep-list">
            {summary.items.map((item) => (
              <li
                key={item.key}
                className={cn("flex flex-col gap-3 rounded-xl border p-4 sm:p-5", item.done && "bg-muted/30")}
                data-testid={`prep-item-${item.key}`}
                data-done={item.done ? "true" : "false"}
              >
                <div className="flex items-start gap-3">
                  {item.done ? (
                    <Check aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
                  ) : (
                    <Circle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                  )}
                  <div className="flex min-w-0 flex-col">
                    <h3 className="text-base font-semibold">
                      {item.label}
                      <span className="sr-only">{item.done ? ", done" : ", still to do"}</span>
                    </h3>
                    {!item.done && item.detail && item.key !== "answers" ? <p className="text-sm text-pretty text-muted-foreground">{item.detail}</p> : null}
                  </div>
                </div>
                <div className="sm:pl-8">{body(item)}</div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}

function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// A note on the timeline keeps its words in payload.text.
function noteText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const text = (payload as Record<string, unknown>).text;
  return typeof text === "string" && text.trim() ? text.trim() : null;
}
