import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { NotForYourRole } from "@/components/not-for-your-role";
import { BookingForm } from "@/components/schedule/booking-form";
import { HoldSync } from "@/components/schedule/hold-keeper";
import { HoldBanner } from "@/components/schedule/hold-banner";
import { MoveConfirm } from "@/components/schedule/move-confirm";
import { TimePicker } from "@/components/schedule/time-picker";
import { Button } from "@/components/ui/button";
import { getViewer } from "@/lib/auth/profile";
import { leadName, STATUS_LABELS } from "@/lib/leads/status";
import { distanceWarnings, formatKm } from "@/lib/schedule/distance";
import { formatMeetingTime, isLive, sentence } from "@/lib/schedule/meetings";
import {
  activeHoldOf,
  bookingSettings,
  fetchBoard,
  guidedPhotoCount,
  meetingsOnDay,
} from "@/lib/schedule/queries";
import { leadReadiness } from "@/lib/schedule/readiness";
import { createClient } from "@/lib/supabase/server";
import { calgaryDateOf, calgaryToday, formatTime, requestTime } from "@/lib/time";

export const metadata: Metadata = {
  title: "Book a meeting",
};

type Search = { start?: string; lead?: string; move?: string; error?: string };

// Booking a meeting, or moving one (Keenan, 2026-11-01). A time is held the
// moment it is tapped, never by opening this page; the page shows whether
// the person holds it. Then: which lead, Before you book, Book.
export default async function BookPage({ searchParams }: { searchParams: Promise<Search> }) {
  const { profile: me, real } = await getViewer();
  if (me.role !== "owner" && me.role !== "sales") return <NotForYourRole />;
  const isOwner = me.role === "owner";
  const params = await searchParams;
  const start = z.iso.datetime({ offset: true }).safeParse(params.start ?? "");
  const startsAt = start.success ? new Date(start.data).toISOString() : null;
  const leadId = z.uuid().safeParse(params.lead ?? "").success ? (params.lead as string) : null;
  const moveId = z.uuid().safeParse(params.move ?? "").success ? (params.move as string) : null;

  const supabase = await createClient();
  const today = calgaryToday();
  const [settings, board] = await Promise.all([bookingSettings(supabase), fetchBoard(supabase, me, real.role)]);
  const hold = await activeHoldOf(supabase, me.id, settings.graceMinutes);
  const viewerId = real.id !== me.id ? me.id : null;
  const slot = startsAt ? board.find((item) => item.startsAt === startsAt) : undefined;
  const held = Boolean(startsAt && hold?.startsAt === startsAt);
  const mine = (lead: { created_by: string; assigned_to: string | null }) =>
    isOwner || lead.created_by === me.id || lead.assigned_to === me.id;

  // ---------------------------------------------------------------- moving
  if (moveId) {
    const { data: meeting } = await supabase
      .from("meetings")
      .select("id, lead_id, starts_at, status, lead:leads!meetings_lead_id_fkey(id, first_name, last_name, created_by, assigned_to)")
      .eq("id", moveId)
      .maybeSingle();
    const lead = meeting?.lead as unknown as { id: string; first_name: string; last_name: string | null; created_by: string; assigned_to: string | null } | null;
    if (!meeting || !lead || !mine(lead)) return <NotForYourRole message="You can only move your own bookings." />;
    if (!isLive(meeting.status) || new Date(meeting.starts_at).getTime() <= requestTime()) {
      return (
        <div className="flex flex-col gap-4">
          <h1 className="text-2xl font-bold">Move a booking</h1>
          <p>This booking can&apos;t be moved any more.</p>
          <Button asChild variant="outline" className="w-fit">
            <Link href={`/app/leads/${lead.id}`}>Back to the lead</Link>
          </Button>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-5">
        <HoldSync startsAt={hold?.startsAt ?? null} />
        <div>
          <h1 className="text-2xl font-bold">Move {leadName(lead)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{sentence(`Booked for ${formatMeetingTime(meeting.starts_at)}`)} Pick the new time.</p>
        </div>
        {startsAt ? (
          <>
            <HoldBanner
              startsAt={startsAt}
              held={held}
              slotState={slot?.state ?? null}
              holderName={slot?.holderName ?? null}
              pickAnotherHref={`/app/schedule/book?move=${moveId}`}
              meetingId={moveId}
            />
            <MoveConfirm meetingId={moveId} leadId={lead.id} from={meeting.starts_at} to={startsAt} held={held} />
          </>
        ) : (
          <TimePicker
            initial={board}
            today={today}
            windowDays={settings.windowDays}
            asSales={!isOwner}
            viewerId={viewerId}
            mode="move"
            meetingId={moveId}
          />
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------- booking
  const { data: lead } = leadId
    ? await supabase
        .from("leads")
        .select("id, first_name, last_name, address_line, neighbourhood, status, created_by, assigned_to, phone, owns_home, wants_price, soffit_colour, lat, lng")
        .eq("id", leadId)
        .maybeSingle()
    : { data: null };
  if (leadId && (!lead || !mine(lead))) return <NotForYourRole message="You can only book your own leads." />;

  const heading = lead ? `Book ${leadName(lead)}` : "Book a meeting";

  if (!startsAt) {
    return (
      <div className="flex flex-col gap-5">
        <HoldSync startsAt={hold?.startsAt ?? null} />
        <div>
          <h1 className="text-2xl font-bold">{heading}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Tap an open time. It&apos;s held for you while you book.</p>
        </div>
        <TimePicker
          initial={board}
          today={today}
          windowDays={settings.windowDays}
          asSales={!isOwner}
          viewerId={viewerId}
          mode="book"
          leadId={leadId}
        />
      </div>
    );
  }

  const pickAnother = `/app/schedule/book${leadId ? `?lead=${leadId}` : ""}`;
  const banner = (
    <HoldBanner
      startsAt={startsAt}
      held={held}
      slotState={slot?.state ?? null}
      holderName={slot?.holderName ?? null}
      pickAnotherHref={pickAnother}
      leadId={leadId}
    />
  );

  if (!lead) {
    // Which lead: the person's own leads that can be booked.
    let query = supabase
      .from("leads")
      .select("id, first_name, last_name, address_line, neighbourhood, status, created_at")
      .in("status", ["new", "follow_up"])
      .order("created_at", { ascending: false })
      .limit(50);
    if (!isOwner) query = query.or(`created_by.eq.${me.id},assigned_to.eq.${me.id}`);
    const { data: bookable } = await query;
    return (
      <div className="flex flex-col gap-5">
        <HoldSync startsAt={hold?.startsAt ?? null} />
        <h1 className="text-2xl font-bold">{heading}</h1>
        {banner}
        <section aria-labelledby="which-lead" className="flex flex-col gap-3">
          <h2 id="which-lead" className="text-lg font-bold">
            Which lead?
          </h2>
          <Button asChild size="lg" variant="outline" className="w-full">
            <Link href="/app/leads/new">Add a new lead and book it</Link>
          </Button>
          {(bookable ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No New or Follow up leads of yours to book. Add a new one.</p>
          ) : (
            <ul className="flex flex-col divide-y rounded-md border" aria-label="Your leads">
              {(bookable ?? []).map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/app/schedule/book?start=${encodeURIComponent(startsAt)}&lead=${item.id}`}
                    className="flex min-h-14 flex-col justify-center px-4 py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="font-semibold">{leadName(item)}</span>
                    <span className="text-sm text-muted-foreground">
                      {item.address_line}
                      {item.neighbourhood ? `, ${item.neighbourhood}` : ""} · {STATUS_LABELS[item.status]}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    );
  }

  const [guided, evening] = await Promise.all([
    guidedPhotoCount(supabase, lead.id),
    meetingsOnDay(supabase, calgaryDateOf(startsAt)),
  ]);
  const others = evening
    .filter((meeting) => isLive(meeting.status) || meeting.status === "qualified" || meeting.status === "not_qualified")
    .filter((meeting) => meeting.lead_id !== lead.id)
    .map((meeting) => ({ startsAt: meeting.starts_at, lat: meeting.lead.lat, lng: meeting.lead.lng, neighbourhood: meeting.lead.neighbourhood }));
  const warnings = distanceWarnings(
    lead.lat !== null && lead.lng !== null ? { lat: lead.lat, lng: lead.lng } : null,
    startsAt,
    others,
    settings.distanceKm,
  ).map(
    (warning) =>
      `This address is ${formatKm(warning.km)} in a straight line from the ${formatTime(warning.meeting.startsAt)} meeting${
        warning.meeting.neighbourhood ? ` in ${warning.meeting.neighbourhood}` : ""
      }.`,
  );
  const canBookStatus = lead.status === "new" || lead.status === "follow_up";

  return (
    <div className="flex flex-col gap-5">
      <HoldSync startsAt={hold?.startsAt ?? null} />
      <div>
        <h1 className="text-2xl font-bold">{heading}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {lead.address_line}
          {lead.neighbourhood ? `, ${lead.neighbourhood}` : ""}
        </p>
      </div>
      {banner}
      {canBookStatus ? (
        <BookingForm
          leadId={lead.id}
          startsAt={startsAt}
          lead={lead}
          items={leadReadiness(lead, guided)}
          guidedPhotos={guided}
          warnings={warnings}
          held={held}
        />
      ) : (
        <p className="rounded-md border px-4 py-3 text-sm">
          This lead is at {STATUS_LABELS[lead.status]}, so it can&apos;t be booked from here.
        </p>
      )}
    </div>
  );
}
